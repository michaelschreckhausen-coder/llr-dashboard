// ═══════════════════════════════════════════════════════════════
// Leadesk Chrome Extension — Content Script v7.8
// Fix: Robuste LinkedIn-DOM-Selektoren (keine artdeco/pv-top-card Abhängigkeit)
// Kompatibel mit altem und neuem LinkedIn-Layout (A/B-Tests, obfuskierte Klassen)
// ═══════════════════════════════════════════════════════════════
var ENVS = {
  prod: {
    url: 'https://supabase.leadesk.de',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc2ODYyNDcyLCJleHAiOjIwOTIyMjI0NzJ9.w8HbycX4Dx5Uu1UCp9ER__cv4T3oldej3BDHgck_WC8'
  },
  staging: {
    url: 'https://supabase-staging.leadesk.de',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc2ODU1OTI0LCJleHAiOjIwOTIyMTU5MjR9.4uJVtq8p3AVRYgTpKtIMwG0FBiP2PxKh6fQrZnT-Plc'
  }
}
var SUPABASE_URL = ENVS.prod.url
var SUPABASE_KEY = ENVS.prod.key
// env wird aus chrome.storage uebernommen sobald getToken laeuft
var LEADESK_URL = 'https://app.leadesk.de'

// ── Token holen: zuerst Storage, dann Leadesk-Tab ────────────────
async function getToken() {
  try {
    var stored = await new Promise(function(r) {
      chrome.storage.local.get(['supabaseSession', 'userId', 'token', 'tokenExpiry', 'env'], r)
    })
    if (stored.env && ENVS[stored.env]) {
      SUPABASE_URL = ENVS[stored.env].url
      SUPABASE_KEY = ENVS[stored.env].key
    }
    var cachedToken = stored.token || (stored.supabaseSession && stored.supabaseSession.access_token)
    var cachedUserId = stored.userId
    if (cachedToken && cachedUserId) {
      var tokenOk = false
      try {
        var parts = cachedToken.split('.')
        var payload = JSON.parse(atob(parts[1]))
        tokenOk = payload.exp && (payload.exp * 1000 > Date.now() + 60000)
      } catch(e) { tokenOk = false }
      if (tokenOk) {
        return { token: cachedToken, userId: cachedUserId }
      } else {
        try { chrome.storage.local.remove(['token', 'userId', 'tokenExpiry', 'supabaseSession']) } catch(e) {}
      }
    }
    return await new Promise(function(r) {
      try {
        chrome.runtime.sendMessage({ type: 'GET_AUTH' }, function(resp) {
          if (chrome.runtime.lastError) { r(null); return }
          if (resp && resp.token) r(resp)
          else r(null)
        })
      } catch(e) { r(null) }
    })
  } catch(e) {
    console.warn('[Leadesk] Extension context invalidated — bitte F5 drücken')
    return { contextInvalid: true }
  }
}

// ── Supabase REST ─────────────────────────────────────────────────
async function sbPost(path, body) {
  var auth = await getToken()
  if (!auth || !auth.token) return { error: 'NOT_LOGGED_IN' }
  try {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + auth.token,
        'Prefer': 'return=representation,resolution=merge-duplicates'
      },
      body: JSON.stringify(body)
    })
    var data = await res.json()
    if (!res.ok) return { error: data.message || res.status }
    return { data: data, userId: auth.userId }
  } catch(e) {
    return { error: e.message }
  }
}

// ── Profil scrapen — umfassend: Name, Headline, About, Experience, Education,
// Skills, Languages, Certifications, Activity/Posts.
// Robust gegen DOM-Aenderungen via Text-Matching der Section-Header.
function scrapeProfile() {
  if (!window.location.href.includes('/in/')) return null

  var main = document.querySelector('main') || document.body

  // ── Basics: Name, Headline, Location, Avatar, URL ──────────────
  var titleRaw = document.title || ''
  var nameFromTitle = titleRaw.split('|')[0].replace(/\([0-9]+\)/g, '').trim()
  var fullName = ''
  var headings = Array.from(main.querySelectorAll('h1, h2'))
  var nameHeading = headings.find(function(h) {
    return (h.innerText || '').trim() === nameFromTitle
  })
  if (nameHeading) {
    fullName = nameFromTitle
  } else {
    var h1 = main.querySelector('h1')
    if (h1 && h1.innerText && h1.innerText.trim()) fullName = h1.innerText.trim()
    else fullName = nameFromTitle
  }
  if (!fullName) { console.warn('[Leadesk] Kein Name gefunden'); return null }

  var allMainEls = Array.from(main.querySelectorAll('*'))
  var nameEl = nameHeading || main.querySelector('h1')
  var nameIdx = nameEl ? allMainEls.indexOf(nameEl) : -1
  var textsAfterName = []
  if (nameIdx >= 0) {
    for (var i = nameIdx + 1; i < Math.min(nameIdx + 250, allMainEls.length); i++) {
      var el = allMainEls[i]
      if (el.tagName === 'BUTTON' || el.tagName === 'A') continue
      if (el.children.length > 0) continue
      var t = (el.innerText || '').trim()
      if (!t || t.length < 3) continue
      if (textsAfterName.indexOf(t) >= 0) continue
      textsAfterName.push(t)
      if (textsAfterName.length >= 20) break
    }
  }
  var headline = ''
  for (var j = 0; j < textsAfterName.length; j++) {
    var tx = textsAfterName[j]
    if (tx.length < 20 || tx.length > 250) continue
    if (tx.charAt(0) === '·' || /^[0-9]/.test(tx)) continue
    if (tx === 'She/Her' || tx === 'He/Him' || tx === 'They/Them') continue
    if (tx.indexOf('Follower') >= 0 || tx.indexOf('Kontakt') >= 0 || tx.indexOf('Verbindung') >= 0) continue
    headline = tx; break
  }
  var location = ''
  for (var k = 0; k < textsAfterName.length; k++) {
    var lx = textsAfterName[k]
    if ((lx.match(/,/g) || []).length >= 2) { location = lx.split('\n')[0].trim(); break }
  }
  if (!location) {
    for (var m = 0; m < textsAfterName.length; m++) {
      var mx = textsAfterName[m]
      if (mx.indexOf(',') >= 0 && mx.indexOf('|') < 0 && mx.indexOf('Follower') < 0) {
        location = mx.split('\n')[0].trim(); break
      }
    }
  }
  var avatarUrl = ''
  var firstName0 = fullName.split(' ')[0].toLowerCase()
  var imgs = Array.from(main.querySelectorAll('img'))
  var avatarImg = imgs.find(function(img) {
    var alt = (img.alt || '').toLowerCase()
    return alt && (alt.indexOf(firstName0) >= 0 || alt.indexOf('profilbild') >= 0 || alt.indexOf('profile photo') >= 0 || alt.indexOf('profile picture') >= 0)
  })
  if (avatarImg) avatarUrl = avatarImg.src
  var parts = fullName.trim().split(/\s+/)
  var firstName = parts[0] || ''
  var lastName = parts.slice(1).join(' ') || ''
  var jobTitle = headline.split(' bei ')[0].split(' at ')[0].trim() || headline
  var company = headline.indexOf(' bei ') >= 0 ? headline.split(' bei ').pop().trim()
               : headline.indexOf(' at ') >= 0 ? headline.split(' at ').pop().trim() : ''
  var city = location.split(',')[0].trim()
  var country = location.split(',').pop().trim()
  var liUrl = window.location.href.split('?')[0].split('#')[0].replace(/\/$/, '').toLowerCase()

  // ── Helper: findet Section by Heading-Text oder Anchor-ID ─────
  // LinkedIn nutzt teils anchor-IDs (#about, #experience, #education, #skills),
  // teils nur Heading-Text. Wir suchen beide Wege.
  function findSection(headingTexts, anchorIds) {
    // 1) Anchor versuchen
    for (var i = 0; i < anchorIds.length; i++) {
      var anchor = document.getElementById(anchorIds[i])
      if (anchor) {
        // Section ist der naechste section-/div-Ahn mit Klasse "artdeco-card" oder
        // einfach das umschliessende section-Element
        var sec = anchor.closest('section') || anchor.parentElement
        if (sec) return sec
      }
    }
    // 2) Heading-Text matching
    var allHeadings = Array.from(main.querySelectorAll('h2, h3'))
    for (var j = 0; j < allHeadings.length; j++) {
      var ht = (allHeadings[j].innerText || '').trim().toLowerCase()
      for (var k = 0; k < headingTexts.length; k++) {
        if (ht === headingTexts[k].toLowerCase() || ht.indexOf(headingTexts[k].toLowerCase()) === 0) {
          var sec2 = allHeadings[j].closest('section')
          if (sec2) return sec2
          return allHeadings[j].parentElement
        }
      }
    }
    return null
  }

  // ── Helper: deduplizierte Text-Extraktion aus Section ─────────
  // LinkedIn rendert Text oft doppelt (aria-hidden + screen-reader). Wir
  // filtern doppelte aufeinanderfolgende Zeilen raus.
  function cleanSectionText(section) {
    if (!section) return ''
    var txt = (section.innerText || '').trim()
    // Header (z.B. "Berufserfahrung") entfernen — erste Zeile
    var lines = txt.split('\n').map(function(l) { return l.trim() }).filter(Boolean)
    // Dedupe consecutive
    var deduped = []
    for (var i = 0; i < lines.length; i++) {
      if (i > 0 && lines[i] === lines[i-1]) continue
      deduped.push(lines[i])
    }
    // Erste Zeile ist der Section-Header — wenn er bekannt-Header-Text matched, abschneiden
    var headerWords = ['info', 'about', 'berufserfahrung', 'experience', 'ausbildung', 'education', 'kenntnisse', 'skills', 'lizenzen', 'licenses', 'sprachen', 'languages', 'aktivit', 'activity', 'featured', 'empfohlen']
    if (deduped.length > 0) {
      var h = deduped[0].toLowerCase()
      for (var w = 0; w < headerWords.length; w++) {
        if (h.indexOf(headerWords[w]) === 0) { deduped.shift(); break }
      }
    }
    return deduped.join('\n').trim()
  }

  // ── About / Info ────────────────────────────────────────────────
  var aboutSection = findSection(['Info', 'About', 'Über mich'], ['about'])
  var li_about = aboutSection ? cleanSectionText(aboutSection) : ''
  // "...mehr"/"...see more" Toggle entfernen
  li_about = li_about.replace(/[\s…]*(mehr anzeigen|see more|weniger anzeigen|see less)$/i, '').trim()
  if (li_about.length > 5000) li_about = li_about.slice(0, 5000)

  // ── Experience / Berufserfahrung ────────────────────────────────
  var expSection = findSection(['Berufserfahrung', 'Experience'], ['experience'])
  var li_experience = expSection ? cleanSectionText(expSection) : ''
  if (li_experience.length > 10000) li_experience = li_experience.slice(0, 10000)

  // ── Education / Ausbildung ──────────────────────────────────────
  var eduSection = findSection(['Ausbildung', 'Education'], ['education'])
  var li_education = eduSection ? cleanSectionText(eduSection) : ''
  if (li_education.length > 5000) li_education = li_education.slice(0, 5000)

  // ── Skills / Kenntnisse ─────────────────────────────────────────
  var skillsSection = findSection(['Kenntnisse', 'Skills', 'Fähigkeiten'], ['skills'])
  var li_skills = skillsSection ? cleanSectionText(skillsSection) : ''
  if (li_skills.length > 3000) li_skills = li_skills.slice(0, 3000)

  // ── Languages / Sprachen ────────────────────────────────────────
  var langSection = findSection(['Sprachen', 'Languages'], ['languages'])
  var li_languages = langSection ? cleanSectionText(langSection) : ''

  // ── Certifications / Lizenzen & Zertifikate ─────────────────────
  var certSection = findSection(['Lizenzen', 'Bescheinigungen', 'Zertifikate', 'Licenses', 'Certifications'], ['licenses_and_certifications'])
  var li_certifications = certSection ? cleanSectionText(certSection) : ''
  if (li_certifications.length > 3000) li_certifications = li_certifications.slice(0, 3000)

  // ── Featured / Empfohlen ────────────────────────────────────────
  var featSection = findSection(['Featured', 'Empfohlen', 'Highlights'], ['featured'])
  var li_featured = featSection ? cleanSectionText(featSection) : ''
  if (li_featured.length > 3000) li_featured = li_featured.slice(0, 3000)

  // ── Activity / Aktivitäten (eigene Posts) ───────────────────────
  var actSection = findSection(['Aktivitäten', 'Aktivität', 'Activity', 'Beiträge', 'Posts'], ['recent_activity', 'content_collections'])
  var li_activity = actSection ? cleanSectionText(actSection) : ''
  // Activity-Section enthaelt oft "Folgen", "Reaktionen", "Kommentar" etc. — drin lassen, hilft KI
  if (li_activity.length > 8000) li_activity = li_activity.slice(0, 8000)

  // ── Volunteer / Ehrenamt ────────────────────────────────────────
  var volSection = findSection(['Ehrenamt', 'Volunteer', 'Freiwilligenarbeit'], ['volunteering_experience'])
  var li_volunteer = volSection ? cleanSectionText(volSection) : ''

  // ── Honors / Auszeichnungen ─────────────────────────────────────
  var honSection = findSection(['Auszeichnungen', 'Honors', 'Awards'], ['honors_and_awards'])
  var li_honors = honSection ? cleanSectionText(honSection) : ''

  console.log('[Leadesk Content] scrapeProfile() finished — section sizes:', {
    name: fullName,
    headline_chars: headline.length,
    about_chars: li_about.length,
    experience_chars: li_experience.length,
    education_chars: li_education.length,
    skills_chars: li_skills.length,
    activity_chars: li_activity.length,
    total: (headline+li_about+li_experience+li_education+li_skills+li_activity).length,
    location: location,
    url: window.location.href
  })

  // ── Connection-Degree erkennen (v9.5.0+) ─────────────────────
  // LinkedIn rendert den Degree als ".dist-value" (legacy) ODER als
  // Text "1. Grades" / "2. Grades" / "3. Grades" in den ersten 250
  // Texten nach dem Namen-Heading. Wir versuchen beide Wege.
  //
  // Mapping auf DB-ENUM crm_connection_status:
  //   1st degree (aktiv vernetzt) → 'verbunden'  + hs_score 60
  //   2nd degree (geteilte Kontakte) → 'pending' + hs_score 40
  //   sonst → 'nicht_verbunden' + hs_score 20
  function detectDegree() {
    var distEl = main.querySelector('.dist-value, [class*="distance"]')
    if (distEl) {
      var dt = (distEl.innerText || '').trim().toLowerCase()
      if (dt === '1st' || /^1\s*[\.·]/.test(dt)) return '1st'
      if (dt === '2nd' || /^2\s*[\.·]/.test(dt)) return '2nd'
      if (dt === '3rd' || /^3\s*[\.·]/.test(dt)) return '3rd'
    }
    for (var di = 0; di < textsAfterName.length; di++) {
      var dt2 = textsAfterName[di].toLowerCase()
      if (dt2 === '1st' || dt2.indexOf('1. grades') >= 0 || dt2.indexOf('1st degree') >= 0) return '1st'
      if (dt2 === '2nd' || dt2.indexOf('2. grades') >= 0 || dt2.indexOf('2nd degree') >= 0) return '2nd'
      if (dt2 === '3rd' || dt2.indexOf('3. grades') >= 0 || dt2.indexOf('3rd degree') >= 0) return '3rd'
    }
    return null
  }
  var degree = detectDegree()
  var connectionStatus = degree === '1st' ? 'verbunden'
                       : degree === '2nd' ? 'pending'
                       : 'nicht_verbunden'
  var degreeScore = degree === '1st' ? 60 : degree === '2nd' ? 40 : 20
  console.log('[Leadesk Content] degree detected:', degree, '→ status:', connectionStatus)

  return {
    first_name: firstName,
    last_name: lastName,
    name: fullName,
    job_title: jobTitle,
    company: company,
    headline: headline,
    avatar_url: avatarUrl || null,
    profile_url: liUrl,
    linkedin_url: liUrl,
    city: city || null,
    country: country || null,
    // ── Volle Profile-Sections (neu in v9.2) ──
    li_about_summary: li_about || null,
    li_experience_summary: li_experience || null,
    li_education_summary: li_education || null,
    li_skills_summary: li_skills || null,
    li_languages_summary: li_languages || null,
    li_certifications_summary: li_certifications || null,
    li_featured_summary: li_featured || null,
    li_activity_summary: li_activity || null,
    li_volunteer_summary: li_volunteer || null,
    li_honors_summary: li_honors || null,
    li_connection_status: connectionStatus,
    source: 'extension_import',
    status: 'Lead',
    hs_score: degreeScore,
  }
}

// ── Scroll-To-Bottom — triggert LinkedIn-Lazy-Load aller Sections ──
// LinkedIn rendert Experience/Education/Skills erst beim Scrollen.
// Wir scrollen die Seite einmal komplett durch + warten kurz,
// damit der Scraper alle Sektionen findet.
async function lazyLoadAllSections() {
  console.log('[Leadesk Content] lazyLoadAllSections START, scrollHeight=' + document.documentElement.scrollHeight)
  var totalHeight = 0
  var distance = 600
  var maxScrolls = 30  // ~18000 px sollten reichen
  for (var i = 0; i < maxScrolls; i++) {
    window.scrollBy(0, distance)
    totalHeight += distance
    await new Promise(function(r) { setTimeout(r, 300) })
    if (totalHeight >= document.documentElement.scrollHeight) break
  }
  // Zurueck nach oben
  window.scrollTo(0, 0)
  await new Promise(function(r) { setTimeout(r, 400) })
  console.log('[Leadesk Content] lazyLoadAllSections DONE, finalScrollHeight=' + document.documentElement.scrollHeight)
}

// ── Import Kern-Logik ─────────────────────────────────────────────
async function doImport(onLoading, onSuccess, onError) {
  onLoading()
  var auth = await getToken()
  if (!auth) { onError('⚠ Bitte in Leadesk einloggen'); return }
  if (auth.contextInvalid) { onError('↻ Seite neu laden (F5)'); return }
  if (!auth.token) { onError('⚠ Leadesk-Tab öffnen'); return }
  var profile = scrapeProfile()
  if (!profile) { onError('⚠ Profil nicht lesbar'); return }
  profile.user_id = auth.userId
  var result = await sbPost('leads?on_conflict=user_id,linkedin_url', [profile])
  if (result.error) {
    console.error('[Leadesk] Import Fehler:', result.error)
    onError('⚠ ' + String(result.error || 'Fehler').substring(0, 25))
  } else {
    onSuccess(profile.name)
    chrome.runtime.sendMessage({ type: 'PROFILE_IMPORTED', name: profile.name })
  }
}

// ── CSS ────────────────────────────────────────────────────────────

// ── Eigene Identity ───────────────────────────────────────────────
// Liest aus der aktuellen LinkedIn-Page wer der eingeloggte User ist.
// Bevorzugt: wir sind auf /in/<slug>/ (z.B. /in/me/ nach Redirect).
// Fallback: nav-bar oben rechts hat den eigenen Profil-Link + Avatar.
function scrapeOwnIdentity() {
  var out = { member_id: null, display_name: null, avatar_url: null, profile_url: null }

  // Pfad 1 — wir sind aktuell auf einem eigenen Profil (nach /in/me/ Redirect)
  if (/\/in\/[^/?#]+/.test(window.location.pathname)) {
    var slug = window.location.pathname.match(/\/in\/([^/?#]+)/)
    if (slug && slug[1]) {
      out.member_id = decodeURIComponent(slug[1])
      out.profile_url = window.location.origin + '/in/' + out.member_id
    }
    var h1 = document.querySelector('main h1')
    if (h1 && h1.innerText) out.display_name = h1.innerText.trim()
    var av = document.querySelector('main img[width="200"], main img.pv-top-card-profile-picture__image, main .pv-top-card__photo img')
    if (av && av.src) out.avatar_url = av.src
  }

  // Pfad 2 — Nav-Bar Profile-Menu (funktioniert auf jeder LinkedIn-Page)
  if (!out.member_id) {
    var navLink = document.querySelector('a.global-nav__primary-link-me-menu-trigger, .global-nav__me-photo, [data-control-name="identity_welcome_message"]')
    if (navLink) {
      var img = navLink.querySelector('img') || navLink
      if (img && img.alt) out.display_name = img.alt
      if (img && img.src) out.avatar_url = img.src
    }
    // member_id aus Profile-Link
    var meLink = document.querySelector('a[href*="/in/"][data-control-name="identity_welcome_message"], a.global-nav__me-photo, a[href*="/in/"].global-nav__primary-link-me-menu-trigger')
    if (meLink && meLink.href) {
      var m = meLink.href.match(/\/in\/([^/?#]+)/)
      if (m && m[1]) {
        out.member_id = decodeURIComponent(m[1])
        out.profile_url = 'https://www.linkedin.com/in/' + out.member_id
      }
    }
  }

  return out
}


function injectCSS() {
  if (document.getElementById('leadesk-css')) return
  var s = document.createElement('style')
  s.id = 'leadesk-css'
  s.textContent = [
    '@keyframes lsk-spin { to { transform: rotate(360deg); } }',
    '@keyframes lsk-pop { from { opacity:0; transform:translateY(-50%) scale(0.8); } to { opacity:1; transform:translateY(-50%) scale(1); } }',
    '#leadesk-float { animation: lsk-pop 0.2s ease; }',
    '#leadesk-float:hover #lsk-tip { display:block !important; }',
  ].join('\n')
  document.head.appendChild(s)
}

// ── Profil-Button in Action-Bar — kein artdeco-button Constraint ──
function injectProfileButton() {
  if (!window.location.href.includes('/in/')) return
  if (document.getElementById('leadesk-portal')) return

  var main = document.querySelector('main')
  if (!main) return

  var allBtns = Array.from(main.querySelectorAll('button'))
  var actionBtn = allBtns.find(function(b) {
    var t = (b.innerText || '').trim()
    return t === 'Nachricht' || t === 'Message' ||
           t === 'Vernetzen' || t === 'Connect' ||
           t === 'Folgen'    || t === 'Follow'  ||
           t === 'Mehr'      || t === 'More'
  })

  if (!actionBtn) {
    console.log('[Leadesk v7.8] Kein Action-Button gefunden — retry geplant')
    return
  }

  var container = actionBtn.parentElement && actionBtn.parentElement.parentElement
  if (!container) return

  var portal = document.createElement('div')
  portal.id = 'leadesk-portal'
  portal.className = 'injected-portal'
  portal.style.cssText = 'display:inline-flex;align-items:center;'

  var btn = document.createElement('button')
  btn.setAttribute('type', 'button')
  btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:0 16px;height:32px;background:rgb(49,90,231);color:#fff;border:none;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background 0.15s;box-shadow:0 2px 8px rgba(49,90,231,0.3);margin-left:8px'
  setDefault(btn)

  btn.addEventListener('click', function(e) {
    e.stopPropagation(); e.preventDefault()
    doImport(
      function() { btn.style.background='#6B7280'; btn.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" style="animation:lsk-spin 0.8s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Lädt...' },
      function(name) { btn.style.background='#059669'; btn.innerHTML='✓ Importiert!'; setTimeout(function(){ setDefault(btn) }, 3500) },
      function(msg) { btn.style.background='#DC2626'; btn.innerHTML=msg; setTimeout(function(){ setDefault(btn) }, 3500) }
    )
  })

  portal.appendChild(btn)
  container.appendChild(portal)
  console.log('[Leadesk v7.8] In-Leadesk-Button injiziert neben:', (actionBtn.innerText||'').trim())
}

function setDefault(btn) {
  btn.style.background = 'rgb(49,90,231)'
  btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 0 2h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1 0-2h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/></svg>In Leadesk'
}

// ── Floating Button ───────────────────────────────────────────────
function injectFloatingButton() {
  if (document.getElementById('leadesk-float')) return
  var fb = document.createElement('div')
  fb.id = 'leadesk-float'
  fb.style.cssText = 'position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:2147483640;cursor:pointer;width:48px;height:48px;background:rgb(49,90,231);border-radius:12px 0 0 12px;display:flex;align-items:center;justify-content:center;box-shadow:-3px 0 16px rgba(49,90,231,0.4);transition:filter 0.15s'
  var tip = document.createElement('div')
  tip.id = 'lsk-tip'
  tip.style.cssText = 'display:none;position:absolute;right:52px;top:50%;transform:translateY(-50%);background:#0F172A;color:#fff;padding:5px 10px;border-radius:6px;font-size:12px;white-space:nowrap;font-family:-apple-system,system-ui,sans-serif;pointer-events:none'
  tip.textContent = 'In Leadesk importieren'
  var icon = document.createElement('div')
  icon.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 0 2h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1 0-2h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/></svg>'
  fb.appendChild(tip)
  fb.appendChild(icon)
  fb.addEventListener('mouseenter', function() { tip.style.display='block'; fb.style.filter='brightness(1.15)' })
  fb.addEventListener('mouseleave', function() { tip.style.display='none'; fb.style.filter='' })
  fb.addEventListener('click', function() {
    if (!window.location.href.includes('/in/')) {
      tip.textContent = 'Öffne ein LinkedIn-Profil'
      tip.style.display = 'block'
      setTimeout(function() { tip.textContent='In Leadesk importieren'; tip.style.display='none' }, 2000)
      return
    }
    doImport(
      function() {
        fb.style.background = '#6B7280'
        icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" style="animation:lsk-spin 0.8s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>'
        tip.textContent = 'Importiere...'
        tip.style.display = 'block'
      },
      function(name) {
        fb.style.background = '#059669'
        icon.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>'
        tip.textContent = '✓ ' + (name || 'Importiert!')
        tip.style.display = 'block'
        setTimeout(function() {
          fb.style.background = 'rgb(49,90,231)'
          icon.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 0 2h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1 0-2h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/></svg>'
          tip.textContent = 'In Leadesk importieren'
          tip.style.display = 'none'
        }, 3500)
      },
      function(msg) {
        fb.style.background = '#DC2626'
        icon.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
        tip.textContent = msg
        tip.style.display = 'block'
        setTimeout(function() {
          fb.style.background = 'rgb(49,90,231)'
          icon.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 0 2h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1 0-2h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/></svg>'
          tip.textContent = 'In Leadesk importieren'
          tip.style.display = 'none'
        }, 3500)
      }
    )
  })
  document.body.appendChild(fb)
}

// ── Observer ──────────────────────────────────────────────────────
function startObserver() {
  var lastUrl = window.location.href
  var timer = null
  new MutationObserver(function() {
    var url = window.location.href
    if (url !== lastUrl) {
      lastUrl = url
      var old = document.getElementById('leadesk-portal')
      if (old) old.remove()
      clearTimeout(timer)
      if (url.includes('/in/')) timer = setTimeout(injectProfileButton, 2000)
    } else if (url.includes('/in/') && !document.getElementById('leadesk-portal')) {
      clearTimeout(timer)
      timer = setTimeout(injectProfileButton, 800)
    }
    if (!document.getElementById('leadesk-float')) {
      injectFloatingButton()
    }
  }).observe(document.body, { childList: true, subtree: true })
}

// ── Loading-Overlay (Full-Screen) waehrend Scrape ────────────────
function showLoadingOverlay() {
  if (document.getElementById('leadesk-loading-overlay')) return
  var overlay = document.createElement('div')
  overlay.id = 'leadesk-loading-overlay'
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'background:rgba(255,255,255,0.97)',
    'z-index:2147483647',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    'color:#14142b',
  ].join(';')
  overlay.innerHTML = [
    '<div style="text-align:center;padding:40px;max-width:480px">',
    '  <div id="leadesk-spinner" style="width:80px;height:80px;border:6px solid #E5E7EB;border-top:6px solid #315AE7;border-radius:50%;margin:0 auto 24px;animation:leadesk-spin 1s linear infinite"></div>',
    '  <h2 style="font-size:22px;font-weight:700;margin:0 0 10px;color:#14142B;letterSpacing:-0.3px">Leadesk extrahiert dein LinkedIn-Profil…</h2>',
    '  <p style="font-size:14px;color:#6B7280;margin:0 0 14px;line-height:1.55">Wir lesen Profilslogan, Info-Box, Berufserfahrung, Ausbildung, Kenntnisse und deine letzten Beiträge.</p>',
    '  <p style="font-size:12px;color:#9CA3AF;margin:0;line-height:1.5">Du wirst in wenigen Sekunden automatisch zurück zu Leadesk geleitet.<br/>Bitte nicht wegklicken oder den Tab schließen.</p>',
    '</div>',
    '<style>@keyframes leadesk-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style>'
  ].join('')
  ;(document.documentElement || document.body || document).appendChild(overlay)
}

function hideLoadingOverlay() {
  var el = document.getElementById('leadesk-loading-overlay')
  if (el && el.parentNode) el.parentNode.removeChild(el)
}

// ── Chrome Messages ───────────────────────────────────────────────
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.type === 'SCRAPE_PROFILE') {
    // SILENT scrape (kein Overlay) -- wird auch beim SidePanel-Profil-
    // Detection auf jedem /in/-Visit aufgerufen. Overlay nur bei
    // explizitem SHOW_LOADING_OVERLAY (siehe unten, Bridge-Trigger).
    lazyLoadAllSections().then(function() {
      sendResponse({ profile: scrapeProfile() })
    }).catch(function() {
      sendResponse({ profile: scrapeProfile() })
    })
    return true  // async response
  }
  if (msg.type === 'SCRAPE_OWN_IDENTITY') {
    sendResponse({ identity: scrapeOwnIdentity() })
    return true
  }
  if (msg.type === 'PING') sendResponse({ ok: true, url: window.location.href })
  if (msg.type === 'SHOW_LOADING_OVERLAY') { showLoadingOverlay(); sendResponse({ ok: true }); return true }
  if (msg.type === 'HIDE_LOADING_OVERLAY') { hideLoadingOverlay(); sendResponse({ ok: true }); return true }
  return true
})

// ── Init ──────────────────────────────────────────────────────────
;(function() {
  injectCSS()
  setTimeout(injectFloatingButton, 800)
  if (window.location.href.includes('/in/')) {
    setTimeout(injectProfileButton, 1500)
    setTimeout(injectProfileButton, 3000)
    setTimeout(injectProfileButton, 5000)
  }
  startObserver()
})()

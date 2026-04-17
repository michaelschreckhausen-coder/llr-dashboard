// ═══════════════════════════════════════════════════════════════
// Leadesk Chrome Extension — Content Script v7.8
// Fix: Robuste LinkedIn-DOM-Selektoren (keine artdeco/pv-top-card Abhängigkeit)
// Kompatibel mit altem und neuem LinkedIn-Layout (A/B-Tests, obfuskierte Klassen)
// ═══════════════════════════════════════════════════════════════
var SUPABASE_URL = 'https://jdhajqpgfrsuoluaesjn.supabase.co'
var SUPABASE_KEY = 'sb_publishable__KdQsVuSD6WWuswGcViaRw_CxDK8grx'
var LEADESK_URL = 'https://app.leadesk.de'

// ── Token holen: zuerst Storage, dann Leadesk-Tab ────────────────
async function getToken() {
  try {
    var stored = await new Promise(function(r) {
      chrome.storage.local.get(['supabaseSession', 'userId', 'token', 'tokenExpiry'], r)
    })
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

// ── Profil scrapen — robust für altes + neues LinkedIn-Layout ────
function scrapeProfile() {
  if (!window.location.href.includes('/in/')) return null

  var main = document.querySelector('main') || document.body

  // 1) Name: Title parsen + H1/H2-Validierung
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
    if (h1 && h1.innerText && h1.innerText.trim()) {
      fullName = h1.innerText.trim()
    } else {
      fullName = nameFromTitle
    }
  }

  if (!fullName) {
    console.warn('[Leadesk v7.8] Kein Name gefunden')
    return null
  }

  console.log('[Leadesk v7.8] Name gefunden:', fullName)

  // 2) DOM-Traverse nach dem Namen-Element für weitere Felder
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

  console.log('[Leadesk v7.8] Texte nach Name:', textsAfterName.slice(0, 8))

  // 3) Headline
  var headline = ''
  for (var j = 0; j < textsAfterName.length; j++) {
    var tx = textsAfterName[j]
    if (tx.length < 20 || tx.length > 250) continue
    if (tx.charAt(0) === '·' || /^[0-9]/.test(tx)) continue
    if (tx === 'She/Her' || tx === 'He/Him' || tx === 'They/Them') continue
    if (tx.indexOf('Follower') >= 0 || tx.indexOf('Kontakt') >= 0 || tx.indexOf('Verbindung') >= 0) continue
    headline = tx
    break
  }

  // 4) Location
  var location = ''
  for (var k = 0; k < textsAfterName.length; k++) {
    var lx = textsAfterName[k]
    var commas = (lx.match(/,/g) || []).length
    if (commas >= 2) { location = lx.split('\n')[0].trim(); break }
  }
  if (!location) {
    for (var m = 0; m < textsAfterName.length; m++) {
      var mx = textsAfterName[m]
      if (mx.indexOf(',') >= 0 && mx.indexOf('|') < 0 && mx.indexOf('Follower') < 0) {
        location = mx.split('\n')[0].trim(); break
      }
    }
  }

  // 5) Avatar
  var avatarUrl = ''
  var firstName0 = fullName.split(' ')[0].toLowerCase()
  var imgs = Array.from(main.querySelectorAll('img'))
  var avatarImg = imgs.find(function(img) {
    var alt = (img.alt || '').toLowerCase()
    return alt && (
      alt.indexOf(firstName0) >= 0 ||
      alt.indexOf('profilbild') >= 0 ||
      alt.indexOf('profile photo') >= 0 ||
      alt.indexOf('profile picture') >= 0
    )
  })
  if (avatarImg) avatarUrl = avatarImg.src

  // 6) Name splitten
  var parts = fullName.trim().split(/\s+/)
  var firstName = parts[0] || ''
  var lastName = parts.slice(1).join(' ') || ''

  var jobTitle = headline.split(' bei ')[0].split(' at ')[0].trim() || headline
  var company = headline.indexOf(' bei ') >= 0 ? headline.split(' bei ').pop().trim()
               : headline.indexOf(' at ') >= 0 ? headline.split(' at ').pop().trim() : ''

  var city = location.split(',')[0].trim()
  var country = location.split(',').pop().trim()

  var liUrl = window.location.href.split('?')[0].split('#')[0].replace(/\/$/, '').toLowerCase()

  console.log('[Leadesk v7.8] Profil gescrapt:', { name: fullName, headline: headline, location: location })

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
    li_about_summary: null,
    city: city || null,
    country: country || null,
    li_connection_status: 'nicht_verbunden',
    source: 'extension_import',
    status: 'Lead',
    hs_score: 20,
  }
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

// ── Chrome Messages ───────────────────────────────────────────────
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.type === 'SCRAPE_PROFILE') sendResponse({ profile: scrapeProfile() })
  if (msg.type === 'PING') sendResponse({ ok: true, url: window.location.href })
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

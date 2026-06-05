// Leadesk Side Panel v9.2 — Multi-Page
const ENVS = {
  prod: {
    url: 'https://supabase.leadesk.de',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc2ODYyNDcyLCJleHAiOjIwOTIyMjI0NzJ9.w8HbycX4Dx5Uu1UCp9ER__cv4T3oldej3BDHgck_WC8'
  },
  staging: {
    url: 'https://supabase-staging.leadesk.de',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc2ODU1OTI0LCJleHAiOjIwOTIyMTU5MjR9.4uJVtq8p3AVRYgTpKtIMwG0FBiP2PxKh6fQrZnT-Plc'
  }
}
let SUPABASE_URL = ENVS.prod.url
let SUPABASE_KEY = ENVS.prod.key

let currentProfile = null
let currentUserId  = null
let currentTeamId  = null
let selectedMsgType = 'vernetzung'
let allLeads = []

// ── KI-Nachrichten: Modi (1:1 mit app.leadesk.de/messages MSG_TYPES) ─
//
// Schema-Konvention seit 2026-05-29 (linkedin_messages-Cutover): 3 Modi
// (vernetzung / first_message / sales_pitch). Pro Modus eigener edgeType
// (für generate-EF body.type), contentKind (für content_generations bucket),
// hardCap (LinkedIn-Limit), promptIntent (was die LLM tun soll), STRICT_FORMAT
// (gegen Markdown/Header/Bullet-Drift der LLM).

const STRICT_FORMAT =
  ' WICHTIG: Antworte AUSSCHLIESSLICH mit dem reinen Nachrichtentext, so wie er in das'
  + ' LinkedIn-Nachrichtenfeld eingefügt wird. KEIN Markdown (kein #, kein **fett**, keine'
  + ' Bullet-Listen). KEIN "Betreff:". KEIN Header. KEINE Erklärung. KEINE Meta-Kommentare'
  + ' ("Hier ist der Text:" / "Warum das funktioniert"). KEINE Anführungszeichen um den Text.'
  + ' Nur der Nachrichtentext selbst, ggf. mit Zeilenumbrüchen für Lesbarkeit. Auf Deutsch.'

const MSG_TYPES = {
  vernetzung: {
    label:       'Vernetzung',
    edgeType:    'connection_request',
    contentKind: 'connection_msg',
    hardCap:     300,
    softTarget:  'max. 300 Zeichen (LinkedIn-Connect-Limit)',
    promptIntent: 'Schreibe eine kurze, persönliche LinkedIn-Vernetzungs-Note (Connect-Note,'
      + ' die VOR der Annahme als Anhang an die Vernetzungsanfrage geht). Maximal 300 Zeichen'
      + ' (LinkedIn-Hard-Limit). Kein Hard-Sell, kein Pitch. Optional ein-Satz-Bezug zur Person'
      + ' oder zum Anlass. Eine neugierige, einladende Eröffnung — keine Verkaufsabsicht.'
      + STRICT_FORMAT,
  },
  first_message: {
    label:       'First Message',
    edgeType:    'first_message',
    contentKind: 'linkedin_first_message',
    hardCap:     null,
    softTarget:  '~400-800 Zeichen · max 5 Sätze',
    promptIntent: 'Schreibe eine erste LinkedIn-Direkt-Nachricht NACH erfolgreicher Vernetzung.'
      + ' Ziel: Conversation starten ODER konkreten Mehrwert anbieten. Länge 400-800 Zeichen,'
      + ' max. ca. 5 Sätze. Persönlich, authentisch, du-Form je nach Brand Voice. KEIN harter'
      + ' Verkaufs-Pitch. Entweder EINE konkrete Frage stellen ODER EINEN konkreten Mehrwert'
      + ' (Link/Tipp/Beobachtung) anbieten — nicht beides.'
      + STRICT_FORMAT,
  },
  sales_pitch: {
    label:       'Sales Pitch',
    edgeType:    'sales_pitch',
    contentKind: 'linkedin_sales_pitch',
    hardCap:     null,
    softTarget:  '~800-1500 Zeichen · mit klarem CTA',
    promptIntent: 'Schreibe eine LinkedIn-Direkt-Nachricht mit konkretem Angebot oder'
      + ' Service-Pitch. Länge 800-1500 Zeichen. Aufbau: (1) Persönlicher Aufhänger /'
      + ' Bezug zum Empfänger, (2) konkretes Problem das du lösen kannst, (3) klares'
      + ' Angebot mit einem CTA am Ende (z.B. 15-Min-Call, Demo, kurze Reply).'
      + ' Persönlich, nicht generisches Marketing-Bla.'
      + STRICT_FORMAT,
  },
}

// Brand-Voice + Audiences-State (lazy-loaded beim ersten Messages-Page-Open)
let activeBrandVoice = null
let audiences = []
let selectedAudienceId = ''
let bvLoadAttempted = false

// ── Helpers ───────────────────────────────────────────────────────
const getAuth = () => new Promise(r => chrome.storage.local.get(['supabaseSession','userId','env'], r)).then(data => {
  if (data.env && ENVS[data.env]) {
    SUPABASE_URL = ENVS[data.env].url
    SUPABASE_KEY = ENVS[data.env].key
  }
  return data
})
const $ = id => document.getElementById(id)

function setStatus(type, text) {
  $('statusDot').className = 'status-dot' + (type ? ' ' + type : '')
  $('statusText').textContent = text
}

async function diagnose(prefix) {
  const all = await new Promise(r => chrome.storage.local.get(null, r))
  console.log('[Leadesk Diag ' + prefix + ']', {
    env: all.env,
    SUPABASE_URL: SUPABASE_URL,
    SUPABASE_KEY_prefix: (SUPABASE_KEY || '').slice(0, 30),
    token_prefix: (all.token || all.supabaseSession?.access_token || '').slice(0, 30),
    userId: all.userId,
    extensionVersion: all.extensionVersion,
  })
}

async function sbFetch(path, method = 'GET', body) {
  const { supabaseSession } = await getAuth()
  const token = supabaseSession?.access_token
  if (!token) return null
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + token,
  }
  if (method === 'POST') headers['Prefer'] = 'return=representation,resolution=merge-duplicates'
  if (method === 'PATCH') headers['Prefer'] = 'return=representation'
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    window.__lastError = res.status + ': ' + await res.text().catch(() => '')
    if (res.status === 401) await diagnose('on-401')
    return null
  }
  return res.json().catch(() => null)
}

// ── Navigation ────────────────────────────────────────────────────
document.querySelectorAll('.nav-btn[data-page]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'))
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
    btn.classList.add('active')
    $('page-' + btn.dataset.page).classList.add('active')
    if (btn.dataset.page === 'leads') loadLeads()
    if (btn.dataset.page === 'ssi') loadSSI()
  })
})

// ── Import Page ───────────────────────────────────────────────────
function showProfile(profile) {
  const name    = profile.name || `${profile.first_name||''} ${profile.last_name||''}`.trim() || 'Unbekannt'
  const title   = profile.job_title || profile.headline || ''
  const company = profile.company || ''
  const loc     = [profile.city, profile.country].filter(Boolean).join(', ')

  $('profileName').textContent    = name
  $('profileTitle').textContent   = title
  $('profileCompany').textContent = company
  $('profileLocation').textContent = loc

  const av = $('profileAvatar')
  if (profile.avatar_url?.startsWith('http')) {
    av.innerHTML = `<img src="${profile.avatar_url}" onerror="this.parentElement.textContent='${(name[0]||'?').toUpperCase()}'"/>`
  } else {
    av.textContent = (name[0]||'?').toUpperCase()
  }

  const conn = profile.li_connection_status
  $('connectionBadge').innerHTML = conn === 'verbunden'
    ? '<span class="badge badge-connected">✓ Vernetzt</span>'
    : conn === 'pending'
    ? '<span class="badge badge-pending">⏳ Anfrage ausstehend</span>'
    : '<span class="badge badge-none">Nicht vernetzt</span>'

  $('noProfile').style.display    = 'none'
  $('profileSection').style.display = 'block'
  resetImportBtn()

  // KI-Nachricht Banner aktualisieren
  $('aiProfileBanner').style.display = 'block'
  $('aiNoProfile').style.display = 'none'
  $('aiProfileName').textContent = name
  $('aiProfileSub').textContent = [title, company].filter(Boolean).join(' · ')
}

function resetImportBtn() {
  const btn = $('importBtn')
  btn.className = 'btn-primary'
  btn.disabled = false
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg> In Leadesk importieren`
}

async function importLead() {
  if (!currentProfile || !currentUserId) return
  const btn = $('importBtn')
  btn.disabled = true
  btn.innerHTML = '<div class="spinner"></div> Importiere...'
  try {
    const payload = { ...currentProfile, user_id: currentUserId, ...(currentTeamId ? { team_id: currentTeamId } : {}) }
    const result = await sbFetch('leads?on_conflict=user_id,linkedin_url', 'POST', [payload])
    if (result !== null) {
      const isNew = Array.isArray(result) && result.length > 0
      btn.className = 'btn-primary success'
      btn.innerHTML = isNew ? '✓ Importiert!' : '✓ Bereits in Leadesk'
      btn.disabled = false
      setStatus('connected', isNew ? 'Lead importiert ✓' : 'Bereits vorhanden ✓')
    } else {
      throw new Error(window.__lastError || 'Fehler beim Speichern')
    }
  } catch(err) {
    btn.className = 'btn-primary error'
    btn.innerHTML = '⚠ ' + (err.message||'Fehler').substring(0,50)
    btn.disabled = false
  }
}

// ── Teams laden ───────────────────────────────────────────────────
async function loadTeams(userId) {
  try {
    const { supabaseSession } = await getAuth()
    const token = supabaseSession?.access_token
    const r1 = await fetch(`${SUPABASE_URL}/rest/v1/team_members?user_id=eq.${userId}&select=team_id`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + token } })
    const ids = r1.ok ? (await r1.json()).map(m => m.team_id) : []
    if (!ids.length) return
    const r2 = await fetch(`${SUPABASE_URL}/rest/v1/teams?id=in.(${ids.join(',')})&select=id,name`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + token } })
    const teams = r2.ok ? await r2.json() : []
    if (!teams.length) return
    const sel = $('teamSelect')
    const saved = localStorage.getItem('leadesk_selected_team')
    sel.innerHTML = ''
    teams.forEach(t => {
      const o = document.createElement('option')
      o.value = t.id; o.textContent = t.name
      if (t.id === saved) o.selected = true
      sel.appendChild(o)
    })
    if (!saved) sel.options[0].selected = true
    currentTeamId = sel.value
    sel.onchange = () => { currentTeamId = sel.value; localStorage.setItem('leadesk_selected_team', currentTeamId) }
    $('teamSelectorWrap').style.display = 'block'
  } catch(e) {}
}

// ── Profil laden ──────────────────────────────────────────────────
async function scrapeViaInjection(tabId) {
  // Content Script direkt ausführen falls sendMessage nicht funktioniert
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        function get(sels) {
          for (const s of (Array.isArray(sels) ? sels : [sels])) {
            const el = document.querySelector(s)
            if (el?.innerText?.trim()) return el.innerText.trim()
          }
          return ''
        }
        function attr(sels, a) {
          for (const s of (Array.isArray(sels) ? sels : [sels])) {
            const v = document.querySelector(s)?.getAttribute(a)
            if (v?.startsWith('http')) return v
          }
          return ''
        }
        const fullName = get(['h1.text-heading-xlarge','h1[class*="heading"]','h1'])
        if (!fullName) return null
        const parts = fullName.trim().split(/\s+/)
        const firstName = parts[0] || ''
        const lastName  = parts.slice(1).join(' ') || ''
        const headline  = get(['.text-body-medium.break-words','div.text-body-medium'])
        const jobTitle  = headline.split(' bei ')[0].split(' at ')[0].trim() || headline
        const company   = headline.includes(' bei ') ? headline.split(' bei ').pop().trim()
                        : headline.includes(' at ')  ? headline.split(' at ').pop().trim() : ''
        const avatarUrl = attr(['img.pv-top-card-profile-picture__image','.pv-top-card__photo img','img[class*="profile-photo"]'], 'src')
        const location  = get(['.text-body-small.inline.t-black--light.break-words'])
        const degree    = get(['.dist-value','[class*="distance"]'])
        const about     = get(['.display-flex.ph5.pv3 span[aria-hidden="true"]'])
        const liUrl     = window.location.href.split('?')[0].split('#')[0].replace(/\/$/, '').toLowerCase()
        return {
          first_name: firstName, last_name: lastName,
          name: fullName || firstName + ' ' + lastName || 'Unbekannt',
          job_title: jobTitle, company, headline,
          avatar_url: avatarUrl || null,
          profile_url: liUrl, linkedin_url: liUrl,
          li_about_summary: about || null,
          city: location.split(',')[0].trim() || null,
          country: location.split(',').pop().trim() || null,
          li_connection_status: degree === '1st' ? 'verbunden' : degree === '2nd' ? 'pending' : 'nicht_verbunden',
          source: 'extension_import', status: 'Lead',
          hs_score: degree === '1st' ? 60 : degree === '2nd' ? 40 : 20,
        }
      }
    })
    return results?.[0]?.result || null
  } catch(e) {
    console.warn('[Leadesk] Injection fehlgeschlagen:', e.message)
    return null
  }
}

async function loadProfileFromTab() {
  $('profileSection').style.display = 'none'
  $('notLoggedIn').style.display = 'none'
  $('noProfile').style.display = 'none'

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => [])
  const tab = tabs[0]

  if (!tab?.url?.includes('linkedin.com/in/')) {
    $('noProfile').style.display = 'block'
    setStatus('connected', 'Eingeloggt ✓')
    return
  }

  setStatus('', 'Profil wird erkannt...')

  // Methode 1: Content Script via sendMessage
  for (let i = 1; i <= 3; i++) {
    await new Promise(r => setTimeout(r, i === 1 ? 800 : 1500))
    const profile = await new Promise(resolve => {
      chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_PROFILE' }, res => {
        if (chrome.runtime.lastError) { resolve(null); return }
        resolve(res?.profile || null)
      })
    })
    if (profile) {
      currentProfile = profile
      showProfile(profile)
      setStatus('connected', 'Profil erkannt ✓')
      return
    }
  }

  // Methode 2: Direkte Script-Injektion als Fallback
  await new Promise(r => setTimeout(r, 500))
  const injected = await scrapeViaInjection(tab.id)
  if (injected) {
    currentProfile = injected
    showProfile(injected)
    setStatus('connected', 'Profil erkannt ✓')
    return
  }

  $('noProfile').style.display = 'block'
  setStatus('error', 'Profil nicht erkannt — Seite neu laden')
}

// ── Leads Page ────────────────────────────────────────────────────
async function loadLeads() {
  const list = $('leadList')
  list.innerHTML = '<div class="loading-msg">⏳ Lädt...</div>'
  try {
    const data = await sbFetch(
      `leads?select=id,first_name,last_name,name,job_title,company,avatar_url,deal_stage,li_connection_status${currentTeamId?'&team_id=eq.'+currentTeamId:''}&order=created_at.desc&limit=50`
    )
    allLeads = data || []
    renderLeads(allLeads)
  } catch(e) {
    list.innerHTML = '<div class="loading-msg">Fehler beim Laden</div>'
  }
}

function renderLeads(leads) {
  const list = $('leadList')
  if (!leads.length) { list.innerHTML = '<div class="loading-msg">Keine Leads gefunden</div>'; return }
  list.innerHTML = leads.map(l => {
    const name = `${l.first_name||''} ${l.last_name||''}`.trim() || l.name || 'Unbekannt'
    const initials = (name[0]||'?').toUpperCase()
    const av = l.avatar_url ? `<img src="${l.avatar_url}" onerror="this.parentElement.textContent='${initials}'"/>` : initials
    const stage = l.deal_stage && l.deal_stage !== 'kein_deal' ? `<span class="lead-stage">${l.deal_stage}</span>` : ''
    return `<div class="lead-item" data-id="${l.id}">
      <div class="lead-mini-avatar">${av}</div>
      <div style="flex:1;min-width:0">
        <div class="lead-name">${name}</div>
        <div class="lead-meta">${[l.job_title,l.company].filter(Boolean).join(' · ').substring(0,45)||'—'}</div>
      </div>
      ${stage}
    </div>`
  }).join('')

  // Klick → Detail
  list.querySelectorAll('.lead-item').forEach(el => {
    el.addEventListener('click', () => openLeadDetail(el.dataset.id))
  })
}

async function openLeadDetail(leadId) {
  $('leadsListView').style.display = 'none'
  $('leadsDetailView').style.display = 'block'
  $('leadDetailContent').innerHTML = '<div class="loading-msg">⏳ Lädt...</div>'

  const lead = await sbFetch(
    `leads?id=eq.${leadId}&select=*&limit=1`
  ).then(d => d?.[0] || null)

  if (!lead) {
    $('leadDetailContent').innerHTML = '<div class="loading-msg">Fehler beim Laden</div>'
    return
  }

  const name    = `${lead.first_name||''} ${lead.last_name||''}`.trim() || lead.name || 'Unbekannt'
  const initials = (name[0]||'?').toUpperCase()
  const av = lead.avatar_url
    ? `<img src="${lead.avatar_url}" onerror="this.parentElement.textContent='${initials}'">`
    : initials

  const stageColors = {
    gewonnen:'#DCFCE7;color:#166534', verloren:'#FEE2E2;color:#991B1B',
    angebot:'#FEF3C7;color:#92400E', verhandlung:'#E0E7FF;color:#3730A3',
    prospect:'#F0FDF4;color:#166534', opportunity:'#EFF6FF;color:#1D4ED8',
    kein_deal:'#F8FAFC;color:#475569'
  }
  const stageCss = stageColors[lead.deal_stage] || stageColors.kein_deal

  const conn = lead.li_connection_status === 'verbunden' ? '✓ Vernetzt'
             : lead.li_connection_status === 'pending'   ? '⏳ Ausstehend'
             : 'Nicht vernetzt'

  $('leadDetailContent').innerHTML = `
    <div class="detail-card">
      <div style="display:flex;align-items:center;gap:12px">
        <div class="detail-avatar">${av}</div>
        <div style="flex:1;min-width:0">
          <div class="detail-name">${name}</div>
          <div class="detail-sub">${lead.job_title||''}</div>
          <div class="detail-sub" style="font-weight:600;color:#475569">${lead.company||''}</div>
        </div>
      </div>
      <div class="detail-actions" style="margin-top:12px">
        <button class="btn-da" id="btnOpenLeadesk">↗ In Leadesk</button>
        ${lead.linkedin_url ? `<button class="btn-da" id="btnOpenLinkedIn">in LinkedIn</button>` : ''}
        ${lead.email ? `<button class="btn-da" id="btnOpenMail">✉ Mail</button>` : ''}
      </div>
    </div>

    <span class="detail-label">Details</span>
    <div class="detail-card" style="padding:4px 14px">
      ${lead.email ? `<div class="detail-row"><span class="detail-row-label">E-Mail</span><span class="detail-row-val">${lead.email}</span></div>` : ''}
      ${lead.phone ? `<div class="detail-row"><span class="detail-row-label">Telefon</span><span class="detail-row-val">${lead.phone}</span></div>` : ''}
      ${lead.city||lead.country ? `<div class="detail-row"><span class="detail-row-label">Standort</span><span class="detail-row-val">${[lead.city,lead.country].filter(Boolean).join(', ')}</span></div>` : ''}
      <div class="detail-row"><span class="detail-row-label">Vernetzung</span><span class="detail-row-val">${conn}</span></div>
      ${lead.deal_stage ? `<div class="detail-row"><span class="detail-row-label">Stage</span><span class="detail-row-val"><span class="detail-stage" style="background:${stageCss.split(';')[0].replace('background:','')};${stageCss.split(';')[1]||''}">${lead.deal_stage}</span></span></div>` : ''}
      ${lead.deal_value ? `<div class="detail-row"><span class="detail-row-label">Deal-Wert</span><span class="detail-row-val" style="color:#16a34a;font-weight:800">€${Number(lead.deal_value).toLocaleString('de-DE')}</span></div>` : ''}
      ${lead.hs_score ? `<div class="detail-row"><span class="detail-row-label">Score</span><span class="detail-row-val" style="font-weight:800;color:rgb(49,90,231)">${lead.hs_score}</span></div>` : ''}
      ${lead.li_about_summary ? `<div class="detail-row"><span class="detail-row-label">About</span><span class="detail-row-val" style="font-weight:400;color:#374151">${lead.li_about_summary.substring(0,120)}${lead.li_about_summary.length>120?'…':''}</span></div>` : ''}
    </div>

    <span class="detail-label">Notizen</span>
    <textarea class="notes-area" id="detailNotes" placeholder="Notizen zu diesem Lead...">${lead.notes||''}</textarea>
    <button class="btn-save" id="saveNotesBtn" data-id="${lead.id}">💾 Notizen speichern</button>
  `

  $('saveNotesBtn').addEventListener('click', async () => {
    const btn = $('saveNotesBtn')
    const notes = $('detailNotes').value
    btn.textContent = '⏳ Speichert...'
    await sbFetch(`leads?id=eq.${lead.id}`, 'PATCH', { notes })
    btn.textContent = '✓ Gespeichert'
    btn.classList.add('saved')
    setTimeout(() => { btn.textContent = '💾 Notizen speichern'; btn.classList.remove('saved') }, 2000)
  })

  // Links via chrome.tabs.create (window.open ist in Side Panel geblockt)
  $('btnOpenLeadesk').addEventListener('click', () => {
    chrome.tabs.create({ url: `https://app.leadesk.de/leads/${lead.id}` })
  })
  if (lead.linkedin_url) {
    $('btnOpenLinkedIn')?.addEventListener('click', () => {
      chrome.tabs.create({ url: lead.linkedin_url })
    })
  }
  if (lead.email) {
    $('btnOpenMail')?.addEventListener('click', () => {
      chrome.tabs.create({ url: `mailto:${lead.email}` })
    })
  }
}

$('leadSearch').addEventListener('input', e => {
  const q = e.target.value.toLowerCase()
  renderLeads(allLeads.filter(l => {
    const name = `${l.first_name||''} ${l.last_name||''} ${l.name||''}`.toLowerCase()
    return name.includes(q) || (l.company||'').toLowerCase().includes(q)
  }))
})

// ── Messages Page ─────────────────────────────────────────────────
//
// 3-Modi-Picker analog app.leadesk.de/messages. Bei Mode-Wechsel:
// - selected-Class umsetzen
// - msgSoftHint (Längen-Hint) updaten
// - existing Result + Copy-Button verstecken (neuer Output erwartet)
document.querySelectorAll('.msg-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.msg-type-btn').forEach(b => b.classList.remove('selected'))
    btn.classList.add('selected')
    selectedMsgType = btn.dataset.type
    updateMsgSoftHint()
    // Result verwerfen — Mode-Wechsel = neuer Output erwartet
    $('msgResult').style.display = 'none'
    $('copyBtn').style.display = 'none'
  })
})

function updateMsgSoftHint() {
  const cfg = MSG_TYPES[selectedMsgType]
  if (!cfg) return
  const el = $('msgSoftHint')
  if (el) el.textContent = cfg.softTarget || ''
}

// Audience-Select-Handler
$('audienceSelect')?.addEventListener('change', e => {
  selectedAudienceId = e.target.value || ''
})

// ── Brand-Voice + Audiences laden (lazy, beim ersten Messages-Page-Open) ─
//
// Lookup-Hierarchie analog BrandVoiceContext.jsx:
//   1. user_preferences.active_brand_voice_id (persistiert pro User)
//   2. Fallback: brand_voices WHERE user_id = $userId AND is_active = true (LIMIT 1)
//
// Audiences: target_audience_brand_voices JOIN target_audiences WHERE brand_voice_id = $bv.id
async function loadBrandVoiceAndAudiences() {
  if (bvLoadAttempted) return
  bvLoadAttempted = true

  try {
    const { supabaseSession, userId } = await getAuth()
    const token = supabaseSession?.access_token
    if (!token || !userId) {
      updateBvBanner(null)
      return
    }

    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + token }

    // 1. user_preferences.active_brand_voice_id holen
    let activeBvId = null
    try {
      const prefRes = await fetch(
        `${SUPABASE_URL}/rest/v1/user_preferences?user_id=eq.${userId}&select=active_brand_voice_id`,
        { headers }
      )
      if (prefRes.ok) {
        const prefData = await prefRes.json()
        activeBvId = prefData?.[0]?.active_brand_voice_id || null
      }
    } catch (_) {}

    // 2. Brand-Voice fetchen: explizite ID wenn vorhanden, sonst is_active=true Fallback
    let bv = null
    if (activeBvId) {
      const bvRes = await fetch(
        `${SUPABASE_URL}/rest/v1/brand_voices?id=eq.${activeBvId}&select=id,name,is_active`,
        { headers }
      )
      if (bvRes.ok) {
        const bvData = await bvRes.json()
        bv = bvData?.[0] || null
      }
    }
    if (!bv) {
      // Fallback: erste eigene aktive BV
      const fallbackRes = await fetch(
        `${SUPABASE_URL}/rest/v1/brand_voices?user_id=eq.${userId}&is_active=eq.true&select=id,name&limit=1`,
        { headers }
      )
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json()
        bv = fallbackData?.[0] || null
      }
    }

    activeBrandVoice = bv
    updateBvBanner(bv)

    // 3. Audiences laden wenn BV vorhanden
    if (bv) {
      const audRes = await fetch(
        `${SUPABASE_URL}/rest/v1/target_audience_brand_voices?brand_voice_id=eq.${bv.id}&select=target_audiences(id,name,description,is_default)`,
        { headers }
      )
      if (audRes.ok) {
        const audData = await audRes.json()
        const list = (audData || []).map(r => r.target_audiences).filter(Boolean)
        list.sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0))
        audiences = list
        const def = list.find(a => a.is_default)
        if (def) selectedAudienceId = def.id
        renderAudienceSelect()
      }
    }
  } catch (e) {
    console.warn('[Leadesk BV/TA] load failed:', e.message)
  }
}

function updateBvBanner(bv) {
  const banner = $('bvBanner')
  const label = $('bvLabel')
  if (!banner || !label) return
  if (bv) {
    banner.style.display = 'flex'
    banner.classList.remove('inactive')
    label.textContent = 'Brand Voice: ' + bv.name
  } else {
    banner.style.display = 'flex'
    banner.classList.add('inactive')
    label.textContent = 'Keine Brand Voice aktiv — Standard-Stil'
  }
}

function renderAudienceSelect() {
  const wrap = $('audienceSelectWrap')
  const sel = $('audienceSelect')
  if (!wrap || !sel) return
  if (audiences.length === 0) {
    wrap.style.display = 'none'
    return
  }
  wrap.style.display = 'block'
  sel.innerHTML = '<option value="">— keine Zielgruppe —</option>' +
    audiences.map(a =>
      `<option value="${a.id}"${a.id === selectedAudienceId ? ' selected' : ''}>${escapeAudienceLabel(a.name)}${a.is_default ? ' (Standard)' : ''}</option>`
    ).join('')
}

function escapeAudienceLabel(s) {
  return (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;')
}

// ── buildPrompt: 1:1-Logik aus Messages.jsx ─────────────────────────
//
// Die generate-EF ignoriert body.systemPrompt komplett (siehe Messages.jsx
// Z96-101 Kommentar): nimmt nur body.prompt + body.content_kind, baut den
// System-Prompt selbst aus DB-Daten auf (active BV via buildBrandVoicePrompt,
// active Audience via ai_summary). Daher packen wir alles in body.prompt.
function buildPrompt(mode, recipient, audience) {
  const cfg = MSG_TYPES[mode]
  if (!cfg) return ''
  const parts = []
  parts.push(cfg.promptIntent)
  if (audience) {
    parts.push(`ZIELGRUPPE: ${audience.name}${audience.description ? ' — ' + audience.description : ''}`)
  }
  const recParts = []
  recParts.push(`Name: ${recipient.name || 'unbekannt'}`)
  if (recipient.position) recParts.push(`Position: ${recipient.position}`)
  if (recipient.company)  recParts.push(`Unternehmen: ${recipient.company}`)
  parts.push('EMPFÄNGER:\n' + recParts.join('\n'))
  return parts.join('\n\n')
}

// ── generateMessage: rewrite analog Messages.jsx ────────────────────
async function generateMessage() {
  const btn = $('generateBtn')
  btn.disabled = true
  btn.innerHTML = '<div class="spinner"></div> Generiere...'
  $('msgResult').style.display = 'none'
  $('copyBtn').style.display = 'none'

  const cfg = MSG_TYPES[selectedMsgType]
  if (!cfg) {
    $('msgResult').textContent = '⚠ Unbekannter Modus: ' + selectedMsgType
    $('msgResult').style.display = 'block'
    btn.disabled = false
    btn.innerHTML = '✨ Nachricht generieren'
    return
  }

  const name = currentProfile?.first_name || currentProfile?.name?.split(' ')[0] || 'diese Person'
  const position = currentProfile?.job_title || currentProfile?.headline || ''
  const company = currentProfile?.company || ''
  const audience = audiences.find(a => a.id === selectedAudienceId) || null

  const prompt = buildPrompt(
    selectedMsgType,
    { name, position, company },
    audience
  )

  // Model aus chrome.storage (von Options-Page), Default: leer (= EF wählt account-default)
  const { ai_model_preference } = await new Promise(r =>
    chrome.storage.local.get(['ai_model_preference'], r)
  )

  try {
    const { supabaseSession } = await getAuth()
    const token = supabaseSession?.access_token

    const body = {
      type:           cfg.edgeType,
      prompt:         prompt,
      brand_voice_id: activeBrandVoice?.id || null,
      content_kind:   cfg.contentKind,
    }
    if (ai_model_preference) body.model = ai_model_preference

    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + (token || SUPABASE_KEY),
      },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    let text =
      (typeof data === 'string' ? data : null) ||
      data?.text ||
      data?.content ||
      (Array.isArray(data?.content) ? data.content[0]?.text : null) ||
      data?.result ||
      data?.about ||
      data?.message ||
      ''

    if (text) {
      text = text.trim()
      // Hard-Cap für Vernetzung (LinkedIn-Limit 300 Zeichen)
      if (cfg.hardCap && text.length > cfg.hardCap) {
        text = text.substring(0, cfg.hardCap - 3).trim() + '...'
      }
    }

    if (!text) throw new Error(data?.error || 'Keine Antwort erhalten')

    $('msgResult').textContent = text
    $('msgResult').style.display = 'block'
    $('copyBtn').style.display = 'block'
  } catch(e) {
    $('msgResult').textContent = '⚠ Fehler: ' + e.message
    $('msgResult').style.display = 'block'
  }

  btn.disabled = false
  btn.innerHTML = '✨ Nachricht generieren'
}

// Brand-Voice/Audience initial laden sobald Auth verfügbar ist
;(async () => {
  // Kurzes Delay damit chrome.storage initial befüllt ist
  setTimeout(() => loadBrandVoiceAndAudiences(), 500)
})()

$('copyBtn').addEventListener('click', () => {
  navigator.clipboard.writeText($('msgResult').textContent)
  $('copyBtn').textContent = '✓ Kopiert!'
  setTimeout(() => { $('copyBtn').textContent = '📋 Kopieren' }, 2000)
})

// ── SSI Page ──────────────────────────────────────────────────────
async function loadSSI() {
  try {
    const { supabaseSession, userId } = await getAuth()
    const token = supabaseSession?.access_token
    if (!token || !userId) return
    const r = await fetch(`${SUPABASE_URL}/rest/v1/ssi_scores?user_id=eq.${userId}&order=recorded_at.desc&limit=1`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + token } })
    if (!r.ok) return
    const data = await r.json()
    if (!data?.length) return
    const s = data[0]
    $('ssiTotal').textContent = Math.round(s.total_score)
    $('ssiDate').textContent = new Date(s.recorded_at).toLocaleDateString('de-DE', { day:'2-digit', month:'short', year:'numeric' })
    // Sub-Scores — DB-Spalten heißen build_brand/find_people/engage_insights/build_relationships
    // (NICHT brand_score/find_score/engage_score/relationships_score — alter Bug pre-v9.6.1)
    const setBar = (barId, valId, val) => {
      const hasVal = val !== null && val !== undefined
      const v = hasVal ? Math.round(val) : 0
      $(barId).style.width = (v / 25 * 100) + '%'
      $(valId).textContent = hasVal ? v : '—'
    }
    setBar('barBrand',  'valBrand',  s.build_brand)
    setBar('barFind',   'valFind',   s.find_people)
    setBar('barEngage', 'valEngage', s.engage_insights)
    setBar('barRel',    'valRel',    s.build_relationships)
    $('ssiEmpty').style.display = 'none'
    $('ssiContent').style.display = 'block'
  } catch(e) {
    console.warn('[Leadesk SSI] loadSSI failed:', e.message)
  }
}

$('ssiBtn').addEventListener('click', async () => {
  const btn = $('ssiBtn')
  btn.disabled = true
  btn.innerHTML = '<div class="spinner"></div> SSI wird geladen...'

  chrome.runtime.sendMessage({ type: 'FETCH_SSI' })

  // Pollen bis Ergebnis (max 30s)
  let attempts = 0
  const SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`
  const resetBtn = () => { btn.disabled = false; btn.innerHTML = SVG + ' SSI Score jetzt laden' }

  const poll = setInterval(() => {
    attempts++
    chrome.runtime.sendMessage({ type: 'GET_SSI_STATUS' }, async (status) => {
      if (!status) return
      if (status.error) {
        clearInterval(poll); resetBtn()
        $('ssiEmpty').textContent = '⚠ ' + status.error
        $('ssiEmpty').style.display = 'block'
        return
      }
      if (status.ok) {
        clearInterval(poll); resetBtn()
        await loadSSI()
        return
      }
      if (attempts >= 30) {
        clearInterval(poll); resetBtn()
        $('ssiEmpty').textContent = '⚠ Timeout — bitte nochmal versuchen'
        $('ssiEmpty').style.display = 'block'
      }
    })
  }, 1000)
})

// ── Auth + Init ───────────────────────────────────────────────────
// Liest Auth aus einem bestimmten Tab heraus.
async function readAuthFromTab(tabId) {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        const k = Object.keys(localStorage).find(k => k.includes('auth-token'))
        if (!k) return null
        try {
          const d = JSON.parse(localStorage.getItem(k))
          if (!d || !d.access_token) return null
          return { session: { access_token: d.access_token, user: { id: d.user?.id } }, userId: d.user?.id }
        } catch { return null }
      }
    })
    return result?.[0]?.result || null
  } catch(e) { return null }
}

async function syncAuth() {
  try {
    // Beide Domains parallel pruefen — wer eingeloggt ist gewinnt;
    // wenn beide, Prod zuerst.
    const prodTabs = await chrome.tabs.query({ url: 'https://app.leadesk.de/*' })
    const stagingTabs = await chrome.tabs.query({ url: 'https://staging.leadesk.de/*' })

    const prodAuth = prodTabs.length ? await readAuthFromTab(prodTabs[0].id) : null
    const stagingAuth = stagingTabs.length ? await readAuthFromTab(stagingTabs[0].id) : null

    let data, env
    if (prodAuth?.session) {
      data = prodAuth; env = 'prod'
    } else if (stagingAuth?.session) {
      data = stagingAuth; env = 'staging'
    } else {
      return false
    }

    // ENVS-Map nutzen damit der richtige Endpoint genutzt wird
    if (ENVS[env]) {
      SUPABASE_URL = ENVS[env].url
      SUPABASE_KEY = ENVS[env].key
    }
    await chrome.storage.local.set({
      supabaseSession: data.session,
      userId: data.userId,
      env: env,
      // Auch token-Eintrag setzen damit background.js getAuth darauf zurueckgreifen kann
      token: data.session.access_token,
      tokenExpiry: Date.now() + 30*60*1000
    })
    console.log('[Leadesk SidePanel] env detected:', env)
    return true
  } catch(e) { console.error('[Leadesk SidePanel] syncAuth:', e); return false }
}

async function init() {
  setStatus('', 'Prüfe Status...')
  // IMMER syncAuth aufrufen -- alter Cache koennte falsche env haben.
  // syncAuth ueberschreibt env+token+supabaseSession mit frischen Werten.
  await syncAuth()
  let { supabaseSession, userId, env } = await getAuth()
  if (env) {
    // Env-Badge im Status anzeigen zur Diagnose
    const badge = env === 'staging' ? ' [STAGING]' : ''
    if (badge) setStatus('connected', 'Verbunden' + badge)
  }
  if (!supabaseSession || !userId) {
    if (await syncAuth()) {
      const a = await getAuth(); supabaseSession = a.supabaseSession; userId = a.userId
    }
  }
  if (!supabaseSession || !userId) {
    setStatus('error', 'Nicht eingeloggt')
    $('notLoggedIn').style.display = 'block'
    $('noProfile').style.display = 'none'
    return
  }
  currentUserId = userId
  setStatus('connected', 'Eingeloggt ✓')
  await Promise.all([loadTeams(userId), loadProfileFromTab()])
  loadSSI()
}

// ── Events ────────────────────────────────────────────────────────
$('importBtn').addEventListener('click', importLead)
$('generateBtn').addEventListener('click', generateMessage)
$('refreshBtn').addEventListener('click', () => { if (currentUserId) loadProfileFromTab() })
$('retryBtn').addEventListener('click', () => { if (currentUserId) loadProfileFromTab() })
$('backToLeads').addEventListener('click', () => {
  $('leadsDetailView').style.display = 'none'
  $('leadsListView').style.display = 'block'
})
// Alle externen Links via chrome.tabs.create
document.querySelectorAll('[data-href]').forEach(el => {
  el.addEventListener('click', () => chrome.tabs.create({ url: el.dataset.href }))
})
$('btnDashboard')?.addEventListener('click', () => chrome.tabs.create({ url: 'https://app.leadesk.de' }))

chrome.tabs.onActivated.addListener(() => { if (currentUserId) loadProfileFromTab() })
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'complete' || !currentUserId) return
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs[0]?.id === tabId) setTimeout(loadProfileFromTab, 800)
  })
})
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'PROFILE_DETECTED' && msg.profile) {
    currentProfile = msg.profile; showProfile(msg.profile); setStatus('connected', 'Profil erkannt ✓')
  }
})

init()

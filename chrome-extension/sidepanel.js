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

  renderMatchBanner(profile)
}

function resetImportBtn() {
  const btn = document.getElementById('importBtn')
  if (!btn) return
  btn.className = 'btn-primary'
  btn.disabled = false
  setBtnLabel('In Leadesk importieren')
  window.__matchState = null
}

// ── Existing-Lead-Lookup (v9.10.0) ────────────────────────────────
// Findet vorhandene Leads beim Import:
//   1. LinkedIn-URL exakt (primär — zuverlässigster Match)
//   2. Name strict (Fallback wenn URL-Match leer — fängt manuell angelegte ohne LinkedIn-URL)
// RLS scopt auf alle Teams wo der User Member ist. Archivierte sind inkludiert.
async function findExistingLeads({ linkedinUrl, firstName, lastName }) {
  if (!currentUserId) return []

  const results = []
  const seen = new Set()
  const select = `select=id,first_name,last_name,name,company,linkedin_url,user_id,owner_id,team_id,archived,archived_at,updated_at,teams(name)`

  // Query 1: LinkedIn-URL exakt
  if (linkedinUrl) {
    const data = await sbFetch(
      `leads?${select}&linkedin_url=eq.${encodeURIComponent(linkedinUrl)}&limit=20`
    )
    if (Array.isArray(data)) {
      for (const lead of data) {
        if (!seen.has(lead.id)) { seen.add(lead.id); results.push({ ...lead, _matchType: 'url' }) }
      }
    }
  }

  // Query 2: Name strict (nur wenn URL leer geblieben — sonst zu noisy)
  if (results.length === 0 && firstName && lastName) {
    const data = await sbFetch(
      `leads?${select}&first_name=ilike.${encodeURIComponent(firstName)}&last_name=ilike.${encodeURIComponent(lastName)}&limit=20`
    )
    if (Array.isArray(data)) {
      for (const lead of data) {
        if (!seen.has(lead.id)) { seen.add(lead.id); results.push({ ...lead, _matchType: 'name' }) }
      }
    }
  }

  // Enrich: Owner-Profile (full_name) für Anzeige
  const ownerIds = [...new Set(results.map(l => l.owner_id || l.user_id).filter(Boolean))]
  let profileMap = {}
  if (ownerIds.length > 0) {
    const data = await sbFetch(
      `profiles?select=id,full_name,email&id=in.(${ownerIds.join(',')})`
    )
    if (Array.isArray(data)) profileMap = Object.fromEntries(data.map(p => [p.id, p]))
  }

  return results.map(lead => {
    const ownerId = lead.owner_id || lead.user_id
    const ownerProfile = profileMap[ownerId]
    return {
      id: lead.id,
      displayName: `${lead.first_name||''} ${lead.last_name||''}`.trim() || lead.name || 'Unbekannt',
      company: lead.company || null,
      linkedinUrl: lead.linkedin_url || null,
      teamName: lead.teams?.name || null,
      teamId: lead.team_id,
      ownerName: ownerProfile?.full_name || ownerProfile?.email?.split('@')[0] || 'Teammitglied',
      archived: !!lead.archived,
      archivedAt: lead.archived_at,
      updatedAt: lead.updated_at,
      sameUser: ownerId === currentUserId,
      matchType: lead._matchType,
    }
  })
}

function fmtRelativeDate(iso) {
  if (!iso) return ''
  const d = new Date(iso); const now = new Date()
  const days = Math.floor((now - d) / 86400000)
  if (days === 0) return 'heute'
  if (days === 1) return 'gestern'
  if (days < 30) return `vor ${days} Tagen`
  if (days < 365) return `vor ${Math.floor(days/30)} Monaten`
  return `vor ${Math.floor(days/365)} Jahren`
}

function deriveMatchState(matches) {
  if (!matches || matches.length === 0) return { state: 'new', matches: [] }
  const urlMatches = matches.filter(m => m.matchType === 'url')
  if (urlMatches.length > 0) {
    const archivedSame = urlMatches.find(m => m.sameUser && m.archived)
    const archivedAny  = urlMatches.find(m => m.archived)
    const sameUser     = urlMatches.find(m => m.sameUser && !m.archived)
    if (sameUser)      return { state: 'same_user', matches: [sameUser] }
    if (archivedAny)   return { state: 'archived',  matches: urlMatches }
    return { state: 'known', matches: urlMatches }
  }
  return { state: 'duplicate', matches }
}

// Hält das SVG-Icon im Import-Button, ersetzt nur den Text-Knoten daneben
function setBtnLabel(text) {
  const btn = document.getElementById('importBtn')
  if (!btn) return
  const svg = btn.querySelector('svg')
  btn.innerHTML = ''
  if (svg) btn.appendChild(svg)
  btn.appendChild(document.createTextNode(svg ? ' ' + text : text))
}

function renderMatchBanner(profile) {
  const banner = document.getElementById('matchBanner')
  if (!banner) return Promise.resolve()
  banner.style.display = 'none'
  banner.innerHTML = ''
  banner.className = 'match-banner'

  return findExistingLeads({
    linkedinUrl: profile.linkedin_url || profile.profile_url || null,
    firstName: profile.first_name || (profile.name || '').split(' ')[0] || null,
    lastName: profile.last_name || (profile.name || '').split(' ').slice(1).join(' ') || null,
  }).then(matches => {
    const { state, matches: filtered } = deriveMatchState(matches)
    window.__matchState = { state, matches: filtered }   // für importLead-Pre-Check (Phase 3)
    banner.classList.add('state-' + state.replace('_', '-'))
    banner.style.display = 'block'

    if (state === 'new') {
      banner.innerHTML = `<div class="match-label">🟢 Neu</div><div>Dieser Kontakt ist noch nicht im CRM — bereit zum Importieren.</div>`
      return
    }

    const labels = {
      same_user: { icon: '⛔', label: 'Bereits importiert' },
      known:     { icon: '🟡', label: 'Bekannter Kontakt' },
      archived:  { icon: '🟠', label: 'Archiviert im CRM' },
      duplicate: { icon: '⚠️', label: `${filtered.length} mögliche Duplikate (gleicher Name)` },
    }
    const cfg = labels[state]

    const rows = filtered.slice(0, 5).map(m => `
      <div class="match-row">
        <div class="match-name">${m.displayName}${m.company ? ' · ' + m.company : ''}</div>
        <div class="match-meta">
          Team ${m.teamName || '—'} · Owner ${m.ownerName}${m.archived ? ' · archiviert' : ''}
          · zuletzt ${fmtRelativeDate(m.updatedAt)}
        </div>
        <div class="match-actions">
          <button class="open-existing" data-id="${m.id}">Bestehenden öffnen</button>
          ${state === 'archived' && m.sameUser ? `<button class="restore-existing primary" data-id="${m.id}">Wiederherstellen</button>` : ''}
        </div>
      </div>
    `).join('')

    banner.innerHTML = `<div class="match-label">${cfg.icon} ${cfg.label}</div>${rows}`

    // Click-Handlers
    banner.querySelectorAll('.open-existing').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id
        chrome.tabs.create({ url: `https://app.leadesk.de/leads/${id}` })
      })
    })
    banner.querySelectorAll('.restore-existing').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id
        btn.disabled = true; btn.textContent = 'Wiederherstellen…'
        const ok = await sbFetch(`leads?id=eq.${id}`, 'PATCH', { archived: false, archived_at: null })
        if (ok) {
          chrome.tabs.create({ url: `https://app.leadesk.de/leads/${id}` })
        } else {
          btn.disabled = false; btn.textContent = 'Wiederherstellen'
          alert('Wiederherstellen fehlgeschlagen — bitte in Leadesk öffnen.')
        }
      })
    })

    // Import-Button State (für Phase 3 vorbereitet)
    const importBtn = document.getElementById('importBtn')
    if (importBtn) {
      if (state === 'same_user') {
        importBtn.disabled = true
        setBtnLabel('Bereits importiert')
      } else if (state === 'known' || state === 'archived' || state === 'duplicate') {
        importBtn.disabled = false
        setBtnLabel('Trotzdem importieren')
      } else {
        importBtn.disabled = false
        setBtnLabel('In Leadesk importieren')
      }
    }
  })
}

async function importLead() {
  if (!currentProfile || !currentUserId) return

  // ── Phase 3: Pre-Insert Race-Check ──────────────────────────────
  // Nochmal frischer Lookup — falls eine parallele Session/Tab den Lead
  // seit dem Page-Load-Banner angelegt hat (Realtime-Drift).
  const liveMatches = await findExistingLeads({
    linkedinUrl: currentProfile.linkedin_url || currentProfile.profile_url || null,
    firstName: currentProfile.first_name || (currentProfile.name || '').split(' ')[0] || null,
    lastName: currentProfile.last_name || (currentProfile.name || '').split(' ').slice(1).join(' ') || null,
  })
  const live = deriveMatchState(liveMatches)

  // Same-User-URL-Match (du hast den Kontakt schon) → Hard-Block.
  if (live.state === 'same_user') {
    alert('Du hast diesen Kontakt schon importiert. Aktualisiere die Ansicht — kein neuer Eintrag angelegt.')
    renderMatchBanner(currentProfile)
    return
  }

  // Known / Duplicate → Confirmation vor dem Doppel-Insert
  if (live.state === 'known' || live.state === 'duplicate') {
    const n = live.matches.length
    const proceed = window.confirm(
      `${n === 1 ? 'Es existiert bereits 1 Kontakt' : `Es existieren bereits ${n} Kontakte`} mit ähnlichen Daten in deinem CRM.\n\n` +
      `Möchtest du trotzdem einen neuen Eintrag anlegen?`
    )
    if (!proceed) {
      renderMatchBanner(currentProfile)
      return
    }
  }

  // Archived → Hinweis auf Wiederherstellen statt Doppel-Insert
  if (live.state === 'archived') {
    const proceed = window.confirm(
      'Dieser Kontakt ist archiviert im CRM.\n\n' +
      'Möchtest du einen neuen Eintrag anlegen statt den archivierten wiederherzustellen?\n\n' +
      'Tipp: Abbrechen + im Banner oben „Wiederherstellen" klicken.'
    )
    if (!proceed) {
      renderMatchBanner(currentProfile)
      return
    }
  }

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
    if (!ids.length) { $('teamSelectorWrap').style.display = 'none'; return }

    const r2 = await fetch(`${SUPABASE_URL}/rest/v1/teams?id=in.(${ids.join(',')})&select=id,name`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + token } })
    const teams = r2.ok ? await r2.json() : []
    if (!teams.length) { $('teamSelectorWrap').style.display = 'none'; return }

    const wrap = $('teamSelectorWrap')
    const sel = $('teamSelect')
    const readonly = $('teamReadonlyName')
    const saved = localStorage.getItem('leadesk_selected_team')

    if (teams.length === 1) {
      // Read-only Badge bei 1 Team
      sel.style.display = 'none'
      readonly.style.display = 'inline-block'
      readonly.textContent = teams[0].name
      currentTeamId = teams[0].id
      localStorage.setItem('leadesk_selected_team', currentTeamId)
    } else {
      // Dropdown bei 2+ Teams
      sel.style.display = 'inline-block'
      readonly.style.display = 'none'
      sel.innerHTML = ''
      teams.forEach(t => {
        const o = document.createElement('option')
        o.value = t.id; o.textContent = t.name
        if (t.id === saved) o.selected = true
        sel.appendChild(o)
      })
      if (!saved) sel.options[0].selected = true
      currentTeamId = sel.value
      sel.onchange = () => {
        currentTeamId = sel.value
        localStorage.setItem('leadesk_selected_team', currentTeamId)
        refreshAfterTeamSwitch()
      }
    }

    wrap.style.display = 'flex'
  } catch (e) {
    console.warn('[Leadesk] loadTeams failed:', e)
  }
}

// ── Phase 1: Sales-Navigator-Modus (Foundation) ──────────────────
async function detectSalesNavContext() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab || !tab.url) return null
    if (tab.url.indexOf('https://www.linkedin.com/sales/lead/') === 0) {
      var m = tab.url.match(/\/sales\/lead\/([^/?]+)/)
      return { mode: 'sales_lead', url: tab.url, sourceId: m ? m[1] : null }
    }
    if (tab.url.indexOf('https://www.linkedin.com/sales/search/people') === 0) {
      const u = new URL(tab.url)
      return { mode: 'sales_saved_search', url: tab.url, savedSearchId: u.searchParams.get('savedSearchId') }
    }
    return null
  } catch (e) {
    return null
  }
}

function renderSalesNavView(ctx) {
  const root = document.getElementById('salesNavStub')
  if (!root) { console.warn('[Leadesk] salesNavStub fehlt'); return }
  const isLead = ctx.mode === 'sales_lead'
  root.style.display = 'block'
  root.innerHTML =
    '<div style="margin:6px 12px;padding:16px;border:1px solid #FDE68A;background:#FFFBEB;border-radius:10px">' +
    '<div style="font-size:15px;font-weight:700;margin-bottom:8px">Sales Navigator erkannt</div>' +
    '<div style="font-size:12px;margin-bottom:6px">Modus: <strong>' + ctx.mode + '</strong></div>' +
    (ctx.savedSearchId ? '<div style="font-size:12px;margin-bottom:6px">Saved-Search-ID: <code>' + ctx.savedSearchId + '</code></div>' : '') +
    (ctx.sourceId ? '<div style="font-size:12px;margin-bottom:6px">Lead-ID: <code>' + ctx.sourceId + '</code></div>' : '') +
    (isLead
      ? '<button id="salesImportBtn" class="btn-primary" style="width:100%;margin-top:12px">Lead importieren</button>'
      : ctx.mode === 'sales_saved_search'
        ? (currentTeamId
            ? '<button id="salesBulkBtn" class="btn-primary" style="width:100%;margin-top:12px">Suchergebnisse scannen (Vorschau)</button>' +
              '<button id="salesWorkerBtn" class="btn-primary" style="width:100%;margin-top:8px">Alle Seiten importieren</button>' +
              '<div id="salesBulkStatus" style="font-size:11px;margin-top:8px;color:#555"></div>' +
              '<div id="salesBulkPreview" style="margin-top:10px"></div>'
            : '<div style="font-size:12px;color:#92400E;background:#FEF3C7;border:1px solid #FDE68A;padding:10px;border-radius:8px;margin-top:12px">' +
              '<strong>Solo-Account</strong><br>Bulk-Import aus gespeicherten Suchen braucht ein Team. ' +
              'Leg in Leadesk unter <em>Einstellungen → Team</em> eines an. ' +
              'Einzel-Import auf der Lead-Detailseite funktioniert weiter.</div>')
        : '<div style="font-size:11px;color:#92400E;background:#FEF3C7;padding:10px;border-radius:6px;margin-top:10px">Unterstützt: Lead-Detail + gespeicherte Suche.</div>') +
    '</div>'
  // Standard-Pages ausblenden (router-aware: .active entfernen → CSS .page{display:none})
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))

  if (isLead) {
    const btn = document.getElementById('salesImportBtn')
    if (btn) btn.addEventListener('click', () => importSalesNavLead(ctx))
  } else if (ctx.mode === 'sales_saved_search') {
    const btn = document.getElementById('salesBulkBtn')
    if (btn) btn.addEventListener('click', () => previewSavedSearch(ctx))
    const wbtn = document.getElementById('salesWorkerBtn')
    if (wbtn) wbtn.addEventListener('click', () => {
      const ok = window.confirm(
        'Bis zu ' + BULK_CAP + ' Leads dieser Suche per Sales-Navigator-API importieren? ' +
        '(Für größere Suchen danach einen weiteren Import starten. Dauert ~1 Min.)')
      if (!ok) return
      runApiBulkImport(ctx, BULK_CAP)
    })
    checkResumeOnOpen()
  }
}

// Phase 3: Saved-Search PREVIEW-only.
// Scrape der Result-Liste → Vorschau (Count + erste 5 Leads). KEIN Insert,
// KEIN Job-Row — der Bulk-Import-Trigger ist für Phase 4 geparkt (dort dann
// inkl. Pre-Dedup gegen sales_nav_id, Job-Tracking, optional Profil-Enrichment
// mit 12s-Throttle). Hier nur Verifikation, dass Scrape + sales_nav_id stimmen.
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}
async function previewSavedSearch(ctx) {
  const btn = document.getElementById('salesBulkBtn')
  const stat = document.getElementById('salesBulkStatus')
  const prev = document.getElementById('salesBulkPreview')
  const setStat = (t) => { if (stat) stat.textContent = t }
  if (!btn) return
  btn.disabled = true
  btn.innerHTML = '<div class="spinner"></div> Lese Suchergebnisse...'
  if (prev) prev.innerHTML = ''
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab || !tab.id) throw new Error('Kein aktiver Tab')

    const resp = await new Promise(resolve => {
      chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_SALES_SEARCH', maxResults: 100 }, r => {
        if (chrome.runtime.lastError) { resolve(null); return }
        resolve(r)
      })
    })
    if (!resp || !resp.ok || !resp.data) throw new Error((resp && resp.error) || 'Scrape fehlgeschlagen')

    const { results, count } = resp.data
    console.log('[Leadesk][SalesNav] scrapeSavedSearch →', count, 'Leads', JSON.parse(JSON.stringify(results))) // TEMP Phase-3-Smoke
    if (!count) throw new Error('Keine Leads in der Suche gefunden')

    // Vorschau: erste 5 Leads (Name · Job · Firma · sales_nav_id-Prefix)
    const rows = results.slice(0, 5).map(r =>
      '<div style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px">' +
      '<div style="font-weight:600">' + esc(r.name) + '</div>' +
      '<div style="color:#666">' + esc(r.job_title || '—') + (r.company ? ' · ' + esc(r.company) : '') + '</div>' +
      '<div style="color:#999;font-size:10px;font-family:monospace">' + esc((r.sales_nav_id || '').slice(0, 22)) + '</div>' +
      '</div>'
    ).join('')
    if (prev) {
      prev.innerHTML =
        '<div style="border:1px solid #ddd;border-radius:8px;overflow:hidden">' + rows + '</div>' +
        (count > 5 ? '<div style="font-size:11px;color:#888;margin-top:6px">… und ' + (count - 5) + ' weitere</div>' : '') +
        '<button id="salesBulkImportBtn" class="btn-primary" style="width:100%;margin-top:12px">Importieren (' + count + ' Leads)</button>'
      const imp = document.getElementById('salesBulkImportBtn')
      if (imp) imp.addEventListener('click', () => importBulkStub(ctx, results))
    }
    setStat(`${count} Leads erkannt`)
    btn.className = 'btn-primary success'
    btn.innerHTML = `✓ ${count} erkannt (Vorschau)`
    btn.disabled = false
  } catch (err) {
    btn.className = 'btn-primary error'
    btn.disabled = false
    btn.innerHTML = '⚠ ' + (err.message || 'Fehler').substring(0, 40)
  }
}

// Aufruf der sales-nav-import Edge Function (JWT-authentifiziert).
async function efCall(action, payload) {
  const { supabaseSession } = await getAuth()
  const token = supabaseSession?.access_token
  if (!token) return { ok: false, error: 'no_token' }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/sales-nav-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ action, ...payload }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, error: (data && data.error) || ('http_' + res.status) }
    return { ok: true, data }
  } catch (e) { return { ok: false, error: e.message } }
}

// Phase 4a: Stub-Bulk-Ingest aus der Saved-Search-Vorschau.
// create → ingest (Batches à 50) → control:finish. Kein Throttle (Listendaten,
// kein Profilbesuch). Cap 500/Job (EF cappt total_leads); Detail-Enrichment mit
// 12s-Throttle ist 4b. COALESCE-Upsert in der RPC dedupt + ergänzt additiv.
const BULK_BATCH = 50
const BULK_CAP = 500
async function importBulkStub(ctx, results) {
  const btn = document.getElementById('salesBulkImportBtn')
  const stat = document.getElementById('salesBulkStatus')
  const setStat = (t) => { if (stat) stat.textContent = t }
  if (!btn) return
  if (!currentTeamId) { alert('Bulk-Import braucht ein Team.'); return }
  const count = results.length
  if (count > BULK_CAP) {
    const ok = window.confirm(
      `${count} Leads gefunden. Pro Job werden max. ${BULK_CAP} importiert.\n\n` +
      `Die ersten ${BULK_CAP} jetzt importieren? Für den Rest später einen neuen Job starten.`)
    if (!ok) return
  }
  btn.disabled = true
  btn.innerHTML = '<div class="spinner"></div> Job anlegen...'
  try {
    const created = await efCall('create', {
      team_id: currentTeamId, source_type: 'saved_search',
      source_url: ctx.url, source_id: ctx.savedSearchId || null, total_scraped: count,
    })
    if (!created.ok) throw new Error('create: ' + created.error)
    const { job_id, total_leads } = created.data

    const toSend = results.slice(0, total_leads)
    let inserted = 0, updated = 0, failed = 0
    for (let i = 0; i < toSend.length; i += BULK_BATCH) {
      const chunk = toSend.slice(i, i + BULK_BATCH)
      const r = await efCall('ingest', { job_id, leads: chunk })
      if (!r.ok) throw new Error('ingest: ' + r.error)
      inserted += r.data.inserted; updated += r.data.updated; failed += r.data.failed
      const done = Math.min(i + BULK_BATCH, toSend.length)
      setStat(`${done}/${toSend.length} verarbeitet · ${inserted} neu · ${updated} aktualisiert`)
      btn.innerHTML = `<div class="spinner"></div> ${done}/${toSend.length}…`
    }
    await efCall('control', { job_id, op: 'finish' })

    btn.className = 'btn-primary success'
    btn.innerHTML = `✓ ${inserted} neu, ${updated} aktualisiert`
    setStat(`Fertig: ${inserted} neu · ${updated} aktualisiert · ${failed} Fehler · ${toSend.length} verarbeitet`)
    setStatus('connected', `${inserted + updated} Leads importiert ✓`)
  } catch (err) {
    btn.className = 'btn-primary error'
    btn.disabled = false
    btn.innerHTML = '⚠ ' + (err.message || 'Fehler').substring(0, 40)
  }
}

// ════════════════════════════════════════════════════════════════════
// Phase 4b: Cross-Page-Worker (SKELETT — Code-Review vor Scharfschaltung)
// Paginiert per chrome.tabs.update über die Saved-Search-Seiten, scraped je
// Seite die Result-Liste (content-sales scrapeSavedSearch), sammelt, dann EIN
// create+ingest-Lauf (Batches à 100). 429-Heuristiken pausieren den Job.
// ⚠ Der Worker BESETZT den aktiven Tab während des Laufs — UX muss das klar
//   kommunizieren (Banner "Tab wird für den Import genutzt, bitte nicht wegklicken").
// Detail-Enrich (12s/Lead) ist Phase 4c, hier NICHT.
// ════════════════════════════════════════════════════════════════════
const WORKER_KEY = 'leadesk_sales_nav_active_job'
const POLL_READY_TIMEOUT = 45000  // LinkedIn-Worst-Case-Ladezeit; short-circuit sobald Cards da
// PAGE_SIZE bewusst entfernt: der Worker terminiert dynamisch bei "empty page"
// + collected>=targetCount, nimmt also jede tatsächliche Seitengröße (25/50/…).
const PAGE_THROTTLE_MS = 6000
const MAX_PAGES = 40           // Hard-Ceiling; BULK_CAP (500) greift davor
const RATE_LIMIT_PAUSE_MS = 60 * 60 * 1000  // 1h, configurable

let workerControl = { paused: false, cancelled: false } // In-Memory-Flags

async function loadWorkerState() { const o = await chrome.storage.local.get(WORKER_KEY); return o[WORKER_KEY] || null }
async function saveWorkerState(s) { await chrome.storage.local.set({ [WORKER_KEY]: s }) }
async function clearWorkerState() { await chrome.storage.local.remove(WORKER_KEY) }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// Kanonische Saved-Search-URL aus savedSearchId bauen — NICHT von tab.url
// kopieren! Die Sales-Nav-SPA normalisiert die aktive URL zur
// ?query=(recentSearchParam:…)-Form, die als andere/leere Suche lädt → 0 Leads.
// page 1 OHNE page-Param (Sales-Nav-Konvention für die erste Seite).
function canonicalSavedSearchUrl(savedSearchId, page) {
  var u = new URL('https://www.linkedin.com/sales/search/people')
  u.searchParams.set('savedSearchId', String(savedSearchId))
  if (page > 1) u.searchParams.set('page', String(page))
  return u.toString()
}

// Fallback für Ad-hoc-Suchen ohne savedSearchId: page-Param auf die Live-URL
// setzen (erhält _ntb/Filter). Weniger robust — daher nur wenn keine savedSearchId.
function buildPageUrl(baseUrl, page) {
  var u = new URL(baseUrl)
  u.searchParams.set('page', String(page))
  return u.toString()
}

// Wählt die Strategie: canonical (Saved Search) bevorzugt, sonst URL-Mutation.
// + #leadesk-worker-Hash: signalisiert content-sales, dass DIES der Worker-Tab
// ist (nicht der aktive User-Tab) → autonomer Scrape + Push. Sales-Nav ignoriert
// den Hash (path/query-basiertes Routing).
function workerPageUrl(savedSearchId, baseUrl, page) {
  var u = savedSearchId ? canonicalSavedSearchUrl(savedSearchId, page) : buildPageUrl(baseUrl, page)
  return u + '#leadesk-worker;p=' + page // p=N → content-sales zeigt die Seite im Overlay
}

// Eine Seite ansteuern + scrapen. Returnt { leads, rateLimited }.
// Polling auf Result-Cards (statt fixem Wait). Returnt {ready, rateLimited}.
// content-sales antwortet erst wenn das Content-Script auf der neuen Seite lebt
// (lastError während des Page-Loads → weiter pollen).
async function pollTabReady(tabId, timeout, interval) {
  timeout = timeout || 8000; interval = interval || 200
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const r = await new Promise(res => {
      chrome.tabs.sendMessage(tabId, { type: 'SALES_READY' }, resp => {
        if (chrome.runtime.lastError) { res(null); return }
        res(resp)
      })
    })
    if (r && r.rateLimited) return { ready: false, rateLimited: r.rateLimited }
    if (r && r.ready) return { ready: true, rateLimited: null }
    await sleep(interval)
  }
  return { ready: false, rateLimited: null } // Timeout
}

// Eine Seite ansteuern + scrapen. Returnt { leads, rateLimited, timedOut }.
// Worker-Tab MUSS aktiv/sichtbar sein während Poll+Scrape — sonst drosselt
// Chrome Rendering/Lazy-Load im Background-Tab und die Result-Cards laden nie.
// Nach dem Scrape Fokus zurück zum User-Tab (restoreTabId) → User hat seinen
// Tab während der 6s-Throttle; der Worker-Tab blitzt nur kurz auf.
// 8s-Poll → 1 Retry → bei zweitem Timeout timedOut=true (Loop → failed).
// sendMessage mit hartem Timeout (MV3: ohne kann der Callback nie feuern wenn
// der Channel still hängt). Resolve null bei Timeout/lastError — nie hängen.
function sendMessageWithTimeout(tabId, msg, timeoutMs) {
  timeoutMs = timeoutMs || 30000
  return new Promise(resolve => {
    var done = false
    var timer = setTimeout(() => { if (!done) { done = true; console.log('[Leadesk][Worker] sendMessage TIMEOUT', msg.type); resolve(null) } }, timeoutMs)
    chrome.tabs.sendMessage(tabId, msg, resp => {
      if (done) return
      done = true; clearTimeout(timer)
      if (chrome.runtime.lastError) { console.log('[Leadesk][Worker] sendMessage error:', chrome.runtime.lastError.message); resolve(null); return }
      resolve(resp)
    })
  })
}

// Wartet auf das SALES_SCRAPE_DONE-Push von content-sales (push-basiert →
// kein sendMessage-Channel-Race). Listener VOR der Navigation registrieren.
function waitForScrapeDone(timeoutMs) {
  timeoutMs = timeoutMs || 60000
  return new Promise(resolve => {
    var done = false
    function handler(msg) {
      if (!msg || msg.type !== 'SALES_SCRAPE_DONE') return
      if (done) return
      done = true; clearTimeout(timer); chrome.runtime.onMessage.removeListener(handler)
      resolve(msg)
    }
    var timer = setTimeout(() => { if (!done) { done = true; chrome.runtime.onMessage.removeListener(handler); console.log('[Leadesk][Worker] SALES_SCRAPE_DONE TIMEOUT (60s)'); resolve(null) } }, timeoutMs)
    chrome.runtime.onMessage.addListener(handler)
  })
}

// Push-basiert: navigieren → auf SALES_SCRAPE_DONE warten (content-sales scrapet
// autonom via #leadesk-worker-Hash). Returnt { leads, rateLimited, timedOut }.
async function navigateAndScrapePage(tabId, savedSearchId, baseUrl, page) {
  const url = workerPageUrl(savedSearchId, baseUrl, page)
  console.log('[Leadesk][Worker] navigate to page', page, '→', url)
  const donePromise = waitForScrapeDone(60000) // Listener VOR Navigation → kein Miss
  await chrome.tabs.update(tabId, { url: url, active: true }) // Vordergrund — bleibt aktiv über alle Seiten
  const result = await donePromise
  if (!result) return { leads: [], rateLimited: null, timedOut: true }
  console.log('[Leadesk][Worker] scrape result page ' + page + ': ' + (result.results || []).length + ' leads' + (result.rateLimited ? ' rateLimited=' + result.rateLimited : ''))
  return { leads: result.results || [], rateLimited: result.rateLimited || null, timedOut: false }
}

// ════════════════════════════════════════════════════════════════════
// Phase 4b (NEU, API-basiert): Sales-Nav-API direkt statt DOM-Scraping.
// Kein Tab-Worker, kein Scroll, kein Overlay — die Sidepanel ruft die interne
// salesApiLeadSearch via chrome.scripting.executeScript({world:'MAIN'}) im
// LinkedIn-Tab ab (Cookies via credentials:'include'). Schnell + robust.
// (Der alte DOM-Worker driveWorker/navigateAndScrapePage bleibt dormant im File
//  als Fallback bis diese API-Route verifiziert ist.)
// ════════════════════════════════════════════════════════════════════

// Läuft im MAIN-World des LinkedIn-Tabs (serialisiert via executeScript).
// MUSS self-contained sein (keine Closure über Sidepanel-Scope).
function pageWorldFetchBatch(savedSearchId, sessionId, start, count) {
  var csrf = null
  try { var m = document.cookie.match(/JSESSIONID="?([^";]+)"?/); csrf = m ? m[1] : null } catch (e) {}
  var url = 'https://www.linkedin.com/sales-api/salesApiLeadSearch' +
    '?q=savedSearchId&start=' + start + '&count=' + count +
    '&savedSearchId=' + encodeURIComponent(savedSearchId) +
    (sessionId ? '&trackingParam=(sessionId:' + encodeURIComponent(sessionId) + ')' : '') +
    '&decorationId=com.linkedin.sales.deco.desktop.searchv2.LeadSearchResult-14'
  var headers = { 'accept': '*/*', 'x-restli-protocol-version': '2.0.0' } // restli-Header: häufigste 400-Ursache
  if (csrf) headers['csrf-token'] = csrf // defensiv — LinkedIn verlangt ihn meist
  return fetch(url, { method: 'GET', credentials: 'include', headers: headers })
    .then(function (r) { return r.ok ? r.json() : { __error: 'API ' + r.status } })
    .catch(function (e) { return { __error: String(e && e.message || e) } })
}

async function execInPage(tabId, func, args) {
  try {
    const res = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: func, args: args || [] })
    return res && res[0] ? res[0].result : null
  } catch (e) { console.warn('[Leadesk][Worker][API] executeScript:', e.message); return null }
}

// sales_nav_id IMMER als ACwAA…-Profile-Hash aus entityUrn — konsistent mit
// Phase-2-Single-Import (DB-verifiziert ACwAABTn_K8…). NICHT die numerische
// member-ID aus objectUrn, sonst matcht der Dedup-Index nicht gegen Phase 2.
function extractSalesNavId(el) {
  var ent = String((el && el.entityUrn) || '')
  var m = ent.match(/fs_salesProfile:\(([^,)]+)/) // "(ACwAA…,NAME_SEARCH,…)" → ACwAA…
  if (m) return m[1]
  var any = (ent.match(/(ACw[A-Za-z0-9_-]{10,})/) || [])[1] // Fallback
  return any || null
}

function parseApiElement(el) {
  if (!el) return null
  var sid = extractSalesNavId(el)
  if (!sid) { console.warn('[parse] FAIL kein sales_nav_id — entityUrn=', el.entityUrn, 'objectUrn=', el.objectUrn); return null }
  var first = el.firstName || ''
  var last = el.lastName || ''
  // job_title/company stecken in currentPositions[0] (current:true), nicht top-level
  var positions = Array.isArray(el.currentPositions) ? el.currentPositions : []
  var pos = positions.filter(function (p) { return p && p.current })[0] || positions[0] || {}
  return {
    sales_nav_id: sid,
    name: (first + ' ' + last).trim() || el.fullName || 'Unbekannt',
    first_name: first || null,
    last_name: last || null,
    job_title: pos.title || el.headline || null,
    company: pos.companyName || el.companyName || null,
    source: 'sales_nav', status: 'Lead',
  }
}

async function runApiBulkImport(ctx, targetCount) {
  const stat = document.getElementById('salesBulkStatus')
  const prev = document.getElementById('salesBulkPreview')
  const setStat = (t) => { if (stat) stat.textContent = t }
  const wbtn = document.getElementById('salesWorkerBtn')
  if (!currentTeamId) { alert('Bulk-Import braucht ein Team.'); return }
  if (!ctx.savedSearchId) { alert('Keine savedSearchId in der URL erkennbar.'); return }
  if (wbtn) { wbtn.disabled = true; wbtn.innerHTML = '<div class="spinner"></div> Lade…' }
  const target = Math.min(targetCount, BULK_CAP)
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab || !tab.id || !/linkedin\.com\/sales\//.test(tab.url || '')) throw new Error('Kein aktiver Sales-Nav-Tab')

    const sessionId = null // trackingParam optional — Smoke bestätigte: nicht nötig
    const collected = []
    const seen = new Set()
    let start = 0, total = null, round = 0
    while (collected.length < target && round < 60) { // round-Cap = Endlosschleifen-Backstop
      const batch = await execInPage(tab.id, pageWorldFetchBatch, [ctx.savedSearchId, sessionId, start, 25])
      if (!batch || batch.__error) throw new Error('API: ' + (batch && batch.__error || 'leere Antwort'))
      const els = batch.elements || []
      if (!els.length) break

      let newInRound = 0
      for (const e of els) {
        let p = null
        try { p = parseApiElement(e) } catch (pe) { console.error('[Leadesk][Worker][API] parse failed:', e && e.objectUrn, pe.message) }
        if (p && p.sales_nav_id && !seen.has(p.sales_nav_id)) { seen.add(p.sales_nav_id); collected.push(p); newInRound++ }
      }
      total = (batch.paging && batch.paging.total) != null ? batch.paging.total : total
      start += els.length
      round++
      console.log('[Leadesk][Worker][API] runde', round, '· collected:', collected.length, '/', (total != null ? total : '?'))
      setStat(`${collected.length} geladen${total != null ? ' / ' + total : ''}…`)
      if (wbtn) wbtn.innerHTML = `<div class="spinner"></div> ${collected.length}${total != null ? '/' + Math.min(total, target) : ''}…`

      if (newInRound === 0) { console.log('[Leadesk][Worker][API] keine neuen Leads → stop (Pagination-Ende oder sales_nav_id nicht geparst)'); break }
      if (total != null && start >= total) break
      await sleep(500) // ~2 calls/s
    }
    console.log('[Leadesk][Worker][API] Sammlung fertig:', collected.length, 'Leads')

    if (!collected.length) throw new Error('0 Leads geparst (sales_nav_id-Mapping? → FIRST ELEMENT prüfen)')
    const toSend = collected.slice(0, target)

    // EF (Phase 4a) unverändert: create → ingest(100) → finish
    const created = await efCall('create', {
      team_id: currentTeamId, source_type: 'saved_search',
      source_url: ctx.url, source_id: ctx.savedSearchId, total_scraped: toSend.length,
    })
    if (!created.ok) throw new Error('create: ' + created.error)
    const jobId = created.data.job_id
    let inserted = 0, updated = 0, failed = 0
    for (let i = 0; i < toSend.length; i += 100) {
      const r = await efCall('ingest', { job_id: jobId, leads: toSend.slice(i, i + 100) })
      if (!r.ok) throw new Error('ingest: ' + r.error)
      inserted += r.data.inserted; updated += r.data.updated; failed += r.data.failed
      setStat(`${Math.min(i + 100, toSend.length)}/${toSend.length} importiert · ${inserted} neu`)
    }
    await efCall('control', { job_id: jobId, op: 'finish' })
    console.log('[Leadesk][Worker][API] DONE:', inserted, 'neu,', updated, 'aktualisiert,', failed, 'Fehler')
    if (wbtn) { wbtn.className = 'btn-primary success'; wbtn.innerHTML = `✓ ${inserted} neu, ${updated} aktualisiert` }
    setStat(`Fertig: ${inserted} neu · ${updated} aktualisiert · ${failed} Fehler · ${toSend.length} gesamt`)
    setStatus('connected', `${inserted + updated} Leads importiert ✓`)
  } catch (err) {
    console.warn('[Leadesk][Worker][API] error:', err.message)
    if (wbtn) { wbtn.className = 'btn-primary error'; wbtn.disabled = false; wbtn.innerHTML = '⚠ ' + (err.message || 'Fehler').substring(0, 44) }
  }
}

// Frischer Start: State anlegen → driveWorker.  (DORMANT — DOM-Fallback)
async function runWorkerFlow(ctx, targetCount) {
  workerControl = { paused: false, cancelled: false }
  const state = {
    savedSearchId: ctx.savedSearchId, url: ctx.url,
    targetCount: Math.min(targetCount, BULK_CAP), teamId: currentTeamId,
    currentPage: 1, collected: [], status: 'scanning', rateLimitUntil: null, jobId: null,
  }
  await saveWorkerState(state)
  return driveWorker(state)
}

// Resume aus paused-State: ab state.currentPage weiterlaufen (frischer Tab).
async function resumeWorker() {
  const state = await loadWorkerState()
  if (!state || state.status !== 'paused') return
  workerControl = { paused: false, cancelled: false }
  state.status = 'scanning'; state.rateLimitUntil = null
  await saveWorkerState(state)
  return driveWorker(state)
}

// Kern-Loop: dedizierter Background-Tab, Sammel-Phase, dann Ingest. Tab-Cleanup
// im finally. State persistiert nach jeder Seite (Resume-fähig).
async function driveWorker(state) {
  // User-Tab merken, um den Fokus nach jedem Scrape + am Ende zurückzugeben
  let originalTabId = null
  try { const [a] = await chrome.tabs.query({ active: true, currentWindow: true }); originalTabId = a ? a.id : null } catch (e) {}

  let tab
  // Vordergrund-Tab (active:true): fokussiert → Sales-Nav lazy-loadet zuverlässig,
  // kein Background-Throttling. User-Tab wird im finally wiederhergestellt.
  try { tab = await chrome.tabs.create({ active: true }) }
  catch (e) { console.log('[Leadesk][Worker] tab_create FAILED:', e.message); state.status = 'failed'; await saveWorkerState(state); renderWorkerProgress(state); throw new Error('tab_create: ' + e.message) }
  state.tabId = tab.id; await saveWorkerState(state)
  console.log('[Leadesk][Worker] Tab created', tab.id, '· target', state.targetCount, '· startPage', state.currentPage)
  try {
    const seen = new Set(state.collected.map(l => l.sales_nav_id))
    while (state.collected.length < state.targetCount && state.currentPage <= MAX_PAGES) {
      if (workerControl.cancelled) { console.log('[Leadesk][Worker] cancelled'); state.status = 'cancelled'; await saveWorkerState(state); break }
      if (workerControl.paused)    { console.log('[Leadesk][Worker] paused'); state.status = 'paused';    await saveWorkerState(state); break }

      renderWorkerLoading(state.currentPage, state.collected.length)
      const { leads, rateLimited, timedOut } = await navigateAndScrapePage(state.tabId, state.savedSearchId, state.url, state.currentPage)
      if (rateLimited) { console.log('[Leadesk][Worker] 429 detected:', rateLimited, '→ pause'); state.status = 'paused'; state.rateLimitUntil = Date.now() + RATE_LIMIT_PAUSE_MS; await saveWorkerState(state); renderWorkerProgress(state); break }
      if (timedOut)    { console.log('[Leadesk][Worker] page', state.currentPage, 'timed out → failed'); state.status = 'failed'; await saveWorkerState(state); renderWorkerProgress(state); break }
      if (!leads.length) { console.log('[Leadesk][Worker] empty page', state.currentPage, '→ Ende der Suche'); break }

      for (const l of leads) { if (l.sales_nav_id && !seen.has(l.sales_nav_id)) { seen.add(l.sales_nav_id); state.collected.push(l) } }
      console.log('[Leadesk][Worker] collected', state.collected.length, 'total nach Seite', state.currentPage)
      state.currentPage++; await saveWorkerState(state); renderWorkerProgress(state)
      await sleep(PAGE_THROTTLE_MS)
    }
    if (state.status === 'scanning' && state.collected.length) await ingestCollected(state)
  } finally {
    if (state.tabId) { try { await chrome.tabs.remove(state.tabId) } catch (e) {} }
    if (originalTabId) { try { await chrome.tabs.update(originalTabId, { active: true }) } catch (e) {} }
  }
  return state
}

// Ingest-Phase: create → Batches à 100 → finish.
async function ingestCollected(state) {
  state.status = 'ingesting'; await saveWorkerState(state); renderWorkerProgress(state)
  const toSend = state.collected.slice(0, state.targetCount)
  console.log('[Leadesk][Worker] ingest start:', toSend.length, 'Leads')
  const created = await efCall('create', {
    team_id: state.teamId, source_type: 'saved_search',
    source_url: state.url, source_id: state.savedSearchId || null, total_scraped: toSend.length,
  })
  if (!created.ok) { console.log('[Leadesk][Worker] create FAILED:', created.error); state.status = 'failed'; await saveWorkerState(state); renderWorkerProgress(state); throw new Error('create: ' + created.error) }
  state.jobId = created.data.job_id; await saveWorkerState(state)
  console.log('[Leadesk][Worker] job created', created.data.job_id, '· total_leads', created.data.total_leads)

  let inserted = 0, updated = 0, failed = 0
  for (let i = 0; i < toSend.length; i += 100) {
    const r = await efCall('ingest', { job_id: state.jobId, leads: toSend.slice(i, i + 100) })
    if (!r.ok) { console.log('[Leadesk][Worker] ingest FAILED:', r.error); state.status = 'failed'; await saveWorkerState(state); renderWorkerProgress(state); throw new Error('ingest: ' + r.error) }
    inserted += r.data.inserted; updated += r.data.updated; failed += r.data.failed
  }
  await efCall('control', { job_id: state.jobId, op: 'finish' })
  console.log('[Leadesk][Worker] DONE:', inserted, 'neu,', updated, 'aktualisiert,', failed, 'Fehler')
  state.status = 'done'; state.result = { inserted, updated, failed }; await saveWorkerState(state); renderWorkerProgress(state)
}

async function pauseWorker() { workerControl.paused = true; const s = await loadWorkerState(); if (s && s.jobId) await efCall('control', { job_id: s.jobId, op: 'pause' }) }
async function cancelWorker() { workerControl.cancelled = true; const s = await loadWorkerState(); if (s && s.jobId) await efCall('control', { job_id: s.jobId, op: 'cancel' }); await clearWorkerState() }

// Resume-on-Open: beim Sidepanel-Mount offenen Job prüfen → Banner.
async function checkResumeOnOpen() {
  const s = await loadWorkerState()
  if (!s) return
  if (s.status === 'done' || s.status === 'cancelled' || s.status === 'failed') { await clearWorkerState(); return }
  renderWorkerProgress(s)
}

// [TODO-REVIEW] Progress-UI: Bar "Seite 7/20 · 175 Leads · 0 Fehler" +
// Tab-Besetzt-Warnung + Pause/Resume/Cancel-Buttons. Rendert in #salesBulkPreview.
// Transienter Lade-Banner während des Page-Loads (bis zu 45s pro Seite).
function renderWorkerLoading(page, collected) {
  const prev = document.getElementById('salesBulkPreview')
  if (!prev) return
  prev.innerHTML =
    '<div style="font-size:12px;padding:8px;border:1px solid #ddd;border-radius:8px">' +
    '<div class="spinner" style="display:inline-block"></div> Lade Seite ' + page + ' — bis zu 45 Sek. · ' + collected + ' Leads bisher' +
    '<br><span style="color:#92400E">⚠ Import läuft in einem Hintergrund-Tab — bitte nicht schließen.</span>' +
    '</div>'
}

function renderWorkerProgress(state) {
  const prev = document.getElementById('salesBulkPreview')
  if (!prev || !state) return
  const labels = { scanning: 'Sammle Seiten', ingesting: 'Importiere', paused: 'Pausiert', done: 'Fertig', failed: 'Fehler', cancelled: 'Abgebrochen' }
  const n = state.collected ? state.collected.length : 0
  const res = state.result ? ` · ${state.result.inserted} neu, ${state.result.updated} aktualisiert` : ''
  let html =
    '<div style="font-size:12px;padding:8px;border:1px solid #ddd;border-radius:8px">' +
    '<strong>' + (labels[state.status] || state.status) + '</strong> · Seite ' + (state.currentPage || 1) +
    ' · ' + n + ' Leads' + res +
    (state.rateLimitUntil ? '<br><span style="color:#92400E">Limit erkannt — Auto-Resume um ' + new Date(state.rateLimitUntil).toLocaleTimeString() + '</span>' : '') +
    (state.status === 'scanning' || state.status === 'ingesting' ? '<br><span style="color:#92400E">⚠ Import läuft in einem Hintergrund-Tab — bitte nicht schließen.</span>' : '') +
    '</div>'
  if (state.status === 'scanning' || state.status === 'ingesting') {
    html += '<button id="wkPause" class="btn-secondary" style="margin-top:8px">Pause</button> ' +
            '<button id="wkCancel" class="btn-secondary" style="margin-top:8px">Abbrechen</button>'
  } else if (state.status === 'paused') {
    html += '<button id="wkResume" class="btn-primary" style="margin-top:8px">Fortsetzen</button> ' +
            '<button id="wkCancel" class="btn-secondary" style="margin-top:8px">Verwerfen</button>'
  }
  prev.innerHTML = html
  const p = document.getElementById('wkPause'); if (p) p.onclick = () => pauseWorker()
  const rs = document.getElementById('wkResume'); if (rs) rs.onclick = () => resumeWorker().catch(e => console.warn('[Leadesk][Worker]', e.message))
  const c = document.getElementById('wkCancel'); if (c) c.onclick = () => cancelWorker().then(() => { const prev2 = document.getElementById('salesBulkPreview'); if (prev2) prev2.innerHTML = '' })
}

// Phase 2: Single-Lead-Import aus Sales Navigator.
// Schickt SCRAPE_SALES_LEAD an content-sales.js, inserted mit source='sales_nav'
// + sales_nav_id. Re-Import fängt der Phase-0-Dedup-Index (team_id, sales_nav_id).
// Kein Throttle — Single-Lead ist sofortig nach Klick (12s-Regel erst Phase 4 Bulk).
async function importSalesNavLead(ctx) {
  const btn = document.getElementById('salesImportBtn')
  if (!btn) return
  if (!currentUserId) { alert('Nicht eingeloggt — bitte in Leadesk anmelden.'); return }
  btn.disabled = true
  btn.innerHTML = '<div class="spinner"></div> Lese Profil...'
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab || !tab.id) throw new Error('Kein aktiver Tab')

    const resp = await new Promise(resolve => {
      chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_SALES_LEAD' }, r => {
        if (chrome.runtime.lastError) { resolve(null); return }
        resolve(r)
      })
    })
    if (!resp || !resp.ok || !resp.data) throw new Error((resp && resp.error) || 'Scrape fehlgeschlagen')

    const { profile, sourceId, profileUrl } = resp.data
    console.log('[Leadesk][SalesNav] scrapeLead →', JSON.parse(JSON.stringify(resp.data))) // TEMP Phase-2-Smoke
    if (!profile || !profile.name || profile.name === 'Unbekannt') throw new Error('Kein Profil erkannt')

    const snId = sourceId || ctx.sourceId || null
    const payload = {
      ...profile,
      user_id: currentUserId,
      ...(currentTeamId ? { team_id: currentTeamId } : {}),
      source: 'sales_nav',
      sales_nav_id: snId,
      ...(profileUrl ? { linkedin_url: profileUrl, profile_url: profileUrl } : {}),
    }

    // Plain INSERT — der partielle Unique-Index (team_id, sales_nav_id) WHERE
    // sales_nav_id IS NOT NULL lässt sich NICHT als ON-CONFLICT-Arbiter
    // inferieren (Postgres 42P10, verifiziert auf Staging 2026-06-18). Dedup
    // läuft daher über den Index als harten Gate: Re-Import → 23505 →
    // PostgREST 409 → wir interpretieren das als "bereits vorhanden".
    // (Caveat: Solo-User mit team_id=NULL deduppen nicht — NULLs sind im
    //  Unique-Index distinct. Team-Pfad ist der Hauptfall; Phase 4 ggf. härten.)
    const result = await sbFetch('leads', 'POST', [payload])
    if (result === null) {
      if (/409|23505|duplicate key/i.test(window.__lastError || '')) {
        btn.className = 'btn-primary success'
        btn.innerHTML = '✓ Bereits in Leadesk'
        setStatus('connected', 'Bereits vorhanden ✓')
        return
      }
      throw new Error(window.__lastError || 'Speichern fehlgeschlagen')
    }
    const isNew = Array.isArray(result) && result.length > 0
    btn.className = 'btn-primary success'
    btn.innerHTML = isNew ? '✓ Importiert!' : '✓ Bereits in Leadesk'
    setStatus('connected', isNew ? 'Lead importiert ✓' : 'Bereits vorhanden ✓')
  } catch (err) {
    btn.className = 'btn-primary error'
    btn.disabled = false
    btn.innerHTML = '⚠ ' + (err.message || 'Fehler').substring(0, 40)
  }
}

function renderStandardView() {
  const stub = document.getElementById('salesNavStub')
  if (stub) { stub.style.display = 'none'; stub.innerHTML = '' }
  // Falls eine vorige Sales-Ansicht alle Pages deaktiviert hat: Default reaktivieren
  if (!document.querySelector('.page.active')) {
    const def = document.getElementById('page-import')
    if (def) def.classList.add('active')
  }
}

// Phase D: Re-Render nach Team-Switch
function refreshAfterTeamSwitch() {
  // Match-Banner refresh wenn Profil aktuell sichtbar
  if (typeof currentProfile !== 'undefined' && currentProfile && typeof renderMatchBanner === 'function') {
    renderMatchBanner(currentProfile)
  }
  // Lead-Liste refetch wenn auf page-leads
  const leadsPage = document.querySelector('#page-leads.active')
  if (leadsPage && typeof loadLeads === 'function') {
    loadLeads()
  }
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
  // Phase 1: Sales-Navigator-Modus erkennen (Foundation-Stub)
  const salesCtx = await detectSalesNavContext()
  if (salesCtx) renderSalesNavView(salesCtx); else renderStandardView()
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

// Phase 1: Sales-Nav-Modus LIVE re-detektieren bei Tab-Wechsel/Navigation (nicht nur Mount).
async function reDetect() {
  const salesCtx = await detectSalesNavContext()
  if (salesCtx) renderSalesNavView(salesCtx); else renderStandardView()
}
chrome.tabs.onActivated.addListener(reDetect)
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]?.id === tabId) reDetect()
    })
  }
})

chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'PROFILE_DETECTED' && msg.profile) {
    currentProfile = msg.profile; showProfile(msg.profile); setStatus('connected', 'Profil erkannt ✓')
  }
})

init()

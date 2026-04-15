// ═══════════════════════════════════════════════════════════════
// Leadesk Extension — Popup Script v3.0
// ═══════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://jdhajqpgfrsuoluaesjn.supabase.co'
const SUPABASE_KEY = 'sb_publishable__KdQsVuSD6WWuswGcViaRw_CxDK8grx'
const DASHBOARD    = 'https://app.leadesk.de'

let currentProfile = null
let currentUserId  = null

// ── Helpers ───────────────────────────────────────────────────────
function getAuth() {
  return new Promise(r => chrome.storage.local.get(['supabaseSession', 'userId'], r))
}

function show(id)  { document.getElementById(id).style.display = '' }
function hide(id)  { document.getElementById(id).style.display = 'none' }

function setStatus(type, text) {
  const dot  = document.getElementById('statusDot')
  const label = document.getElementById('statusText')
  dot.className   = 'status-dot ' + type
  label.textContent = text
}

// ── Supabase Fetch ────────────────────────────────────────────────
async function sbFetch(path, method = 'GET', body) {
  const { supabaseSession } = await getAuth()
  const token = supabaseSession?.access_token
  if (!token) return null

  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + token,
      'Prefer': method === 'POST' ? 'return=representation,resolution=merge-duplicates' : '',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) return null
  return res.json().catch(() => null)
}

// ── Profil aus aktivem Tab holen ──────────────────────────────────
async function getProfileFromTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (!tab?.url?.includes('linkedin.com/in/')) {
        resolve(null)
        return
      }
      chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_PROFILE' }, (response) => {
        if (chrome.runtime.lastError || !response?.profile) {
          resolve(null)
          return
        }
        resolve(response.profile)
      })
    })
  })
}

// ── Profil-Card anzeigen ──────────────────────────────────────────
function showProfile(profile) {
  const name    = profile.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unbekannt'
  const title   = profile.job_title || profile.headline || ''
  const company = profile.company || ''
  const avatar  = profile.avatar_url

  document.getElementById('profileName').textContent    = name
  document.getElementById('profileTitle').textContent   = title
  document.getElementById('profileCompany').textContent = company

  const avatarEl = document.getElementById('profileAvatar')
  if (avatar && avatar.startsWith('http')) {
    avatarEl.innerHTML = `<img src="${avatar}" alt="${name}" onerror="this.parentElement.textContent='${name[0]?.toUpperCase() || '?'}'"/>`
  } else {
    avatarEl.textContent = name[0]?.toUpperCase() || '?'
  }
}

// ── Import ausführen ──────────────────────────────────────────────
window.importLead = async function() {
  if (!currentProfile || !currentUserId) return

  const btn = document.getElementById('importBtn')
  btn.disabled = true
  btn.className = 'btn-import'
  btn.innerHTML = `<div class="spinner"></div> Importiere...`

  try {
    const payload = { ...currentProfile, user_id: currentUserId }
    const result  = await sbFetch(
      'leads?on_conflict=user_id,linkedin_url',
      'POST',
      [payload]
    )

    if (result !== null) {
      const isNew = Array.isArray(result) && result.length > 0
      btn.className = 'btn-import success'
      btn.innerHTML = isNew
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Erfolgreich importiert!`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Bereits in Leadesk`

      setStatus('connected', isNew ? 'Lead importiert ✓' : 'Bereits vorhanden ✓')
    } else {
      throw new Error('Speichern fehlgeschlagen')
    }
  } catch(err) {
    btn.className = 'btn-import error'
    btn.innerHTML = `⚠ Fehler — bitte neu versuchen`
    setStatus('error', 'Import fehlgeschlagen')

    setTimeout(() => {
      btn.disabled = false
      btn.className = 'btn-import'
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
          <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
        </svg>
        Nochmal versuchen
      `
    }, 2500)
  }
}

// ── Navigation ────────────────────────────────────────────────────
window.openDashboard = function() {
  chrome.tabs.create({ url: DASHBOARD })
}
window.openLeads = function() {
  chrome.tabs.create({ url: DASHBOARD + '/leads' })
}

// ── Auth aus Leadesk-Tab lesen ────────────────────────────────────
async function syncAuthFromLeadesk() {
  return new Promise((resolve) => {
    chrome.tabs.query({}, (tabs) => {
      const leaTab = tabs.find(t => t.url?.includes('app.leadesk.de') || t.url?.includes('leadesk.de'))
      if (!leaTab) { resolve(false); return }

      chrome.scripting.executeScript({
        target: { tabId: leaTab.id },
        func: () => {
          const key = Object.keys(localStorage).find(k => k.includes('auth-token'))
          if (!key) return null
          try {
            const data = JSON.parse(localStorage.getItem(key))
            return { session: data, userId: data?.user?.id }
          } catch { return null }
        }
      }, (results) => {
        if (chrome.runtime.lastError || !results?.[0]?.result) { resolve(false); return }
        const { session, userId } = results[0].result
        if (session && userId) {
          chrome.storage.local.set({ supabaseSession: session, userId }, () => resolve(true))
        } else {
          resolve(false)
        }
      })
    })
  })
}

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  setStatus('', 'Prüfe Status...')

  // Auth aus gespeichertem Storage
  let { supabaseSession, userId } = await getAuth()

  // Falls nicht vorhanden: aus Leadesk-Tab holen
  if (!supabaseSession || !userId) {
    const synced = await syncAuthFromLeadesk()
    if (synced) {
      const auth = await getAuth()
      supabaseSession = auth.supabaseSession
      userId = auth.userId
    }
  }

  if (!supabaseSession || !userId) {
    setStatus('error', 'Nicht eingeloggt')
    hide('profileFound')
    hide('notOnProfile')
    show('notLoggedIn')
    return
  }

  currentUserId = userId
  setStatus('connected', 'Eingeloggt ✓')
  
  // SSI Section immer anzeigen wenn eingeloggt
  document.getElementById('ssiSection').style.display = 'block'
  loadLastSSI()

  // Prüfe ob auf LinkedIn-Profil
  const profile = await getProfileFromTab()

  if (!profile) {
    hide('notLoggedIn')
    hide('profileFound')
    show('notOnProfile')
    setStatus('connected', 'Eingeloggt — kein Profil offen')
    return
  }

  currentProfile = profile
  hide('notLoggedIn')
  hide('notOnProfile')
  show('profileFound')
  showProfile(profile)
  setStatus('connected', 'Profil erkannt ✓')
}

init()

// ── SSI Score ─────────────────────────────────────────────────────
async function loadLastSSI() {
  try {
    const { supabaseSession, userId } = await getAuth()
    const token = supabaseSession?.access_token
    if (!token || !userId) return

    const r = await fetch(`${SUPABASE_URL}/rest/v1/ssi_scores?user_id=eq.${userId}&order=recorded_at.desc&limit=1`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` }
    })
    if (!r.ok) return
    const data = await r.json()
    if (!data || !data.length) return

    const ssi = data[0]
    document.getElementById('ssiScoreVal').textContent = Math.round(ssi.total_score)
    document.getElementById('ssiScoreDate').textContent = new Date(ssi.recorded_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })

    // Unterkategorien
    const subs = []
    if (ssi.build_brand)         subs.push(`Marke: ${Math.round(ssi.build_brand)}`)
    if (ssi.find_people)         subs.push(`Finden: ${Math.round(ssi.find_people)}`)
    if (ssi.engage_insights)     subs.push(`Insights: ${Math.round(ssi.engage_insights)}`)
    if (ssi.build_relationships) subs.push(`Netzwerk: ${Math.round(ssi.build_relationships)}`)
    if (subs.length) document.getElementById('ssiSubScores').innerHTML = subs.join(' · ')

    document.getElementById('ssiLastScore').style.display = 'block'
  } catch(e) {
    console.warn('[Leadesk SSI] Letzten Score laden:', e.message)
  }
}

function fetchSSI() {
  const btn = document.getElementById('ssiBtn')
  const SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>'
  
  btn.disabled = true
  btn.style.background = '#7C3AED'
  btn.innerHTML = '<div class="spinner" style="border-color:rgba(255,255,255,0.3);border-top-color:#fff"></div> Öffne LinkedIn...'

  // Status in Storage zurücksetzen
  chrome.storage.local.set({ ssiStatus: { loading: true, ts: Date.now() } })

  // Background starten (gibt sofort zurück)
  chrome.runtime.sendMessage({ type: 'FETCH_SSI' }, function(resp) {
    if (chrome.runtime.lastError) {
      btn.innerHTML = '⚠ Extension-Fehler — neu laden'
      btn.style.background = '#DC2626'
      btn.disabled = false
      return
    }
    // Jetzt auf Ergebnis in Storage pollen
    pollSSIStatus()
  })
}

function pollSSIStatus() {
  const btn = document.getElementById('ssiBtn')
  const SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>'
  var startTs = Date.now()
  var dots = 0
  const labels = ['Öffne LinkedIn...', 'Warte auf Seite...', 'Lese Score...', 'Speichere...']

  const poll = setInterval(function() {
    dots++
    // Label wechseln für besseres Feedback
    var label = labels[Math.min(Math.floor(dots / 3), labels.length - 1)]
    btn.innerHTML = '<div class="spinner" style="border-color:rgba(255,255,255,0.3);border-top-color:#fff"></div> ' + label

    // Timeout nach 35s
    if (Date.now() - startTs > 35000) {
      clearInterval(poll)
      btn.innerHTML = '⚠ Timeout — LinkedIn zu langsam?'
      btn.style.background = '#DC2626'
      setTimeout(function() {
        btn.innerHTML = SVG + ' SSI Score erneut versuchen'
        btn.style.background = '#7C3AED'
        btn.disabled = false
      }, 4000)
      return
    }

    chrome.storage.local.get(['ssiStatus'], function(d) {
      var s = d.ssiStatus
      if (!s || s.loading) return // noch lädt

      clearInterval(poll)

      if (s.ok) {
        btn.innerHTML = '✓ Score: ' + Math.round(s.score) + ' gespeichert!'
        btn.style.background = '#059669'
        setTimeout(function() {
          btn.innerHTML = SVG + ' SSI Score aktualisieren'
          btn.style.background = '#7C3AED'
          btn.disabled = false
          loadLastSSI()
        }, 3000)
      } else {
        var err = (s.error || 'Unbekannter Fehler').substring(0, 40)
        btn.innerHTML = '⚠ ' + err
        btn.style.background = '#DC2626'
        setTimeout(function() {
          btn.innerHTML = SVG + ' SSI Score erneut versuchen'
          btn.style.background = '#7C3AED'
          btn.disabled = false
        }, 5000)
      }
    })
  }, 2000) // alle 2 Sekunden prüfen
}

// ── Event Listener (kein inline onclick — MV3 CSP Pflicht) ──────────
// Direkter Aufruf (script lädt nach DOM wegen position am Ende von popup.html)
(function attachListeners() {
  // Import Button
  var importBtn = document.getElementById('importBtn')
  if (importBtn) importBtn.addEventListener('click', window.importLead)

  // SSI Button
  var ssiBtn = document.getElementById('ssiBtn')
  if (ssiBtn) ssiBtn.addEventListener('click', fetchSSI)

  // Footer Buttons
  var btnDash = document.querySelector('.footer .btn-sm:first-child')
  var btnLeads = document.querySelector('.footer .btn-sm:last-child')
  if (btnDash) btnDash.addEventListener('click', window.openDashboard)
  if (btnLeads) btnLeads.addEventListener('click', window.openLeads)

  // Not Logged In Button
  var notLoggedBtn = document.querySelector('#notLoggedIn .btn-import')
  if (notLoggedBtn) notLoggedBtn.addEventListener('click', window.openDashboard)
})()

// ═══════════════════════════════════════════════════════════════
// LinkedIn Lead Radar — Extension Popup v2.0
// ═══════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://jdhajqpgfrsuoluaesjn.supabase.co'
const SUPABASE_KEY = 'sb_publishable__KdQsVuSD6WWuswGcViaRw_CxDK8grx'
const DASHBOARD    = 'https://llr-dashboard.vercel.app'

// ── Supabase Auth ────────────────────────────────────────────────
async function signIn(email, password) {
  const res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'apikey': SUPABASE_KEY },
    body: JSON.stringify({ email, password })
  })
  if (!res.ok) { const e = await res.json(); throw new Error(e.error_description || e.msg || 'Login fehlgeschlagen') }
  return res.json()
}

async function getStoredSession() {
  return new Promise(r => chrome.storage.local.get(['supabaseSession','userId','userEmail'], r))
}

async function saveSession(session, userId, email) {
  return new Promise(r => chrome.storage.local.set({ supabaseSession: session, userId, userEmail: email }, r))
}

async function clearSession() {
  return new Promise(r => chrome.storage.local.remove(['supabaseSession','userId','userEmail'], r))
}

async function sbFetch(path, method, body) {
  const { supabaseSession } = await getStoredSession()
  const token = supabaseSession?.access_token
  if (!token) return null
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: method || 'GET',
    headers: {
      'Content-Type':'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + token,
    },
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) return null
  return method === 'GET' || !method ? res.json() : res
}

// ── UI helpers ───────────────────────────────────────────────────
function show(id)  { const el = document.getElementById(id); if (el) el.style.display = 'block' }
function hide(id)  { const el = document.getElementById(id); if (el) el.style.display = 'none' }
function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text }
function setStatus(msg, type) {
  const el = document.getElementById('status')
  if (!el) return
  el.textContent = msg
  el.className = 'status ' + (type || '')
  el.style.display = 'block'
}

// ── Scrape current LinkedIn tab ─────────────────────────────────
async function scrapeCurrentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tabs.length) return null
  try {
    const res = await chrome.tabs.sendMessage(tabs[0].id, { type: 'SCRAPE_PROFILE' })
    return res?.profile
  } catch(e) {
    return null
  }
}

// ── Get LinkedIn connection status ───────────────────────────────
async function getLinkedInStatus() {
  const { userId } = await getStoredSession()
  if (!userId) return null
  const data = await sbFetch('linkedin_connections?user_id=eq.' + userId + '&select=*')
  return data?.[0] || null
}

// ── Render logged-in UI ──────────────────────────────────────────
async function renderLoggedIn(email) {
  hide('login-view')
  show('main-view')
  setText('user-email', email || '')

  const li = await getLinkedInStatus()
  const liStatusEl = document.getElementById('li-status')
  if (liStatusEl) {
    if (li?.status === 'connected') {
      liStatusEl.textContent = 'Verbunden' + (li.li_name ? ' als ' + li.li_name : '')
      liStatusEl.style.color = '#10B981'
    } else {
      liStatusEl.textContent = 'Nicht verbunden'
      liStatusEl.style.color = '#9CA3AF'
    }
  }

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const url = tabs[0]?.url || ''
  const isLinkedIn = url.includes('linkedin.com')
  const isProfile = url.includes('linkedin.com/in/')

  const scrapeBtn = document.getElementById('scrape-btn')
  const syncBtn = document.getElementById('sync-btn')
  if (scrapeBtn) scrapeBtn.disabled = !isProfile
  if (syncBtn) syncBtn.disabled = !isLinkedIn

  setText('current-url', isLinkedIn ? url.replace('https://www.linkedin.com','').split('?')[0] || '/' : 'Nicht auf LinkedIn')
}

// ── INIT ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const { supabaseSession, userId, userEmail } = await getStoredSession()

  if (supabaseSession && userId) {
    renderLoggedIn(userEmail)
  } else {
    show('login-view')
    hide('main-view')
  }

  // ── Login form ─────────────────────────────────────────────────
  const loginBtn = document.getElementById('login-btn')
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      const email = document.getElementById('email')?.value?.trim()
      const pass  = document.getElementById('password')?.value
      if (!email || !pass) { setStatus('E-Mail und Passwort eingeben', 'error'); return }

      loginBtn.disabled = true
      loginBtn.textContent = 'Anmelden...'
      setStatus('', '')

      try {
        const data = await signIn(email, pass)
        await saveSession(data, data.user.id, email)
        await chrome.runtime.sendMessage({ type: 'SET_SESSION', session: data, userId: data.user.id })
        await renderLoggedIn(email)
      } catch(e) {
        setStatus(e.message, 'error')
      } finally {
        loginBtn.disabled = false
        loginBtn.textContent = 'Anmelden'
      }
    })
  }

  // ── Logout ─────────────────────────────────────────────────────
  const logoutBtn = document.getElementById('logout-btn')
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await clearSession()
      hide('main-view')
      show('login-view')
      setStatus('Abgemeldet', '')
    })
  }

  // ── LinkedIn verbinden ──────────────────────────────────────────
  const connectBtn = document.getElementById('connect-li-btn')
  if (connectBtn) {
    connectBtn.addEventListener('click', async () => {
      const { userId } = await getStoredSession()
      if (!userId) { setStatus('Zuerst anmelden', 'error'); return }
      const tab = await chrome.tabs.create({ url: 'https://www.linkedin.com/feed/', active: true })
      setTimeout(async () => {
        try { await chrome.tabs.sendMessage(tab.id, { type: 'PING' }) } catch(e) {}
      }, 2000)
      window.close()
    })
  }

  // ── Profil scrapen ──────────────────────────────────────────────
  const scrapeBtn = document.getElementById('scrape-btn')
  if (scrapeBtn) {
    scrapeBtn.addEventListener('click', async () => {
      scrapeBtn.disabled = true
      scrapeBtn.textContent = 'Scrape...'
      const profile = await scrapeCurrentTab()
      if (profile) {
        setStatus('Gespeichert: ' + profile.name, 'success')
      } else {
        setStatus('Kein Profil gefunden', 'error')
      }
      scrapeBtn.disabled = false
      scrapeBtn.textContent = 'Profil importieren'
    })
  }

  // ── Sync ausloesen ──────────────────────────────────────────────
  const syncBtn = document.getElementById('sync-btn')
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'TRIGGER_SYNC' })
      setStatus('Sync gestartet!', 'success')
    })
  }

  // ── Dashboard oeffnen ───────────────────────────────────────────
  const dashBtn = document.getElementById('dashboard-btn')
  if (dashBtn) {
    dashBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: DASHBOARD + '/linkedin-connect' })
      window.close()
    })
  }
})

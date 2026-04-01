// ═══════════════════════════════════════════════════════════
// Lead Radar Extension — popup.js v3.0
// Waalaxy-Fluss: Login → auto-connect → Profilbild anzeigen
// ═══════════════════════════════════════════════════════════

const SB_URL = 'https://jdhajqpgfrsuoluaesjn.supabase.co'
const SB_KEY = 'sb_publishable__KdQsVuSD6WWuswGcViaRw_CxDK8grx'
const DASH   = 'https://llr-dashboard.vercel.app'

// ── Storage ──────────────────────────────────────────────────────
function load() { return new Promise(r => chrome.storage.local.get(['session','userId','liConn'], r)) }
function save(d) { return new Promise(r => chrome.storage.local.set(d, r)) }
function clear() { return new Promise(r => chrome.storage.local.remove(['session','userId','liConn'], r)) }

// ── Supabase ─────────────────────────────────────────────────────
async function sbPost(path, body) {
  const d = await load()
  const token = d.session && d.session.access_token
  const res = await fetch(SB_URL + '/rest/v1/' + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SB_KEY,
      'Authorization': token ? 'Bearer ' + token : 'Bearer ' + SB_KEY,
      'Prefer': 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(body)
  })
  return res.ok ? res.json() : null
}

async function sbGet(path) {
  const d = await load()
  const token = d.session && d.session.access_token
  const res = await fetch(SB_URL + '/rest/v1/' + path, {
    headers: {
      'apikey': SB_KEY,
      'Authorization': token ? 'Bearer ' + token : 'Bearer ' + SB_KEY,
    }
  })
  return res.ok ? res.json() : null
}

async function signIn(email, pass) {
  const res = await fetch(SB_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY },
    body: JSON.stringify({ email, password: pass })
  })
  if (!res.ok) {
    const e = await res.json()
    throw new Error(e.error_description || e.msg || 'Login fehlgeschlagen')
  }
  return res.json()
}

// ── LinkedIn Tab finden oder oeffnen ─────────────────────────────
async function getOrOpenLinkedIn() {
  const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' })
  if (tabs.length) return tabs[0]
  return chrome.tabs.create({ url: 'https://www.linkedin.com/feed/', active: false })
}

// ── Content script ausfuehren um Profil zu holen ─────────────────
async function scrapeLinkedInProfile() {
  const tab = await getOrOpenLinkedIn()
  // Kurz warten damit Seite geladen ist
  await new Promise(r => setTimeout(r, 2500))
  try {
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'PING' })
    if (result && result.ok) {
      const profile = await chrome.tabs.sendMessage(tab.id, { type: 'GET_LI_PROFILE' })
      return profile
    }
  } catch(e) {
    // Content script noch nicht geladen — direkt scripten
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: function() {
          const photo = document.querySelector('.global-nav__me-photo, .feed-identity-module__actor-meta img, img.presence-entity__image')
          const name  = photo ? photo.alt : (document.querySelector('.feed-identity-module__actor-meta .t-bold') || {}).innerText || ''
          const headline = (document.querySelector('.feed-identity-module__actor-meta .t-black--light') || {}).innerText || ''
          return { name: name ? name.trim() : '', headline: headline ? headline.trim() : '', avatar: photo ? photo.src : '' }
        }
      })
      return results && results[0] && results[0].result
    } catch(e2) {
      return null
    }
  }
}

// ── Verbindung in Supabase speichern ─────────────────────────────
async function saveConnection(profile) {
  const d = await load()
  if (!d.userId) return null
  const payload = {
    user_id: d.userId,
    status: 'connected',
    li_name: profile.name || '',
    li_avatar_url: profile.avatar || '',
    li_headline: profile.headline || '',
    connected_at: new Date().toISOString(),
    last_active: new Date().toISOString(),
  }
  const result = await sbPost('linkedin_connections?on_conflict=user_id', payload)
  // In chrome.storage cachen
  await save({ liConn: payload })
  return result
}

// ── UI rendern ────────────────────────────────────────────────────
function showLogin() {
  document.getElementById('login-view').style.display = 'block'
  document.getElementById('connected-view').style.display = 'none'
}

function showConnected(conn) {
  document.getElementById('login-view').style.display = 'none'
  document.getElementById('connected-view').style.display = 'block'

  const nameEl     = document.getElementById('li-name')
  const headEl     = document.getElementById('li-headline')
  const statusEl   = document.getElementById('conn-status')
  const avatarWrap = document.getElementById('avatar-wrap')

  if (nameEl) nameEl.textContent = conn.li_name || conn.name || 'LinkedIn Konto'
  if (headEl) headEl.textContent = conn.li_headline || conn.headline || ''

  // Profilbild oder Initialen
  if (avatarWrap) {
    const src = conn.li_avatar_url || conn.avatar || ''
    if (src && src.startsWith('http')) {
      avatarWrap.innerHTML = '<img src="' + src + '" class="avatar" onerror="this.style.display=\'none\'" />'
    } else {
      const initial = (conn.li_name || conn.name || 'L').charAt(0).toUpperCase()
      avatarWrap.innerHTML = '<div class="avatar-placeholder">' + initial + '</div>'
    }
  }

  if (statusEl) statusEl.textContent = 'Verbunden'
}

function showConnecting(name) {
  document.getElementById('login-view').style.display = 'none'
  document.getElementById('connected-view').style.display = 'block'
  const nameEl = document.getElementById('li-name')
  const statusEl = document.getElementById('conn-status')
  const avatarWrap = document.getElementById('avatar-wrap')
  if (nameEl) nameEl.textContent = name || 'Verbinde...'
  if (statusEl) { statusEl.textContent = 'Verbinde...'; statusEl.style.color = '#F59E0B' }
  if (avatarWrap) avatarWrap.innerHTML = '<div class="avatar-placeholder" style="background:#E5E7EB;color:#9CA3AF">...</div>'
}

// ── Haupt-Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const d = await load()

  // Bereits gespeicherte LI-Verbindung aus Cache anzeigen
  if (d.session && d.userId) {
    if (d.liConn && d.liConn.status === 'connected') {
      showConnected(d.liConn)
    } else {
      // Session vorhanden aber noch nicht verbunden
      showConnecting(d.session.user && d.session.user.email)
      // Aus Supabase holen
      const conn = await sbGet('linkedin_connections?user_id=eq.' + d.userId + '&select=*&limit=1')
      if (conn && conn.length && conn[0].status === 'connected') {
        await save({ liConn: conn[0] })
        showConnected(conn[0])
      } else {
        // Noch nicht verbunden — auto-connect starten
        showConnecting('Verbinde mit LinkedIn...')
        autoConnect()
      }
    }
  } else {
    showLogin()
  }

  // ── Login ───────────────────────────────────────────────────────
  const loginBtn = document.getElementById('login-btn')
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      const email = (document.getElementById('email') || {}).value || ''
      const pass  = (document.getElementById('password') || {}).value || ''
      const errEl = document.getElementById('err')
      if (!email || !pass) { showErr('E-Mail und Passwort eingeben'); return }

      loginBtn.disabled = true
      loginBtn.textContent = 'Anmelden...'
      if (errEl) errEl.style.display = 'none'

      try {
        const data = await signIn(email, pass)
        await save({ session: data, userId: data.user.id })
        // Session an background schicken
        chrome.runtime.sendMessage({ type: 'SET_SESSION', session: data, userId: data.user.id })
        // Auto-connect starten
        showConnecting(email)
        autoConnect()
      } catch(e) {
        showErr(e.message)
        loginBtn.disabled = false
        loginBtn.textContent = 'Anmelden'
      }
    })
  }

  // Enter-Taste
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter') loginBtn && loginBtn.click()
  })

  // ── Buttons ─────────────────────────────────────────────────────
  document.getElementById('logout-btn') && document.getElementById('logout-btn').addEventListener('click', async () => {
    await clear()
    showLogin()
  })

  document.getElementById('dash-btn') && document.getElementById('dash-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: DASH + '/linkedin-connect' })
    window.close()
  })

  document.getElementById('li-btn') && document.getElementById('li-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://www.linkedin.com/feed/' })
    window.close()
  })

  document.getElementById('sync-btn') && document.getElementById('sync-btn').addEventListener('click', async () => {
    chrome.runtime.sendMessage({ type: 'TRIGGER_SYNC' })
    document.getElementById('sync-btn').textContent = 'Gestartet!'
    setTimeout(() => { document.getElementById('sync-btn').textContent = 'Sync starten' }, 2000)
  })

  document.getElementById('scrape-btn') && document.getElementById('scrape-btn').addEventListener('click', async () => {
    const btn = document.getElementById('scrape-btn')
    btn.textContent = 'Importiere...'
    btn.disabled = true
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tabs[0] && tabs[0].url && tabs[0].url.includes('linkedin.com/in/')) {
      try {
        await chrome.tabs.sendMessage(tabs[0].id, { type: 'EXECUTE_JOB' })
        btn.textContent = 'Importiert!'
      } catch(e) { btn.textContent = 'Fehler' }
    } else {
      btn.textContent = 'Bitte LinkedIn-Profil oeffnen'
    }
    setTimeout(() => { btn.textContent = 'Profil jetzt importieren'; btn.disabled = false }, 2500)
  })
})

function showErr(msg) {
  const el = document.getElementById('err')
  if (el) { el.textContent = msg; el.style.display = 'block' }
}

// ── Auto-Connect: LinkedIn oeffnen, Profil lesen, speichern ──────
async function autoConnect() {
  try {
    const profile = await scrapeLinkedInProfile()
    if (profile && profile.name) {
      await saveConnection(profile)
      showConnected({ li_name: profile.name, li_avatar_url: profile.avatar, li_headline: profile.headline })
    } else {
      // Kein Profil gefunden — warte auf manuelle Aktion
      const nameEl = document.getElementById('li-name')
      const statusEl = document.getElementById('conn-status')
      if (nameEl) nameEl.textContent = 'Bitte LinkedIn oeffnen'
      if (statusEl) { statusEl.textContent = 'Warte...'; statusEl.style.color = '#F59E0B' }
    }
  } catch(e) {
    console.error('[LLR popup] autoConnect error:', e)
  }
}

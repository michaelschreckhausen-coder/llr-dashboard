// ═══════════════════════════════════════════════════════════════
// LinkedIn Lead Radar — Background Service Worker v2.0
// Koordiniert Queue-Polling, Session-Management und Tab-Steuerung
// ═══════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://jdhajqpgfrsuoluaesjn.supabase.co'
const SUPABASE_KEY = 'sb_publishable__KdQsVuSD6WWuswGcViaRw_CxDK8grx'

// ── Storage helpers ──────────────────────────────────────────────
function getAuth() { return new Promise(r => chrome.storage.local.get(['supabaseSession','userId'], r)) }

// ── Supabase helper ──────────────────────────────────────────────
async function sbFetch(path, method='GET', body) {
  const { supabaseSession } = await getAuth()
  const token = supabaseSession?.access_token
  if (!token) return null
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + token,
      'Prefer': method === 'POST' ? 'resolution=merge-duplicates' : '',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) return null
  return method === 'GET' ? res.json() : res
}

// ── Finde oder oeffne LinkedIn-Tab ───────────────────────────────
async function getLinkedInTab() {
  const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' })
  if (tabs.length > 0) return tabs[0]
  const tab = await chrome.tabs.create({ url: 'https://www.linkedin.com/feed/', active: false })
  return tab
}

// ── Sende Nachricht an LinkedIn-Tab ─────────────────────────────
async function sendToLinkedIn(msg) {
  const tab = await getLinkedInTab()
  await new Promise(r => setTimeout(r, 1500))
  try {
    return await chrome.tabs.sendMessage(tab.id, msg)
  } catch(e) {
    console.log('[LLR BG] Konnte nicht an Tab senden:', e.message)
    return null
  }
}

// ── Queue Check: Pending Jobs holen und ausloesen ─────────────────
async function checkQueue() {
  const { userId, supabaseSession } = await getAuth()
  if (!userId || !supabaseSession) return

  const jobs = await sbFetch(
    'scrape_jobs?user_id=eq.' + userId + '&status=eq.pending&order=priority.asc,created_at.asc&limit=3'
  )
  if (!jobs || !jobs.length) return

  console.log('[LLR BG] Pending Jobs:', jobs.length)

  for (const job of jobs) {
    const tab = await getLinkedInTab()

    // Navigiere den Tab zur Job-URL falls noetig
    if (job.url && tab.url !== job.url) {
      await chrome.tabs.update(tab.id, { url: job.url })
      await new Promise(r => setTimeout(r, 3000))
    }

    // Trigger execution in content script
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'EXECUTE_JOB', jobId: job.id })
    } catch(e) {
      console.log('[LLR BG] Job exec error:', e.message)
    }
  }
}

// ── Automation Jobs ausfuehren ────────────────────────────────────
async function checkAutomationQueue() {
  const { userId, supabaseSession } = await getAuth()
  if (!userId || !supabaseSession) return

  // Rate limit check
  const today = new Date().toISOString().split('T')[0]
  const limits = await sbFetch('rate_limits?user_id=eq.' + userId + '&date=eq.' + today)
  if (!limits) return

  const connectLimit = limits.find(l => l.action === 'connect')
  if (connectLimit && connectLimit.count >= connectLimit.max_daily) {
    console.log('[LLR BG] Tageslimit fuer Verbindungen erreicht')
    return
  }

  const jobs = await sbFetch(
    'automation_jobs?user_id=eq.' + userId +
    '&status=eq.pending&scheduled_at=lte.' + new Date().toISOString() +
    '&order=created_at.asc&limit=1'
  )
  if (!jobs || !jobs.length) return

  const job = jobs[0]
  console.log('[LLR BG] Automation Job:', job.type, job.target_url)

  const tab = await getLinkedInTab()
  if (job.target_url) {
    await chrome.tabs.update(tab.id, { url: job.target_url })
    await new Promise(r => setTimeout(r, 3000))
  }

  // Update rate limit
  await sbFetch('rate_limits', 'POST', {
    user_id: userId, date: today, action: job.type, count: (connectLimit?.count || 0) + 1, max_daily: 20
  })

  // Mark as running
  await sbFetch('automation_jobs?id=eq.' + job.id, 'PATCH', {
    status: 'running', started_at: new Date().toISOString()
  })
}

// ── Heartbeat — Extension am Leben halten ────────────────────────
async function heartbeat() {
  const { userId } = await getAuth()
  if (!userId) return
  await sbFetch(
    'linkedin_connections?user_id=eq.' + userId,
    'PATCH',
    { last_active: new Date().toISOString() }
  )
  await sbFetch(
    'extension_sessions?user_id=eq.' + userId,
    'PATCH',
    { last_ping: new Date().toISOString(), is_active: true }
  )
}

// ── Alarm-Setup ──────────────────────────────────────────────────
chrome.alarms.create('queue-check', { periodInMinutes: 1 })
chrome.alarms.create('heartbeat',   { periodInMinutes: 5 })

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'queue-check') {
    await checkQueue()
    await checkAutomationQueue()
  }
  if (alarm.name === 'heartbeat') {
    await heartbeat()
  }
})

// ── Install/Update Handler ────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  console.log('[LLR BG] Extension installiert/aktualisiert:', reason)
  chrome.alarms.create('queue-check', { periodInMinutes: 1 })
  chrome.alarms.create('heartbeat',   { periodInMinutes: 5 })

  // Extension Session registrieren
  const { userId } = await getAuth()
  if (userId) {
    await sbFetch('extension_sessions', 'POST', {
      user_id: userId,
      version: chrome.runtime.getManifest().version,
      browser: navigator.userAgent,
      is_active: true,
    })
  }
})

// ── Message Handler (von Popup und Content Scripts) ──────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SET_SESSION') {
    chrome.storage.local.set({
      supabaseSession: msg.session,
      userId: msg.userId,
    })
    heartbeat()
    sendResponse({ ok: true })
  }

  if (msg.type === 'TRIGGER_SYNC') {
    checkQueue()
    sendResponse({ started: true })
  }

  if (msg.type === 'GET_STATUS') {
    getAuth().then(({ supabaseSession, userId }) => {
      sendResponse({ loggedIn: !!supabaseSession, userId })
    })
    return true
  }

  if (msg.type === 'PROFILE_SCRAPED') {
    console.log('[LLR BG] Profil gespeichert:', msg.profile?.name)
    sendResponse({ ok: true })
  }

  return true
})

// ── Startup Check ────────────────────────────────────────────────
;(async function() {
  console.log('[LLR BG] Service Worker gestartet v2.0')
  await heartbeat()
  await checkQueue()
})()

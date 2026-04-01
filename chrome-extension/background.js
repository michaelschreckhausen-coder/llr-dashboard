// Lead Radar — Background Service Worker v3.0
// WICHTIG: Oeffnet KEINE neuen Tabs automatisch

const SUPABASE_URL = 'https://jdhajqpgfrsuoluaesjn.supabase.co'
const SUPABASE_KEY = 'sb_publishable__KdQsVuSD6WWuswGcViaRw_CxDK8grx'

function getAuth() { return new Promise(r => chrome.storage.local.get(['session','userId'], r)) }

async function sbFetch(path, method, body) {
  const d = await getAuth()
  const token = d.session && d.session.access_token
  if (!token) return null
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + token,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) return null
  return (method === 'GET' || !method) ? res.json() : res
}

// Nur vorhandene LinkedIn-Tabs nutzen — KEINE neuen erstellen
async function findLinkedInTab() {
  const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' })
  return tabs.length ? tabs[0] : null
}

async function checkQueue() {
  const d = await getAuth()
  if (!d.userId || !d.session) return

  // Nur ausfuehren wenn LinkedIn-Tab bereits offen ist
  const tab = await findLinkedInTab()
  if (!tab) return

  const jobs = await sbFetch(
    'scrape_jobs?user_id=eq.' + d.userId +
    '&status=eq.pending&order=priority.asc,created_at.asc&limit=1'
  )
  if (!jobs || !jobs.length) return

  const job = jobs[0]
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'EXECUTE_JOB', jobId: job.id })
  } catch(e) {
    console.log('[LLR BG] Job exec error:', e.message)
  }
}

async function heartbeat() {
  const d = await getAuth()
  if (!d.userId || !d.session) return
  const now = new Date().toISOString()
  await sbFetch('linkedin_connections?user_id=eq.' + d.userId, 'PATCH', { last_active: now })
}

// Alarms
chrome.alarms.create('queue-check', { periodInMinutes: 1 })
chrome.alarms.create('heartbeat',   { periodInMinutes: 5 })

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'queue-check') await checkQueue()
  if (alarm.name === 'heartbeat')   await heartbeat()
})

chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.log('[LLR BG] v3.0 installiert:', reason)
  chrome.alarms.create('queue-check', { periodInMinutes: 1 })
  chrome.alarms.create('heartbeat',   { periodInMinutes: 5 })
})

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SET_SESSION') {
    chrome.storage.local.set({ session: msg.session, userId: msg.userId })
    sendResponse({ ok: true })
  }
  if (msg.type === 'TRIGGER_SYNC') {
    checkQueue()
    sendResponse({ started: true })
  }
  if (msg.type === 'PROFILE_SCRAPED') {
    console.log('[LLR BG] Profil:', msg.profile && msg.profile.name)
    sendResponse({ ok: true })
  }
  return true
})

// Beim Start NUR heartbeat — kein Tab oeffnen!
;(async function() {
  console.log('[LLR BG] Service Worker v3.0 gestartet')
  await heartbeat()
})()

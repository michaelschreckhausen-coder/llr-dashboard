// Leadesk Extension — Background Service Worker v7.6
// Vernetzung läuft komplett in der Extension (kein Server nötig)
// Öffnet LinkedIn-Tabs unsichtbar im Hintergrund

var SUPABASE_URL = 'https://jdhajqpgfrsuoluaesjn.supabase.co'
var SUPABASE_KEY = 'sb_publishable__KdQsVuSD6WWuswGcViaRw_CxDK8grx'
var DAILY_LIMIT  = 20
var MIN_DELAY    = 45
var MAX_DELAY    = 90

// ── Auth ──────────────────────────────────────────────────────────
async function getAuth() {
  var s = await chrome.storage.local.get(['token', 'userId', 'tokenExpiry'])
  if (s.token && s.tokenExpiry && Date.now() < s.tokenExpiry) {
    try {
      var p = JSON.parse(atob(s.token.split('.')[1]))
      if (p.exp && p.exp * 1000 > Date.now() + 60000) return { token: s.token, userId: s.userId }
    } catch(e) {}
    await chrome.storage.local.remove(['token', 'userId', 'tokenExpiry'])
  }
  try {
    var tabs = await chrome.tabs.query({ url: 'https://app.leadesk.de/*' })
    if (!tabs.length) tabs = await chrome.tabs.query({ url: 'https://*.leadesk.de/*' })
    if (!tabs.length) { console.log('[Leadesk] Kein Leadesk-Tab'); return null }
    var res = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: function() {
        var k = Object.keys(localStorage).find(function(k) { return k.includes('auth-token') })
        if (!k) return null
        try { var d = JSON.parse(localStorage.getItem(k)); return { token: d.access_token, userId: d.user.id } }
        catch(e) { return null }
      }
    })
    var auth = res && res[0] && res[0].result
    if (auth && auth.token) {
      await chrome.storage.local.set({ token: auth.token, userId: auth.userId, tokenExpiry: Date.now() + 30*60*1000 })
      return auth
    }
  } catch(e) { console.error('[Leadesk] Auth:', e.message) }
  return null
}

// ── Supabase ──────────────────────────────────────────────────────
async function sbPatch(path, body) {
  var auth = await getAuth()
  if (!auth) return
  await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + auth.token },
    body: JSON.stringify(body)
  })
}

async function sbGet(path) {
  var auth = await getAuth()
  if (!auth) return null
  var r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + auth.token }
  })
  return r.ok ? r.json() : null
}

// ── Tages-Limit ───────────────────────────────────────────────────
async function checkDaily() {
  var d = await chrome.storage.local.get(['dailyCount', 'dailyDate'])
  var today = new Date().toDateString()
  if (d.dailyDate !== today) { await chrome.storage.local.set({ dailyCount: 0, dailyDate: today }); return true }
  if ((d.dailyCount || 0) >= DAILY_LIMIT) return false
  await chrome.storage.local.set({ dailyCount: (d.dailyCount || 0) + 1 })
  return true
}

// ── LinkedIn Job verarbeiten ──────────────────────────────────────
var processing = false

async function processJob(job) {
  console.log('[Leadesk] Job starten:', job.linkedin_url)

  // Status: running
  await sbPatch('connection_queue?id=eq.' + job.id, { status: 'running', started_at: new Date().toISOString() })
  await chrome.action.setBadgeText({ text: '▶' })
  await chrome.action.setBadgeBackgroundColor({ color: '#3B82F6' })

  var tabId = null
  try {
    // Tab im Hintergrund öffnen (active: false = unsichtbar)
    // Fenster minimiert öffnen — Tab nicht sichtbar
    var win = await chrome.windows.create({ url: job.linkedin_url, focused: false, state: 'minimized' })
    var tab = win.tabs[0]
    tabId = tab.id

    // Warten bis Tab geladen
    await waitLoaded(tabId, 25000)
    await sleep(3500)

    // Vernetzung ausführen
    var result = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: connectOnPage,
      args: [job.message || '']
    })

    var res = result && result[0] && result[0].result
    console.log('[Leadesk] Ergebnis:', JSON.stringify(res))

    if (res && res.ok) {
      await sbPatch('connection_queue?id=eq.' + job.id, { status: 'done', finished_at: new Date().toISOString() })
      await sbPatch('leads?id=eq.' + job.lead_id, { li_connection_status: 'pending', li_connection_requested_at: new Date().toISOString() })
      await chrome.action.setBadgeText({ text: '✓' })
      await chrome.action.setBadgeBackgroundColor({ color: '#059669' })
      setTimeout(function() { chrome.action.setBadgeText({ text: '' }) }, 5000)
      console.log('[Leadesk] ✓ Vernetzt:', job.linkedin_url)
    } else {
      var err = (res && res.error) || 'Unbekannt'
      await sbPatch('connection_queue?id=eq.' + job.id, { status: 'failed', error: err, finished_at: new Date().toISOString() })
      await chrome.action.setBadgeText({ text: '!' })
      await chrome.action.setBadgeBackgroundColor({ color: '#DC2626' })
      console.error('[Leadesk] ✗ Fehler:', err)
    }

  } catch(e) {
    console.error('[Leadesk] Exception:', e.message)
    await sbPatch('connection_queue?id=eq.' + job.id, { status: 'failed', error: e.message, finished_at: new Date().toISOString() })
  } finally {
    if (tab && tab.windowId) setTimeout(function() { chrome.windows.remove(tab.windowId).catch(function(){}) }, 2000)
  }
}

// ── Wird auf der LinkedIn-Seite ausgeführt ────────────────────────
function connectOnPage(message) {
  return new Promise(function(resolve) {
    function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms) }) }

    function findBtn(texts) {
      return Array.from(document.querySelectorAll('button, [role="button"]')).find(function(b) {
        var t = (b.innerText || b.textContent || '').trim()
        return texts.some(function(tx) { return t === tx || t.startsWith(tx) })
      })
    }

    async function run() {
      try {
        // Prüfe Login
        if (document.querySelector('.login__form') || window.location.href.includes('/login') || window.location.href.includes('/authwall')) {
          return resolve({ ok: false, error: 'Nicht eingeloggt auf LinkedIn' })
        }

        // Vernetzen-Button
        var connectBtn = findBtn(['Vernetzen', 'Connect'])

        if (!connectBtn) {
          var moreBtn = findBtn(['Mehr', 'More'])
          if (!moreBtn) return resolve({ ok: false, error: 'Kein Vernetzen-Button gefunden' })
          moreBtn.click(); await sleep(1500)
          var items = Array.from(document.querySelectorAll('[role="menuitem"]'))
          var dropItem = items.find(function(el) {
            return ['Vernetzen','Connect'].includes((el.innerText||'').trim())
          })
          if (!dropItem) return resolve({ ok: false, error: 'Vernetzen nicht im Dropdown' })
          dropItem.click(); await sleep(1500)
        } else {
          connectBtn.click(); await sleep(1500)
        }

        // Modal
        if (message && message.trim()) {
          var noteBtn = findBtn(['Notiz hinzufügen', 'Add a note', 'Personalisieren'])
          if (noteBtn) {
            noteBtn.click(); await sleep(1000)
            var ta = document.querySelector('textarea#custom-message, textarea[name="message"], textarea')
            if (ta) {
              var setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
              setter.call(ta, message.substring(0, 300))
              ta.dispatchEvent(new Event('input', { bubbles: true }))
              await sleep(500)
            }
            var sendBtn = findBtn(['Senden', 'Send'])
            if (sendBtn) { sendBtn.click(); return resolve({ ok: true, method: 'with_note' }) }
          }
        }

        var withoutBtn = findBtn(['Ohne Notiz senden', 'Ohne Notiz', 'Send without a note', 'Senden'])
        if (withoutBtn) { withoutBtn.click(); return resolve({ ok: true, method: 'without_note' }) }

        resolve({ ok: false, error: 'Kein Senden-Button im Modal' })
      } catch(e) {
        resolve({ ok: false, error: e.message })
      }
    }

    run()
  })
}

// ── Tab geladen warten ────────────────────────────────────────────
function waitLoaded(tabId, timeout) {
  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() { reject(new Error('Timeout')) }, timeout)
    function check(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer)
        chrome.tabs.onUpdated.removeListener(check)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(check)
    chrome.tabs.get(tabId, function(tab) {
      if (tab && tab.status === 'complete') {
        clearTimeout(timer)
        chrome.tabs.onUpdated.removeListener(check)
        resolve()
      }
    })
  })
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms) }) }

// ── Queue pollen ──────────────────────────────────────────────────
async function pollQueue() {
  if (processing) return
  var auth = await getAuth()
  if (!auth) { console.log('[Leadesk] Kein Auth — Leadesk-Tab öffnen'); return }

  var ok = await checkDaily()
  if (!ok) { console.log('[Leadesk] Tageslimit erreicht'); return }

  var jobs = await sbGet('connection_queue?user_id=eq.' + auth.userId + '&status=eq.pending&order=created_at.asc&limit=1')
  if (!jobs || !jobs.length) {
    var d = await chrome.storage.local.get(['dailyCount'])
    if ((d.dailyCount||0) > 0) await chrome.storage.local.set({ dailyCount: (d.dailyCount||1)-1 })
    return
  }

  processing = true
  try {
    await processJob(jobs[0])
    var delay = (MIN_DELAY + Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY))) * 1000
    console.log('[Leadesk] Nächster Job in', Math.round(delay/1000) + 's')
    chrome.alarms.create('nextJob', { delayInMinutes: delay/60000 })
  } finally {
    processing = false
  }
}

// ── Alarm Handler ─────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name === 'queuePoll' || alarm.name === 'nextJob') pollQueue()
})

// ── Messages ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.type === 'GET_AUTH') { getAuth().then(sendResponse); return true }
  if (msg.type === 'POLL_NOW') { pollQueue(); sendResponse({ ok: true }); return true }
  if (msg.type === 'PROFILE_IMPORTED') {
    chrome.action.setBadgeText({ text: '✓' })
    chrome.action.setBadgeBackgroundColor({ color: '#059669' })
    setTimeout(function() { chrome.action.setBadgeText({ text: '' }) }, 3000)
    return true
  }
  if (msg.type === 'GET_QUEUE_STATUS') {
    chrome.storage.local.get(['dailyCount', 'dailyDate'], function(d) {
      sendResponse({ dailyCount: d.dailyCount||0, limit: DAILY_LIMIT, processing: processing })
    })
    return true
  }
  return true
})

// ── Install / Startup ─────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(function(details) {
  chrome.alarms.create('queuePoll', { periodInMinutes: 40/60 })
  console.log('[Leadesk] v7.6 installiert — Queue-Polling aktiv')
  if (details.reason === 'install') chrome.tabs.create({ url: 'https://app.leadesk.de' })
})

chrome.runtime.onStartup.addListener(function() {
  chrome.alarms.create('queuePoll', { periodInMinutes: 40/60 })
  console.log('[Leadesk] Chrome gestartet — Queue-Polling reaktiviert')
})

// Beim Laden sofort einmal pollen
setTimeout(pollQueue, 3000)

// Leadesk Extension — Background Service Worker v7.2
// Nutzt chrome.alarms statt setInterval (MV3 kompatibel)

var SUPABASE_URL = 'https://jdhajqpgfrsuoluaesjn.supabase.co'
var SUPABASE_KEY = 'sb_publishable__KdQsVuSD6WWuswGcViaRw_CxDK8grx'
var DAILY_LIMIT  = 20
var MIN_DELAY    = 40  // Sekunden (zwischen Jobs)
var MAX_DELAY    = 90  // Sekunden (zwischen Jobs)

// ── Auth aus Leadesk-Tab ──────────────────────────────────────────
async function getAuth() {
  // 1. Aus Storage (gecacht)
  var s = await chrome.storage.local.get(['token', 'userId', 'tokenExpiry'])
  if (s.token && s.tokenExpiry && Date.now() < s.tokenExpiry) {
    return { token: s.token, userId: s.userId }
  }

  // 2. Aus Leadesk-Tab lesen
  try {
    var tabs = await chrome.tabs.query({ url: 'https://app.leadesk.de/*' })
    if (!tabs.length) tabs = await chrome.tabs.query({ url: 'https://*.leadesk.de/*' })
    if (!tabs.length) return null

    var results = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: function() {
        var k = Object.keys(localStorage).find(function(k) { return k.includes('auth-token') })
        if (!k) return null
        try {
          var d = JSON.parse(localStorage.getItem(k))
          return { token: d && d.access_token, userId: d && d.user && d.user.id }
        } catch(e) { return null }
      }
    })

    var auth = results && results[0] && results[0].result
    if (auth && auth.token && auth.userId) {
      // 50 Min cachen
      await chrome.storage.local.set({
        token: auth.token,
        userId: auth.userId,
        tokenExpiry: Date.now() + 50 * 60 * 1000
      })
      return auth
    }
  } catch(e) {
    console.error('[Leadesk BG] Auth Fehler:', e.message)
  }
  return null
}

// ── Supabase Fetch ────────────────────────────────────────────────
async function sbFetch(path, method, body) {
  var auth = await getAuth()
  if (!auth) return null
  try {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
      method: method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + auth.token,
        'Prefer': method === 'POST' ? 'return=representation' : ''
      },
      body: body ? JSON.stringify(body) : undefined
    })
    if (!res.ok) {
      console.error('[Leadesk BG] Supabase Fehler:', res.status, await res.text())
      return null
    }
    return await res.json()
  } catch(e) {
    console.error('[Leadesk BG] Fetch Fehler:', e.message)
    return null
  }
}

async function sbPatch(path, body) {
  var auth = await getAuth()
  if (!auth) return
  await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + auth.token
    },
    body: JSON.stringify(body)
  })
}

// ── Tages-Limit ───────────────────────────────────────────────────
async function checkAndIncrementDaily() {
  var d = await chrome.storage.local.get(['dailyCount', 'dailyDate'])
  var today = new Date().toDateString()
  if (d.dailyDate !== today) {
    await chrome.storage.local.set({ dailyCount: 0, dailyDate: today })
    return true
  }
  if ((d.dailyCount || 0) >= DAILY_LIMIT) return false
  await chrome.storage.local.set({ dailyCount: (d.dailyCount || 0) + 1 })
  return true
}

// ── LinkedIn Tab für Job öffnen und Vernetzung senden ────────────
async function processJob(job) {
  console.log('[Leadesk BG] Starte Job:', job.linkedin_url)

  // Status: running
  await sbPatch('connection_queue?id=eq.' + job.id, {
    status: 'running',
    started_at: new Date().toISOString()
  })
  await chrome.action.setBadgeText({ text: '▶' })
  await chrome.action.setBadgeBackgroundColor({ color: '#3B82F6' })

  var tabId = null
  var winId = null
  try {
    // Popup-Fenster weit außerhalb des Bildschirms öffnen (für User unsichtbar)
    var win = await chrome.windows.create({
      url: job.linkedin_url,
      type: 'popup',
      focused: false,
      width: 1280,
      height: 800,
      left: 99999,
      top: 99999
    })
    winId = win.id
    tabId = win.tabs[0].id

    // Sofort minimieren damit es wirklich unsichtbar bleibt
    await chrome.windows.update(winId, { state: 'minimized' })

    // Warte bis Tab geladen
    await waitTabLoaded(tabId, 20000)
    // Extra 3s für LinkedIn JavaScript
    await sleep(3000)

    // Vernetzung senden
    var result = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: sendConnectionRequest,
      args: [job.message || '']
    })

    var res = result && result[0] && result[0].result
    console.log('[Leadesk BG] Ergebnis:', JSON.stringify(res))

    if (res && res.ok) {
      // Erfolg
      await sbPatch('connection_queue?id=eq.' + job.id, {
        status: 'done',
        finished_at: new Date().toISOString()
      })
      await sbPatch('leads?id=eq.' + job.lead_id, {
        li_connection_status: 'pending',
        li_connection_requested_at: new Date().toISOString()
      })
      await chrome.action.setBadgeText({ text: '✓' })
      await chrome.action.setBadgeBackgroundColor({ color: '#059669' })
      setTimeout(function() { chrome.action.setBadgeText({ text: '' }) }, 5000)
      console.log('[Leadesk BG] ✓ Vernetzt:', job.linkedin_url)
    } else {
      var errMsg = (res && res.error) || 'Unbekannt'
      await sbPatch('connection_queue?id=eq.' + job.id, {
        status: 'failed',
        error: errMsg,
        finished_at: new Date().toISOString()
      })
      await chrome.action.setBadgeText({ text: '!' })
      await chrome.action.setBadgeBackgroundColor({ color: '#DC2626' })
      console.error('[Leadesk BG] ✗ Fehler:', errMsg)
    }

  } catch(e) {
    console.error('[Leadesk BG] Exception:', e.message)
    await sbPatch('connection_queue?id=eq.' + job.id, {
      status: 'failed',
      error: e.message,
      finished_at: new Date().toISOString()
    })
  } finally {
    // Fenster schließen nach 3s
    if (win && win.id) {
      setTimeout(function() {
        chrome.windows.remove(win.id).catch(function() {})
      }, 3000)
    }
  }
}

// ── Vernetzungsanfrage auf LinkedIn senden (wird in Tab injiziert) ─
function sendConnectionRequest(message) {
  return new Promise(function(resolve) {
    function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms) }) }

    function findBtn(texts) {
      var btns = Array.from(document.querySelectorAll('button, [role="button"]'))
      return btns.find(function(b) {
        var t = (b.innerText || b.textContent || '').trim()
        return texts.some(function(tx) { return t === tx || t.startsWith(tx) })
      })
    }

    async function run() {
      try {
        // Schritt 1: Vernetzen-Button suchen
        var connectBtn = findBtn(['Vernetzen', 'Connect'])

        if (!connectBtn) {
          // Über "Mehr"-Dropdown versuchen
          var moreBtn = findBtn(['Mehr', 'More'])
          if (!moreBtn) return resolve({ ok: false, error: 'Kein Vernetzen-Button' })

          moreBtn.click()
          await sleep(1500)

          // Im Dropdown suchen
          var items = Array.from(document.querySelectorAll('[role="menuitem"]'))
          var dropItem = items.find(function(el) {
            var t = (el.innerText || el.textContent || '').trim()
            return t === 'Vernetzen' || t === 'Connect'
          })
          if (!dropItem) return resolve({ ok: false, error: 'Vernetzen nicht im Dropdown' })
          dropItem.click()
          await sleep(1500)
        } else {
          connectBtn.click()
          await sleep(1500)
        }

        // Schritt 2: Modal prüfen — "Notiz hinzufügen" oder direkt senden
        if (message && message.trim()) {
          var noteBtn = findBtn(['Notiz hinzufügen', 'Add a note', 'Personalisieren'])
          if (noteBtn) {
            noteBtn.click()
            await sleep(1000)

            var ta = document.querySelector('textarea#custom-message, textarea[name="message"], textarea')
            if (ta) {
              ta.focus()
              // Native value setter für React
              var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
              nativeSetter.call(ta, message.substring(0, 300))
              ta.dispatchEvent(new Event('input', { bubbles: true }))
              await sleep(800)
            }

            var sendBtn = findBtn(['Senden', 'Send'])
            if (sendBtn) { sendBtn.click(); return resolve({ ok: true, method: 'with_note' }) }
          }
        }

        // Ohne Notiz senden
        var withoutNote = findBtn(['Ohne Notiz senden', 'Ohne Notiz', 'Send without a note', 'Senden'])
        if (withoutNote) { withoutNote.click(); return resolve({ ok: true, method: 'without_note' }) }

        resolve({ ok: false, error: 'Kein Senden-Button gefunden' })
      } catch(e) {
        resolve({ ok: false, error: e.message })
      }
    }

    run()
  })
}

// ── Tab geladen warten ────────────────────────────────────────────
function waitTabLoaded(tabId, timeout) {
  timeout = timeout || 30000
  return new Promise(function(resolve, reject) {
    var done = false
    var timer = setTimeout(function() {
      if (!done) { done = true; reject(new Error('Tab timeout nach ' + timeout + 'ms')) }
    }, timeout)

    function finish() {
      if (done) return
      done = true
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    }

    function listener(id, info, tab) {
      if (id !== tabId) return
      if (info.status === 'complete') finish()
    }
    chrome.tabs.onUpdated.addListener(listener)

    // Polling als Fallback — alle 1.5s prüfen
    var poll = setInterval(function() {
      chrome.tabs.get(tabId, function(tab) {
        if (chrome.runtime.lastError) { clearInterval(poll); return }
        if (tab && tab.status === 'complete') { clearInterval(poll); finish() }
      })
    }, 1500)

    // Sofort prüfen
    chrome.tabs.get(tabId, function(tab) {
      if (chrome.runtime.lastError) return
      if (tab && tab.status === 'complete') { clearInterval(poll); finish() }
    })
  })
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms) }) }

// ── Haupt-Queue-Loop ──────────────────────────────────────────────
var processing = false

async function pollQueue() {
  if (processing) {
    console.log('[Leadesk BG] Bereits aktiv, überspringe Poll')
    return
  }

  var auth = await getAuth()
  if (!auth) {
    console.log('[Leadesk BG] Kein Auth-Token — Leadesk-Tab offen?')
    return
  }

  var ok = await checkAndIncrementDaily()
  if (!ok) {
    console.log('[Leadesk BG] Tageslimit erreicht')
    chrome.action.setBadgeText({ text: '⏸' })
    chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' })
    return
  }

  // Job holen
  var jobs = await sbFetch(
    'connection_queue?user_id=eq.' + auth.userId +
    '&status=eq.pending&order=created_at.asc&limit=1'
  )

  if (!jobs || !jobs.length) {
    console.log('[Leadesk BG] Keine Jobs in Queue')
    // Tageszähler wieder zurücksetzen da kein Job verbraucht wurde
    var d = await chrome.storage.local.get(['dailyCount'])
    if ((d.dailyCount || 0) > 0) {
      await chrome.storage.local.set({ dailyCount: (d.dailyCount || 1) - 1 })
    }
    return
  }

  processing = true
  try {
    await processJob(jobs[0])
  } finally {
    processing = false
  }

  // Nächsten Job nach Delay planen
  var delay = MIN_DELAY + Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY))
  console.log('[Leadesk BG] Nächster Job in', delay + 's')
  chrome.alarms.create('nextJob', { delayInMinutes: delay / 60 })
}

// ── Alarm Handler ─────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name === 'queuePoll' || alarm.name === 'nextJob') {
    console.log('[Leadesk BG] Alarm:', alarm.name)
    pollQueue()
  }
})

// ── Messages ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.type === 'GET_AUTH') {
    getAuth().then(sendResponse)
    return true
  }
  if (msg.type === 'OPEN_LEADESK') {
    chrome.tabs.create({ url: 'https://app.leadesk.de' })
    return true
  }
  if (msg.type === 'PROFILE_IMPORTED') {
    chrome.action.setBadgeText({ text: '✓' })
    chrome.action.setBadgeBackgroundColor({ color: '#059669' })
    setTimeout(function() { chrome.action.setBadgeText({ text: '' }) }, 3000)
    return true
  }
  if (msg.type === 'GET_QUEUE_STATUS') {
    chrome.storage.local.get(['dailyCount', 'dailyDate'], function(d) {
      sendResponse({ dailyCount: d.dailyCount || 0, limit: DAILY_LIMIT, processing: processing })
    })
    return true
  }
  if (msg.type === 'POLL_NOW') {
    // Sofort pollen (für Tests)
    pollQueue()
    sendResponse({ ok: true })
    return true
  }
  return true
})

// ── Install / Startup ─────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(function(details) {
  // Wiederkehrender Alarm alle 2 Minuten
  chrome.alarms.create('queuePoll', { periodInMinutes: 40/60 })
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'https://app.leadesk.de' })
  }
  console.log('[Leadesk BG] Installiert v7.2, Queue-Polling aktiv')
})

chrome.runtime.onStartup.addListener(function() {
  chrome.alarms.create('queuePoll', { periodInMinutes: 40/60 })
  console.log('[Leadesk BG] Chrome gestartet, Queue-Polling reaktiviert')
})

// Sofort beim Laden einmal pollen
setTimeout(pollQueue, 3000)

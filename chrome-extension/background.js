// Leadesk Extension — Background Service Worker v7.0
// Queue-basierte LinkedIn Automation

var SUPABASE_URL = 'https://jdhajqpgfrsuoluaesjn.supabase.co'
var SUPABASE_KEY = 'sb_publishable__KdQsVuSD6WWuswGcViaRw_CxDK8grx'
var POLL_INTERVAL = 45000  // 45s zwischen Polls
var MIN_DELAY     = 40000  // 40s min zwischen Aktionen
var MAX_DELAY     = 90000  // 90s max zwischen Aktionen
var DAILY_LIMIT   = 20     // Max Anfragen pro Tag

var isRunning   = false
var dailyCount  = 0
var lastResetDay = ''

// ── Auth ──────────────────────────────────────────────────────────
async function getAuthFromLeadesk() {
  var stored = await chrome.storage.local.get(['supabaseSession', 'userId', 'tokenExpiry'])
  var now = Date.now()
  if (stored.supabaseSession && stored.tokenExpiry && stored.tokenExpiry > now) {
    return { token: stored.supabaseSession.access_token, userId: stored.userId }
  }
  var tabs = await chrome.tabs.query({})
  var lea = tabs.find(function(t) { return t.url && t.url.includes('leadesk.de') })
  if (!lea) return null
  try {
    var results = await chrome.scripting.executeScript({
      target: { tabId: lea.id },
      func: function() {
        var key = Object.keys(localStorage).find(function(k) { return k.includes('auth-token') })
        if (!key) return null
        var d = JSON.parse(localStorage.getItem(key))
        return { token: d && d.access_token, userId: d && d.user && d.user.id }
      }
    })
    var auth = results && results[0] && results[0].result
    if (auth && auth.token) {
      await chrome.storage.local.set({
        supabaseSession: { access_token: auth.token },
        userId: auth.userId,
        tokenExpiry: now + 50 * 60 * 1000
      })
      return auth
    }
  } catch(e) {}
  return null
}

// ── Supabase REST ─────────────────────────────────────────────────
async function sbFetch(path, method, body) {
  var auth = await getAuthFromLeadesk()
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
    if (!res.ok) return null
    return await res.json()
  } catch(e) { return null }
}

// ── Tages-Limit prüfen ────────────────────────────────────────────
function checkDailyLimit() {
  var today = new Date().toDateString()
  if (lastResetDay !== today) {
    lastResetDay = today
    dailyCount = 0
    chrome.storage.local.set({ dailyCount: 0, dailyResetDay: today })
  }
  return dailyCount < DAILY_LIMIT
}

// ── Job aus Queue holen ───────────────────────────────────────────
async function getNextJob(userId) {
  var jobs = await sbFetch(
    'connection_queue?user_id=eq.' + userId +
    '&status=eq.pending&order=created_at.asc&limit=1'
  )
  return jobs && jobs[0]
}

// ── Job-Status updaten ────────────────────────────────────────────
async function updateJob(id, status, error) {
  var body = { status: status }
  if (error) body.error = error
  if (status === 'running') body.started_at = new Date().toISOString()
  if (status === 'done' || status === 'failed' || status === 'skipped') {
    body.finished_at = new Date().toISOString()
  }
  await sbFetch('connection_queue?id=eq.' + id, 'PATCH', body)
}

// ── Lead-Status updaten ───────────────────────────────────────────
async function updateLeadStatus(leadId, status) {
  await sbFetch('leads?id=eq.' + leadId, 'PATCH', {
    li_connection_status: status,
    li_connection_requested_at: new Date().toISOString()
  })
}

// ── LinkedIn Tab finden oder öffnen ──────────────────────────────
async function getLinkedInTab(url) {
  var tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' })
  var existing = tabs.find(function(t) { return t.url === url || t.url.startsWith(url) })
  if (existing) {
    await chrome.tabs.update(existing.id, { active: false })
    return existing.id
  }
  var newTab = await chrome.tabs.create({ url: url, active: false })
  return newTab.id
}

// ── Warte bis Tab geladen ─────────────────────────────────────────
function waitForTab(tabId, timeout) {
  timeout = timeout || 15000
  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() { reject(new Error('Tab timeout')) }, timeout)
    chrome.tabs.onUpdated.addListener(function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer)
        chrome.tabs.onUpdated.removeListener(listener)
        setTimeout(resolve, 2000)  // Extra 2s für LinkedIn JS
      }
    })
  })
}

// ── Vernetzungsanfrage auf LinkedIn senden ────────────────────────
async function sendConnectionOnTab(tabId, message) {
  var results = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: function(msg) {
      return new Promise(function(resolve) {

        // Schritt 1: "Vernetzen" Button finden
        function findConnectBtn() {
          return Array.from(document.querySelectorAll('button')).find(function(b) {
            var t = b.innerText && b.innerText.trim()
            return t === 'Vernetzen' || t === 'Connect'
          })
        }

        // Schritt 2: "Mehr" Dropdown öffnen falls Vernetzen nicht direkt sichtbar
        function findMoreBtn() {
          return Array.from(document.querySelectorAll('button')).find(function(b) {
            var t = b.innerText && b.innerText.trim()
            return t === 'Mehr' || t === 'More'
          })
        }

        // Schritt 3: Modal-Button "Notiz hinzufügen" finden
        function findAddNoteBtn() {
          return Array.from(document.querySelectorAll('button')).find(function(b) {
            var t = b.innerText && b.innerText.trim()
            return t.includes('Notiz') || t.includes('note') || t.includes('Note') || t.includes('personalisieren')
          })
        }

        // Schritt 4: "Ohne Notiz" Button finden
        function findWithoutNoteBtn() {
          return Array.from(document.querySelectorAll('button')).find(function(b) {
            var t = b.innerText && b.innerText.trim()
            return t.includes('Ohne') || t.includes('without') || t.includes('Without') || t.includes('Senden')
          })
        }

        // Schritt 5: Senden-Button im Modal
        function findSendBtn() {
          return Array.from(document.querySelectorAll('button')).find(function(b) {
            var t = b.innerText && b.innerText.trim()
            return t === 'Senden' || t === 'Send'
          })
        }

        function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms) }) }

        async function run() {
          try {
            // Vernetzen-Button suchen (direkt oder über Mehr)
            var connectBtn = findConnectBtn()

            if (!connectBtn) {
              // Versuche über "Mehr" Dropdown
              var moreBtn = findMoreBtn()
              if (!moreBtn) return resolve({ ok: false, error: 'Kein Vernetzen-Button gefunden' })

              moreBtn.click()
              await sleep(1000)

              // Suche "Vernetzen" im Dropdown
              var dropdownItem = Array.from(document.querySelectorAll('[role="menuitem"], li')).find(function(el) {
                var t = el.innerText && el.innerText.trim()
                return t === 'Vernetzen' || t === 'Connect'
              })

              if (!dropdownItem) return resolve({ ok: false, error: 'Kein Vernetzen im Dropdown' })
              dropdownItem.click()
              await sleep(1500)
            } else {
              connectBtn.click()
              await sleep(1500)
            }

            // Modal offen — Notiz hinzufügen?
            if (msg) {
              var addNoteBtn = findAddNoteBtn()
              if (addNoteBtn) {
                addNoteBtn.click()
                await sleep(1000)

                // Textarea für Notiz finden und füllen
                var textarea = document.querySelector('textarea[name="message"], #custom-message, textarea')
                if (textarea) {
                  textarea.focus()
                  textarea.value = msg.substring(0, 300)
                  textarea.dispatchEvent(new Event('input', { bubbles: true }))
                  textarea.dispatchEvent(new Event('change', { bubbles: true }))
                  await sleep(500)
                }

                // Senden
                var sendBtn = findSendBtn()
                if (sendBtn) {
                  sendBtn.click()
                  return resolve({ ok: true, withNote: true })
                }
              }

              // Kein "Notiz hinzufügen" → Ohne Notiz senden
              var withoutNote = findWithoutNoteBtn()
              if (withoutNote) {
                withoutNote.click()
                return resolve({ ok: true, withNote: false })
              }
            } else {
              // Ohne Notiz senden
              var withoutNote2 = findWithoutNoteBtn()
              if (withoutNote2) {
                withoutNote2.click()
                return resolve({ ok: true, withNote: false })
              }
              // Direkt Senden
              var sendBtn2 = findSendBtn()
              if (sendBtn2) {
                sendBtn2.click()
                return resolve({ ok: true, withNote: false })
              }
            }

            resolve({ ok: false, error: 'Senden-Button nicht gefunden' })
          } catch(e) {
            resolve({ ok: false, error: e.message })
          }
        }

        run()
      })
    },
    args: [message || '']
  })

  return results && results[0] && results[0].result
}

// ── Zufälliger Delay ──────────────────────────────────────────────
function randomDelay() {
  return MIN_DELAY + Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY))
}

// ── Hauptloop: Queue abarbeiten ───────────────────────────────────
async function processQueue() {
  if (isRunning) return
  if (!checkDailyLimit()) {
    console.log('[Leadesk] Tageslimit erreicht (' + DAILY_LIMIT + ')')
    chrome.action.setBadgeText({ text: '⏸' })
    chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' })
    return
  }

  var auth = await getAuthFromLeadesk()
  if (!auth) return  // Nicht eingeloggt

  var job = await getNextJob(auth.userId)
  if (!job) return  // Keine Jobs

  isRunning = true
  chrome.action.setBadgeText({ text: '▶' })
  chrome.action.setBadgeBackgroundColor({ color: '#3B82F6' })

  console.log('[Leadesk] Starte Job:', job.linkedin_url)
  await updateJob(job.id, 'running')

  try {
    // Tab öffnen
    var tabId = await getLinkedInTab(job.linkedin_url)
    await waitForTab(tabId)

    // Vernetzung senden
    var result = await sendConnectionOnTab(tabId, job.message)

    if (result && result.ok) {
      await updateJob(job.id, 'done')
      await updateLeadStatus(job.lead_id, 'pending')
      dailyCount++
      chrome.storage.local.set({ dailyCount: dailyCount })

      console.log('[Leadesk] ✓ Vernetzt:', job.linkedin_url)
      chrome.action.setBadgeText({ text: '✓' })
      chrome.action.setBadgeBackgroundColor({ color: '#059669' })

      // Tab wieder schließen nach kurzer Pause
      setTimeout(function() {
        chrome.tabs.remove(tabId).catch(function() {})
      }, 3000)

    } else {
      var err = (result && result.error) || 'Unbekannter Fehler'
      await updateJob(job.id, 'failed', err)
      console.error('[Leadesk] ✗ Fehler:', err)
      chrome.action.setBadgeText({ text: '!' })
      chrome.action.setBadgeBackgroundColor({ color: '#DC2626' })
    }

  } catch(e) {
    await updateJob(job.id, 'failed', e.message)
    console.error('[Leadesk] Exception:', e.message)
  }

  isRunning = false

  // Nächsten Job nach Delay starten
  var delay = randomDelay()
  console.log('[Leadesk] Nächster Job in', Math.round(delay/1000) + 's')
  setTimeout(function() {
    chrome.action.setBadgeText({ text: '' })
    processQueue()
  }, delay)
}

// ── Messages vom Content Script / Popup ──────────────────────────
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.type === 'GET_AUTH') {
    getAuthFromLeadesk().then(sendResponse)
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
    chrome.storage.local.get(['dailyCount', 'dailyResetDay'], function(d) {
      sendResponse({ dailyCount: d.dailyCount || 0, limit: DAILY_LIMIT, isRunning: isRunning })
    })
    return true
  }
  if (msg.type === 'PAUSE_QUEUE') {
    isRunning = true  // Blockiert processQueue
    chrome.action.setBadgeText({ text: '⏸' })
    chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' })
    sendResponse({ ok: true })
    return true
  }
  if (msg.type === 'RESUME_QUEUE') {
    isRunning = false
    chrome.action.setBadgeText({ text: '' })
    processQueue()
    sendResponse({ ok: true })
    return true
  }
  return true
})

// ── Install ───────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'https://app.leadesk.de' })
  }
})

// ── Polling starten ───────────────────────────────────────────────
setInterval(processQueue, POLL_INTERVAL)
setTimeout(processQueue, 5000)  // Beim Start nach 5s prüfen

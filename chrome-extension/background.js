// Leadesk Extension — Background Service Worker v7.9
// SSI-Scraper Fix: Port-basierte Kommunikation für lange async Operationen

// Supabase-Konfiguration pro Environment
// Extension erkennt automatisch ob User auf staging.leadesk.de oder
// app.leadesk.de eingeloggt ist und nutzt den passenden Endpoint.
var ENVS = {
  prod: {
    url: 'https://supabase.leadesk.de',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc2ODYyNDcyLCJleHAiOjIwOTIyMjI0NzJ9.w8HbycX4Dx5Uu1UCp9ER__cv4T3oldej3BDHgck_WC8'
  },
  staging: {
    url: 'https://supabase-staging.leadesk.de',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc2ODU1OTI0LCJleHAiOjIwOTIyMTU5MjR9.4uJVtq8p3AVRYgTpKtIMwG0FBiP2PxKh6fQrZnT-Plc'
  }
}
// Default = prod; wird in getAuth() basierend auf Tab-URL aktualisiert
var SUPABASE_URL = ENVS.prod.url
var SUPABASE_KEY = ENVS.prod.key
function setEnv(env) {
  var cfg = ENVS[env] || ENVS.prod
  SUPABASE_URL = cfg.url
  SUPABASE_KEY = cfg.key
}

// Versions-Marker: bei jedem Service-Worker-Start pruefen. Wenn ein
// alter Cache aus frueheren Versionen drin liegt -> komplett clearen.
// Wichtig: laeuft NICHT nur in onInstalled (das matched nur bei
// install/update, nicht bei einfachem Reload).
var CURRENT_EXT_VERSION = '9.4.4'
chrome.storage.local.get('extensionVersion', function(data) {
  if (data.extensionVersion !== CURRENT_EXT_VERSION) {
    console.log('[Leadesk] Version-Mismatch (' + data.extensionVersion + ' vs ' + CURRENT_EXT_VERSION + ') -> Storage wird geleert')
    chrome.storage.local.clear(function() {
      chrome.storage.local.set({ extensionVersion: CURRENT_EXT_VERSION })
    })
  }
})
var DAILY_LIMIT  = 20
var MIN_DELAY    = 45
var MAX_DELAY    = 90

// ── Auth ──────────────────────────────────────────────────────────
// Liest Token + User-ID aus localStorage eines bestimmten Leadesk-Tabs.
async function readTokenFromTab(tabId) {
  try {
    var res = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: function() {
        var k = Object.keys(localStorage).find(function(k) { return k.includes('auth-token') })
        if (!k) return null
        try {
          var d = JSON.parse(localStorage.getItem(k))
          if (!d || !d.access_token) return null
          return { token: d.access_token, userId: d.user && d.user.id }
        } catch(e) { return null }
      }
    })
    return (res && res[0] && res[0].result) || null
  } catch(e) {
    return null
  }
}

async function getAuth() {
  var s = await chrome.storage.local.get(['token', 'userId', 'tokenExpiry', 'env'])
  if (s.token && s.tokenExpiry && Date.now() < s.tokenExpiry && s.env) {
    try {
      var p = JSON.parse(atob(s.token.split('.')[1]))
      if (p.exp && p.exp * 1000 > Date.now() + 60000) {
        setEnv(s.env)
        return { token: s.token, userId: s.userId, env: s.env }
      }
    } catch(e) {}
    await chrome.storage.local.remove(['token', 'userId', 'tokenExpiry', 'env'])
  }
  try {
    // BEIDE Domains parallel pruefen — nimm den der einen GUELTIGEN Token hat.
    // Wenn beide Token haben: Prod gewinnt (App-Domain hat Vorrang).
    var prodTabs = await chrome.tabs.query({ url: 'https://app.leadesk.de/*' })
    var stagingTabs = await chrome.tabs.query({ url: 'https://staging.leadesk.de/*' })

    var prodAuth = prodTabs.length ? await readTokenFromTab(prodTabs[0].id) : null
    var stagingAuth = stagingTabs.length ? await readTokenFromTab(stagingTabs[0].id) : null

    // Entscheidungs-Logik:
    // 1) Beide vorhanden -> prod
    // 2) Nur prod oder nur staging -> der vorhandene
    // 3) Keiner -> null
    var auth, env
    if (prodAuth && prodAuth.token) {
      auth = prodAuth; env = 'prod'
    } else if (stagingAuth && stagingAuth.token) {
      auth = stagingAuth; env = 'staging'
    } else {
      console.log('[Leadesk] Kein Leadesk-Tab mit Login gefunden')
      return null
    }

    setEnv(env)
    await chrome.storage.local.set({
      token: auth.token,
      userId: auth.userId,
      tokenExpiry: Date.now() + 30*60*1000,
      env: env
    })
    console.log('[Leadesk] Auth detected env:', env, 'user:', auth.userId && auth.userId.slice(0, 8))
    return { token: auth.token, userId: auth.userId, env: env }
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

async function sbPost(path, body) {
  var auth = await getAuth()
  if (!auth) return { error: 'NOT_LOGGED_IN' }
  var r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + auth.token,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(body)
  })
  var data = await r.json()
  if (!r.ok) return { error: data.message || r.status }
  return { data: data }
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

// ── SSI Scraper Funktion (wird auf der LinkedIn-Seite ausgeführt) ──
// Selektoren aus echtem DOM der linkedin.com/sales/ssi Seite extrahiert
function scrapeSSIPage() {
  try {
    // Warte-Check: Seite noch am Laden?
    var heading = document.querySelector('h1, h2')
    var hasSSIContent = heading && (heading.textContent || '').toLowerCase().includes('social selling')
    if (!hasSSIContent && !document.querySelector('span.ssi-score__value')) {
      return { error: 'Seite noch nicht geladen', retry: true }
    }

    // Login-Check
    if (window.location.href.includes('/login') || window.location.href.includes('/authwall')) {
      return { error: 'Nicht auf LinkedIn eingeloggt' }
    }

    // ── Gesamt-Score ──────────────────────────────────────────────
    // Selektor: span.ssi-score__value — erster Wert ist der Gesamt-Score
    var scoreEls = Array.from(document.querySelectorAll('span.ssi-score__value'))
    var total_score = null

    if (scoreEls.length >= 1) {
      // Erster Wert = Gesamt-Score (z.B. "61")
      total_score = parseFloat((scoreEls[0].textContent || '').trim().replace(',', '.'))
    }

    // Fallback: suche "XX von 100" Pattern
    if (!total_score || total_score > 100) {
      var vonText = document.body.innerText.match(/(\d+)\s*von\s*100/)
      if (vonText) total_score = parseInt(vonText[1])
    }

    // ── Subkategorien ─────────────────────────────────────────────
    // scoreEls[1..4] = die 4 Säulen (je 0-25)
    var build_brand = null, find_people = null, engage_insights = null, build_relationships = null

    if (scoreEls.length >= 5) {
      build_brand         = parseFloat((scoreEls[1].textContent || '').replace(',', '.'))
      find_people         = parseFloat((scoreEls[2].textContent || '').replace(',', '.'))
      engage_insights     = parseFloat((scoreEls[3].textContent || '').replace(',', '.'))
      build_relationships = parseFloat((scoreEls[4].textContent || '').replace(',', '.'))
    }

    // ── Rankings ──────────────────────────────────────────────────
    // span.mh1.t-black.t-40 = Top-%-Werte (Branche, Netzwerk)
    var rankEls = Array.from(document.querySelectorAll('span.mh1.t-black.t-40, .mh1.t-black.t-40'))
    var industry_rank = rankEls[0] ? parseInt(rankEls[0].textContent.trim()) : null
    var network_rank  = rankEls[1] ? parseInt(rankEls[1].textContent.trim()) : null

    return {
      total_score:         total_score,
      build_brand:         build_brand,
      find_people:         find_people,
      engage_insights:     engage_insights,
      build_relationships: build_relationships,
      industry_rank:       industry_rank,
      network_rank:        network_rank,
      url:                 window.location.href,
    }
  } catch(e) {
    return { error: e.message }
  }
}

// ── SSI Score abrufen — speichert Ergebnis in chrome.storage ──────
// Nutzt storage statt sendResponse (vermeidet MV3 Service Worker Timeout)
async function fetchAndSaveSSI() {
  var auth = await getAuth()
  if (!auth) {
    await chrome.storage.local.set({ ssiStatus: { error: 'Nicht eingeloggt — Leadesk-Tab öffnen', ts: Date.now() } })
    return
  }

  var windowId = null

  try {
    chrome.action.setBadgeText({ text: 'SSI' })
    chrome.action.setBadgeBackgroundColor({ color: '#8B5CF6' })
    await chrome.storage.local.set({ ssiStatus: { loading: true, ts: Date.now() } })

    // Versuche zuerst normale SSI-Seite, dann Sales Navigator
    var ssiUrls = [
      'https://www.linkedin.com/sales/ssi',
      'https://www.linkedin.com/feed/?autoplay=true',  // als Fallback erstmal einloggen prüfen
    ]

    var win = await chrome.windows.create({
      url: ssiUrls[0],
      focused: false,
      state: 'minimized'
    })
    var tabId = win.tabs[0].id
    windowId = win.id

    // Warten bis Seite geladen + JS gerendert
    await waitLoaded(tabId, 25000)
    await sleep(4000)

    // Prüfe ob Redirect auf Login
    var urlCheck = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: function() { return { url: window.location.href, title: document.title } }
    })
    var pageInfo = urlCheck && urlCheck[0] && urlCheck[0].result
    console.log('[Leadesk SSI] Seite:', pageInfo && pageInfo.url)

    // Wenn Login-Redirect → Fehler
    if (pageInfo && (pageInfo.url.includes('/login') || pageInfo.url.includes('/authwall') || pageInfo.url.includes('/checkpoint'))) {
      await chrome.storage.local.set({ ssiStatus: { error: 'LinkedIn-Login erforderlich — auf LinkedIn einloggen', ts: Date.now() } })
      chrome.action.setBadgeText({ text: '!' })
      chrome.action.setBadgeBackgroundColor({ color: '#DC2626' })
      return
    }

    // Scrapen
    var result = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: scrapeSSIPage
    })
    var ssiData = result && result[0] && result[0].result
    console.log('[Leadesk SSI] Ergebnis:', JSON.stringify(ssiData))

    // Falls kein Score: nochmal nach extra Wartezeit
    if (!ssiData || !ssiData.total_score || ssiData.total_score <= 0) {
      await sleep(4000)
      result = await chrome.scripting.executeScript({ target: { tabId: tabId }, func: scrapeSSIPage })
      ssiData = result && result[0] && result[0].result
      console.log('[Leadesk SSI] 2. Versuch:', JSON.stringify(ssiData))
    }

    if (!ssiData || !ssiData.total_score || ssiData.total_score <= 0) {
      await chrome.storage.local.set({ ssiStatus: { error: 'Score nicht lesbar — Sales Navigator nötig oder SSI-Seite geändert', ts: Date.now() } })
      chrome.action.setBadgeText({ text: '!' })
      chrome.action.setBadgeBackgroundColor({ color: '#DC2626' })
      return
    }

    // Speichern in Supabase
    var payload = {
      user_id:             auth.userId,
      total_score:         ssiData.total_score,
      build_brand:         ssiData.build_brand || null,
      find_people:         ssiData.find_people || null,
      engage_insights:     ssiData.engage_insights || null,
      build_relationships: ssiData.build_relationships || null,
      industry_rank:       ssiData.industry_rank || null,
      network_rank:        ssiData.network_rank || null,
      source:              'extension',
      recorded_at:         new Date().toISOString()
    }

    var saved = await sbPost('ssi_scores', payload)
    if (saved.error) {
      await chrome.storage.local.set({ ssiStatus: { error: 'Speichern fehlgeschlagen: ' + saved.error, ts: Date.now() } })
      chrome.action.setBadgeText({ text: '!' })
      chrome.action.setBadgeBackgroundColor({ color: '#DC2626' })
    } else {
      console.log('[Leadesk SSI] ✓ Score ' + ssiData.total_score + ' gespeichert')
      await chrome.storage.local.set({ ssiStatus: { ok: true, score: ssiData.total_score, data: ssiData, ts: Date.now() } })
      chrome.action.setBadgeText({ text: '✓' })
      chrome.action.setBadgeBackgroundColor({ color: '#059669' })
      setTimeout(function() { chrome.action.setBadgeText({ text: '' }) }, 5000)
    }

  } catch(e) {
    console.error('[Leadesk SSI] Fehler:', e.message)
    await chrome.storage.local.set({ ssiStatus: { error: e.message, ts: Date.now() } })
    chrome.action.setBadgeText({ text: '!' })
    chrome.action.setBadgeBackgroundColor({ color: '#DC2626' })
  } finally {
    if (windowId) setTimeout(function() { chrome.windows.remove(windowId).catch(function(){}) }, 2000)
  }
}

// ── LinkedIn Job verarbeiten ──────────────────────────────────────
var processing = false

async function processJob(job) {
  console.log('[Leadesk] Job starten:', job.linkedin_url)
  await sbPatch('connection_queue?id=eq.' + job.id, { status: 'running', started_at: new Date().toISOString() })
  await chrome.action.setBadgeText({ text: '▶' })
  await chrome.action.setBadgeBackgroundColor({ color: '#3B82F6' })

  var tab = null
  try {
    var win = await chrome.windows.create({ url: job.linkedin_url, focused: false, state: 'minimized' })
    tab = win.tabs[0]
    await waitLoaded(tab.id, 25000)
    await sleep(3500)
    var result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: connectOnPage, args: [job.message || ''] })
    var res = result && result[0] && result[0].result
    if (res && res.ok) {
      await sbPatch('connection_queue?id=eq.' + job.id, { status: 'done', finished_at: new Date().toISOString() })
      await sbPatch('leads?id=eq.' + job.lead_id, { li_connection_status: 'pending', li_connection_requested_at: new Date().toISOString() })
      await chrome.action.setBadgeText({ text: '✓' })
      await chrome.action.setBadgeBackgroundColor({ color: '#059669' })
      setTimeout(function() { chrome.action.setBadgeText({ text: '' }) }, 5000)
    } else {
      var err = (res && res.error) || 'Unbekannt'
      await sbPatch('connection_queue?id=eq.' + job.id, { status: 'failed', error: err, finished_at: new Date().toISOString() })
      await chrome.action.setBadgeText({ text: '!' })
      await chrome.action.setBadgeBackgroundColor({ color: '#DC2626' })
    }
  } catch(e) {
    await sbPatch('connection_queue?id=eq.' + job.id, { status: 'failed', error: e.message, finished_at: new Date().toISOString() })
  } finally {
    if (tab && tab.windowId) setTimeout(function() { chrome.windows.remove(tab.windowId).catch(function(){}) }, 2000)
  }
}

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
        if (document.querySelector('.login__form') || window.location.href.includes('/login') || window.location.href.includes('/authwall')) {
          return resolve({ ok: false, error: 'Nicht eingeloggt auf LinkedIn' })
        }
        var connectBtn = findBtn(['Vernetzen', 'Connect'])
        if (!connectBtn) {
          var moreBtn = findBtn(['Mehr', 'More'])
          if (!moreBtn) return resolve({ ok: false, error: 'Kein Vernetzen-Button gefunden' })
          moreBtn.click(); await sleep(1500)
          var items = Array.from(document.querySelectorAll('[role="menuitem"]'))
          var dropItem = items.find(function(el) { return ['Vernetzen','Connect'].includes((el.innerText||'').trim()) })
          if (!dropItem) return resolve({ ok: false, error: 'Vernetzen nicht im Dropdown' })
          dropItem.click(); await sleep(1500)
        } else {
          connectBtn.click(); await sleep(1500)
        }
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
      } catch(e) { resolve({ ok: false, error: e.message }) }
    }
    run()
  })
}

function waitLoaded(tabId, timeout) {
  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() { reject(new Error('Timeout nach ' + timeout + 'ms')) }, timeout)
    function check(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer); chrome.tabs.onUpdated.removeListener(check); resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(check)
    chrome.tabs.get(tabId, function(tab) {
      if (tab && tab.status === 'complete') {
        clearTimeout(timer); chrome.tabs.onUpdated.removeListener(check); resolve()
      }
    })
  })
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms) }) }

async function pollQueue() {
  if (processing) return
  var auth = await getAuth()
  if (!auth) return
  var ok = await checkDaily()
  if (!ok) return
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
    chrome.alarms.create('nextJob', { delayInMinutes: delay/60000 })
  } finally { processing = false }
}

// ── Messages ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.type === 'GET_AUTH') { getAuth().then(sendResponse); return true }
  if (msg.type === 'BRIDGE_SCRAPE_LINKEDIN') {
    // Nur Anfragen aus bridge.js auf leadesk.de akzeptieren.
    var senderUrl = (sender && sender.url) || ''
    if (!/^https:\/\/(app|staging|[a-z0-9-]+)\.leadesk\.de\//.test(senderUrl)) {
      sendResponse({ error: 'Unbefugter Bridge-Aufruf' })
      return true
    }
    scrapeLinkedInProfileForWebApp(msg.url).then(sendResponse).catch(function(err) {
      sendResponse({ error: String(err && err.message || err) })
    })
    return true
  }
  if (msg.type === 'POLL_NOW') { pollQueue(); sendResponse({ ok: true }); return true }

  // SSI: starte async im Hintergrund, Popup pollt chrome.storage
  if (msg.type === 'FETCH_SSI') {
    // Sofortige Antwort — Prozess läuft im Hintergrund
    sendResponse({ ok: true, started: true })
    fetchAndSaveSSI()
    return true
  }

  if (msg.type === 'GET_SSI_STATUS') {
    chrome.storage.local.get(['ssiStatus'], function(d) {
      sendResponse(d.ssiStatus || { idle: true })
    })
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
      sendResponse({ dailyCount: d.dailyCount||0, limit: DAILY_LIMIT, processing: processing })
    })
    return true
  }
  return true
})

// ── Alarm Handler ─────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name === 'queuePoll' || alarm.name === 'nextJob') pollQueue()
  if (alarm.name === 'ssiDaily') fetchAndSaveSSI()
})

function getNext8AM() {
  var now = new Date()
  var next = new Date(now)
  next.setHours(8, 0, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 1)
  return next.getTime()
}

chrome.runtime.onInstalled.addListener(async function(details) {
  // Beim Update/Install: alten Auth-Cache loeschen, damit env+Token frisch erkannt werden.
  // Verhindert PGRST301 'No suitable key' wegen veraltetem cross-env Token.
  if (details.reason === 'install' || details.reason === 'update') {
    try {
      await chrome.storage.local.remove(['token', 'userId', 'tokenExpiry', 'env', 'supabaseSession'])
      console.log('[Leadesk] Auth-Cache nach', details.reason, 'geleert')
    } catch(_) {}
  }

  chrome.alarms.create('queuePoll', { periodInMinutes: 40/60 })
  chrome.alarms.create('ssiDaily', { when: getNext8AM(), periodInMinutes: 24*60 })
  console.log('[Leadesk] v7.9 installiert')
  if (details.reason === 'install') chrome.tabs.create({ url: 'https://app.leadesk.de' })
})

chrome.runtime.onStartup.addListener(function() {
  chrome.alarms.create('queuePoll', { periodInMinutes: 40/60 })
  chrome.alarms.create('ssiDaily', { when: getNext8AM(), periodInMinutes: 24*60 })
})

setTimeout(pollQueue, 3000)

// ── Side Panel ─────────────────────────────────────────────────────
// Extension-Icon-Klick → Side Panel öffnen
chrome.action.onClicked.addListener(function(tab) {
  chrome.sidePanel.open({ windowId: tab.windowId })
})

// Tab-Navigation: Profil erkannt → Side Panel benachrichtigen
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status !== 'complete') return
  if (!tab.url || !tab.url.includes('linkedin.com/in/')) return
  // Content Script nach Profil fragen und an Side Panel weiterleiten
  setTimeout(function() {
    chrome.tabs.sendMessage(tabId, { type: 'SCRAPE_PROFILE' }, function(response) {
      if (chrome.runtime.lastError) return
      if (response && response.profile) {
        chrome.runtime.sendMessage({ type: 'PROFILE_DETECTED', profile: response.profile, tabId: tabId })
          .catch(function() {}) // Side Panel evtl. noch nicht offen
      }
    })
  }, 1500)
})


// ── External Messages (von app.leadesk.de) ───────────────────────
// Web-App kann hier direkt scrape-Anfragen schicken, ohne dass der User
// die LinkedIn-Seite selbst geoeffnet haben muss. Wir oeffnen die URL
// in einem neuen Tab, lassen content.js scrapen und liefern das Profil
// zurueck. Nur fuer Domains aus externally_connectable im Manifest.
chrome.runtime.onMessageExternal.addListener(function(msg, sender, sendResponse) {
  if (msg && msg.action === 'scrape_linkedin_profile') {
    scrapeLinkedInProfileForWebApp(msg.url).then(sendResponse).catch(function(err) {
      sendResponse({ error: String(err && err.message || err) })
    })
    return true
  }
  if (msg && msg.action === 'get_active_linkedin_identity') {
    getActiveLinkedInIdentity().then(sendResponse).catch(function(err) {
      sendResponse({ error: String(err && err.message || err) })
    })
    return true
  }
  sendResponse({ error: 'Unbekannte Aktion' })
  return false
})

// ── Aktive LinkedIn-Identity holen ───────────────────────────────
// Öffnet /in/me/ (redirected auf das eigene Profil), scrapt Identity, schliesst Tab.
async function getActiveLinkedInIdentity() {
  // Existierende Leadesk-Tab merken
  var leadeskTabIdBefore = null
  try {
    var pre = await chrome.tabs.query({ url: ['https://app.leadesk.de/*', 'https://staging.leadesk.de/*'] })
    if (pre && pre.length > 0) leadeskTabIdBefore = pre[0].id
  } catch(_) {}

  // /in/me/ redirected automatisch zum eigenen Profil wenn eingeloggt
  var tab
  try {
    tab = await chrome.tabs.create({ url: 'https://www.linkedin.com/in/me/', active: true })
    if (tab.windowId) {
      try { await chrome.windows.update(tab.windowId, { focused: true }) } catch(_) {}
    }
    // Auf Redirect warten — max 8s
    var finalUrl = null
    for (var i = 0; i < 16; i++) {
      await new Promise(function(r) { setTimeout(r, 500) })
      try {
        var t = await chrome.tabs.get(tab.id)
        if (t && t.url && /\/in\/[^/?#]+/.test(t.url) && !/\/in\/me\//.test(t.url) && t.status === 'complete') {
          finalUrl = t.url
          break
        }
      } catch(_) {}
    }
    if (!finalUrl) {
      // Login wahrscheinlich nicht aktiv
      try { await chrome.tabs.remove(tab.id) } catch(_) {}
      return { error: 'Keine aktive LinkedIn-Session. Bitte zuerst auf linkedin.com einloggen.' }
    }

    // content.js scrapen lassen
    var identity = null
    for (var j = 0; j < 5; j++) {
      try {
        var resp = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_OWN_IDENTITY' })
        if (resp && resp.identity && resp.identity.member_id) {
          identity = resp.identity
          break
        }
      } catch(_) {}
      await new Promise(function(r) { setTimeout(r, 600) })
    }

    // Tab schliessen, zurueck zu Leadesk
    try { await chrome.tabs.remove(tab.id) } catch(_) {}
    if (leadeskTabIdBefore) {
      try { await chrome.tabs.update(leadeskTabIdBefore, { active: true }) } catch(_) {}
    }

    if (!identity || !identity.member_id) {
      return { error: 'Identity konnte nicht erkannt werden. DOM hat sich evtl. geändert.' }
    }
    return { identity: identity }
  } catch (err) {
    if (tab && tab.id) {
      try { await chrome.tabs.remove(tab.id) } catch(_) {}
    }
    return { error: String(err && err.message || err) }
  }
}

async function scrapeLinkedInProfileForWebApp(rawUrl) {
  console.log('[Leadesk Scrape] START', rawUrl)
  if (!rawUrl || typeof rawUrl !== 'string') return { error: 'URL fehlt' }
  var url
  try {
    url = new URL(rawUrl.trim())
  } catch(e) {
    return { error: 'Ungueltige URL' }
  }
  if (!/^(www\.)?linkedin\.com$/i.test(url.hostname)) {
    return { error: 'Bitte eine LinkedIn-Profil-URL (linkedin.com/in/...) eingeben' }
  }
  if (!/^\/in\//i.test(url.pathname)) {
    return { error: 'Bitte eine LinkedIn-Profil-URL (linkedin.com/in/...) eingeben' }
  }
  var profileUrl = url.origin + url.pathname.replace(/\/$/, '')

  // Existierende Leadesk-Tab merken, damit wir nachher zurueckgehen koennen.
  var leadeskTabIdBefore = null
  try {
    var pre = await chrome.tabs.query({ url: ['https://app.leadesk.de/*', 'https://staging.leadesk.de/*'] })
    if (pre && pre.length > 0) leadeskTabIdBefore = pre[0].id
  } catch(_) {}

  // LinkedIn-Tab oeffnen — active=true erzwingt Vordergrund.
  // Plus: window.update focused=true direkt nach create, damit LinkedIn
  // sicher rendert (manche Fenster-Manager geben Tab focus, aber Window bleibt unfocused).
  var tab
  try {
    tab = await chrome.tabs.create({ url: profileUrl, active: true })
    console.log('[Leadesk Scrape] Tab opened id=' + tab.id + ' windowId=' + tab.windowId)
    if (tab.windowId) {
      try { await chrome.windows.update(tab.windowId, { focused: true }) } catch(_) {}
    }
    // SHOW_LOADING_OVERLAY auf dem neuen Tab so frueh wie moeglich
    // (sobald content.js geladen ist). Wir versuchen alle 400ms, max 5x.
    for (var ovi = 0; ovi < 5; ovi++) {
      await new Promise(function(r) { setTimeout(r, 400) })
      try {
        var ok = await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_LOADING_OVERLAY' })
        if (ok && ok.ok) break
      } catch(e) {}
    }
  } catch(e) {
    console.error('[Leadesk Scrape] tab.create failed:', e.message)
    return { error: 'Konnte LinkedIn-Tab nicht oeffnen: ' + e.message }
  }
  if (!tab || !tab.id) return { error: 'Kein Tab-Handle erhalten' }

  var profile = null
  var lastErr = null
  try {
    profile = await waitAndScrape(tab.id, 6, 1500)
    console.log('[Leadesk Scrape] scrape result:', profile && {
      name: profile.name,
      about_chars: (profile.li_about_summary||'').length,
      experience_chars: (profile.li_experience_summary||'').length,
      education_chars: (profile.li_education_summary||'').length,
    })
  } catch(e) {
    lastErr = e
    console.error('[Leadesk Scrape] waitAndScrape failed:', e.message)
  }

  // Tab schliessen UND zurueck zur Leadesk-App fokussieren
  try { await chrome.tabs.remove(tab.id) } catch(_) {}
  try {
    if (leadeskTabIdBefore) {
      await chrome.tabs.update(leadeskTabIdBefore, { active: true })
      var t = await chrome.tabs.get(leadeskTabIdBefore).catch(function() { return null })
      if (t && t.windowId) await chrome.windows.update(t.windowId, { focused: true })
    }
  } catch(_) {}

  if (!profile) {
    return { error: lastErr ? lastErr.message : 'Profil konnte nicht extrahiert werden' }
  }
  if (!profile.name || profile.name.length < 2) {
    return { error: 'LinkedIn hat moeglicherweise eine Login-Wand gezeigt. Bitte einmal in LinkedIn einloggen und nochmal versuchen.' }
  }

  console.log('[Leadesk Scrape] DONE name=' + profile.name)
  return { profile: profile, sourceUrl: profileUrl }
}

async function waitAndScrape(tabId, attempts, intervalMs) {
  // Stelle sicher dass der Tab + dessen Window im Vordergrund sind --
  // LinkedIn rendert Sections nur in aktiven Tabs (Anti-Scraping).
  try {
    await chrome.tabs.update(tabId, { active: true })
    var t = await chrome.tabs.get(tabId)
    if (t && t.windowId) {
      await chrome.windows.update(t.windowId, { focused: true })
    }
  } catch(_) {}

  var ready = false
  for (var i = 0; i < attempts; i++) {
    await new Promise(function(r) { setTimeout(r, intervalMs) })
    try {
      var pong = await chrome.tabs.sendMessage(tabId, { type: 'PING' })
      if (pong && pong.ok) { ready = true; break }
    } catch(e) {}
  }
  if (!ready) throw new Error('LinkedIn-Profil konnte nicht geladen werden (Timeout)')

  // Aktiv-Status nochmal sicherstellen vor dem Scrape (User koennte gewechselt haben)
  try { await chrome.tabs.update(tabId, { active: true }) } catch(_) {}

  // Scrape mit Retries — der Scrape-Handler in content.js triggert Lazy-Load
  // aller Sections + scrolled durch die Seite, das dauert ~9-15s.
  // Wir warten bis About + Experience verfuegbar sind (oder max 4 Versuche).
  var profile = null
  for (var j = 0; j < 4; j++) {
    var resp = null
    try {
      resp = await chrome.tabs.sendMessage(tabId, { type: 'SCRAPE_PROFILE' })
    } catch(e) {
      throw new Error('Scrape-Aufruf an LinkedIn-Tab fehlgeschlagen: ' + e.message)
    }
    if (resp && resp.profile) {
      profile = resp.profile
      // Fertig wenn About UND Experience da sind
      if (profile.li_about_summary && profile.li_experience_summary) break
    }
    await new Promise(function(r) { setTimeout(r, 2000) })
  }
  return profile
}

// Leadesk Extension — Background Service Worker v7.8
// + SSI-Scraper: liest LinkedIn SSI-Score und speichert ihn in Supabase

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

// ── SSI Scraper ───────────────────────────────────────────────────
// Wird auf der SSI-Seite ausgeführt (linkedin.com/sales/ssi)
function scrapeSSIPage() {
  try {
    var score = null
    var buildBrand = null, findPeople = null, engageInsights = null, buildRelationships = null
    var industryRank = null, networkRank = null

    // Gesamt-Score — verschiedene mögliche Selektoren
    var selectors = [
      '.ssi-score__total-score',
      '.ssi-score-total',
      '[data-test-score-value]',
      '.ssi-index__score',
    ]
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i])
      if (el) {
        var val = parseFloat(el.innerText || el.textContent || '')
        if (!isNaN(val) && val > 0) { score = val; break }
      }
    }

    // Fallback: suche große Zahl die den SSI-Score enthält
    if (!score) {
      var allNums = Array.from(document.querySelectorAll('[class*="score"], [class*="Score"], [class*="index"]'))
        .map(function(el) { return parseFloat(el.innerText || '') })
        .filter(function(n) { return !isNaN(n) && n >= 1 && n <= 100 })
      if (allNums.length) score = Math.max.apply(null, allNums)
    }

    // Unterkategorien (4 Säulen, je 0-25)
    var subScores = Array.from(document.querySelectorAll(
      '.ssi-score__category-score, [class*="category-score"], [class*="pillar-score"], .ssi-score-category'
    )).map(function(el) {
      return parseFloat(el.innerText || el.textContent || '')
    }).filter(function(n) { return !isNaN(n) && n >= 0 && n <= 25 })

    if (subScores.length >= 4) {
      buildBrand        = subScores[0]
      findPeople        = subScores[1]
      engageInsights    = subScores[2]
      buildRelationships= subScores[3]
    }

    // Branchenrang / Netzwerkrang
    var rankEls = document.querySelectorAll('[class*="rank"], [class*="Rank"]')
    var ranks = Array.from(rankEls).map(function(el) {
      return parseInt((el.innerText || '').replace(/[^\d]/g, ''))
    }).filter(function(n) { return !isNaN(n) && n > 0 })
    if (ranks.length >= 1) industryRank = ranks[0]
    if (ranks.length >= 2) networkRank  = ranks[1]

    // Fallback-Score aus dem Seitentitel
    if (!score) {
      var title = document.title
      var m = title.match(/(\d+)/)
      if (m) score = parseInt(m[1])
    }

    return {
      total_score: score,
      build_brand: buildBrand,
      find_people: findPeople,
      engage_insights: engageInsights,
      build_relationships: buildRelationships,
      industry_rank: industryRank,
      network_rank: networkRank,
      page_title: document.title,
      page_url: window.location.href,
    }
  } catch(e) {
    return { error: e.message }
  }
}

// ── SSI Score abrufen und speichern ───────────────────────────────
async function fetchAndSaveSSI(sendResponse) {
  var auth = await getAuth()
  if (!auth) {
    if (sendResponse) sendResponse({ error: 'Nicht eingeloggt — Leadesk-Tab öffnen' })
    return
  }

  var tabId = null
  var windowId = null

  try {
    chrome.action.setBadgeText({ text: 'SSI' })
    chrome.action.setBadgeBackgroundColor({ color: '#8B5CF6' })

    // SSI-Seite in Hintergrundfenster öffnen
    var win = await chrome.windows.create({
      url: 'https://www.linkedin.com/sales/ssi',
      focused: false,
      state: 'minimized'
    })
    tabId = win.tabs[0].id
    windowId = win.id

    // Warten bis Seite geladen
    await waitLoaded(tabId, 20000)
    await sleep(3500) // JS braucht Zeit zum Rendern

    // Scrapen
    var result = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: scrapeSSIPage
    })

    var ssiData = result && result[0] && result[0].result
    console.log('[Leadesk SSI] Gescraped:', JSON.stringify(ssiData))

    if (!ssiData || ssiData.error) {
      var err = (ssiData && ssiData.error) || 'Seite konnte nicht gelesen werden'
      if (sendResponse) sendResponse({ error: err })
      chrome.action.setBadgeText({ text: '!' })
      chrome.action.setBadgeBackgroundColor({ color: '#DC2626' })
      return
    }

    if (!ssiData.total_score || ssiData.total_score <= 0) {
      // Zweiter Versuch nach mehr Wartezeit
      await sleep(3000)
      result = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: scrapeSSIPage
      })
      ssiData = result && result[0] && result[0].result
    }

    if (!ssiData || !ssiData.total_score) {
      if (sendResponse) sendResponse({ error: 'SSI-Score nicht gefunden — auf LinkedIn eingeloggt?' })
      chrome.action.setBadgeText({ text: '!' })
      chrome.action.setBadgeBackgroundColor({ color: '#DC2626' })
      return
    }

    // In Supabase speichern
    var payload = {
      user_id:            auth.userId,
      total_score:        ssiData.total_score,
      build_brand:        ssiData.build_brand || 0,
      find_people:        ssiData.find_people || 0,
      engage_insights:    ssiData.engage_insights || 0,
      build_relationships:ssiData.build_relationships || 0,
      industry_rank:      ssiData.industry_rank || null,
      network_rank:       ssiData.network_rank || null,
      source:             'extension',
      recorded_at:        new Date().toISOString()
    }

    var saved = await sbPost('ssi_scores', payload)
    if (saved.error) {
      console.error('[Leadesk SSI] Speichern fehlgeschlagen:', saved.error)
      if (sendResponse) sendResponse({ error: 'Speichern fehlgeschlagen: ' + saved.error })
      chrome.action.setBadgeText({ text: '!' })
      chrome.action.setBadgeBackgroundColor({ color: '#DC2626' })
    } else {
      console.log('[Leadesk SSI] ✓ Gespeichert — Score:', ssiData.total_score)
      chrome.action.setBadgeText({ text: '✓' })
      chrome.action.setBadgeBackgroundColor({ color: '#059669' })
      setTimeout(function() { chrome.action.setBadgeText({ text: '' }) }, 4000)
      if (sendResponse) sendResponse({ ok: true, score: ssiData.total_score, data: ssiData })
    }

  } catch(e) {
    console.error('[Leadesk SSI] Exception:', e.message)
    chrome.action.setBadgeText({ text: '!' })
    chrome.action.setBadgeBackgroundColor({ color: '#DC2626' })
    if (sendResponse) sendResponse({ error: e.message })
  } finally {
    // Hintergrundfenster wieder schließen
    if (windowId) {
      setTimeout(function() {
        chrome.windows.remove(windowId).catch(function() {})
      }, 2000)
    }
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

    var result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: connectOnPage,
      args: [job.message || '']
    })

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

// ── Tab geladen warten ────────────────────────────────────────────
function waitLoaded(tabId, timeout) {
  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() { reject(new Error('Timeout')) }, timeout)
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

// ── Queue pollen ──────────────────────────────────────────────────
async function pollQueue() {
  if (processing) return
  var auth = await getAuth()
  if (!auth) { return }
  var ok = await checkDaily()
  if (!ok) { return }
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
  } finally {
    processing = false
  }
}

// ── Alarm Handler ─────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name === 'queuePoll' || alarm.name === 'nextJob') pollQueue()
  // Täglich um 8 Uhr SSI automatisch scrapen
  if (alarm.name === 'ssiDaily') fetchAndSaveSSI(null)
})

// ── Messages ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.type === 'GET_AUTH') { getAuth().then(sendResponse); return true }
  if (msg.type === 'POLL_NOW') { pollQueue(); sendResponse({ ok: true }); return true }

  // SSI manuell abrufen
  if (msg.type === 'FETCH_SSI') {
    fetchAndSaveSSI(sendResponse)
    return true // async response
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

// ── Install / Startup ─────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(function(details) {
  chrome.alarms.create('queuePoll', { periodInMinutes: 40/60 })
  // SSI täglich automatisch scrapen (08:00 Uhr)
  chrome.alarms.create('ssiDaily', { when: getNext8AM(), periodInMinutes: 24*60 })
  console.log('[Leadesk] v7.8 installiert — Queue-Polling + SSI-Scraper aktiv')
  if (details.reason === 'install') chrome.tabs.create({ url: 'https://app.leadesk.de' })
})

chrome.runtime.onStartup.addListener(function() {
  chrome.alarms.create('queuePoll', { periodInMinutes: 40/60 })
  chrome.alarms.create('ssiDaily', { when: getNext8AM(), periodInMinutes: 24*60 })
  console.log('[Leadesk] Chrome gestartet — Queue-Polling + SSI reaktiviert')
})

function getNext8AM() {
  var now = new Date()
  var next = new Date(now)
  next.setHours(8, 0, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 1)
  return next.getTime()
}

setTimeout(pollQueue, 3000)

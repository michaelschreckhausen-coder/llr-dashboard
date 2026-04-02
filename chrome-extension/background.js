// Lead Radar — Background Service Worker v4.0
// SSI im Hintergrund scrapen — kein sichtbares Fenster

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
      'Prefer': (method === 'PATCH' || method === 'POST') ? 'return=representation' : '',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) return null
  return (method === 'GET' || !method) ? res.json() : res
}

function findLinkedInTab() {
  return chrome.tabs.query({ url: 'https://www.linkedin.com/*' }).then(function(tabs) { return tabs[0] || null })
}

// SSI im Hintergrund scrapen via chrome.scripting.executeScript
async function scrapeSSIInBackground(userId, jobId) {
  console.log('[LLR BG] SSI Hintergrund-Scraping startet...')
  var ssiTab = null
  var createdTab = false
  try {
    // Prüfe ob bereits SSI-Tab offen
    var existing = await chrome.tabs.query({ url: 'https://www.linkedin.com/sales/ssi*' })
    if (existing.length > 0) {
      ssiTab = existing[0]
      // Tab refreshen damit Seite aktuell ist
      await chrome.tabs.reload(ssiTab.id)
    } else {
      // Neuen Tab im Hintergrund öffnen
      ssiTab = await chrome.tabs.create({ url: 'https://www.linkedin.com/sales/ssi', active: false })
      createdTab = true
    }
    // Warte bis Tab geladen
    await new Promise(function(resolve, reject) {
      var timeout = setTimeout(function() { reject(new Error('Timeout')) }, 20000)
      function listener(tabId, info) {
        if (tabId === ssiTab.id && info.status === 'complete') {
          clearTimeout(timeout)
          chrome.tabs.onUpdated.removeListener(listener)
          resolve()
        }
      }
      chrome.tabs.onUpdated.addListener(listener)
      chrome.tabs.get(ssiTab.id, function(t) {
        if (t && t.status === 'complete') { clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); resolve() }
      })
    })
    // Extra Wartezeit für JS auf der Seite
    await new Promise(function(r) { setTimeout(r, 3000) })
    // SSI-Score via scripting.executeScript auslesen
    var results = await chrome.scripting.executeScript({
      target: { tabId: ssiTab.id },
      func: async function() {
        // Methode 1: LinkedIn Sales Navigator API
        try {
          var res = await fetch('https://www.linkedin.com/sales/api/socialSellingCoachingData', {
            headers: { 'accept': 'application/json', 'x-restli-protocol-version': '2.0.0' },
            credentials: 'include'
          })
          if (res.ok) {
            var d = await res.json()
            var total = Math.round((d && (d.ssiScore || d.totalScore || d.score)) || 0)
            if (total > 0) {
              return {
                total: total,
                build_brand: Math.round((d.components && d.components[0] && d.components[0].score) || d.buildProfessionalBrand || 0),
                find_people: Math.round((d.components && d.components[1] && d.components[1].score) || d.findRightPeople || 0),
                engage_insights: Math.round((d.components && d.components[2] && d.components[2].score) || d.engageWithInsights || 0),
                build_relationships: Math.round((d.components && d.components[3] && d.components[3].score) || d.buildRelationships || 0),
                source: 'sales_api'
              }
            }
          }
        } catch(e) { console.log('Sales API error:', e.message) }
        // Methode 2: DOM-Selektoren
        var sels = ['[data-test-ssi-score]', '.ssi-score__total', '[class*="ssi-score"]', '[class*="score__total"]', '[class*="socialSellingIndex"] [class*="score"]']
        for (var i = 0; i < sels.length; i++) {
          var el = document.querySelector(sels[i])
          if (el) {
            var n = parseInt(el.textContent.trim())
            if (n >= 1 && n <= 100) {
              return { total: n, build_brand: 0, find_people: 0, engage_insights: 0, build_relationships: 0, source: 'dom' }
            }
          }
        }
        // Methode 3: Alle Score-ähnlichen Zahlen
        var allEls = document.querySelectorAll('[class*="score"], [class*="index"], h1, h2, h3')
        for (var j = 0; j < allEls.length; j++) {
          var num = parseInt(allEls[j].textContent.trim())
          if (num >= 1 && num <= 100 && allEls[j].textContent.trim().length <= 3) {
            return { total: num, build_brand: 0, find_people: 0, engage_insights: 0, build_relationships: 0, source: 'dom_fallback' }
          }
        }
        return null
      }
    })
    var data = results && results[0] && results[0].result
    if (data && data.total > 0) {
      // Job als erledigt markieren
      await sbFetch('scrape_jobs?id=eq.' + jobId, 'PATCH', {
        status: 'done',
        result: data,
        completed_at: new Date().toISOString()
      })
      // SSI-Score in Tabelle speichern
      await sbFetch('ssi_scores', 'POST', {
        user_id: userId,
        total_score: data.total,
        build_brand: data.build_brand || 0,
        find_people: data.find_people || 0,
        engage_insights: data.engage_insights || 0,
        build_relationships: data.build_relationships || 0,
        measured_at: new Date().toISOString()
      })
      console.log('[LLR BG] SSI erfolgreich:', data.total, 'Quelle:', data.source)
    } else {
      console.log('[LLR BG] SSI Score nicht gefunden')
      await sbFetch('scrape_jobs?id=eq.' + jobId, 'PATCH', {
        status: 'error',
        result: { error: 'Score nicht gefunden' },
        completed_at: new Date().toISOString()
      })
    }
  } catch(err) {
    console.error('[LLR BG] SSI Fehler:', err.message)
    await sbFetch('scrape_jobs?id=eq.' + jobId, 'PATCH', {
      status: 'error',
      result: { error: err.message },
      completed_at: new Date().toISOString()
    }).catch(function(){})
  } finally {
    if (createdTab && ssiTab) {
      chrome.tabs.remove(ssiTab.id).catch(function(){})
    }
  }
}

// Job-Queue prüfen
async function checkQueue() {
  var d = await getAuth()
  if (!d.userId || !d.session) return
  var jobs = await sbFetch('scrape_jobs?user_id=eq.' + d.userId + '&status=eq.pending&order=created_at.asc&limit=1')
  if (!jobs || !jobs.length) return
  var job = jobs[0]
  console.log('[LLR BG] Job gefunden:', job.type)
  if (job.type === 'ssi') {
    await sbFetch('scrape_jobs?id=eq.' + job.id, 'PATCH', { status: 'running' })
    await scrapeSSIInBackground(d.userId, job.id)
    return
  }
  var tab = await findLinkedInTab()
  if (!tab) { console.log('[LLR BG] Kein LinkedIn-Tab offen'); return }
  try { await chrome.tabs.sendMessage(tab.id, { type: 'EXECUTE_JOB', jobId: job.id }) } catch(e) { console.log('[LLR BG] Job error:', e.message) }
}

async function heartbeat() {
  var d = await getAuth()
  if (!d.userId || !d.session) return
  await sbFetch('profiles?id=eq.' + d.userId, 'PATCH', { last_active: new Date().toISOString() }).catch(function(){})
}

chrome.alarms.create('queue-check', { periodInMinutes: 0.5 })
chrome.alarms.create('heartbeat', { periodInMinutes: 5 })

chrome.alarms.onAlarm.addListener(async function(alarm) {
  if (alarm.name === 'queue-check') await checkQueue()
  if (alarm.name === 'heartbeat') await heartbeat()
})

chrome.runtime.onInstalled.addListener(function() {
  console.log('[LLR BG] v4.0 installiert')
  chrome.alarms.create('queue-check', { periodInMinutes: 0.5 })
  chrome.alarms.create('heartbeat', { periodInMinutes: 5 })
})

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.type === 'SET_SESSION') {
    chrome.storage.local.set({ session: msg.session, userId: msg.userId })
    sendResponse({ ok: true })
  }
  if (msg.type === 'TRIGGER_SSI') {
    getAuth().then(function(d) { if (d.userId && msg.jobId) scrapeSSIInBackground(d.userId, msg.jobId) })
    sendResponse({ started: true })
  }
  if (msg.type === 'TRIGGER_SYNC') { checkQueue(); sendResponse({ started: true }) }
  return true
})

;(async function() {
  console.log('[LLR BG] Service Worker v4.0 gestartet')
  await heartbeat()
})()

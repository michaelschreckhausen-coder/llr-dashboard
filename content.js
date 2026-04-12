// ═══════════════════════════════════════════════════════════════
// LinkedIn Lead Radar — Content Script v2.0
// Laeuft auf linkedin.com — scrapet Daten und sendet sie ans Dashboard
// ═══════════════════════════════════════════════════════════════

const SUPABASE_URL  = 'https://jdhajqpgfrsuoluaesjn.supabase.co'
const SUPABASE_KEY  = 'sb_publishable__KdQsVuSD6WWuswGcViaRw_CxDK8grx'
const DASHBOARD_URL = 'https://app.leadesk.de'

// ── Storage helpers ──────────────────────────────────────────────
function getAuth() { return new Promise(r => chrome.storage.local.get(['supabaseSession','userId'], r)) }
function setAuth(d) { return new Promise(r => chrome.storage.local.set(d, r)) }

// ── Supabase REST helper ─────────────────────────────────────────
async function sbFetch(path, method='GET', body) {
  const { supabaseSession } = await getAuth()
  const token = supabaseSession?.access_token
  if (!token) { log('Nicht angemeldet'); return null }
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
  if (!res.ok) { const e = await res.text(); log('Supabase error: ' + e, true); return null }
  return method === 'GET' ? res.json() : res
}

function log(msg, err) {
  console.log('[LLR]', msg)
  window.postMessage({ type: 'LLR_SYNC_PROGRESS', message: msg, level: err ? 'error' : 'info' }, '*')
}

// ── 1. PROFIL-SCRAPER (linkedin.com/in/*) ────────────────────────
function scrapeCurrentProfile() {
  const url = window.location.href
  if (!url.includes('/in/')) return null

  const getText = sel => document.querySelector(sel)?.innerText?.trim() || ''
  const getAttr = (sel, attr) => document.querySelector(sel)?.getAttribute(attr) || ''

  const name     = getText('h1.text-heading-xlarge, h1[class*="heading"]') ||
                   getText('.pv-top-card--list .text-heading-xlarge')
  const headline = getText('.text-body-medium.break-words, .pv-top-card--list .text-body-medium')
  const location = getText('.text-body-small.inline.t-black--light.break-words')
  const avatar   = getAttr('.pv-top-card__photo img, img.profile-photo-edit__preview', 'src') ||
                   getAttr('img.presence-entity__image', 'src')
  const linkedin_url = url.split('?')[0]

  const degree   = getText('.dist-value')
  const followers = getText('.pvs-header__subtitle .t-bold')

  // Extract contact info
  const email = getText('.ci-email .pv-contact-info__contact-type + div') || ''
  const phone  = getText('.ci-phone .pv-contact-info__contact-type + div') || ''
  const website= getText('.ci-websites a') || ''

  // Current position
  const company  = getText('.pv-top-card--experience-list-item .t-bold') ||
                   getText('[data-field="experience_company_logo"] ~ div .t-bold')
  const position = getText('.pv-top-card--experience-list-item .t-normal') || ''

  // About
  const about    = getText('.pv-about-section .pv-about__summary-text, .display-flex.ph5.pv3 span[aria-hidden]')

  if (!name) return null

  return {
    name, headline, location, linkedin_url,
    company, position, email, phone, website,
    profile_image_url: avatar,
    about,
    connection_degree: degree,
    followers,
    source: 'extension_scrape',
    status: 'Lead',
    lead_score: degree === '1st' ? 60 : degree === '2nd' ? 40 : 20,
  }
}

// ── 2. VERBINDUNGEN-SCRAPER ──────────────────────────────────────
async function scrapeConnections() {
  const url = window.location.href
  if (!url.includes('/connections/') && !url.includes('/mynetwork/')) return []

  log('Scrape Verbindungen...')
  const connections = []

  document.querySelectorAll('.mn-connection-card, .invitation-card, [data-view-name*="connection"]').forEach(card => {
    const name    = card.querySelector('.mn-connection-card__name, .invitation-card__title, a[href*="/in/"]')?.innerText?.trim()
    const sub     = card.querySelector('.mn-connection-card__occupation, .invitation-card__subtitle')?.innerText?.trim()
    const link    = card.querySelector('a[href*="/in/"]')?.href?.split('?')[0]
    const avatar  = card.querySelector('img')?.src
    const connAt  = card.querySelector('.time-badge')?.innerText?.trim()

    if (name && link) {
      connections.push({
        name,
        headline: sub || '',
        linkedin_url: link,
        profile_image_url: avatar || null,
        connected_at: connAt || null,
        connection_degree: '1st',
        status: 'Vernetzt',
        lead_score: 60,
        source: 'extension_connections',
      })
    }
  })

  log('Gefunden: ' + connections.length + ' Verbindungen')
  return connections
}

// ── 3. NACHRICHTEN-SCRAPER ───────────────────────────────────────
async function scrapeMessages() {
  const url = window.location.href
  if (!url.includes('/messaging/')) return []

  log('Scrape Nachrichten...')
  const messages = []

  document.querySelectorAll('.msg-conversation-listitem, .msg-overlay-list-bubble').forEach(conv => {
    const name    = conv.querySelector('.msg-conversation-card__participant-names, .msg-overlay-bubble-header__details')?.innerText?.trim()
    const preview = conv.querySelector('.msg-conversation-card__message-snippet, .msg-overlay-list-bubble__content')?.innerText?.trim()
    const time    = conv.querySelector('time')?.getAttribute('datetime') || new Date().toISOString()
    const link    = conv.querySelector('a[href*="/in/"]')?.href?.split('?')[0]
    const avatar  = conv.querySelector('img')?.src

    if (name && preview) {
      messages.push({
        recipient_name: name,
        recipient_linkedin_url: link || null,
        message_text: preview,
        sent_at: time,
        message_type: 'outreach',
        rating: 0,
        source: 'extension_sync',
      })
    }
  })

  // Also read open conversation
  document.querySelectorAll('.msg-s-message-list__event').forEach(msg => {
    const text     = msg.querySelector('.msg-s-event-listitem__body')?.innerText?.trim()
    const sender   = msg.querySelector('.msg-s-message-group__name')?.innerText?.trim()
    const time     = msg.querySelector('time')?.getAttribute('datetime')
    const isMine   = msg.querySelector('.msg-s-event-listitem--other') === null

    if (text && isMine) {
      messages.push({
        recipient_name: document.querySelector('.msg-entity-lockup__entity-title')?.innerText?.trim() || sender || 'Unbekannt',
        message_text: text,
        sent_at: time || new Date().toISOString(),
        message_type: 'outreach',
        rating: 0,
        source: 'extension_message',
      })
    }
  })

  log('Gefunden: ' + messages.length + ' Nachrichten')
  return messages
}

// ── 4. ANGENOMMENE VERNETZUNGSANFRAGEN ───────────────────────────
async function scrapeAcceptedInvites() {
  const url = window.location.href
  if (!url.includes('/invitation-manager/')) return []

  log('Scrape angenommene Anfragen...')
  const accepted = []

  document.querySelectorAll('.invitation-card, [class*="invitation"]').forEach(card => {
    const name    = card.querySelector('.invitation-card__title, a[href*="/in/"]')?.innerText?.trim()
    const sub     = card.querySelector('.invitation-card__subtitle')?.innerText?.trim()
    const link    = card.querySelector('a[href*="/in/"]')?.href?.split('?')[0]
    const avatar  = card.querySelector('img')?.src
    const status  = card.querySelector('.t-green, [class*="accepted"]')?.innerText?.trim()

    if (name && link) {
      accepted.push({
        name,
        headline: sub || '',
        linkedin_url: link,
        profile_image_url: avatar || null,
        status: 'Vernetzt',
        lead_score: 60,
        connection_degree: '1st',
        source: 'extension_invites',
        vernetzt: true,
      })
    }
  })

  log('Gefunden: ' + accepted.length + ' angenommene Anfragen')
  return accepted
}

// ── 5. VERBINDUNG HERSTELLEN ─────────────────────────────────────

// ─── SSI Score Scraper (verbessert v2.1) ────────────────────────────────────
async function scrapeSSI() {
  await new Promise(r => setTimeout(r, 2500))

  let total = null, build_brand = null, find_people = null
  let engage_insights = null, build_relationships = null
  let industry_rank = null, network_rank = null

  // Methode 1: LinkedIn Sales Navigator REST API
  try {
    const res = await fetch('https://www.linkedin.com/sales/api/socialSellingCoachingData', {
      headers: { 'accept': 'application/json', 'x-restli-protocol-version': '2.0.0' },
      credentials: 'include'
    })
    if (res.ok) {
      const d = await res.json()
      log('[LLR] SSI API: ' + JSON.stringify(d).substring(0, 300))
      total          = Math.round(d?.ssiScore || d?.totalScore || d?.score || 0)
      build_brand    = Math.round(d?.components?.[0]?.score || d?.buildProfessionalBrand || 0)
      find_people    = Math.round(d?.components?.[1]?.score || d?.findRightPeople || 0)
      engage_insights= Math.round(d?.components?.[2]?.score || d?.engageWithInsights || 0)
      build_relationships = Math.round(d?.components?.[3]?.score || d?.buildRelationships || 0)
      industry_rank  = d?.industryRank || d?.industry_rank || null
      network_rank   = d?.networkRank  || d?.network_rank  || null
    }
  } catch(e) { log('[LLR] API Fehler: ' + e.message) }

  // Methode 2: DOM-Selektoren mit erweiterten Fallbacks
  if (!total || total === 0) {
    await new Promise(r => setTimeout(r, 1500))
    const sels = [
      '[data-test-ssi-score]',
      '.ssi-score__total',
      '.social-selling-score',
      '[class*="ssi-score"]',
      '[class*="score__total"]',
      '[class*="socialSellingIndex"] [class*="score"]',
      '[class*="ssi"] [class*="total"]',
    ]
    for (const sel of sels) {
      const el = document.querySelector(sel)
      if (el) { const n = parseInt(el.textContent.trim()); if (n >= 1 && n <= 100) { total = n; break } }
    }

    // Teilscores
    const componentEls = document.querySelectorAll(
      '[class*="component"] [class*="score"], [class*="subscore"], [class*="pillar"] [class*="score"], [class*="ssi-component"] [class*="score"]'
    )
    const compScores = []
    componentEls.forEach(el => { const n = parseFloat(el.textContent.trim()); if (n >= 0 && n <= 25) compScores.push(n) })
    if (compScores.length >= 4) {
      build_brand = Math.round(compScores[0]); find_people = Math.round(compScores[1])
      engage_insights = Math.round(compScores[2]); build_relationships = Math.round(compScores[3])
    }

    // Rankings
    const rankEls = document.querySelectorAll('[class*="rank"], [class*="percentile"]')
    const ranks = []
    rankEls.forEach(el => { const m = el.textContent.trim().match(/(\d+)/); if (m) ranks.push(parseInt(m[1])) })
    if (ranks.length >= 1) industry_rank = ranks[0]
    if (ranks.length >= 2) network_rank  = ranks[1]
  }

  // Methode 3: Heuristic — alle 1-2-stelligen Zahlen finden
  if (!total || total === 0) {
    const candidates = []
    document.querySelectorAll('span, div, h1, h2, h3, p').forEach(el => {
      if (el.children.length === 0) {
        const text = el.textContent.trim()
        if (/^\d{1,2}$/.test(text)) {
          const n = parseInt(text)
          if (n >= 1 && n <= 100) candidates.push({ n, top: el.getBoundingClientRect().top })
        }
      }
    })
    candidates.sort((a, b) => a.top - b.top)
    if (candidates.length > 0) total = candidates[0].n
    if (candidates.length >= 5) {
      build_brand = candidates[1].n; find_people = candidates[2].n
      engage_insights = candidates[3].n; build_relationships = candidates[4].n
    }
  }

  if (!total || total <= 0) { log('[LLR] SSI Score nicht gefunden'); return null }

  const data = {
    total, build_brand: build_brand || 0, find_people: find_people || 0,
    engage_insights: engage_insights || 0, build_relationships: build_relationships || 0,
    industry_rank, network_rank,
    scraped_at: new Date().toISOString()
  }

  // localStorage als Backup
  try { localStorage.setItem('llr_ssi_scrape', JSON.stringify({ ...data, ts: Date.now() })) } catch(e) {}

  // postMessage an Opener (Popup) UND an alle LLR-Tabs
  const msg = { type: 'LLR_SSI_SCRAPED', data }
  if (window.opener && !window.opener.closed) {
    try { window.opener.postMessage(msg, '*') } catch(e) {}
  }
  // Auch an den aktuellen Frame (falls kein Popup)
  window.postMessage(msg, '*')

  // Chrome runtime message an Background (für Auto-Sync)
  try {
    chrome.runtime.sendMessage({ type: 'SSI_SCRAPED', data })
  } catch(e) {}

  log('[LLR] SSI gescraped: total=' + total + ' brand=' + build_brand + ' people=' + find_people + ' insights=' + engage_insights + ' rels=' + build_relationships + ' iRank=' + industry_rank + ' nRank=' + network_rank)
  return data
}

async function connectToSupabase() {
  log('Stelle LinkedIn-Verbindung her...')

  const { userId } = await getAuth()
  if (!userId) { log('Kein User gefunden — bitte zuerst im Dashboard anmelden', true); return }

  // Read LinkedIn member info
  const memberIdMeta = document.querySelector('meta[name="linkedin:member:id"]')
  const memberId = memberIdMeta?.content || ''

  const name   = document.querySelector('.global-nav__me-photo')?.alt ||
                 document.querySelector('.nav__footer-user-profile-name')?.innerText?.trim() || ''
  const avatar = document.querySelector('.global-nav__me-photo')?.src ||
                 document.querySelector('.presence-entity__image')?.src || ''

  const payload = {
    user_id: userId,
    status: 'connected',
    li_name: name,
    li_avatar_url: avatar,
    li_member_id: memberId,
    last_active: new Date().toISOString(),
    connected_at: new Date().toISOString(),
  }

  await sbFetch('linkedin_connections?on_conflict=user_id', 'POST', payload)
  log('Verbunden als: ' + name, false)

  window.postMessage({ type: 'LLR_CONNECTED', name, avatar }, '*')
}

// ── 6. DATEN IN SUPABASE SPEICHERN ───────────────────────────────
async function saveLeadsToSupabase(leads) {
  const { userId } = await getAuth()
  if (!userId || !leads.length) return 0

  const withUser = leads.map(l => ({ ...l, user_id: userId }))
  let saved = 0
  const BATCH = 20

  for (let i = 0; i < withUser.length; i += BATCH) {
    const batch = withUser.slice(i, i + BATCH)
    const res = await sbFetch('leads?on_conflict=user_id,linkedin_url', 'POST', batch)
    if (res) saved += batch.length
    log('Gespeichert: ' + Math.min(i + BATCH, withUser.length) + '/' + withUser.length)
  }
  return saved
}

async function saveMessagesToSupabase(msgs) {
  const { userId } = await getAuth()
  if (!userId || !msgs.length) return 0

  const withUser = msgs.map(m => ({ ...m, user_id: userId }))
  await sbFetch('linkedin_messages', 'POST', withUser)
  log('Nachrichten gespeichert: ' + msgs.length)
  return msgs.length
}

async function markJobDone(jobId, result) {
  if (!jobId) return
  await sbFetch('scrape_jobs?id=eq.' + jobId, 'PATCH', {
    status: 'done',
    result: result,
    finished_at: new Date().toISOString(),
  })
}

// ── 7. AUTO-SCRAPE BEI PROFIL-SEITEN ────────────────────────────
async function autoScrapeProfile() {
  await new Promise(r => setTimeout(r, 2000))
  const profile = scrapeCurrentProfile()
  if (!profile) return

  log('Profil erkannt: ' + profile.name)
  const { supabaseSession } = await getAuth()
  if (!supabaseSession) return

  await saveLeadsToSupabase([profile])
  log('Profil gespeichert: ' + profile.name)

  // Notify popup
  chrome.runtime.sendMessage({ type: 'PROFILE_SCRAPED', profile })
}

// ── 8. QUEUE JOB AUSFÜHREN ───────────────────────────────────────
async function executeQueueJob() {
  const { userId, supabaseSession } = await getAuth()
  if (!userId || !supabaseSession) return

  const jobs = await sbFetch(
    'scrape_jobs?user_id=eq.' + userId + '&status=eq.pending&order=created_at.asc&limit=1'
  )
  if (!jobs || !jobs.length) return

  const job = jobs[0]
  log('Fuehre Job aus: ' + job.type + ' — ' + job.url)

  await sbFetch('scrape_jobs?id=eq.' + job.id, 'PATCH', {
    status: 'running', started_at: new Date().toISOString()
  })

  let result = { count: 0 }

  if (job.type === 'connections') {
    if (window.location.href !== job.url) {
      window.location.href = job.url
      return
    }
    const conns = await scrapeConnections()
    const accepted = await scrapeAcceptedInvites()
    const all = [...conns, ...accepted]
    if (all.length) {
      const saved = await saveLeadsToSupabase(all)
      result = { count: saved }
    }

  } else if (job.type === 'profile') {
    if (job.url.includes('/messaging/')) {
      if (window.location.href !== job.url) { window.location.href = job.url; return }
      const msgs = await scrapeMessages()
      if (msgs.length) await saveMessagesToSupabase(msgs)
      result = { count: msgs.length }
    } else {
      const profile = scrapeCurrentProfile()
      if (profile) {
        await saveLeadsToSupabase([profile])
        result = { count: 1, profile }
      }
    }
  }

  await markJobDone(job.id, result)
  log('Job abgeschlossen: ' + job.type + ' (' + result.count + ' Eintraege)', false)
  window.postMessage({ type: 'LLR_SYNC_PROGRESS', message: 'Sync abgeschlossen: ' + result.count + ' importiert', level:'success', done: true }, '*')
}

// ── 9. MESSAGE LISTENER (vom Dashboard) ─────────────────────────
window.addEventListener('message', async (e) => {
  if (e.origin !== DASHBOARD_URL && !e.origin.includes('leadesk')) return
  const { type, userId } = e.data || {}

  if (type === 'LLR_REQUEST_CONNECT') {
    if (userId) await setAuth({ userId })
    await connectToSupabase()
  }
  if (type === 'LLR_START_SYNC') {
    const { syncType } = e.data
    if (syncType === 'connections') {
      const conns = await scrapeConnections()
      if (conns.length) await saveLeadsToSupabase(conns)
      window.postMessage({ type:'LLR_SYNC_PROGRESS', message: conns.length + ' Verbindungen importiert', done:true }, '*')
    }
    if (syncType === 'messages') {
      const msgs = await scrapeMessages()
      if (msgs.length) await saveMessagesToSupabase(msgs)
      window.postMessage({ type:'LLR_SYNC_PROGRESS', message: msgs.length + ' Nachrichten synchronisiert', done:true }, '*')
    }
    if (syncType === 'invites') {
      const inv = await scrapeAcceptedInvites()
      if (inv.length) await saveLeadsToSupabase(inv)
      window.postMessage({ type:'LLR_SYNC_PROGRESS', message: inv.length + ' angenommene Anfragen importiert', done:true }, '*')
    }
  }
})

// ── 10. Chrome Runtime Message Handler ──────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SCRAPE_PROFILE') {
    const p = scrapeCurrentProfile()
    sendResponse({ profile: p })
  }
  if (msg.type === 'PING') {
    sendResponse({ ok: true, url: window.location.href })
  }
  if (msg.type === 'EXECUTE_JOB') {
    executeQueueJob()
    sendResponse({ started: true })
  }
  return true
})

// ── 11. AUTO-INIT ────────────────────────────────────────────────

// ── AUTO-CONNECT: Pruefe ob Verbindungsauftrag in Supabase wartet ──
async function checkPendingConnect() {
  var auth = await getAuth()
  var userId = auth.userId
  if (!userId) return

  var data = await sbFetch('linkedin_connections?user_id=eq.' + userId + '&status=eq.pending&select=*')
  if (!data || !data.length) return

  // Verbindung herstellen
  console.log('[LLR] Verbindungsauftrag gefunden — verbinde...')
  await connectToSupabase()
}
;(async function init() {
  const url = window.location.href

  // Signalisiere dem Dashboard dass Extension aktiv ist
  window.postMessage({ type: 'LLR_EXT_READY', version: '2.0' }, '*')

  if (url.includes('/in/') && !url.includes('/mynetwork/')) {
    await autoScrapeProfile()
  } else if (url.includes('/feed/') || url === 'https://www.linkedin.com/' || url === 'https://www.linkedin.com') {
    await checkPendingConnect()
    var auth0 = await getAuth()
    if (auth0.supabaseSession) await executeQueueJob()
  } else if (url.includes('/mynetwork/') || url.includes('/connections/')) {
    const { supabaseSession } = await getAuth()
    if (supabaseSession) await executeQueueJob()
  } else if (url.includes('/messaging/')) {
    const { supabaseSession } = await getAuth()
    if (supabaseSession) await executeQueueJob()
  } else if (url.includes('/sales/ssi') || url.includes('/sales/index/')) {
    scrapeSSI()
  } else if (url.includes('/invitation-manager/')) {
    const { supabaseSession } = await getAuth()
    if (supabaseSession) await executeQueueJob()
  }

  // Starte Queue-Polling alle 30s
  setInterval(async () => {
    const { supabaseSession } = await getAuth()
    if (supabaseSession) await executeQueueJob()
  }, 30000)
})()

// ═══════════════════════════════════════════════════════════
// Leadesk Chrome Extension — Background Service Worker v4.0
// Automation Engine: Job Queue, SSO Sync, Scheduling
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://jdhajqpgfrsuoluaesjn.supabase.co'
const SUPABASE_KEY = 'sb_publishable__KdQsVuSD6WWuswGcViaRw_CxDK8grx'
const DASHBOARD_URL = 'https://app.leadesk.de'

// ── Auth-Helpers ─────────────────────────────────────────────────
function getSession() {
  return new Promise(resolve => chrome.storage.local.get(['supabaseSession','userId'], resolve))
}

function setSession(data) {
  return new Promise(resolve => chrome.storage.local.set(data, resolve))
}

// ── Supabase REST ─────────────────────────────────────────────────
async function sbFetch(path, method = 'GET', body, headers = {}) {
  const { supabaseSession } = await getSession()
  const token = supabaseSession?.access_token
  if (!token) return { error: 'Not authenticated' }
  
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + token,
      'Prefer': method === 'POST' ? 'return=representation' : method === 'PATCH' ? 'return=minimal' : '',
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.text()
    console.error('[LLR BG] sbFetch error:', err)
    return { error: err }
  }
  return method === 'GET' ? res.json() : (method === 'POST' ? res.json() : { ok: true })
}

// ── SSO: Session vom Dashboard sync ──────────────────────────────
// Dashboard injiziert Session über localStorage wenn User eingeloggt ist
// Extension liest sie beim Start + periodisch
async function syncSessionFromDashboard() {
  try {
    const tabs = await chrome.tabs.query({ url: DASHBOARD_URL + '/*' })
    if (!tabs.length) return false
    
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => {
        const key = Object.keys(localStorage).find(k => k.includes('auth-token') && k.includes('supabase'))
        if (!key) return null
        try {
          const data = JSON.parse(localStorage.getItem(key))
          return { access_token: data?.access_token, user: data?.user }
        } catch { return null }
      }
    })
    
    const session = results?.[0]?.result
    if (session?.access_token) {
      await setSession({ 
        supabaseSession: session, 
        userId: session.user?.id,
        syncedAt: Date.now()
      })
      console.log('[LLR BG] Session synced from dashboard, user:', session.user?.email)
      return true
    }
  } catch (e) {
    console.log('[LLR BG] Session sync failed:', e.message)
  }
  return false
}

// ── Job Queue: Nächsten Job vom Server holen ──────────────────────
async function claimNextJob() {
  const { userId } = await getSession()
  if (!userId) return null

  // Nächsten pendenden Job holen (scheduled_at <= now)
  const jobs = await sbFetch(
    `automation_jobs?user_id=eq.${userId}&status=eq.pending&scheduled_at=lte.${new Date().toISOString()}&order=priority.asc,scheduled_at.asc&limit=1`
  )
  
  if (!Array.isArray(jobs) || !jobs.length) return null
  const job = jobs[0]

  // Job als "claimed" markieren
  await sbFetch(`automation_jobs?id=eq.${job.id}`, 'PATCH', {
    status: 'claimed',
    claimed_at: new Date().toISOString()
  })

  return job
}

// ── Job ausführen ─────────────────────────────────────────────────
async function executeJob(job) {
  console.log('[LLR BG] Executing job:', job.type, job.id)
  
  // Job als "running" markieren
  await sbFetch(`automation_jobs?id=eq.${job.id}`, 'PATCH', {
    status: 'running',
    started_at: new Date().toISOString()
  })

  let result = null
  let error = null

  try {
    switch (job.type) {

      case 'visit_profile': {
        const { linkedin_url } = job.payload
        if (!linkedin_url) throw new Error('Keine LinkedIn URL')
        
        // Tab öffnen (im Hintergrund)
        const tab = await chrome.tabs.create({ url: linkedin_url, active: false })
        await waitForTab(tab.id)
        await sleep(3000 + Math.random() * 3000) // Human-like delay
        
        // Lead-ID im Tab speichern für Content Script
        if (job.lead_id) {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (leadId) => { window.__leadesk_lead_id = leadId },
            args: [job.lead_id]
          })
        }

        await chrome.tabs.remove(tab.id)
        result = { visited: true, url: linkedin_url }
        break
      }

      case 'import_profile': {
        const { linkedin_url } = job.payload
        if (!linkedin_url) throw new Error('Keine LinkedIn URL')
        
        const tab = await chrome.tabs.create({ url: linkedin_url, active: false })
        await waitForTab(tab.id)
        await sleep(2000 + Math.random() * 2000)

        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: scrapeProfileForImport
        })
        
        const profileData = results?.[0]?.result
        await chrome.tabs.remove(tab.id)

        if (!profileData) throw new Error('Profil konnte nicht gescrapt werden')

        // In Supabase speichern
        const { userId } = await getSession()
        const leadPayload = {
          ...profileData,
          user_id: userId,
          li_connection_status: 'connected',
          source: 'automation_import',
          created_at: new Date().toISOString()
        }
        await sbFetch('leads', 'POST', leadPayload)
        result = { imported: true, name: profileData.first_name + ' ' + profileData.last_name }
        break
      }

      case 'send_connect': {
        const { linkedin_url, message } = job.payload
        if (!linkedin_url) throw new Error('Keine LinkedIn URL')

        // Lead-Daten für Template-Substitution holen
        let leadData = {}
        if (job.lead_id) {
          const leads = await sbFetch(`leads?id=eq.${job.lead_id}&select=first_name,last_name,company,job_title&limit=1`)
          if (Array.isArray(leads) && leads.length) leadData = leads[0]
        }

        const finalMessage = substituteTemplate(message || '', leadData)

        const tab = await chrome.tabs.create({ url: linkedin_url, active: false })
        await waitForTab(tab.id)
        await sleep(3000 + Math.random() * 2000)

        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: sendConnectionRequest,
          args: [finalMessage]
        })

        await chrome.tabs.remove(tab.id)
        result = results?.[0]?.result || { sent: false }
        
        // Lead-Status updaten
        if (job.lead_id && result.sent) {
          await sbFetch(`leads?id=eq.${job.lead_id}`, 'PATCH', {
            li_connection_status: 'requested',
            li_connection_requested_at: new Date().toISOString()
          })
        }
        break
      }

      case 'send_message': {
        const { linkedin_url, message } = job.payload
        if (!linkedin_url) throw new Error('Keine LinkedIn URL')

        let leadData = {}
        if (job.lead_id) {
          const leads = await sbFetch(`leads?id=eq.${job.lead_id}&select=first_name,last_name,company,job_title&limit=1`)
          if (Array.isArray(leads) && leads.length) leadData = leads[0]
        }

        const finalMessage = substituteTemplate(message || '', leadData)

        const tab = await chrome.tabs.create({ url: linkedin_url, active: false })
        await waitForTab(tab.id)
        await sleep(3000 + Math.random() * 2000)

        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: sendLinkedInMessage,
          args: [finalMessage]
        })

        await chrome.tabs.remove(tab.id)
        result = results?.[0]?.result || { sent: false }
        break
      }

      case 'scrape_connections': {
        const { max_count = 100 } = job.payload
        const tab = await chrome.tabs.create({ 
          url: 'https://www.linkedin.com/mynetwork/invite-connect/connections/', 
          active: false 
        })
        await waitForTab(tab.id)
        await sleep(3000)

        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: scrapeConnectionsList,
          args: [max_count]
        })
        
        await chrome.tabs.remove(tab.id)
        const connections = results?.[0]?.result || []
        
        // Alle Connections als Leads speichern (nur neue)
        const { userId } = await getSession()
        let imported = 0
        for (const conn of connections) {
          const existing = await sbFetch(`leads?user_id=eq.${userId}&linkedin_url=eq.${conn.linkedin_url}&limit=1`)
          if (Array.isArray(existing) && existing.length) continue
          
          await sbFetch('leads', 'POST', {
            ...conn,
            user_id: userId,
            li_connection_status: 'connected',
            source: 'automation_import'
          })
          imported++
          await sleep(200) // Rate limiting
        }

        result = { scraped: connections.length, imported }
        break
      }

      default:
        throw new Error('Unbekannter Job-Typ: ' + job.type)
    }

    // Job als done markieren
    await sbFetch(`automation_jobs?id=eq.${job.id}`, 'PATCH', {
      status: 'done',
      completed_at: new Date().toISOString(),
      result: result
    })

    // Campaign Lead Schritt weiterschalten
    if (job.campaign_lead_id) {
      await advanceCampaignLead(job.campaign_lead_id, job.campaign_id)
    }

    console.log('[LLR BG] Job done:', job.type, result)

  } catch (e) {
    error = e.message
    console.error('[LLR BG] Job failed:', job.type, e)
    
    const retryCount = (job.retry_count || 0) + 1
    const shouldRetry = retryCount <= (job.max_retries || 2)
    
    await sbFetch(`automation_jobs?id=eq.${job.id}`, 'PATCH', {
      status: shouldRetry ? 'pending' : 'failed',
      error_msg: error,
      retry_count: retryCount,
      scheduled_at: shouldRetry ? new Date(Date.now() + 5 * 60000).toISOString() : undefined,
      completed_at: !shouldRetry ? new Date().toISOString() : undefined
    })

    if (job.campaign_lead_id && !shouldRetry) {
      await sbFetch(`automation_campaign_leads?id=eq.${job.campaign_lead_id}`, 'PATCH', {
        status: 'failed',
        error_msg: error
      })
    }
  }
}

// ── Campaign Lead Step weiterschalten ────────────────────────────
async function advanceCampaignLead(campaignLeadId, campaignId) {
  const [clRows, campRows] = await Promise.all([
    sbFetch(`automation_campaign_leads?id=eq.${campaignLeadId}&limit=1`),
    sbFetch(`automation_campaigns?id=eq.${campaignId}&select=sequence,settings&limit=1`)
  ])
  
  const cl = Array.isArray(clRows) ? clRows[0] : null
  const camp = Array.isArray(campRows) ? campRows[0] : null
  if (!cl || !camp) return

  const sequence = camp.sequence || []
  const nextStep = (cl.current_step || 0) + 1

  if (nextStep >= sequence.length) {
    // Kampagne für diesen Lead abgeschlossen
    await sbFetch(`automation_campaign_leads?id=eq.${campaignLeadId}`, 'PATCH', {
      status: 'completed',
      completed_at: new Date().toISOString(),
      current_step: nextStep
    })
    // Campaign Lead-Counter updaten
    await sbFetch(`automation_campaigns?id=eq.${campaignId}`, 'PATCH', {
      leads_done: '(leads_done + 1)' // raw SQL geht nicht via REST, machen wir via RPC
    })
    return
  }

  const step = sequence[nextStep]
  const delayMs = ((step.delay_min || 60) + Math.random() * ((step.delay_max || step.delay_min || 60) - (step.delay_min || 60))) * 60 * 1000
  const nextActionAt = new Date(Date.now() + delayMs).toISOString()

  // Nächsten Job einplanen
  const lead = await sbFetch(`leads?id=eq.${cl.lead_id}&select=linkedin_url,first_name,last_name&limit=1`)
  const leadData = Array.isArray(lead) ? lead[0] : null

  if (leadData) {
    await sbFetch('automation_jobs', 'POST', {
      user_id: cl.user_id,
      campaign_id: campaignId,
      campaign_lead_id: campaignLeadId,
      lead_id: cl.lead_id,
      type: step.type,
      payload: { linkedin_url: leadData.linkedin_url, ...step },
      scheduled_at: nextActionAt,
      priority: 5
    })
  }

  await sbFetch(`automation_campaign_leads?id=eq.${campaignLeadId}`, 'PATCH', {
    current_step: nextStep,
    next_action_at: nextActionAt
  })
}

// ── Template Substitution ─────────────────────────────────────────
function substituteTemplate(template, lead) {
  return template
    .replace(/\{\{first_name\}\}/g, lead.first_name || 'Hallo')
    .replace(/\{\{last_name\}\}/g, lead.last_name || '')
    .replace(/\{\{company\}\}/g, lead.company || 'Ihrem Unternehmen')
    .replace(/\{\{job_title\}\}/g, lead.job_title || '')
    .trim()
}

// ── Hilfsfunktionen ───────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function waitForTab(tabId, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Tab timeout')), timeout)
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer)
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(listener)
    chrome.tabs.get(tabId, t => { if (t?.status === 'complete') { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve() } })
  })
}

// ── Inline-Funktionen für executeScript (müssen serialisierbar sein) ─
function scrapeProfileForImport() {
  const getText = sel => document.querySelector(sel)?.innerText?.trim() || ''
  const getAttr = (sel, attr) => document.querySelector(sel)?.getAttribute(attr) || ''
  const url = window.location.href.split('?')[0]
  if (!url.includes('/in/')) return null

  const fullName = getText('h1.text-heading-xlarge, h1[class*="heading"]')
  const nameParts = fullName.trim().split(' ')
  const firstName = nameParts[0] || ''
  const lastName  = nameParts.slice(1).join(' ') || ''
  
  return {
    name: fullName,
    first_name: firstName,
    last_name: lastName,
    headline: getText('.text-body-medium.break-words'),
    company: getText('.pv-top-card--experience-list-item .t-bold, [data-field="experience_company_logo"] ~ div .t-bold'),
    job_title: getText('.pv-top-card--experience-list-item .t-normal'),
    location: getText('.text-body-small.inline.t-black--light.break-words'),
    linkedin_url: url,
    profile_url: url,
    avatar_url: getAttr('.pv-top-card__photo img, .profile-photo-edit__preview, .presence-entity__image', 'src'),
    li_about_summary: getText('.pv-about-section .pv-about__summary-text'),
  }
}

function sendConnectionRequest(message) {
  return new Promise(async resolve => {
    try {
      // Klicke "Vernetzen" Button
      const connectBtn = Array.from(document.querySelectorAll('button')).find(b => 
        b.innerText?.trim().match(/^Vernetzen|^Connect/i) && !b.closest('[data-view-name="profile-entity-hovercard"]')
      )
      if (!connectBtn) { resolve({ sent: false, reason: 'Kein Connect-Button gefunden' }); return }
      connectBtn.click()
      await new Promise(r => setTimeout(r, 1500))

      if (message && message.trim()) {
        // "Mit Notiz hinzufügen" klicken
        const noteBtn = Array.from(document.querySelectorAll('button')).find(b => 
          b.innerText?.trim().match(/Notiz|Add a note/i)
        )
        if (noteBtn) {
          noteBtn.click()
          await new Promise(r => setTimeout(r, 1000))
          const textarea = document.querySelector('textarea[name="message"], #custom-message')
          if (textarea) {
            textarea.value = message
            textarea.dispatchEvent(new Event('input', { bubbles: true }))
            await new Promise(r => setTimeout(r, 500))
          }
        }
      }

      // Senden
      const sendBtn = Array.from(document.querySelectorAll('button')).find(b => 
        b.innerText?.trim().match(/^Senden|^Send|^Vernetzen/i) && b.type !== 'button' || 
        b.getAttribute('aria-label')?.match(/Senden|Send/i)
      )
      if (sendBtn) {
        sendBtn.click()
        await new Promise(r => setTimeout(r, 1000))
        resolve({ sent: true })
      } else {
        resolve({ sent: false, reason: 'Kein Senden-Button' })
      }
    } catch(e) {
      resolve({ sent: false, reason: e.message })
    }
  })
}

function sendLinkedInMessage(message) {
  return new Promise(async resolve => {
    try {
      const msgBtn = Array.from(document.querySelectorAll('button')).find(b =>
        b.innerText?.trim().match(/^Nachricht|^Message/i)
      )
      if (!msgBtn) { resolve({ sent: false, reason: 'Kein Message-Button' }); return }
      msgBtn.click()
      await new Promise(r => setTimeout(r, 2000))

      const input = document.querySelector('.msg-form__contenteditable, div[contenteditable="true"].msg-form__contenteditable')
      if (!input) { resolve({ sent: false, reason: 'Kein Nachrichtenfeld' }); return }

      input.focus()
      input.innerText = message
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise(r => setTimeout(r, 500))

      const sendBtn = document.querySelector('button.msg-form__send-button, button[type="submit"]')
      if (sendBtn && !sendBtn.disabled) {
        sendBtn.click()
        resolve({ sent: true })
      } else {
        resolve({ sent: false, reason: 'Send-Button deaktiviert' })
      }
    } catch(e) {
      resolve({ sent: false, reason: e.message })
    }
  })
}

function scrapeConnectionsList(maxCount) {
  const connections = []
  document.querySelectorAll('.mn-connection-card, .mn-member-identity-entity').forEach(card => {
    if (connections.length >= maxCount) return
    const name   = card.querySelector('.mn-connection-card__name, .mn-member-identity-entity__details h3')?.innerText?.trim()
    const sub    = card.querySelector('.mn-connection-card__occupation, .mn-member-identity-entity__details p')?.innerText?.trim()
    const link   = card.querySelector('a[href*="/in/"]')?.href?.split('?')[0]
    const avatar = card.querySelector('img')?.src
    if (name && link) {
      const parts = name.split(' ')
      connections.push({
        name, first_name: parts[0], last_name: parts.slice(1).join(' '),
        headline: sub, linkedin_url: link, profile_url: link, avatar_url: avatar
      })
    }
  })
  return connections
}

// ── Automation Loop ────────────────────────────────────────────────
let isRunning = false
let loopActive = false

async function automationLoop() {
  if (isRunning) return
  
  const { supabaseSession } = await getSession()
  if (!supabaseSession?.access_token) {
    // Session vom Dashboard holen
    await syncSessionFromDashboard()
    return
  }

  // Tägliches Limit + Arbeitszeiten prüfen
  const now = new Date()
  const hour = now.getHours()
  if (hour < 8 || hour >= 20) {
    console.log('[LLR BG] Außerhalb Arbeitszeiten, pausiere...')
    return
  }

  const job = await claimNextJob()
  if (!job) return

  isRunning = true
  try {
    await executeJob(job)
    // Human-like Pause zwischen Jobs (30-90s)
    await sleep(30000 + Math.random() * 60000)
  } finally {
    isRunning = false
  }
}

// ── Alarms Setup ──────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('automation-loop', { periodInMinutes: 1 })
  chrome.alarms.create('session-sync', { periodInMinutes: 5 })
  console.log('[LLR BG] Extension installiert, Automation-Loop gestartet')
})

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'automation-loop') await automationLoop()
  if (alarm.name === 'session-sync') await syncSessionFromDashboard()
})

// ── Messages vom Popup / Content Script ──────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  ;(async () => {
    switch (msg.type) {

      case 'GET_STATUS': {
        const { supabaseSession, userId, syncedAt } = await getSession()
        const isAuth = !!(supabaseSession?.access_token)
        sendResponse({ authenticated: isAuth, userId, syncedAt })
        break
      }

      case 'SYNC_SESSION': {
        const ok = await syncSessionFromDashboard()
        sendResponse({ success: ok })
        break
      }

      case 'LOGOUT': {
        await chrome.storage.local.clear()
        sendResponse({ success: true })
        break
      }

      case 'IMPORT_CURRENT_PROFILE': {
        const tab = sender.tab
        if (!tab) { sendResponse({ error: 'Kein Tab' }); break }
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: scrapeProfileForImport
        })
        const profile = results?.[0]?.result
        if (!profile) { sendResponse({ error: 'Kein Profil gefunden' }); break }
        
        const { userId } = await getSession()
        const payload = { ...profile, user_id: userId, li_connection_status: 'connected', source: 'extension_import' }
        const result = await sbFetch('leads', 'POST', payload)
        sendResponse({ success: !result.error, lead: Array.isArray(result) ? result[0] : result, error: result.error })
        break
      }

      case 'SEND_CONNECT': {
        const { leadId, message } = msg
        const leads = await sbFetch(`leads?id=eq.${leadId}&select=linkedin_url,first_name,last_name&limit=1`)
        const lead = Array.isArray(leads) ? leads[0] : null
        if (!lead) { sendResponse({ error: 'Lead nicht gefunden' }); break }

        const { userId } = await getSession()
        await sbFetch('automation_jobs', 'POST', {
          user_id: userId,
          lead_id: leadId,
          type: 'send_connect',
          payload: { linkedin_url: lead.linkedin_url, message },
          priority: 2,
          scheduled_at: new Date().toISOString()
        })
        sendResponse({ success: true, queued: true })
        break
      }

      case 'GET_QUEUE_STATUS': {
        const { userId } = await getSession()
        if (!userId) { sendResponse({ error: 'Not auth' }); break }
        const jobs = await sbFetch(
          `automation_jobs?user_id=eq.${userId}&status=in.(pending,claimed,running)&select=id,type,status,scheduled_at&limit=50`
        )
        sendResponse({ jobs: Array.isArray(jobs) ? jobs : [] })
        break
      }

      default:
        sendResponse({ error: 'Unbekannter Nachrichtentyp' })
    }
  })()
  return true // async response
})

console.log('[LLR BG] Background Service Worker v4.0 gestartet')

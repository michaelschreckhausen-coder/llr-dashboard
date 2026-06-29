// src/lib/leadeskExtension.js
// Bridge zwischen der Web-App und der Leadesk Chrome Extension via
// window.postMessage (kein chrome.runtime.id Hardcoding noetig).
// Das content_script "bridge.js" der Extension empfaengt diese Messages
// auf leadesk.de Domains und delegiert an den Background-Service-Worker.

// Public Chrome Web Store URL — seit 2026-05-17 öffentlich abrufbar.
export const EXTENSION_WEBSTORE_URL = 'https://chromewebstore.google.com/detail/leadesk/iikeboliakdgmmaefjjemfakndfelpof'

const BRIDGE_TIMEOUT_DETECT = 800   // ms — wie lang wir auf "ping pong" warten
const BRIDGE_TIMEOUT_SCRAPE = 60000 // ms — Scrape kann lange dauern (Tab oeffnen + LinkedIn-Lazy-Load)

function randomId() {
  return 'ldsk-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

// Sendet eine Anfrage an die Bridge und wartet auf die passende Antwort.
function sendBridgeMessage(action, payload = {}, timeoutMs = BRIDGE_TIMEOUT_SCRAPE) {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Kein Browser-Kontext'))
      return
    }
    const requestId = randomId()
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true
      window.removeEventListener('message', handler)
      reject(new Error('Zeitüberschreitung beim Warten auf die Extension. Ist die Leadesk-Extension installiert und aktiv?'))
    }, timeoutMs)

    function handler(event) {
      if (event.source !== window) return
      const d = event.data
      if (!d || typeof d !== 'object') return
      if (d.source !== 'leadesk-ext') return
      if (d.requestId !== requestId) return
      if (done) return
      done = true
      clearTimeout(timer)
      window.removeEventListener('message', handler)
      resolve(d.payload || {})
    }
    window.addEventListener('message', handler)
    window.postMessage({ source: 'leadesk-web', requestId, action, ...payload }, window.location.origin)
  })
}

// Schnell-Check ob die Extension installiert ist (DOM-Sentinel + ping).
export async function detectLeadeskExtension() {
  // 1) Sofort-Check (Marker schon da)
  if (typeof document !== 'undefined') {
    const m = document.getElementById('leadesk-extension-ready')
    if (m) return { installed: true, version: m.getAttribute('data-version') || '?' }
  }

  // 2) Parallel: MutationObserver auf späten Marker + Ping
  const observerPromise = new Promise(resolve => {
    if (typeof document === 'undefined') { resolve(null); return }
    let done = false
    const obs = new MutationObserver(() => {
      const m = document.getElementById('leadesk-extension-ready')
      if (m && !done) {
        done = true
        obs.disconnect()
        resolve({ installed: true, version: m.getAttribute('data-version') || '?' })
      }
    })
    obs.observe(document.documentElement, { childList: true, subtree: true })
    setTimeout(() => {
      if (!done) { done = true; obs.disconnect(); resolve(null) }
    }, 2500)
  })

  const pingPromise = sendBridgeMessage('ping', {}, BRIDGE_TIMEOUT_DETECT)
    .then(p => (p && p.ok) ? { installed: true, version: p.version || '?' } : null)
    .catch(() => null)

  const [obsRes, pingRes] = await Promise.all([observerPromise, pingPromise])
  return obsRes || pingRes || { installed: false }
}

// Hauptfunktion: scrapet ein LinkedIn-Profil ueber die Extension.
// Returnt { profile, sourceUrl } oder { error }.
export async function scrapeLinkedInProfile(url, opts) {
  const includePosts = !!(opts && opts.includePosts)
  if (!url || typeof url !== 'string') return { error: 'Bitte eine LinkedIn-Profil-URL eingeben' }
  if (!/linkedin\.com\/in\//i.test(url)) return { error: 'Bitte eine LinkedIn-Profil-URL (linkedin.com/in/...) eingeben' }
  const det = await detectLeadeskExtension()
  if (!det.installed) {
    return {
      error: 'Leadesk Chrome-Extension nicht aktiv. Bitte installiere oder aktiviere die Extension, um LinkedIn-Profile zu importieren.',
      missingExtension: true,
    }
  }
  try {
    const resp = await sendBridgeMessage('scrape_linkedin_profile', { url, includePosts }, BRIDGE_TIMEOUT_SCRAPE)
    return resp || { error: 'Keine Antwort von der Extension' }
  } catch (e) {
    return { error: e.message || 'Fehler beim Import via Extension' }
  }
}

// Scrapet eine LinkedIn COMPANY PAGE ueber die Extension (Action ab v9.8.0).
// Returnt { company, sourceUrl } oder { error }.
export async function scrapeLinkedInCompany(url) {
  if (!url || typeof url !== 'string') return { error: 'Bitte eine LinkedIn-Company-URL eingeben' }
  if (!/linkedin\.com\/company\//i.test(url)) return { error: 'Bitte eine LinkedIn-Company-URL (linkedin.com/company/...) eingeben' }
  const det = await detectLeadeskExtension()
  if (!det.installed) {
    return {
      error: 'Leadesk Chrome-Extension nicht aktiv. Bitte installiere oder aktiviere die Extension, um Company Pages zu importieren.',
      missingExtension: true,
    }
  }
  try {
    const resp = await sendBridgeMessage('scrape_linkedin_company', { url }, BRIDGE_TIMEOUT_SCRAPE)
    if (resp?.error && /Unbekannte Aktion/i.test(resp.error)) {
      return { error: 'Deine Leadesk-Extension ist zu alt für Company-Page-Import (benötigt v9.8+). Bitte Extension aktualisieren.', outdatedExtension: true }
    }
    return resp || { error: 'Keine Antwort von der Extension' }
  } catch (e) {
    return { error: e.message || 'Fehler beim Import via Extension' }
  }
}

// Formatiert eine Company Page als Plain-Text-Block fuer Brand-Voice-/KB-Imports.
export function formatLinkedInCompanyAsText(c) {
  if (!c) return ''
  const lines = []
  if (c.name) lines.push('Unternehmen: ' + c.name)
  if (c.tagline && c.tagline !== c.industry) lines.push('Tagline: ' + c.tagline)
  if (c.industry) lines.push('Branche: ' + c.industry)
  if (c.company_size) lines.push('Unternehmensgröße: ' + c.company_size)
  if (c.headquarters) lines.push('Hauptsitz: ' + c.headquarters)
  if (c.founded) lines.push('Gegründet: ' + c.founded)
  if (c.type) lines.push('Art: ' + c.type)
  if (c.website) lines.push('Website: ' + c.website)
  if (c.followers) lines.push('LinkedIn-Follower: ' + c.followers)
  if (c.linkedin_url) lines.push('LinkedIn: ' + c.linkedin_url)
  if (c.specialties) {
    lines.push('')
    lines.push('## SPEZIALGEBIETE')
    lines.push(c.specialties)
  }
  if (c.description) {
    lines.push('')
    lines.push('## ÜBER UNS (PAGE-BESCHREIBUNG)')
    lines.push(c.description)
  }
  if (Array.isArray(c.posts) && c.posts.length) {
    lines.push('')
    lines.push('## PAGE-BEITRÄGE (VOLLTEXT, NEUESTE ZUERST)')
    c.posts.forEach((p, i) => {
      lines.push('')
      lines.push('### Beitrag ' + (i + 1))
      lines.push(p)
    })
  }
  return lines.join('\n')
}

// Formatiert ein Profil als strukturierten Plain-Text-Block fuer Knowledge-Base-,
// Brand-Voice- und Zielgruppen-Imports. Bringt ALLE im Profil sichtbaren
// Sections rein (Headline, About, Experience, Education, Skills, Languages,
// Certifications, Featured, Activity/Posts, Volunteer, Honors).
export function formatLinkedInProfileAsText(profile) {
  if (!profile) return ''
  const lines = []

  // ── Kopf ──
  if (profile.name) lines.push('Name: ' + profile.name)
  if (profile.headline) lines.push('Profilslogan: ' + profile.headline)
  if (profile.job_title || profile.company) {
    const t = profile.job_title || ''
    const c = profile.company ? ' @ ' + profile.company : ''
    lines.push('Aktuelle Position: ' + t + c)
  }
  if (profile.industry) lines.push('Branche: ' + profile.industry)
  if (profile.city || profile.country || profile.location) {
    const loc = [profile.city, profile.country].filter(Boolean).join(', ') || profile.location
    if (loc) lines.push('Standort: ' + loc)
  }
  if (profile.linkedin_url || profile.profile_url) {
    lines.push('LinkedIn: ' + (profile.linkedin_url || profile.profile_url))
  }

  // ── Sections (Reihenfolge bewusst: erst Wer, dann Was, dann Inhalte) ──
  const sections = [
    { key: 'li_about_summary',          title: 'INFO-BOX (ÜBER MICH)' },
    { key: 'li_featured_summary',       title: 'FEATURED / EMPFOHLEN' },
    { key: 'li_experience_summary',     title: 'BERUFSERFAHRUNG' },
    { key: 'li_education_summary',      title: 'AUSBILDUNG' },
    { key: 'li_certifications_summary', title: 'LIZENZEN & ZERTIFIKATE' },
    { key: 'li_skills_summary',         title: 'KENNTNISSE & FÄHIGKEITEN' },
    { key: 'li_languages_summary',      title: 'SPRACHEN' },
    { key: 'li_volunteer_summary',      title: 'EHRENAMT' },
    { key: 'li_honors_summary',         title: 'AUSZEICHNUNGEN' },
    { key: 'li_activity_summary',       title: 'AKTIVITÄTEN / LINKEDIN-BEITRÄGE' },
  ]
  if (Array.isArray(profile.li_posts) && profile.li_posts.length) {
    lines.push('')
    lines.push('## LINKEDIN-BEITRÄGE (VOLLTEXT, NEUESTE ZUERST)')
    profile.li_posts.forEach((p, i) => {
      lines.push('')
      lines.push('### Beitrag ' + (i + 1))
      lines.push(p)
    })
  }
  for (const s of sections) {
    const v = profile[s.key]
    if (!v || !String(v).trim()) continue
    lines.push('')
    lines.push('## ' + s.title)
    lines.push(String(v).trim())
  }

  return lines.join('\n')
}


// Holt die aktuell auf linkedin.com eingeloggte Identity (member_id + name + avatar).
// Wird verwendet um eine Brand Voice mit einem konkreten LinkedIn-Profil zu verknüpfen.
export async function getActiveLinkedInIdentity() {
  const det = await detectLeadeskExtension()
  if (!det.installed) {
    return {
      error: 'Leadesk Chrome-Extension nicht aktiv. Bitte installiere oder aktiviere die Extension, um dein LinkedIn-Profil zu verbinden.',
      missingExtension: true,
    }
  }
  try {
    const resp = await sendBridgeMessage('get_active_linkedin_identity', {}, BRIDGE_TIMEOUT_SCRAPE)
    return resp || { error: 'Keine Antwort von der Extension' }
  } catch (e) {
    return { error: e.message || 'Fehler beim Lesen der LinkedIn-Identity' }
  }
}

// Scrapet die eigene LinkedIn-Connections-Seite, um zu erkennen welche
// gesendeten Vernetzungsanfragen angenommen wurden.
// Returnt { connections: [{ name, profile_url }] } oder { error }.
export async function scrapeLinkedInConnections() {
  const det = await detectLeadeskExtension()
  if (!det.installed) {
    return {
      error: 'Leadesk Chrome-Extension nicht aktiv. Bitte installiere oder aktiviere die Extension, um deine Verbindungen abzugleichen.',
      missingExtension: true,
    }
  }
  try {
    const resp = await sendBridgeMessage('scrape_connections', {}, BRIDGE_TIMEOUT_SCRAPE)
    if (resp?.error && /Unbekannte Aktion/i.test(resp.error)) {
      return { error: 'Deine Leadesk-Extension ist zu alt für den Verbindungs-Abgleich (benötigt die neueste Version). Bitte Extension aktualisieren.', outdatedExtension: true }
    }
    return resp || { error: 'Keine Antwort von der Extension' }
  } catch (e) {
    return { error: e.message || 'Fehler beim Verbindungs-Abgleich via Extension' }
  }
}

// Normalisiert eine LinkedIn-Profil-URL auf linkedin.com/in/<slug> (klein, ohne Query/Slash).
export function normalizeLinkedInUrl(u) {
  if (!u) return null
  const m = String(u).match(/https?:\/\/[^/]*linkedin\.com\/in\/[^/?#]+/i)
  return m ? m[0].toLowerCase().replace(/\/$/, '') : null
}

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
  // 1) Synchroner DOM-Marker
  if (typeof document !== 'undefined') {
    const marker = document.getElementById('leadesk-extension-ready')
    if (marker) {
      return { installed: true, version: marker.getAttribute('data-version') || '?' }
    }
  }
  // 2) Fallback ping mit kurzem Timeout
  try {
    const pong = await sendBridgeMessage('ping', {}, BRIDGE_TIMEOUT_DETECT)
    return { installed: !!(pong && pong.ok), version: pong?.version || '?' }
  } catch (e) {
    return { installed: false }
  }
}

// Hauptfunktion: scrapet ein LinkedIn-Profil ueber die Extension.
// Returnt { profile, sourceUrl } oder { error }.
export async function scrapeLinkedInProfile(url) {
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
    const resp = await sendBridgeMessage('scrape_linkedin_profile', { url }, BRIDGE_TIMEOUT_SCRAPE)
    return resp || { error: 'Keine Antwort von der Extension' }
  } catch (e) {
    return { error: e.message || 'Fehler beim Import via Extension' }
  }
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
  for (const s of sections) {
    const v = profile[s.key]
    if (!v || !String(v).trim()) continue
    lines.push('')
    lines.push('## ' + s.title)
    lines.push(String(v).trim())
  }

  return lines.join('\n')
}

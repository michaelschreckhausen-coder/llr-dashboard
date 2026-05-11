// src/lib/leadeskExtension.js
// Bridge zwischen der Web-App und der Leadesk Chrome Extension via
// window.postMessage (kein chrome.runtime.id Hardcoding noetig).
// Das content_script "bridge.js" der Extension empfaengt diese Messages
// auf leadesk.de Domains und delegiert an den Background-Service-Worker.

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

// Formatiert ein Profil als Plain-Text-Block fuer Knowledge-Base-Eintraege.
export function formatLinkedInProfileAsText(profile) {
  if (!profile) return ''
  const lines = []
  if (profile.name) lines.push('Name: ' + profile.name)
  if (profile.headline) lines.push('Headline: ' + profile.headline)
  if (profile.job_title || profile.company) {
    const t = profile.job_title || ''
    const c = profile.company ? ' @ ' + profile.company : ''
    lines.push('Aktuelle Position: ' + t + c)
  }
  if (profile.industry) lines.push('Branche: ' + profile.industry)
  if (profile.city || profile.country || profile.location) {
    lines.push('Standort: ' + [profile.city, profile.country].filter(Boolean).join(', ') || profile.location)
  }
  if (profile.linkedin_url || profile.profile_url) lines.push('LinkedIn: ' + (profile.linkedin_url || profile.profile_url))
  if (profile.li_about_summary) {
    lines.push('')
    lines.push('## ABOUT')
    lines.push(profile.li_about_summary)
  }
  if (profile.li_experience_summary) {
    lines.push('')
    lines.push('## ERFAHRUNG')
    lines.push(profile.li_experience_summary)
  }
  return lines.join('\n')
}

// ═══════════════════════════════════════════════════════════════
// Leadesk Extension — Bridge Content Script
// Laeuft nur auf *.leadesk.de Pages.
// Faengt window.postMessage von der Web-App ab und delegiert an
// background.js. Damit braucht das Frontend keine Extension-ID
// (chrome.runtime.sendMessage aus Webpage-Context wuerde sonst eine
// Extension-ID erwarten, die nirgendwo gehardcoded werden soll).
// Plus: setzt einen DOM-Sentinel, damit die Web-App detecten kann
// dass die Extension installiert ist.
// ═══════════════════════════════════════════════════════════════

;(function() {
  if (typeof window === 'undefined') return
  if (window.__leadeskExtensionBridge) return
  window.__leadeskExtensionBridge = true

  // DOM-Sentinel — Frontend nutzt document.getElementById('leadesk-extension-ready')
  // um zu erkennen ob die Extension aktiv ist (incl. Version).
  function installSentinel() {
    try {
      var existing = document.getElementById('leadesk-extension-ready')
      if (existing) return
      var marker = document.createElement('div')
      marker.id = 'leadesk-extension-ready'
      marker.style.display = 'none'
      marker.setAttribute('data-version', (chrome.runtime.getManifest && chrome.runtime.getManifest().version) || '?')
      ;(document.documentElement || document.body || document).appendChild(marker)
    } catch(e) { /* noop */ }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installSentinel, { once: true })
  } else {
    installSentinel()
  }

  // ── postMessage-Bridge ─────────────────────────────────────────
  window.addEventListener('message', function(event) {
    // Nur Messages aus dem eigenen Frame akzeptieren
    if (event.source !== window) return
    var data = event.data
    if (!data || typeof data !== 'object') return
    if (data.source !== 'leadesk-web') return
    var requestId = data.requestId
    if (!requestId) return

    function reply(payload) {
      window.postMessage({ source: 'leadesk-ext', requestId: requestId, payload: payload }, window.location.origin)
    }

    if (data.action === 'ping') {
      reply({ ok: true, version: (chrome.runtime.getManifest && chrome.runtime.getManifest().version) || '?' })
      return
    }

    if (data.action === 'scrape_linkedin_profile') {
      try {
        chrome.runtime.sendMessage({
          type: 'BRIDGE_SCRAPE_LINKEDIN',
          url: data.url
        }, function(resp) {
          if (chrome.runtime.lastError) {
            reply({ error: 'Verbindung zur Extension fehlgeschlagen: ' + chrome.runtime.lastError.message })
            return
          }
          reply(resp || { error: 'Keine Antwort von der Extension' })
        })
      } catch(e) {
        reply({ error: 'Bridge-Fehler: ' + e.message })
      }
      return
    }

    reply({ error: 'Unbekannte Aktion: ' + data.action })
  }, false)
})()

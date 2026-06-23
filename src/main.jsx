import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import './i18n'
import { initSentry, Sentry } from './lib/sentry'

initSentry()

// Stale-Deploy-Schutz: Nach einem neuen Deploy ändern sich die gehashten Chunk-
// Dateinamen. Ein offener Tab kann dann einen alten (gelöschten) Lazy-Chunk
// anfordern → "Failed to fetch dynamically imported module". Vite feuert dafür
// `vite:preloadError`. Wir laden die Seite dann GENAU EINMAL neu (zeitgeschützt
// gegen Endlosschleifen), damit die frische Manifest-/Chunk-Version geholt wird.
function reloadOnceForStaleChunk(tag) {
  try {
    const KEY = 'leadesk_chunk_reload_at'
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (Date.now() - last > 20000) {        // höchstens 1×/20s → keine Loops
      sessionStorage.setItem(KEY, String(Date.now()))
      window.location.reload()
    }
  } catch (_e) { /* sessionStorage evtl. blockiert → ignorieren */ }
}
window.addEventListener('vite:preloadError', (e) => { try { e.preventDefault() } catch (_x) {} reloadOnceForStaleChunk('preload') })
// Fallback: manche Browser melden es als unhandledrejection mit passender Message.
window.addEventListener('unhandledrejection', (e) => {
  const msg = String(e?.reason?.message || e?.reason || '')
  if (/dynamically imported module|Importing a module script failed|Failed to fetch dynamically/i.test(msg)) {
    reloadOnceForStaleChunk('rejection')
  }
})

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(
  <Sentry.ErrorBoundary fallback={({ resetError }) => (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <h2>Da ist etwas schiefgelaufen.</h2>
      <button onClick={resetError} style={{ marginTop: 12 }}>Neu laden</button>
    </div>
  )}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </Sentry.ErrorBoundary>
)
// rebuild Tue Apr 14 17:58:52 UTC 2026

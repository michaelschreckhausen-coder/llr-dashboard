import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import './i18n'
import { initSentry, Sentry } from './lib/sentry'

initSentry()

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

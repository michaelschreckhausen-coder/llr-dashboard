// content-sales.js — Sales-Navigator-Content-Script
// Phase 1: Foundation. Erkennt die Sales-Nav-Page-Variante und meldet sie via postMessage
// an das Sidepanel. Scrape-Logik kommt in Phase 2 (Single) + Phase 3 (Saved-Search).

(function () {
  'use strict'

  function detectPageType() {
    var path = window.location.pathname
    if (path.indexOf('/sales/lead/') === 0) return 'sales_lead'
    if (path.indexOf('/sales/search/people') === 0) return 'sales_saved_search'
    if (path.indexOf('/sales/lists/') === 0) return 'sales_list'
    return 'sales_other'
  }

  function extractSourceId() {
    var path = window.location.pathname
    var search = window.location.search
    var leadMatch = path.match(/\/sales\/lead\/([^/?]+)/)
    if (leadMatch) return leadMatch[1]
    var searchParams = new URLSearchParams(search)
    return searchParams.get('savedSearchId') || searchParams.get('listId') || null
  }

  // Beim Mount + bei SPA-Navigation (history.pushState) Info ans Sidepanel posten
  function announceContext() {
    var ctx = {
      pageType: detectPageType(),
      sourceId: extractSourceId(),
      url: window.location.href,
    }
    window.postMessage({
      source: 'leadesk-content-sales',
      action: 'context',
      payload: ctx,
    }, window.location.origin)
  }

  announceContext()

  // SPA-Nav abfangen (Sales-Nav nutzt history-API)
  var origPushState = history.pushState
  history.pushState = function () {
    origPushState.apply(this, arguments)
    setTimeout(announceContext, 200)
  }
  window.addEventListener('popstate', function () {
    setTimeout(announceContext, 200)
  })

  // Sidepanel kann uns scrape-Requests via window.postMessage schicken — wir lauschen
  window.addEventListener('message', function (event) {
    if (event.source !== window) return
    var d = event.data
    if (!d || d.source !== 'leadesk-sidepanel-sales') return
    // Phase 2+3 verkabeln hier scrape_single / scrape_search
    // Stub: nur ack zurück
    window.postMessage({
      source: 'leadesk-content-sales',
      requestId: d.requestId,
      action: 'ack',
      payload: { received: d.action },
    }, window.location.origin)
  })
})()

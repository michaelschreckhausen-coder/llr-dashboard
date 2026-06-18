// content-sales.js — Sales-Navigator-Content-Script
// Phase 1: Foundation (Context-Detection + Announce).
// Phase 2: Single-Lead-Scraper — Gerüst steht, SELEKTOR-STRINGS sind TODO bis
//          der DOM-Dump (~/Downloads/sales-lead-dump-{1,2}.html) ausgewertet ist.
//          Die Struktur (Helper + FIELD_MAP + scrapeLead) ist final; einzusetzen
//          bleiben nur die markierten /* C: */-Selektoren in FIELD_MAP / EXTRA_MAP.
// Phase 3: Saved-Search-Bulk verkabelt hier später scrape_search.

(function () {
  'use strict'

  // ── Page-Detection ────────────────────────────────────────────────
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
    var leadMatch = path.match(/\/sales\/lead\/([^/?,]+)/)
    if (leadMatch) return leadMatch[1]
    var searchParams = new URLSearchParams(search)
    return searchParams.get('savedSearchId') || searchParams.get('listId') || null
  }

  // ── Generische DOM-Helper (attribut-/text-basiert, klassen-agnostisch) ──
  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms) })
  }

  function txt(el) {
    if (!el) return ''
    return (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ')
  }

  function root() {
    return document.querySelector('main') || document.body
  }

  // Erstes Element das auf einen der Selektoren matched (null-safe, try/catch je Selektor)
  function firstEl(selectors, scope) {
    var s = scope || root()
    for (var i = 0; i < selectors.length; i++) {
      if (!selectors[i]) continue
      try {
        var el = s.querySelector(selectors[i])
        if (el) return el
      } catch (e) { /* ungültiger Selektor → skip */ }
    }
    return null
  }

  // Sales-Nav-PII-Markup: [data-anonymize="<attr>"] — stabiler als Hash-Klassen
  function bySnAttr(attr, scope) {
    return firstEl(['[data-anonymize="' + attr + '"]'], scope)
  }

  // Section über ihren Heading-Text finden (DE+EN, Substring-Match, lowercase)
  function byHeading(texts, scope) {
    var s = scope || root()
    var headings = Array.prototype.slice.call(s.querySelectorAll('h1, h2, h3, header, [role="heading"]'))
    var lc = texts.map(function (t) { return t.toLowerCase() })
    for (var i = 0; i < headings.length; i++) {
      var ht = txt(headings[i]).toLowerCase()
      if (!ht) continue
      for (var j = 0; j < lc.length; j++) {
        if (ht.indexOf(lc[j]) !== -1) {
          return headings[i].closest('section') || headings[i].parentElement || headings[i]
        }
      }
    }
    return null
  }

  // Lazy-Load-Sentinel: scrollt bis scrollHeight zweimal in Folge stabil ist.
  // Sales-Nav lädt Highlights/Account-Insights/Activity erst beim Scroll nach.
  async function lazyLoadSalesNav(maxScrolls, settleMs) {
    maxScrolls = maxScrolls || 20
    settleMs = settleMs || 400
    var lastH = 0
    var stable = 0
    for (var i = 0; i < maxScrolls; i++) {
      window.scrollTo(0, document.body.scrollHeight)
      await sleep(settleMs)
      var h = document.body.scrollHeight
      if (h === lastH) {
        stable++
        if (stable >= 2) break
      } else {
        stable = 0
      }
      lastH = h
    }
    window.scrollTo(0, 0)
    await sleep(150)
  }

  // ── Parser ────────────────────────────────────────────────────────
  function parseText(el) { return txt(el) || null }
  function parseAttr(el, a) {
    if (!el) return null
    var v = el.getAttribute(a)
    return v || null
  }
  // "12 Jahre 3 Monate" / "12 yrs 3 mos" → roher Text (Normalisierung später)
  function parseTenure(el) {
    var t = txt(el)
    var m = t.match(/(\d+\s*(?:Jahre?|yrs?|years?))(?:\s*(\d+\s*(?:Monate?|mos?|months?)))?/i)
    return m ? m[0].trim() : (t || null)
  }

  // ── Section-Anker (verifiziert gegen 2 DOM-Dumps, 2026-06-18) ───────
  // Sales-Nav markiert jede Section mit data-sn-view-name — stabiler als
  // Hash-Klassen UND als byHeading (locale-agnostisch). Wir scopen jedes
  // PII-Feld auf seine Section, damit person-name etc. aus "Recommended
  // Leads"/"Shared in common" nicht fälschlich gematcht werden.
  var SEC_TOPCARD = '[data-sn-view-name="feature-lead-top-card"] '
  var SEC_ROLE    = '[data-sn-view-name="lead-current-role"] '
  var SEC_ABOUT   = '[data-sn-view-name="feature-about-lead"] '

  // ── FIELD_MAP — Kern-Profil-Felder ─────────────────────────────────
  // selectors: [primary, fallback1, ...]  → erstes Match gewinnt.
  var FIELD_MAP = [
    { field: 'name',       attr: null,  parser: parseText,
      selectors: [SEC_TOPCARD + 'h1[data-anonymize="person-name"]', SEC_TOPCARD + '[data-anonymize="person-name"]'] },
    { field: 'headline',   attr: null,  parser: parseText,
      selectors: [SEC_TOPCARD + '[data-anonymize="headline"]'] },
    { field: 'job_title',  attr: null,  parser: parseText,
      // Current-Role ist detaillierter als die Top-Card-Headline → primär
      selectors: [SEC_ROLE + '[data-anonymize="job-title"]', SEC_TOPCARD + '[data-anonymize="headline"]'] },
    { field: 'company',    attr: null,  parser: parseText,
      selectors: [SEC_ROLE + '[data-anonymize="company-name"]'] },
    { field: 'avatar_url', attr: 'src', parser: parseAttr,
      selectors: [SEC_TOPCARD + 'img[data-anonymize="headshot-photo"]'] },
    { field: 'about',      attr: null,  parser: parseText,
      selectors: [SEC_ABOUT + '[data-anonymize="person-blurb"]'] },
    // NICHT im Detail-DOM (beide Dumps, 2026-06-18): location, öffentl. /in/-URL,
    // Email → bleiben null. Dedup läuft daher über sales_nav_id, nicht linkedin_url.
  ]

  // ── EXTRA_MAP — Sales-Nav-exklusive Felder ──────────────────────────
  // resolver: () => Element|null  (Section-Anker; parser zieht Text raus)
  var EXTRA_MAP = [
    { field: 'tenure',             parser: parseTenure,
      // "Sept. 2016–Heute  9 Jahre 10 Monate" steht in der Current-Role-Section
      resolve: function () { return firstEl(['[data-sn-view-name="lead-current-role"]']) } },
    { field: 'account_insights',   parser: parseText,
      // Account-IQ-KI-Zusammenfassung — BUCKET-SPEZIFISCH (nur wenn vorhanden)
      resolve: function () { return firstEl(['[data-sn-view-name="feature-account-iq-insight"]']) } },
    { field: 'reasons_to_reach_out', parser: parseText,
      // "Beziehung"/Gesprächsanlässe-Section
      resolve: function () { return firstEl(['[data-sn-view-name="feature-lead-relationship"]']) } },
    { field: 'recent_posts',       parser: parseText,
      resolve: function () { return firstEl(['[aria-labelledby="recent-activity-v2--heading"]', '[data-sn-view-name="feature-lead-relationship"]']) } },
    { field: 'shared_in_common',   parser: parseText,
      resolve: function () { return firstEl(['[data-sn-view-name="shared-in-common"]']) } },
    { field: 'persona_match',      parser: parseText,
      // selten — nur wenn Persona konfiguriert; oft null
      resolve: function () { return byHeading(['Persona', 'Persona-Übereinstimmung']) } },
    // seniority + department: NICHT im Detail-DOM — nur als Spalten in der
    // Listen-/Such-Sicht (Phase 3). Im Single-Lead bleiben sie null.
    { field: 'seniority',          parser: parseText, resolve: function () { return null } },
    { field: 'department',         parser: parseText, resolve: function () { return null } },
  ]

  // ── Ableitungen aus rohen Feldern ───────────────────────────────────
  function splitName(name) {
    var parts = (name || '').trim().split(/\s+/)
    return { first: parts[0] || '', last: parts.slice(1).join(' ') || '' }
  }
  function companyFromHeadline(headline) {
    if (!headline) return null
    if (headline.indexOf(' bei ') !== -1) return headline.split(' bei ').pop().trim()
    if (headline.indexOf(' at ') !== -1) return headline.split(' at ').pop().trim()
    return null
  }
  // Degree aus dem Top-Card-Sublabel ("(He/Him) · 2.") → 1/2/3 oder null
  function detectDegree() {
    var sub = firstEl([SEC_TOPCARD + '[class*="name-sublabel"]'])
    var t = txt(sub)
    var m = t.match(/(?:^|[^\d])([123])(?:\.|st|nd|rd|°|\s|$)/)
    return m ? m[1] : null
  }
  function degreeToStatus(d) {
    return d === '1' ? 'verbunden' : d === '2' ? 'pending' : 'nicht_verbunden'
  }
  function degreeToScore(d) {
    return d === '1' ? 60 : d === '2' ? 40 : 20
  }

  // ── Haupt-Scraper ───────────────────────────────────────────────────
  // Returnt { profile, sourceId, profileUrl, sales_nav_extra } — analog /in/-Scraper.
  async function scrapeLead() {
    await lazyLoadSalesNav(20, 400)
    var scope = root()

    // Kern-Felder via FIELD_MAP
    var raw = {}
    for (var i = 0; i < FIELD_MAP.length; i++) {
      var f = FIELD_MAP[i]
      var el = firstEl(f.selectors, scope)
      raw[f.field] = f.attr ? f.parser(el, f.attr) : f.parser(el)
    }

    var name = raw.name || null
    var nm = splitName(name)
    var headline = raw.headline || null
    var jobTitle = raw.job_title || null
    var company = raw.company || companyFromHeadline(headline)
    var degree = detectDegree()
    var profileUrl = null // öffentlicher /in/-Link ist im Sales-Nav-Detail-DOM nicht vorhanden

    var sourceId = extractSourceId()

    // Sales-Nav-exklusive Felder via EXTRA_MAP
    var extra = {}
    for (var k = 0; k < EXTRA_MAP.length; k++) {
      var e = EXTRA_MAP[k]
      var node = null
      try { node = e.resolve(scope) } catch (err) { node = null }
      extra[e.field] = node ? e.parser(node) : null
    }

    var profile = {
      first_name: nm.first,
      last_name: nm.last,
      name: name || (nm.first + ' ' + nm.last).trim() || 'Unbekannt',
      job_title: jobTitle || null,
      company: company || null,
      headline: headline,
      avatar_url: raw.avatar_url || null,
      profile_url: profileUrl,
      linkedin_url: profileUrl,
      li_about_summary: raw.about || null,
      city: null,
      country: null,
      li_connection_status: degreeToStatus(degree),
      source: 'sales_nav',
      status: 'Lead',
      hs_score: degreeToScore(degree),
    }

    return { profile: profile, sourceId: sourceId, profileUrl: profileUrl, sales_nav_extra: extra }
  }

  // ── Saved-Search-Bulk-Scraper (Phase 3) ─────────────────────────────
  // Die /sales/search/people-Liste enthält Name/Titel/Firma/sales_nav_id
  // (aus dem Lead-Link) bereits OHNE Profilbesuch → kein Throttle nötig.
  // Profil-Enrichment mit 12s-Throttle ist Phase 4.
  // Verifiziert gegen 2 Saved-Search-DOM-Dumps (2026-06-18, je 6/6 Leads sauber):
  var SEC_SEARCH_RESULTS = '[data-sn-view-name="module-lead-search-results"]'
  var SEL_RESULT_CARD    = 'li.artdeco-list__item'

  function leadIdFromHref(href) {
    if (!href) return null
    var m = href.match(/\/sales\/lead\/([^/?,]+)/)
    return m ? m[1] : null
  }

  // 429-/Block-Heuristiken (kein DOM-Snippet der Limit-Seite nötig):
  // 1) URL-Redirect auf /checkpoint/ oder /authwall
  // 2) Heading/Body-Text-Match "Sicherheitsüberprüfung"/"Security verification"/…
  // (3) Empty-Result-trotz-DOM prüft der Worker selbst: count===0 wo >0 erwartet)
  function detectRateLimit() {
    var url = window.location.href
    if (/\/checkpoint\//i.test(url) || /\/authwall/i.test(url)) return 'redirect'
    var bodyText = (document.body && document.body.innerText ? document.body.innerText : '').slice(0, 3000)
    if (/Sicherheitsüberprüfung|Security verification|Please verify|commercial use limit|Nutzungslimit/i.test(bodyText)) return 'verification'
    return null
  }

  // Warten bis Result-Cards präsent UND count-stabil (Sales-Nav rendert
  // progressiv) — verhindert Scrape mitten im Lazy-Load. Returnt true wenn settled.
  async function pollSearchCardsReady(maxMs) {
    maxMs = maxMs || 45000 // LinkedIn-Worst-Case-Ladezeit; short-circuit sobald count-stabil
    var start = Date.now()
    while (Date.now() - start < maxMs) {
      var n = document.querySelectorAll(SEL_RESULT_CARD).length
      if (n > 0) {
        await sleep(2000) // Settle-Grace: 2s, dann Count-Stabilität prüfen
        if (document.querySelectorAll(SEL_RESULT_CARD).length === n && n > 0) return true
      } else {
        await sleep(300)
      }
    }
    return false
  }

  // Aggressives Lazy-Loading: bis ans Seitenende scrollen, bis die Card-Anzahl
  // stabil bleibt (Sales-Nav lädt initial nur ~6, Rest beim Scroll). Danach
  // zurück nach oben (Rendering-Reset). Stabil = 2× gleiche Anzahl in Folge.
  // Sales-Nav scrollt einen INNEREN Container, nicht das Window → window.scrollTo
  // allein triggert kein Lazy-Load. Echten scrollbaren Container der Result-Liste
  // finden (scrollbarer Ancestor mit overflowY auto/scroll).
  function findScrollContainer() {
    var list = document.querySelector('[data-search-results-container]') ||
               document.querySelector('ul.artdeco-list') ||
               firstEl([SEC_SEARCH_RESULTS])
    var p = list
    while (p && p !== document.body && p !== document.documentElement) {
      var oy = ''
      try { oy = window.getComputedStyle(p).overflowY } catch (e) {}
      if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 20) return p
      p = p.parentElement
    }
    return document.scrollingElement || document.documentElement
  }

  // Vordergrund-Tab (active:true) + echtes händisches Scrollen: scrollBy + wheel-
  // Event alle 1.8s, bis 25 Cards geladen ODER kein Wachstum mehr (letzte Seite
  // <25). In einem fokussierten Tab lazy-loadet Sales-Nav zuverlässig.
  async function aggressiveScroll() {
    var container = findScrollContainer()
    var TARGET = 25, lastCount = -1, noGrowth = 0
    for (var i = 0; i < 30; i++) {
      var count = document.querySelectorAll(SEL_RESULT_CARD).length
      if (count >= TARGET) break
      if (count === lastCount) { noGrowth++; if (noGrowth >= 3 && count > 0) break } // letzte Seite hat <25
      else { noGrowth = 0; lastCount = count }
      window.scrollBy(0, 600)
      try { document.dispatchEvent(new WheelEvent('wheel', { deltaY: 600, bubbles: true })) } catch (e) {}
      try { container.scrollTop = container.scrollHeight } catch (e) {}
      await sleep(1800)
    }
    window.scrollTo(0, 0)
    try { container.scrollTop = 0 } catch (e) {}
    await sleep(600)
  }

  // Eine Card-Sammlung aus dem aktuellen DOM ziehen (synchron).
  function collectSearchCards(maxResults) {
    var scope = firstEl([SEC_SEARCH_RESULTS]) || root()
    var cards = scope.querySelectorAll(SEL_RESULT_CARD)
    var out = []
    var seen = {}
    for (var i = 0; i < cards.length && out.length < maxResults; i++) {
      var card = cards[i]
      var link = firstEl(['a[href*="/sales/lead/"]'], card)
      var sid = leadIdFromHref(link && link.getAttribute('href'))
      if (!sid || seen[sid]) continue
      seen[sid] = true
      var name = txt(firstEl(['[data-anonymize="person-name"]'], card))
      var nm = splitName(name)
      out.push({
        sales_nav_id: sid,
        name: name || 'Unbekannt',
        first_name: nm.first,
        last_name: nm.last,
        job_title: txt(firstEl(['[data-anonymize="job-title"]', '[data-anonymize="title"]', '[data-anonymize="headline"]'], card)) || null,
        company: txt(firstEl(['[data-anonymize="company-name"]'], card)) || null,
        source: 'sales_nav',
        status: 'Lead',
      })
    }
    return out
  }

  async function scrapeSavedSearch(maxResults) {
    maxResults = maxResults || 100
    var rateLimited = detectRateLimit()
    if (rateLimited) return { results: [], count: 0, rateLimited: rateLimited, pageUrl: window.location.href, savedSearchId: extractSourceId() }
    await pollSearchCardsReady(45000) // Cards präsent + count-stabil abwarten (≤45s)
    await aggressiveScroll()          // Bug A: bis Card-Count stabil scrollen (~6→25)
    var out = collectSearchCards(maxResults)
    if (out.length === 0) {           // Retry-on-empty: langsamer Lazy-Load → 5s + 1 Retry
      await sleep(5000)
      await aggressiveScroll()
      out = collectSearchCards(maxResults)
    }
    return { results: out, count: out.length, rateLimited: null, pageUrl: window.location.href, savedSearchId: extractSourceId() }
  }

  // ── Worker-Overlay (Full-Screen, analog content.js-Profil-Scraper) ──
  function showSearchOverlay() {
    if (document.getElementById('leadesk-sales-overlay')) return
    var pageM = (window.location.hash.match(/p=(\d+)/) || [])[1]
    var pageTxt = pageM ? ' · Seite ' + pageM : ''
    var o = document.createElement('div')
    o.id = 'leadesk-sales-overlay'
    o.style.cssText = 'position:fixed;inset:0;background:rgba(255,255,255,0.97);z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#14142b'
    o.innerHTML = '<div style="text-align:center;padding:40px;max-width:480px">' +
      '<div style="width:48px;height:48px;border:4px solid rgba(0,0,0,0.06);border-top:4px solid rgb(49,90,231);border-radius:50%;animation:lsk-spin 1s linear infinite;margin:0 auto 22px"></div>' +
      '<h2 style="font-size:20px;font-weight:500;margin:0 0 10px">Leadesk extrahiert Suchergebnisse…' + pageTxt + '</h2>' +
      '<p style="font-size:13px;color:#555;margin:0;line-height:1.6">Bitte diesen Tab nicht schließen oder weg-navigieren.<br>Du kannst andere Tabs/Apps nutzen — dieser Tab gehört dem Import.</p>' +
      '</div><style>@keyframes lsk-spin{to{transform:rotate(360deg)}}</style>'
    ;(document.documentElement || document.body).appendChild(o)
  }
  function hideSearchOverlay() {
    var el = document.getElementById('leadesk-sales-overlay')
    if (el && el.parentNode) el.parentNode.removeChild(el)
  }

  // Push-basierter Worker-Scrape: autonom scrollen + scrapen + Ergebnis ans
  // Sidepanel PUSHEN (statt auf SCRAPE_SALES_SEARCH-Request zu warten).
  // Eliminiert den MV3-sendMessage-Race — content-sales meldet sich erst wenn
  // es lebt UND der Lazy-Scroll settled ist.
  async function runWorkerScrape() {
    showSearchOverlay()
    var out = []
    var rl = detectRateLimit()
    try {
      if (!rl) {
        await pollSearchCardsReady(45000)
        await aggressiveScroll()
        out = collectSearchCards(100)
        if (out.length === 0) { await sleep(5000); await aggressiveScroll(); out = collectSearchCards(100) }
      }
    } catch (e) { /* push trotzdem, Worker entscheidet */ }
    hideSearchOverlay()
    chrome.runtime.sendMessage({
      source: 'leadesk-content-sales', type: 'SALES_SCRAPE_DONE',
      results: out, count: out.length, rateLimited: rl,
      savedSearchId: extractSourceId(), url: window.location.href,
    })
  }

  // ── Phase-1-Context-Announce (vestigial: postMessage geht an die Page,
  //    nicht ans Sidepanel — das Sidepanel liest Context via chrome.tabs.query.
  //    Bleibt drin als Page-World-Hook für künftiges Bridging.) ──────────
  function announceContext() {
    window.postMessage({
      source: 'leadesk-content-sales',
      action: 'context',
      payload: { pageType: detectPageType(), sourceId: extractSourceId(), url: window.location.href },
    }, window.location.origin)
  }
  announceContext()

  // Worker-Modus: trägt die URL den #leadesk-worker-Marker, ist dies der vom
  // Cross-Page-Worker gesteuerte Tab (NICHT der aktive User-Tab) → autonom
  // scrapen + Ergebnis pushen. Hash früh gelesen, bevor die SPA ihn evtl. strippt.
  if (window.location.hash.indexOf('leadesk-worker') >= 0 && detectPageType() === 'sales_saved_search') {
    runWorkerScrape()
  }

  // SPA-Nav abfangen (Sales-Nav nutzt history-API)
  var origPushState = history.pushState
  history.pushState = function () {
    origPushState.apply(this, arguments)
    setTimeout(announceContext, 200)
  }
  window.addEventListener('popstate', function () { setTimeout(announceContext, 200) })

  // ── Scrape-Requests vom Sidepanel (chrome.runtime, analog content.js) ──
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg) return
    if (msg.type === 'SCRAPE_SALES_LEAD') {
      scrapeLead()
        .then(function (data) { sendResponse({ ok: true, data: data }) })
        .catch(function (err) { sendResponse({ ok: false, error: (err && err.message) || 'scrape_failed' }) })
      return true // async sendResponse
    }
    if (msg.type === 'SALES_CONTEXT') {
      sendResponse({ ok: true, pageType: detectPageType(), sourceId: extractSourceId(), url: window.location.href })
      return false
    }
    if (msg.type === 'SALES_READY') {
      // Readiness-Poll für den Cross-Page-Worker: Result-Cards present? + 429-Check
      sendResponse({
        ok: true,
        ready: document.querySelectorAll(SEL_RESULT_CARD).length > 0,
        rateLimited: detectRateLimit(),
      })
      return false
    }
    if (msg.type === 'SCRAPE_SALES_SEARCH') {
      scrapeSavedSearch(msg.maxResults)
        .then(function (data) { sendResponse({ ok: true, data: data }) })
        .catch(function (err) { sendResponse({ ok: false, error: (err && err.message) || 'scrape_failed' }) })
      return true // async sendResponse
    }
  })
})()

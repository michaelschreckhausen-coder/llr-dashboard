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
    // Phase 3: msg.type === 'SCRAPE_SALES_SEARCH' verkabelt hier den Bulk-Scraper
  })
})()

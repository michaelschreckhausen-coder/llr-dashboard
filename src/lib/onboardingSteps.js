// ─────────────────────────────────────────────────────────────────────────────
// Onboarding-Daten: First-Run-Tour (anchored Coachmarks) + Just-in-time-Tipps.
//
// Texte bewusst hier hartcodiert (Deutsch), nicht über i18n — Onboarding-Copy
// ändert sich häufig und braucht keinen Key-Roundtrip. Whitelabel-neutral:
// "Leadesk" nur im Willkommens-Step, sonst generisch.
//
// TOUR_STEPS hängen an Sidebar-Ankern (data-tour-id). Wir zeigen auf die
// Section-HEADER, nicht auf einzelne Sub-Items — die Header sind immer sichtbar,
// die Accordions können zu sein. anchor: null = zentriertes Modal.
//
// AREA_TIPS sind routenbasiert: beim ersten Betreten der Route taucht eine
// dezente Karte auf (sofern nicht schon dismissed). matchPrefix erlaubt Detail-
// Routen (z.B. /leads/123 matcht /leads).
// ─────────────────────────────────────────────────────────────────────────────

export const TOUR_STEPS = [
  {
    id: 'welcome',
    anchor: null,
    title: 'Willkommen 👋',
    body: 'Leadesk bringt deinen kompletten LinkedIn-Vertrieb in eine App — vom ersten Kontakt bis zum gewonnenen Deal. Wir zeigen dir in 60 Sekunden, wo was liegt.',
  },
  {
    id: 'dashboard',
    anchor: 'nav-dashboard',
    title: 'Dein Startpunkt',
    body: 'Auf der Startseite siehst du jeden Morgen, was ansteht. Direkt daneben: der Assistent — dein KI-Chat über alle deine Kontakte, Deals und Aktivitäten.',
  },
  {
    id: 'branding',
    anchor: 'nav-branding',
    title: 'Zuerst: deine Stimme',
    body: 'Hinterlege deine Brand Voice und deine Zielgruppe. Das ist die wichtigste 5-Minuten-Investition — die KI nutzt diese Daten überall: in Nachrichten, Posts und Vorschlägen.',
  },
  {
    id: 'crm',
    anchor: 'nav-sales',
    title: 'Wen sprichst du an?',
    body: 'Hier liegen Kontakte, Unternehmen und Deals. Jeder Kontakt sammelt Status, Notizen und Aktivitäten an einem Ort — und was du gewinnst, fließt automatisch ins Reporting.',
  },
  {
    id: 'linkedin',
    anchor: 'nav-linkedin',
    title: 'Kontakt aufnehmen',
    body: 'Vernetzungsanfragen und Nachrichten-Sequenzen laufen von hier — personalisiert und im sicheren Tagesrhythmus. Voraussetzung ist die Chrome-Extension als Brücke zu LinkedIn.',
  },
  {
    id: 'content',
    anchor: 'nav-content',
    title: 'Sichtbar werden',
    body: 'Erstelle LinkedIn-Posts mit KI in deiner Brand Voice und plane sie im Redaktionsplan vor. Sichtbarkeit kommt von Regelmäßigkeit.',
  },
  {
    id: 'done',
    anchor: null,
    title: 'Jetzt du',
    body: 'Leg deinen ersten Kontakt an — oder hol dir mit der Chrome-Extension Leads direkt aus LinkedIn. Den Rest erklären wir dir genau dann, wenn du ihn brauchst.',
    cta: { label: 'Ersten Kontakt anlegen', to: '/leads' },
  },
]

// Routenbasierte Just-in-time-Tipps. key = stabiler Identifier (auch der Wert,
// der in onboarding_state.tips_dismissed landet). route = matchPrefix.
export const AREA_TIPS = [
  {
    key: '/brand-voice',
    title: 'Brand Voice',
    body: 'Füge ein paar deiner besten Texte ein — ab dann klingt jede generierte Nachricht nach dir.',
  },
  {
    key: '/zielgruppen',
    title: 'Zielgruppen',
    body: 'Definiere, wen du erreichen willst. Die KI personalisiert Ansprache und Content entlang dieser Profile.',
  },
  {
    key: '/leads',
    title: 'Deine Kontakt-Zentrale',
    body: 'Jeder Kontakt sammelt Status, Notizen, Aktivitäten und Deals an einem Ort. Leg deinen ersten an — oder importiere per CSV bzw. Chrome-Extension.',
  },
  {
    key: '/deals',
    title: 'Pipeline',
    body: 'Zieh deine Verkaufschancen durch die Stufen. Was hier landet, fließt automatisch ins Reporting.',
  },
  {
    key: '/vernetzungen',
    title: 'Vernetzung automatisieren',
    body: 'Sende personalisierte Vernetzungsanfragen im sicheren Tagesrhythmus. Die Chrome-Extension führt sie aus.',
  },
  {
    key: '/content-studio',
    title: 'Content-Werkstatt',
    body: 'Vom Stichwort zum fertigen LinkedIn-Beitrag — und passenden Bildern — in Sekunden, in deiner Brand Voice.',
  },
  {
    key: '/reports',
    title: 'Reporting',
    body: 'Sieh, was deine Aktivität bringt: Conversions, Pipeline-Wert und Entwicklung über die Zeit.',
  },
]

// Findet den passenden Area-Tip für eine Route (längster Prefix-Match gewinnt,
// damit /leads-Detail nicht versehentlich einen kürzeren Prefix triggert).
export function tipForRoute(pathname) {
  if (!pathname) return null
  let best = null
  for (const tip of AREA_TIPS) {
    if (pathname === tip.key || pathname.startsWith(tip.key + '/')) {
      if (!best || tip.key.length > best.key.length) best = tip
    }
  }
  return best
}

// ─────────────────────────────────────────────────────────────────────────────
// AREA_TOURS — geführte Pro-Bereich-Touren (mehrseitig, demonstrativ).
// step.event ('leadesk:tour-<event>'): demo-chat / demo-insert / demo-toolbar /
// demo-clear. Anker: navlink:<route> | On-Page-data-tour-id | null=zentriert.
// Strike2 ausgeschlossen. Persistiert in onboarding_state.area_tours_done.
// ─────────────────────────────────────────────────────────────────────────────

export const AREA_TOURS = {
  branding: {
    id: 'branding',
    label: 'Branding',
    navKey: 'nav.branding',
    routes: ['/personal-brand', '/company-brand', '/zielgruppen', '/wissensdatenbank'],
    steps: [
      { id: 'intro', route: '/personal-brand', anchor: null,
        title: 'Branding — dein Fundament',
        body: 'Bevor die KI für dich schreibt, lernt sie, wer du bist und wie du klingst. Diese vier Bausteine fließen in jeden Post, jede Nachricht und jeden Vorschlag ein. Lass sie uns kurz gemeinsam durchgehen.' },
      { id: 'personal-brand', route: '/personal-brand', anchor: 'brand-new-ai',
        title: 'Personal Brand',
        body: 'Deine persönliche Markenstimme. Über diesen Button baut die KI sie in ~2 Minuten aus deiner Website oder deinem LinkedIn-Profil, oder du füllst sie manuell aus. In der Brand legst du Tonalität, Hook-Stil, Call-to-Action und Emoji-Menge fest, und genau daran hält sich danach jeder generierte Text.' },
      { id: 'company-brand', route: '/company-brand', anchor: 'brand-new-ai',
        title: 'Company Brand',
        body: 'Die Stimme deines Unternehmens für die LinkedIn Company Page. Der Clou: Wählst du beim Schreiben eine Personal- UND eine Company Brand zusammen, entsteht der Ambassador-Modus, persönlich formuliert, aber mit den Fakten und Botschaften des Unternehmens.' },
      { id: 'zielgruppen', route: '/zielgruppen', anchor: 'aud-new-ai',
        title: 'Zielgruppen',
        body: 'Wen willst du erreichen? Lege Profile mit Position, Bedürfnissen und Pain Points an, auch hier hilft die KI-Befüllung aus einer URL. Beim Schreiben wählst du dann eine Zielgruppe aus, und die KI richtet Ansprache und Inhalt gezielt darauf aus.' },
      { id: 'wissensdatenbank', route: '/wissensdatenbank', anchor: 'kb-add',
        title: 'Wissensdatenbank',
        body: 'Dein Faktenspeicher: Dokumente, URLs und LinkedIn-Profile. Was du hier hinterlegst, zieht die KI automatisch heran, damit deine Texte konkret und korrekt werden statt allgemein. Je mehr gutes Material, desto besser die Ergebnisse.' },
      { id: 'done', route: '/personal-brand', anchor: null,
        title: 'Leg los',
        body: 'Starte mit deiner Personal Brand, das ist die wichtigste 5-Minuten-Investition. Diese Tour kannst du jederzeit über das Fragezeichen oben rechts erneut starten.',
        cta: { label: 'Zur Personal Brand', to: '/personal-brand' } },
    ],
  },
  content: {
    id: 'content',
    label: 'Content',
    navKey: 'nav.content',
    routes: ['/content-studio', '/redaktionsplan', '/dokumente', '/visuals', '/media'],
    steps: [
      { id: 'intro', route: '/content-studio', anchor: null,
        title: 'Content — von der Idee zum fertigen Post',
        body: 'Hier entsteht dein LinkedIn-Content, von der ersten Idee bis zum geplanten Beitrag, alles in deiner Brand Voice. Ich mach dir das an einem kleinen Beispiel vor.' },
      { id: 'tw-overview', route: '/content-studio', anchor: 'navlink:/content-studio',
        title: 'Content-Werkstatt',
        body: 'Das Herzstück des Content-Bereichs. Statt einen langen Prompt zu tippen, entwickelst du deinen Beitrag im Dialog mit der KI, im Chat. Im selben Chat erstellst und bearbeitest du auch Bilder. Schauen wir uns an, wie das abläuft.' },
      { id: 'brand-switch', route: '/content-studio', anchor: 'bv-switcher',
        title: 'Deine aktive Brand',
        body: 'Oben wählst du, mit welcher Brand du gerade arbeitest, und wechselst zwischen deinen Personal- und Company Brands. Wichtig: Jede Brand hat ihren eigenen Content-Bereich (eigene Chats, Dokumente und Beiträge) und ihr eigenes Memory. Die KI lernt pro Brand getrennt aus deinen Texten und vermischt nichts.' },
      { id: 'composer', route: '/content-studio', anchor: 'cs-composer',
        title: 'Hier startest du',
        body: 'Schreib einfach, worüber du posten willst, ein Stichwort genügt. Darunter wählst du den Kontext für die Generierung. Enter sendet, Shift+Enter macht einen Absatz. Wir gehen die Kontext-Felder kurz durch.' },
      { id: 'zielgruppe', route: '/content-studio', anchor: 'cs-audience-select',
        title: 'Zielgruppe wählen',
        body: 'Hier wählst du, für welche deiner Zielgruppen der Beitrag gedacht ist. Die KI richtet Ansprache, Beispiele und Tonfall gezielt auf dieses Profil aus, statt allgemein an alle zu schreiben.' },
      { id: 'ambassador', route: '/content-studio', anchor: 'cs-company-select',
        title: 'Im Namen eines Unternehmens schreiben',
        body: 'Als Personal Brand kannst du hier zusätzlich eine (oder mehrere) Company Brand auswählen. Dann schreibt die KI weiter in deiner Persönlichkeit und Stimme, aber mit den Botschaften und Fakten des Unternehmens, das ist der Ambassador-Modus.' },
      { id: 'websuche', route: '/content-studio', anchor: 'cs-websearch',
        title: 'Web-Suche',
        body: 'Schaltest du die Web-Suche ein, recherchiert die KI vor dem Schreiben aktuelle Fakten, Zahlen und Quellen im Web und baut sie in den Beitrag ein. Ideal für tagesaktuelle Themen oder belegte Statistiken.' },
      { id: 'example', route: '/content-studio', anchor: 'cs-post-card', event: 'demo-chat',
        title: 'Dein fertiger Beitrag',
        body: 'Die KI antwortet mit einer Nachricht, in der ein fertiger Beitrag in deiner Brand Voice steckt, hier als hervorgehobener Block (Beispiel). Darunter hast du zwei Wege, ihn weiterzuverwenden.' },
      { id: 'attach-post', route: '/content-studio', anchor: 'cs-attach-post', event: 'demo-chat',
        title: 'Direkt als Beitrag sichern',
        body: 'Mit diesem Button bringst du den Text direkt in den Redaktionsplan. Über das Menü legst du entweder einen neuen Beitrag an oder fügst den Text einem deiner bestehenden Beiträge hinzu, ohne Umweg über die Dokumente.' },
      { id: 'insert-doc', route: '/content-studio', anchor: 'cs-insert-doc', event: 'demo-chat',
        title: 'Oder: ins Dokument',
        body: 'Willst du ausführlicher schreiben, formatieren und mit den KI-Werkzeugen feilen, holst du den Beitrag stattdessen ins Dokument. Genau das machen wir jetzt.' },
      { id: 'into-doc', route: '/content-studio', anchor: 'cs-doc-pane', event: 'demo-insert',
        title: 'Das Dokument öffnet sich',
        body: 'Sobald du einen Beitrag ins Dokument holst, klappt rechts deine Dokumentansicht auf, mit dem Text drin. Hier schreibst du weiter, formatierst und finalisierst. Jeder Chat merkt sich seine Dokumente: wechselst du später den Chat, ist das passende Dokument wieder da. Über die Tabs am Dokument legst du weitere an.' },
      { id: 'werkzeuge', route: '/content-studio', anchor: 'cs-doc-pane', event: 'demo-toolbar',
        title: 'KI-Werkzeugleiste',
        body: 'Markierst du im Dokument Text, erscheint diese kleine Werkzeugleiste (oben an der Markierung). Damit lässt du Stellen umschreiben (lockerer, prägnanter …), kürzen oder verlängern, übersetzen, Emojis hinzufügen oder entfernen, dazu eigene KI-Befehle. Alles bleibt in deiner Brand Voice.' },
      { id: 'doc-rail', route: '/content-studio', anchor: 'cs-doc-tabs', event: 'demo-rail',
        title: 'Mehrere Dokumente pro Chat',
        body: 'Hat ein Chat mehrere Dokumente, erscheint ganz rechts diese Leiste, hier ein Beispiel mit dreien. Ein Chat kann also beliebig viele Dokumente sammeln, und über das Plus weitere anlegen oder bestehende hinzufügen. Umgekehrt gilt genauso: dasselbe Dokument lässt sich mehreren Chats zuordnen. Auf der Dokumente-Seite siehst du pro Dokument, in wie vielen Chats es liegt.' },
      { id: 'dokumente', route: '/dokumente', anchor: 'navlink:/dokumente', event: 'demo-clear',
        title: 'Dokumente',
        body: 'Alle deine Beiträge als Dokumente an einem Ort. Hier bearbeitest du sie weiter, ordnest sie Chats zu, exportierst sie oder schickst sie direkt in den Redaktionsplan bzw. als Vorlage zu den Visuals.' },
      { id: 'vis-mode', route: '/visuals', anchor: 'vis-mode',
        title: 'Visuals — zwei Modi',
        body: 'Erzeuge passende Bilder mit KI. Zuerst wählst du den Modus: „Bild zu Beitrag / Dokument" erstellt ein Bild passend zu einem konkreten Text, „Freihand" ein Bild ohne Beitragsbezug.' },
      { id: 'vis-template', route: '/visuals', anchor: 'vis-template',
        title: 'Bild-Stil / Vorlage',
        body: 'Hier wählst du den Stil bzw. die Vorlage: realistisches Foto, Statistik, Carousel, Statement, Personal-Brand-Portrait, Before/After und mehr. Die Vorlage gibt Aufbau und Look vor.' },
      { id: 'vis-reference', route: '/visuals', anchor: 'vis-reference',
        title: 'Referenzmedien',
        body: 'Lege fest, woran sich das Bild orientiert: Mit einem Klick nutzt du die hinterlegten Brand-Bilder (z.B. dein Foto, Logos, CI), optional zusätzlich die einer Company Brand, oder du lädst eigene Referenzbilder hoch.' },
      { id: 'vis-settings', route: '/visuals', anchor: 'vis-settings',
        title: 'Format, Anzahl, Modell',
        body: 'Zum Schluss die Ausgabe: Format (z.B. quadratischer Feed-Beitrag oder Hochformat), Anzahl der Varianten und das Bild-Modell. Dann auf „Generieren", fertig.' },
      { id: 'media', route: '/media', anchor: 'navlink:/media',
        title: 'Medien',
        body: 'Dein Brand-Asset-Hub: hochgeladene Bilder, Logos und KI-generierte Visuals sammeln sich hier und sind für jeden Beitrag griffbereit.' },
      { id: 'redaktionsplan', route: '/redaktionsplan', anchor: 'navlink:/redaktionsplan',
        title: 'Redaktionsplan',
        body: 'Dein Planungs-Cockpit. Hier planst und terminierst du alle Beiträge. Oben wechselst du zwischen vier Ansichten: Board (Kanban), Woche, Monat (Kalender) und Liste.' },
      { id: 'rp-brainstorm', route: '/redaktionsplan', anchor: 'rp-brainstorm',
        title: 'Brainstorming',
        body: 'Keine Idee? Über „Brainstormen" schlägt dir die KI Themen vor, passend zu deinem Thema, deiner Zielgruppe und deinem Wissen. Die besten übernimmst du mit einem Klick als Ideen-Karten ins Board, und entwickelst sie von dort in der Content-Werkstatt weiter.' },
      { id: 'rp-board', route: '/redaktionsplan', anchor: 'rp-board',
        title: 'Vom Entwurf zum Post',
        body: 'Deine Beiträge wandern durch die Phasen: Ideen → In Arbeit → Eingeplant → Veröffentlicht. Per Drag-and-Drop ziehst du Karten weiter; was du terminierst, veröffentlicht Leadesk zur geplanten Zeit automatisch auf LinkedIn. Mit „Neuer Beitrag" legst du jederzeit manuell einen an.' },
      { id: 'done', route: '/content-studio', anchor: null, event: 'demo-clear',
        title: 'Leg los',
        body: 'Schreib in der Content-Werkstatt einfach dein erstes Stichwort, der Rest entsteht im Dialog. Diese Tour findest du jederzeit über das Fragezeichen oben rechts.',
        cta: { label: 'Zur Content-Werkstatt', to: '/content-studio' } },
    ],
  },
}

export function areaForRoute(pathname) {
  if (!pathname) return null
  for (const key of Object.keys(AREA_TOURS)) {
    const routes = AREA_TOURS[key].routes
    if (routes.some(r => pathname === r || pathname.startsWith(r + '/'))) return key
  }
  return null
}

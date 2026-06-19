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
    title: 'Text-Werkstatt',
    body: 'Vom Stichwort zum fertigen LinkedIn-Beitrag in Sekunden — in deiner Brand Voice.',
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
// AREA_TOURS — geführte Pro-Bereich-Touren (mehrseitig).
//
// Im Gegensatz zur globalen First-Run-Tour (TOUR_STEPS) führt eine Bereichstour
// den User AKTIV durch die Unterseiten des Bereichs. Jeder Step:
//   route  = Zielseite (die Tour navigiert dorthin, bevor der Coachmark erscheint)
//   anchor = data-tour-id des zugehörigen Sidebar-Eintrags ('navlink:<route>'),
//            der ist immer im DOM und damit ein stabiler Spotlight-Anker.
//            null = zentriertes Modal (Intro/Outro).
//   navKey = i18n-Key des Sektion-Labels — das Layout hält damit die richtige
//            Sidebar-Sektion aufgeklappt, sonst ist der Anker nicht sichtbar.
//
// Persistiert pro Bereich in onboarding_state.area_tours_done = { content:true,… }.
// Fehlt der Key (Bestands-User), gilt der Bereich als "noch nicht gesehen" → die
// Tour triggert einmalig beim nächsten Betreten.
// ─────────────────────────────────────────────────────────────────────────────

export const AREA_TOURS = {
  branding: {
    id: 'branding',
    label: 'Branding',
    navKey: 'nav.branding',
    routes: ['/personal-brand', '/company-brand', '/zielgruppen', '/wissensdatenbank', '/ki-sichtbarkeit'],
    steps: [
      { id: 'intro', route: '/personal-brand', anchor: null,
        title: 'Branding — dein Fundament',
        body: 'Im Branding hinterlegst du, wer du bist und wie du klingst. Diese Angaben nutzt die KI überall: in Posts, Nachrichten und Vorschlägen. Wir gehen die fünf Bausteine kurz durch.' },
      { id: 'personal-brand', route: '/personal-brand', anchor: 'navlink:/personal-brand',
        title: 'Personal Brand',
        body: 'Deine persönliche Markenstimme. Lass sie per KI aus deiner Website oder deinem LinkedIn-Profil erstellen oder fülle sie manuell. Sie steuert Tonalität, Hook-Stil, Call-to-Action und Emoji-Nutzung für jeden generierten Text.' },
      { id: 'company-brand', route: '/company-brand', anchor: 'navlink:/company-brand',
        title: 'Company Brand',
        body: 'Die Stimme deines Unternehmens für die LinkedIn Company Page. Wählst du beim Schreiben eine Personal- plus eine Company Brand, schreibt die KI im Ambassador-Modus: persönlich, aber mit den Fakten des Unternehmens.' },
      { id: 'zielgruppen', route: '/zielgruppen', anchor: 'navlink:/zielgruppen',
        title: 'Zielgruppen',
        body: 'Definiere, wen du erreichen willst: Position, Bedürfnisse, Pain Points. Die KI personalisiert Ansprache und Inhalte entlang dieser Profile. Auch hier hilft die KI-Auto-Befüllung aus einer URL.' },
      { id: 'wissensdatenbank', route: '/wissensdatenbank', anchor: 'navlink:/wissensdatenbank',
        title: 'Wissensdatenbank',
        body: 'Dein Faktenmaterial: Dokumente, URLs und LinkedIn-Profile. Alles, was du hier hinterlegst, fließt automatisch in jede Generierung ein, damit deine Texte konkret und korrekt bleiben.' },
      { id: 'ki-sichtbarkeit', route: '/ki-sichtbarkeit', anchor: 'navlink:/ki-sichtbarkeit',
        title: 'KI-Sichtbarkeit',
        body: 'Sieh, wie gut du in ChatGPT, Claude und Co. gefunden wirst. Lege ein Profil mit deinem Namen und Thema an, dann prüft Leadesk regelmäßig deine Sichtbarkeit in den großen KI-Modellen.' },
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
        title: 'Content — von der Idee zum Post',
        body: 'Hier produzierst du LinkedIn-Inhalte, alles in deiner Brand Voice. Wir zeigen dir kurz die fünf Werkzeuge und wie sie zusammenspielen.' },
      { id: 'content-studio', route: '/content-studio', anchor: 'navlink:/content-studio',
        title: 'Text-Werkstatt',
        body: 'Dein KI-Schreibtisch: Aus einem Stichwort entsteht im Chat ein fertiger LinkedIn-Beitrag in deiner Stimme. Übernimm ihn ins Dokument, formuliere mit Flash-Actions um, und dank Memory lernt Leadesk aus deinen bisherigen Texten.' },
      { id: 'dokumente', route: '/dokumente', anchor: 'navlink:/dokumente',
        title: 'Dokumente',
        body: 'Deine Beiträge als Dokumente: bearbeiten, mehreren Chats zuordnen, exportieren und direkt in den Redaktionsplan oder als Visual-Referenz weitergeben.' },
      { id: 'visuals', route: '/visuals', anchor: 'navlink:/visuals',
        title: 'Visuals',
        body: 'Erzeuge passende Bilder und Grafiken zu deinen Posts mit KI, im Stil deiner Marke.' },
      { id: 'media', route: '/media', anchor: 'navlink:/media',
        title: 'Medien',
        body: 'Dein Brand-Asset-Hub: Logos, Bilder und wiederverwendbare Medien an einem Ort, griffbereit für jeden Beitrag.' },
      { id: 'redaktionsplan', route: '/redaktionsplan', anchor: 'navlink:/redaktionsplan',
        title: 'Redaktionsplan',
        body: 'Plane und terminiere deine Beiträge im Kalender. Reichweite kommt von Regelmäßigkeit, hier behältst du den Überblick über alles Geplante und Veröffentlichte.' },
      { id: 'done', route: '/content-studio', anchor: null,
        title: 'Leg los',
        body: 'Schreib deinen ersten Beitrag in der Text-Werkstatt. Diese Tour kannst du jederzeit über das Fragezeichen oben rechts erneut starten.',
        cta: { label: 'Zur Text-Werkstatt', to: '/content-studio' } },
    ],
  },
}

// Liefert die Bereichs-ID (Key in AREA_TOURS) für eine Route, sonst null.
export function areaForRoute(pathname) {
  if (!pathname) return null
  for (const key of Object.keys(AREA_TOURS)) {
    const routes = AREA_TOURS[key].routes
    if (routes.some(r => pathname === r || pathname.startsWith(r + '/'))) return key
  }
  return null
}

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
// AREA_TOURS — geführte Pro-Bereich-Touren (mehrseitig, ausführlich).
//
// step.route  = Zielseite (Tour navigiert dorthin).
// step.anchor = Spotlight-Ziel. 'navlink:<route>' = Sidebar-Eintrag (immer da);
//               'cs-composer' / 'cs-doc-pane' / 'brand-new-ai' / 'aud-new-ai' /
//               'kb-add' / 'auralis-activate' = ON-PAGE-Elemente (data-tour-id im
//               jeweiligen Page-Code). null = zentriertes Modal (Intro/Outro).
//               Fehlt der Anker (z.B. leere Liste) → Fallback zentriert.
// step.event  = optionales window-Event, das das Layout beim Step-Eintritt feuert,
//               z.B. 'open-editor' → öffnet in der Text-Werkstatt den Splitscreen,
//               damit der Anker sichtbar ist.
// navKey      = i18n-Key der Sidebar-Sektion (Layout hält sie offen).
//
// Persistiert pro Bereich in onboarding_state.area_tours_done. Strike2 ausgeschlossen.
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
        body: 'Bevor die KI für dich schreibt, lernt sie, wer du bist und wie du klingst. Diese fünf Bausteine fließen in jeden Post, jede Nachricht und jeden Vorschlag ein. Lass sie uns kurz gemeinsam durchgehen.' },
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
      { id: 'ki-sichtbarkeit', route: '/ki-sichtbarkeit', anchor: 'auralis-activate',
        title: 'KI-Sichtbarkeit',
        body: 'Immer mehr Menschen recherchieren über ChatGPT, Claude und Co. Hier legst du ein Profil mit deinem Namen und Thema an, und Leadesk prüft regelmäßig, wie gut du in den großen KI-Modellen gefunden wirst.' },
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
        body: 'Hier entsteht dein LinkedIn-Content, von der ersten Idee bis zum geplanten Beitrag, alles in deiner Brand Voice. Ich zeige dir die Werkzeuge und vor allem den Splitscreen, mit dem du schreibst.' },
      { id: 'tw-overview', route: '/content-studio', anchor: 'navlink:/content-studio',
        title: 'Text-Werkstatt',
        body: 'Das Herzstück des Content-Bereichs. Statt einen langen Prompt zu tippen, formulierst du deinen Beitrag im Dialog mit der KI, und zwar im Splitscreen: links der Chat, rechts dein Dokument. Schauen wir uns das Stück für Stück an.' },
      { id: 'composer', route: '/content-studio', anchor: 'cs-composer',
        title: 'Hier startest du',
        body: 'Schreib einfach, worüber du posten willst, ein Stichwort genügt. Darunter wählst du den Kontext: Zielgruppe, Unternehmen (für den Ambassador-Modus), Web-Suche für aktuelle Fakten und über das Plus eigene Wissensquellen. Enter sendet, Shift+Enter macht einen Absatz.' },
      { id: 'splitscreen', route: '/content-studio', anchor: 'cs-doc-pane', event: 'open-editor',
        title: 'Der Splitscreen',
        body: 'Sobald du loslegst, teilt sich der Bildschirm: links bleibt der Chat, rechts öffnet sich dein Dokument. So siehst du Gespräch und Beitrag nebeneinander und arbeitest am Text weiter, ohne den Faden zu verlieren. Über den Pfeil an der Kante klappst du das Dokument jederzeit auf und zu.' },
      { id: 'uebernehmen', route: '/content-studio', anchor: 'cs-doc-pane', event: 'open-editor',
        title: 'Vom Chat ins Dokument',
        body: 'Gefällt dir ein Vorschlag aus dem Chat, übernimmst du ihn mit einem Klick ins Dokument, als neuen Beitrag oder unten angehängt. Wichtig: Jeder Chat merkt sich seine Dokumente. Wechselst du den Chat, erscheint automatisch das zugehörige Dokument. Über die Tabs am Dokument springst du zwischen mehreren Dokumenten eines Chats oder legst ein neues an.' },
      { id: 'werkzeuge', route: '/content-studio', anchor: 'cs-doc-pane', event: 'open-editor',
        title: 'KI-Werkzeugleiste im Dokument',
        body: 'Markierst du im Dokument einen Satz oder Absatz, erscheint direkt darüber eine Werkzeugleiste: umschreiben (lockerer, professioneller, prägnanter …), kürzen oder verlängern, übersetzen, Emojis rein oder raus, dazu eigene KI-Befehle, die du speichern kannst. Alles bleibt in deiner Brand Voice.' },
      { id: 'dokumente', route: '/dokumente', anchor: 'navlink:/dokumente',
        title: 'Dokumente',
        body: 'Alle deine Beiträge als Dokumente an einem Ort. Hier bearbeitest du sie weiter, ordnest sie Chats zu, exportierst sie oder schickst sie direkt in den Redaktionsplan bzw. als Vorlage zu den Visuals.' },
      { id: 'visuals', route: '/visuals', anchor: 'navlink:/visuals',
        title: 'Visuals',
        body: 'Erzeuge passende Bilder und Grafiken zu deinen Posts mit KI, im Stil deiner Marke. Ein starkes Bild hebt die Reichweite eines Beitrags spürbar.' },
      { id: 'media', route: '/media', anchor: 'navlink:/media',
        title: 'Medien',
        body: 'Dein Brand-Asset-Hub: hochgeladene Bilder, Logos und KI-generierte Visuals sammeln sich hier und sind für jeden Beitrag griffbereit.' },
      { id: 'redaktionsplan', route: '/redaktionsplan', anchor: 'navlink:/redaktionsplan',
        title: 'Redaktionsplan',
        body: 'Plane deine Beiträge im Kalender und im Board, von der Idee über den Entwurf bis veröffentlicht. Reichweite kommt von Regelmäßigkeit, hier behältst du sie im Blick.' },
      { id: 'done', route: '/content-studio', anchor: null,
        title: 'Leg los',
        body: 'Schreib in der Text-Werkstatt einfach dein erstes Stichwort, der Rest entsteht im Dialog. Diese Tour findest du jederzeit über das Fragezeichen oben rechts.',
        cta: { label: 'Zur Text-Werkstatt', to: '/content-studio' } },
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

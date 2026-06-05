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

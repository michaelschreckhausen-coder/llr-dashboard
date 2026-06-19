// strike2QuestionsCatalog.js — zentrale Wahrheit für den Strike2-Persona-Wizard.
// Schuster-Modell® / Empathischer Funnel®: 7 Kaufphasen + Grunddaten + Review.
// Input-Typen: 'text' | 'textarea' | 'multiselect' | 'tags' (slider/ranked in 3b).
//
// store: 'grunddaten' → persona_grunddaten jsonb | 'antworten' → antworten[tag] jsonb
// Phase 3a: Step 0 (GRUND) + Step 1 (PER) voll ausmodelliert. Steps 2–7 sind
// scaffolded (questions: []) → Wizard zeigt "in Vorbereitung"; 3b füllt sie.

export const STRIKE2_STEPS = [
  {
    idx: 0, tag: 'GRUND', store: 'grunddaten',
    title: 'Persona-Grunddaten',
    subtitle: 'Wer ist diese Person — Rolle, Kontext, Ziele?',
    questions: [
      { key: 'name', type: 'text', label: 'Name der Persona', required: true, placeholder: 'z. B. „IT-Leiter Mittelstand"' },
      { key: 'buying_center_role', type: 'multiselect', label: 'Rolle im Buying Center',
        options: ['Initiator', 'Entscheider', 'Anwender', 'Einkauf', 'Beeinflusser', 'Gatekeeper'] },
      { key: 'branche_groesse', type: 'text', label: 'Branche & Unternehmensgröße', placeholder: 'z. B. Maschinenbau, 200–500 MA' },
      { key: 'ziele', type: 'textarea', label: '3 strategische Ziele der Persona', placeholder: 'Was will diese Person beruflich erreichen? (ein Ziel pro Zeile)' },
    ],
  },
  {
    idx: 1, tag: 'PER', store: 'antworten',
    title: 'Problemerkennung',
    subtitle: 'Ziel: das Problem sichtbar & spürbar machen',
    questions: [
      { key: 'problem', type: 'textarea', label: 'Welches Problem erkennt die Persona?', required: true, placeholder: 'Konkrete Schmerzpunkte im Arbeitsalltag…' },
      { key: 'trigger', type: 'textarea', label: 'Welche Auslöser machen das Problem akut?', placeholder: 'Ereignisse/Situationen, die den Leidensdruck erhöhen…' },
      { key: 'emotionen', type: 'multiselect', label: 'Vorherrschende Emotionen',
        options: ['Frust', 'Unsicherheit', 'Druck', 'Überforderung', 'Angst', 'Neugier', 'Hoffnung'] },
      { key: 'originalzitate', type: 'tags', label: 'Originalzitate (O-Töne)', placeholder: 'Zitat eingeben + Enter' },
    ],
  },
  {
    idx: 2, tag: 'INF', store: 'antworten', title: 'Informieren', subtitle: 'Ziel: Orientierung & Wissensaufbau',
    questions: [
      { key: 'suchen', type: 'textarea', label: 'Wonach googelt die Persona?', required: true, placeholder: 'Typische Suchanfragen / Fragen am Anfang der Recherche…' },
      { key: 'wissensluecken', type: 'textarea', label: 'Wo fehlt Wissen / welche Fragen sind offen?' },
      { key: 'quellen', type: 'multiselect', label: 'Genutzte Informationsquellen',
        options: ['Branchenmagazine', 'Analystenreports', 'Peer-Empfehlungen', 'LinkedIn', 'Podcasts', 'Studien', 'Webinare'] },
      { key: 'buzzwords_an', type: 'tags', label: 'Anziehende Buzz-Words', placeholder: 'Begriff + Enter' },
      { key: 'buzzwords_ab', type: 'tags', label: 'Abschreckende Buzz-Words', placeholder: 'Begriff + Enter' },
    ],
  },
  {
    idx: 3, tag: 'BEF', store: 'antworten', title: 'Befähigen', subtitle: 'Ziel: Handlungsfähigkeit herstellen',
    questions: [
      { key: 'hilfsmittel', type: 'textarea', label: 'Welche Hilfsmittel/Tools braucht die Persona?', required: true },
      { key: 'unsicherheit_aufgaben', type: 'textarea', label: 'Bei welchen Aufgaben ist sie unsicher?' },
      { key: 'quick_wins', type: 'textarea', label: 'Welche Quick-Wins überzeugen?' },
      { key: 'lernformat', type: 'multiselect', label: 'Bevorzugtes Lernformat',
        options: ['Whitepaper', 'Webinar', 'Video-Tutorial', 'Checkliste', 'Canvas-Vorlage', 'Workshop'] },
    ],
  },
  {
    idx: 4, tag: 'EVA', store: 'antworten', title: 'Evaluieren', subtitle: 'Ziel: Optionen strukturiert vergleichen',
    questions: [
      { key: 'alternativen', type: 'tags', label: 'Welche Alternativen zieht sie in Betracht?', required: true, placeholder: 'Alternative + Enter' },
      { key: 'kriterien', type: 'ranked', label: 'Entscheidungskriterien (nach Wichtigkeit)',
        options: ['Preis', 'ROI', 'Implementierungsaufwand', 'Integration', 'Support', 'Compliance', 'Skalierbarkeit', 'Time-to-Value'] },
      { key: 'painpoints_alternativen', type: 'textarea', label: 'Pain-Points bei den Alternativen' },
      { key: 'vergleichsformat', type: 'multiselect', label: 'Bevorzugtes Vergleichs-Format',
        options: ['Feature-Matrix', 'Demo', 'Testphase', 'Referenzgespräch', 'Analystenvergleich'] },
    ],
  },
  {
    idx: 5, tag: 'BEW', store: 'antworten', title: 'Bewerten', subtitle: 'Ziel: Vertrauen & Risiko abwägen',
    questions: [
      { key: 'vertrauensbeweise', type: 'multiselect', label: 'Welche Vertrauensbeweise zählen?', required: true,
        options: ['Case Studies', 'Referenzen', 'Zertifikate', 'Awards', 'Peer-Empfehlungen', 'Pilot', 'Geld-zurück-Garantie'] },
      { key: 'branchen_referenzen', type: 'tags', label: 'Konkrete Branchen-Referenzen, die zählen', placeholder: 'Referenz + Enter' },
      { key: 'skepsis', type: 'textarea', label: 'Worüber ist die Persona skeptisch?' },
      { key: 'risiko_skala', type: 'slider', label: 'Wahrgenommenes Risiko (1 = gering, 10 = hoch)', min: 1, max: 10 },
    ],
  },
  {
    idx: 6, tag: 'KEN-ABS', store: 'antworten', title: 'Entscheiden', subtitle: 'Ziel: Kaufentscheidung absichern',
    questions: [
      { key: 'stakeholder', type: 'multiselect', label: 'Beteiligte Stakeholder',
        options: ['Initiator', 'Entscheider', 'Anwender', 'Einkauf', 'Beeinflusser', 'Gatekeeper', 'Geschäftsführung', 'IT', 'Legal'] },
      { key: 'business_case', type: 'textarea', label: 'Business-Case-Argumente', required: true },
      { key: 'einwaende', type: 'textarea', label: 'Einwände kurz vor Abschluss' },
      { key: 'decision_trigger', type: 'multiselect', label: 'Entscheidungs-Trigger',
        options: ['Budget-Zyklus', 'Quartalsende', 'Strategie-Pivot', 'Wettbewerber-Move', 'Compliance-Deadline'] },
    ],
  },
  {
    idx: 7, tag: 'IMP-RUC', store: 'antworten', title: 'Kunden entwickeln', subtitle: 'Ziel: Onboarding, Bindung, Ausbau',
    questions: [
      { key: 'onboarding_huerden', type: 'textarea', label: 'Onboarding-Hürden', required: true },
      { key: 'erfolgs_kpis', type: 'textarea', label: 'Erfolgs-KPIs der Persona' },
      { key: 'upsell_hooks', type: 'textarea', label: 'Up-/Cross-Sell-Hooks' },
      { key: 'community_format', type: 'multiselect', label: 'Bevorzugtes Community-Format',
        options: ['User-Conference', 'Slack-Community', 'Newsletter', 'Webinar-Reihe', '1:1-Coaching'] },
    ],
  },
  { idx: 8, tag: 'REVIEW', store: null, title: 'Review & Generierung', subtitle: 'Antworten prüfen, dann 70 Content-Ideen generieren', questions: [] },
]

export const STRIKE2_TOTAL_STEPS = STRIKE2_STEPS.length // 9 (0–8)

export function strike2Step(idx) {
  return STRIKE2_STEPS.find(s => s.idx === idx) || STRIKE2_STEPS[0]
}

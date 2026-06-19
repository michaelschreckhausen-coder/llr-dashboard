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
  { idx: 2, tag: 'INF', store: 'antworten', title: 'Informieren', subtitle: 'Ziel: Orientierung & Wissensaufbau', questions: [] },
  { idx: 3, tag: 'BEF', store: 'antworten', title: 'Befähigen', subtitle: 'Ziel: Handlungsfähigkeit herstellen', questions: [] },
  { idx: 4, tag: 'EVA', store: 'antworten', title: 'Evaluieren', subtitle: 'Ziel: Optionen strukturiert vergleichen', questions: [] },
  { idx: 5, tag: 'BEW', store: 'antworten', title: 'Bewerten', subtitle: 'Ziel: Vertrauen & Risiko abwägen', questions: [] },
  { idx: 6, tag: 'KEN-ABS', store: 'antworten', title: 'Entscheiden', subtitle: 'Ziel: Kaufentscheidung absichern', questions: [] },
  { idx: 7, tag: 'IMP-RUC', store: 'antworten', title: 'Kunden entwickeln', subtitle: 'Ziel: Onboarding, Bindung, Ausbau', questions: [] },
  { idx: 8, tag: 'REVIEW', store: null, title: 'Review & Generierung', subtitle: 'Antworten prüfen, dann 70 Content-Ideen generieren', questions: [] },
]

export const STRIKE2_TOTAL_STEPS = STRIKE2_STEPS.length // 9 (0–8)

export function strike2Step(idx) {
  return STRIKE2_STEPS.find(s => s.idx === idx) || STRIKE2_STEPS[0]
}

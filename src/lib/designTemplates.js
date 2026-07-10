// src/lib/designTemplates.js
// Start-Layouts (Vorlagen) für den Grafik-Designer der Content-Werkstatt.
//
// Eine Vorlage definiert eine Bühnen-Größe + farbigen Hintergrund + eine Liste
// von react-konva-Objekten (Text/Formen) als Platzhalter, die der Nutzer dann
// füllt. Bewusst KEIN Bild nötig — Layouts starten auf farbigem Grund.
//
// Koordinaten sind in Bühnen-Pixeln (absolut) angegeben; der Designer rendert
// sie direkt als Overlay-Objekte. IDs werden beim Einfügen frisch vergeben.
//
// Portiert/abgeleitet aus den früheren Prompt-„TEMPLATES" in Visuals.jsx
// (Statement/Zitat, Statistik, Before/After, Carousel-Slide, Event).

const PRIMARY = '#0A6FB0'

// Helfer: Standard-Bühne 1080×1080 (LinkedIn-Quadrat).
const SQ = 1080

export const DESIGN_TEMPLATES = [
  // ─── 1. Statement / Zitat ──────────────────────────────────────────────────
  {
    id: 'statement',
    label: 'Statement / Zitat',
    desc: 'Große Aussage auf ruhigem Hintergrund',
    aspect: '1:1',
    stage: { width: SQ, height: SQ },
    background: '#0F172A',
    objects: [
      { type: 'rect', x: 90, y: 150, width: 70, height: 10, fill: PRIMARY, stroke: '#000', strokeWidth: 0, rotation: 0 },
      { type: 'text', x: 90, y: 210, width: 900, text: '„Hier steht deine zentrale Aussage – kurz, klar, einprägsam."',
        fontSize: 76, fontFamily: 'Georgia', fill: '#ffffff', fontStyle: 'bold', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 90, y: 820, width: 700, text: '— Dein Name, Position',
        fontSize: 36, fontFamily: 'Inter', fill: 'rgba(255,255,255,0.7)', fontStyle: 'normal', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
    ],
  },

  // ─── 2. Statistik / Kennzahl ────────────────────────────────────────────────
  {
    id: 'stats',
    label: 'Statistik',
    desc: 'Eine große Zahl mit Kontext',
    aspect: '1:1',
    stage: { width: SQ, height: SQ },
    background: '#ffffff',
    objects: [
      { type: 'rect', x: 0, y: 0, width: SQ, height: 26, fill: PRIMARY, stroke: '#000', strokeWidth: 0, rotation: 0 },
      { type: 'text', x: 80, y: 300, width: 920, text: '87%',
        fontSize: 320, fontFamily: 'Inter', fill: PRIMARY, fontStyle: 'bold', align: 'center', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 140, y: 720, width: 800, text: 'Kurzer Kontext zur Zahl – worauf bezieht sie sich?',
        fontSize: 44, fontFamily: 'Inter', fill: '#1f2937', fontStyle: 'normal', align: 'center', rotation: 0, scaleX: 1, scaleY: 1 },
    ],
  },

  // ─── 3. Before / After ──────────────────────────────────────────────────────
  {
    id: 'before_after',
    label: 'Vorher / Nachher',
    desc: 'Zwei-Spalten-Vergleich',
    aspect: '1:1',
    stage: { width: SQ, height: SQ },
    background: '#F1F5F9',
    objects: [
      { type: 'rect', x: 0, y: 0, width: SQ / 2, height: SQ, fill: '#E2E8F0', stroke: '#000', strokeWidth: 0, rotation: 0 },
      { type: 'rect', x: SQ / 2, y: 0, width: SQ / 2, height: SQ, fill: PRIMARY, stroke: '#000', strokeWidth: 0, rotation: 0 },
      { type: 'text', x: 60, y: 90, width: 420, text: 'VORHER',
        fontSize: 54, fontFamily: 'Inter', fill: '#475569', fontStyle: 'bold', align: 'center', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 600, y: 90, width: 420, text: 'NACHHER',
        fontSize: 54, fontFamily: 'Inter', fill: '#ffffff', fontStyle: 'bold', align: 'center', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 70, y: 470, width: 400, text: 'Problem / Ausgangslage',
        fontSize: 40, fontFamily: 'Inter', fill: '#334155', fontStyle: 'normal', align: 'center', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 610, y: 470, width: 400, text: 'Lösung / Ergebnis',
        fontSize: 40, fontFamily: 'Inter', fill: '#ffffff', fontStyle: 'normal', align: 'center', rotation: 0, scaleX: 1, scaleY: 1 },
    ],
  },

  // ─── 4. Carousel-Slide (Hero) ───────────────────────────────────────────────
  {
    id: 'carousel_slide',
    label: 'Carousel-Slide',
    desc: 'Hochformat 4:5 mit Titel + Hook',
    aspect: '4:5',
    stage: { width: 1080, height: 1350 },
    background: '#111827',
    objects: [
      { type: 'text', x: 80, y: 110, width: 920, text: 'Slide 1',
        fontSize: 40, fontFamily: 'Inter', fill: PRIMARY, fontStyle: 'bold', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 80, y: 300, width: 920, text: 'Großer Titel des Carousels, der zum Weiterswipen einlädt',
        fontSize: 88, fontFamily: 'Inter', fill: '#ffffff', fontStyle: 'bold', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 80, y: 760, width: 920, text: 'Untertitel oder kurzer Hook, der Spannung aufbaut.',
        fontSize: 44, fontFamily: 'Inter', fill: 'rgba(255,255,255,0.75)', fontStyle: 'normal', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'rect', x: 80, y: 1200, width: 160, height: 12, fill: PRIMARY, stroke: '#000', strokeWidth: 0, rotation: 0 },
      { type: 'text', x: 80, y: 1230, width: 920, text: 'Weiter swipen →',
        fontSize: 34, fontFamily: 'Inter', fill: 'rgba(255,255,255,0.6)', fontStyle: 'normal', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
    ],
  },

  // ─── 5. Event-Announcement ──────────────────────────────────────────────────
  {
    id: 'event',
    label: 'Event-Ankündigung',
    desc: 'Webinar / Veranstaltung / Launch',
    aspect: '1:1',
    stage: { width: SQ, height: SQ },
    background: PRIMARY,
    objects: [
      { type: 'text', x: 90, y: 150, width: 900, text: 'LIVE-EVENT',
        fontSize: 44, fontFamily: 'Inter', fill: 'rgba(255,255,255,0.8)', fontStyle: 'bold', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 90, y: 300, width: 900, text: 'Titel deines Events',
        fontSize: 96, fontFamily: 'Inter', fill: '#ffffff', fontStyle: 'bold', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'rect', x: 90, y: 700, width: 620, height: 110, fill: '#ffffff', stroke: '#000', strokeWidth: 0, cornerRadius: 14, rotation: 0 },
      { type: 'text', x: 120, y: 730, width: 560, text: 'Do, 5. Juni · 18:00 Uhr',
        fontSize: 50, fontFamily: 'Inter', fill: PRIMARY, fontStyle: 'bold', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
    ],
  },
  // ─── 6. Großes Zitat ────────────────────────────────────────────────────────
  {
    id: 'big_quote',
    label: 'Großes Zitat',
    desc: 'Zitat mit großem Anführungszeichen',
    aspect: '1:1',
    stage: { width: SQ, height: SQ },
    background: '#ffffff',
    objects: [
      { type: 'text', x: 80, y: 60, width: 400, text: '“',
        fontSize: 360, fontFamily: 'Georgia', fill: PRIMARY, fontStyle: 'bold', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 90, y: 420, width: 900, text: 'Hier steht ein starkes Zitat, das im Gedächtnis bleibt.',
        fontSize: 66, fontFamily: 'Georgia', fill: '#111827', fontStyle: 'bold', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 90, y: 880, width: 700, text: '— Dein Name',
        fontSize: 34, fontFamily: 'Inter', fill: '#6b7280', fontStyle: 'normal', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
    ],
  },

  // ─── 7. 3 Statistiken ─────────────────────────────────────────────────────
  {
    id: 'three_stats',
    label: '3 Statistiken',
    desc: 'Drei Kennzahlen nebeneinander',
    aspect: '1:1',
    stage: { width: SQ, height: SQ },
    background: '#0F172A',
    objects: [
      { type: 'text', x: 80, y: 110, width: 920, text: 'Die wichtigsten Zahlen',
        fontSize: 56, fontFamily: 'Inter', fill: '#ffffff', fontStyle: 'bold', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 60, y: 360, width: 300, text: '87%',
        fontSize: 130, fontFamily: 'Inter', fill: PRIMARY, fontStyle: 'bold', align: 'center', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 390, y: 360, width: 300, text: '3×',
        fontSize: 130, fontFamily: 'Inter', fill: PRIMARY, fontStyle: 'bold', align: 'center', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 720, y: 360, width: 300, text: '24h',
        fontSize: 130, fontFamily: 'Inter', fill: PRIMARY, fontStyle: 'bold', align: 'center', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 60, y: 560, width: 300, text: 'Kontext eins',
        fontSize: 30, fontFamily: 'Inter', fill: 'rgba(255,255,255,0.75)', fontStyle: 'normal', align: 'center', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 390, y: 560, width: 300, text: 'Kontext zwei',
        fontSize: 30, fontFamily: 'Inter', fill: 'rgba(255,255,255,0.75)', fontStyle: 'normal', align: 'center', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 720, y: 560, width: 300, text: 'Kontext drei',
        fontSize: 30, fontFamily: 'Inter', fill: 'rgba(255,255,255,0.75)', fontStyle: 'normal', align: 'center', rotation: 0, scaleX: 1, scaleY: 1 },
    ],
  },

  // ─── 8. Schritt-für-Schritt (3 Punkte) ────────────────────────────────────
  {
    id: 'steps_three',
    label: 'Schritt-für-Schritt',
    desc: 'Drei nummerierte Schritte',
    aspect: '4:5',
    stage: { width: 1080, height: 1350 },
    background: '#F8FAFC',
    objects: [
      { type: 'text', x: 80, y: 100, width: 920, text: 'In 3 Schritten zum Ziel',
        fontSize: 72, fontFamily: 'Inter', fill: '#111827', fontStyle: 'bold', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'ellipse', x: 130, y: 360, radiusX: 44, radiusY: 44, fill: PRIMARY, stroke: '#000', strokeWidth: 0, rotation: 0 },
      { type: 'text', x: 86, y: 328, width: 88, text: '1',
        fontSize: 56, fontFamily: 'Inter', fill: '#ffffff', fontStyle: 'bold', align: 'center', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 210, y: 330, width: 800, text: 'Erster Schritt — kurz beschreiben.',
        fontSize: 44, fontFamily: 'Inter', fill: '#1f2937', fontStyle: 'normal', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'ellipse', x: 130, y: 620, radiusX: 44, radiusY: 44, fill: PRIMARY, stroke: '#000', strokeWidth: 0, rotation: 0 },
      { type: 'text', x: 86, y: 588, width: 88, text: '2',
        fontSize: 56, fontFamily: 'Inter', fill: '#ffffff', fontStyle: 'bold', align: 'center', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 210, y: 590, width: 800, text: 'Zweiter Schritt — kurz beschreiben.',
        fontSize: 44, fontFamily: 'Inter', fill: '#1f2937', fontStyle: 'normal', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'ellipse', x: 130, y: 880, radiusX: 44, radiusY: 44, fill: PRIMARY, stroke: '#000', strokeWidth: 0, rotation: 0 },
      { type: 'text', x: 86, y: 848, width: 88, text: '3',
        fontSize: 56, fontFamily: 'Inter', fill: '#ffffff', fontStyle: 'bold', align: 'center', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 210, y: 850, width: 800, text: 'Dritter Schritt — kurz beschreiben.',
        fontSize: 44, fontFamily: 'Inter', fill: '#1f2937', fontStyle: 'normal', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
    ],
  },

  // ─── 9. Ankündigung ──────────────────────────────────────────────────────
  {
    id: 'announcement',
    label: 'Ankündigung',
    desc: 'Neuigkeit / News-Update',
    aspect: '1:1',
    stage: { width: SQ, height: SQ },
    background: '#ffffff',
    objects: [
      { type: 'rect', x: 90, y: 150, width: 320, height: 70, fill: PRIMARY, stroke: '#000', strokeWidth: 0, cornerRadius: 35, rotation: 0 },
      { type: 'text', x: 110, y: 168, width: 280, text: 'NEU',
        fontSize: 38, fontFamily: 'Inter', fill: '#ffffff', fontStyle: 'bold', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 90, y: 320, width: 900, text: 'Das gibt es jetzt Neues',
        fontSize: 92, fontFamily: 'Inter', fill: '#111827', fontStyle: 'bold', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 90, y: 640, width: 900, text: 'Kurze Beschreibung, was sich ändert und warum es spannend ist.',
        fontSize: 44, fontFamily: 'Inter', fill: '#4b5563', fontStyle: 'normal', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
    ],
  },

  // ─── 10. Frage des Tages ───────────────────────────────────────────────────
  {
    id: 'question',
    label: 'Frage des Tages',
    desc: 'Engagement-Frage an die Community',
    aspect: '1:1',
    stage: { width: SQ, height: SQ },
    background: PRIMARY,
    objects: [
      { type: 'text', x: 90, y: 160, width: 900, text: 'FRAGE DES TAGES',
        fontSize: 42, fontFamily: 'Inter', fill: 'rgba(255,255,255,0.8)', fontStyle: 'bold', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 90, y: 330, width: 900, text: 'Wie löst du dieses eine Problem?',
        fontSize: 86, fontFamily: 'Inter', fill: '#ffffff', fontStyle: 'bold', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 90, y: 860, width: 900, text: '↓ Schreib es in die Kommentare',
        fontSize: 40, fontFamily: 'Inter', fill: 'rgba(255,255,255,0.85)', fontStyle: 'normal', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
    ],
  },

  // ─── 11. Tipp / Hack ───────────────────────────────────────────────────────
  {
    id: 'tip_hack',
    label: 'Tipp / Hack',
    desc: 'Kurzer Profi-Tipp',
    aspect: '1:1',
    stage: { width: SQ, height: SQ },
    background: '#FEF3C7',
    objects: [
      { type: 'text', x: 90, y: 150, width: 900, text: '💡 PROFI-TIPP',
        fontSize: 46, fontFamily: 'Inter', fill: '#92400e', fontStyle: 'bold', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 90, y: 320, width: 900, text: 'Der eine Trick, der alles einfacher macht',
        fontSize: 78, fontFamily: 'Inter', fill: '#1f2937', fontStyle: 'bold', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 90, y: 720, width: 900, text: 'Erkläre den Tipp in ein, zwei Sätzen.',
        fontSize: 44, fontFamily: 'Inter', fill: '#44403c', fontStyle: 'normal', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
    ],
  },

  // ─── 12. Profil-Banner (LinkedIn) ──────────────────────────────────────────
  {
    id: 'profile_banner',
    label: 'Profil-Banner',
    desc: 'LinkedIn-Hintergrundbild 4:1',
    aspect: '4:1',
    stage: { width: 1584, height: 396 },
    background: '#0F172A',
    objects: [
      { type: 'rect', x: 0, y: 0, width: 16, height: 396, fill: PRIMARY, stroke: '#000', strokeWidth: 0, rotation: 0 },
      { type: 'text', x: 80, y: 110, width: 1100, text: 'Dein Name · Deine Positionierung',
        fontSize: 64, fontFamily: 'Inter', fill: '#ffffff', fontStyle: 'bold', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
      { type: 'text', x: 80, y: 210, width: 1100, text: 'Ich helfe [Zielgruppe] dabei, [Ergebnis] zu erreichen.',
        fontSize: 38, fontFamily: 'Inter', fill: 'rgba(255,255,255,0.78)', fontStyle: 'normal', align: 'left', rotation: 0, scaleX: 1, scaleY: 1 },
    ],
  },
]

export function getDesignTemplate(id) {
  return DESIGN_TEMPLATES.find(t => t.id === id) || null
}

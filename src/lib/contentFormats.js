// Content-Werkstatt „Plus" — Format-Katalog (Single Source of Truth, Spec §4).
// Frontend rendert Felder datengetrieben (kein handgeschriebenes Formular pro Familie);
// die EF spiegelt diese Datei (Deno kann nicht aus dem Frontend importieren) — beim Ändern
// _shared/contentFormats.ts mitziehen. Feld-`advanced:true` → hinter „Optionen ⌄".
//
// Feldtypen: 'text' | 'textarea' | 'tags' | 'select' (options[, default]) | 'number'.
// Format-Props: key, family, label, fields[], output[] (Schlüssel im format_output),
//   longForm (zweistufig: Gliederung → Ausformulierung), maxTokens (je Format, nicht global),
//   charLimit (nur Social: Kanal-Ziellimit für den Zeichenzähler, Warnung nicht Sperre).

export const CONTENT_FAMILIES = [
  { key: 'blog_seo', label: 'Blog & SEO' },
  { key: 'web_copy', label: 'Website & Landingpage' },
  { key: 'email',    label: 'E-Mail & Newsletter' },
  { key: 'social',   label: 'Social (weitere Kanäle)' },
]

export const CONTENT_FORMATS = [
  // ── Blog & SEO ────────────────────────────────────────────────
  {
    key: 'blog_article', family: 'blog_seo', label: 'SEO-Blogartikel',
    fields: [
      { key: 'focus_keyword', label: 'Fokus-Keyword', type: 'text', required: true },
      { key: 'secondary_keywords', label: 'Neben-Keywords', type: 'tags' },
      { key: 'search_intent', label: 'Suchintention', type: 'select', options: ['informational', 'kommerziell', 'transaktional'], default: 'informational' },
      { key: 'word_count', label: 'Zielwortzahl', type: 'select', options: [600, 900, 1200, 1800], default: 1200 },
      { key: 'outline_hint', label: 'Gliederung vorgeben', type: 'textarea', advanced: true },
    ],
    output: ['h1', 'meta_title', 'meta_description', 'slug', 'outline', 'body_markdown', 'faq', 'image_alt_suggestions'],
    longForm: true, maxTokens: 8000,
  },
  {
    key: 'seo_pillar', family: 'blog_seo', label: 'Pillar / Ratgeber',
    fields: [
      { key: 'focus_keyword', label: 'Fokus-Keyword', type: 'text', required: true },
      { key: 'subtopics', label: 'Unterthemen', type: 'tags' },
      { key: 'word_count', label: 'Zielwortzahl', type: 'select', options: [1200, 1800, 2500], default: 1800 },
      { key: 'internal_link_targets', label: 'Interne Link-Ziele', type: 'tags', advanced: true },
      { key: 'search_intent', label: 'Suchintention', type: 'select', options: ['informational', 'kommerziell', 'transaktional'], default: 'informational', advanced: true },
    ],
    output: ['h1', 'meta_title', 'meta_description', 'slug', 'outline', 'body_markdown', 'faq', 'internal_links', 'image_alt_suggestions'],
    longForm: true, maxTokens: 8000,
  },
  {
    key: 'how_to', family: 'blog_seo', label: 'How-to / Anleitung',
    fields: [
      { key: 'focus_keyword', label: 'Fokus-Keyword', type: 'text', required: true },
      { key: 'outcome', label: 'Ergebnis', type: 'text' },
      { key: 'step_count', label: 'Schritt-Anzahl', type: 'select', options: [3, 5, 7, 10], default: 5 },
      { key: 'prerequisites', label: 'Vorkenntnisse', type: 'text', advanced: true },
    ],
    output: ['h1', 'meta_title', 'meta_description', 'slug', 'steps', 'body_markdown', 'faq'],
    longForm: true, maxTokens: 6000,
  },
  {
    key: 'listicle', family: 'blog_seo', label: 'Listicle',
    fields: [
      { key: 'focus_keyword', label: 'Fokus-Keyword', type: 'text', required: true },
      { key: 'item_count', label: 'Anzahl Punkte', type: 'select', options: [5, 7, 10, 15], default: 7 },
      { key: 'sort_criterion', label: 'Sortierkriterium', type: 'text', advanced: true },
    ],
    output: ['h1', 'meta_title', 'meta_description', 'slug', 'items', 'body_markdown'],
    longForm: false, maxTokens: 5000,
  },
  {
    key: 'glossary', family: 'blog_seo', label: 'Glossar-Eintrag',
    fields: [
      { key: 'term', label: 'Begriff', type: 'text', required: true },
      { key: 'delimitation', label: 'Abgrenzung', type: 'textarea', advanced: true },
    ],
    output: ['h1', 'meta_title', 'meta_description', 'slug', 'body_markdown', 'related_terms'],
    longForm: false, maxTokens: 3000,
  },

  // ── Website & Landingpage ─────────────────────────────────────
  {
    key: 'landing_page', family: 'web_copy', label: 'Landingpage',
    fields: [
      { key: 'offer', label: 'Angebot', type: 'text', required: true },
      { key: 'value_prop', label: 'Nutzenversprechen', type: 'textarea' },
      { key: 'cta_goal', label: 'CTA-Ziel', type: 'text' },
      { key: 'section_count', label: 'Sektionsanzahl', type: 'select', options: [4, 5, 6, 8], default: 6 },
      { key: 'objections', label: 'Einwände', type: 'tags', advanced: true },
    ],
    output: ['sections'],
    longForm: true, maxTokens: 6000,
  },
  {
    key: 'hero_section', family: 'web_copy', label: 'Hero-Section',
    fields: [
      { key: 'offer', label: 'Angebot / Kernnutzen', type: 'text', required: true },
      { key: 'audience_hint', label: 'Zielgruppen-Hinweis', type: 'text', advanced: true },
    ],
    output: ['variants'],
    longForm: false, maxTokens: 2500,
  },
  {
    key: 'feature_block', family: 'web_copy', label: 'Feature-Block',
    fields: [
      { key: 'feature', label: 'Feature', type: 'text', required: true },
      { key: 'benefit', label: 'Nutzen', type: 'text' },
    ],
    output: ['sections'],
    longForm: false, maxTokens: 2500,
  },
  {
    key: 'product_description', family: 'web_copy', label: 'Produktbeschreibung',
    fields: [
      { key: 'product', label: 'Produkt', type: 'text', required: true },
      { key: 'key_features', label: 'Kern-Features', type: 'tags' },
      { key: 'tone_hint', label: 'Ton', type: 'text', advanced: true },
    ],
    output: ['headline', 'body', 'bullet_points', 'cta_label'],
    longForm: false, maxTokens: 2500,
  },
  {
    key: 'about_page', family: 'web_copy', label: 'Über-uns-Seite',
    fields: [
      { key: 'company', label: 'Unternehmen', type: 'text', required: true },
      { key: 'mission', label: 'Mission / Werte', type: 'textarea', advanced: true },
      { key: 'milestones', label: 'Meilensteine', type: 'tags', advanced: true },
    ],
    output: ['sections'],
    longForm: false, maxTokens: 4000,
  },

  // ── E-Mail & Newsletter ───────────────────────────────────────
  {
    key: 'newsletter', family: 'email', label: 'Newsletter',
    fields: [
      { key: 'topic', label: 'Thema', type: 'text', required: true },
      { key: 'goal', label: 'Ziel', type: 'text', advanced: true },
    ],
    output: ['subject_variants', 'preheader', 'body', 'cta_label'],
    longForm: false, maxTokens: 3000,
  },
  {
    key: 'cold_email_sequence', family: 'email', label: 'Kalt-Mail-Sequenz',
    fields: [
      { key: 'offer', label: 'Angebot', type: 'text', required: true },
      { key: 'step_count', label: 'Anzahl Schritte', type: 'select', options: [2, 3, 4, 5, 6, 7], default: 4 },
      { key: 'delay_days', label: 'Abstand (Tage)', type: 'number', default: 3 },
    ],
    output: ['emails'],
    longForm: true, maxTokens: 6000,
  },
  {
    key: 'followup', family: 'email', label: 'Follow-up-Mail',
    fields: [
      { key: 'context', label: 'Kontext / Anlass', type: 'text', required: true },
      { key: 'tone_hint', label: 'Ton', type: 'text', advanced: true },
    ],
    output: ['subject_variants', 'preheader', 'body', 'cta_label'],
    longForm: false, maxTokens: 2500,
  },
  {
    key: 'nurture', family: 'email', label: 'Nurture-Mail',
    fields: [
      { key: 'topic', label: 'Thema', type: 'text', required: true },
      { key: 'stage', label: 'Funnel-Stufe', type: 'select', options: ['awareness', 'consideration', 'decision'], default: 'consideration', advanced: true },
    ],
    output: ['subject_variants', 'preheader', 'body', 'cta_label'],
    longForm: false, maxTokens: 2500,
  },

  // ── Social (weitere Kanäle) ───────────────────────────────────
  {
    key: 'x_post', family: 'social', label: 'X-Post',
    fields: [{ key: 'topic', label: 'Thema', type: 'text', required: true }],
    output: ['hooks', 'body', 'hashtags', 'char_count'],
    longForm: false, maxTokens: 1500, charLimit: 280,
  },
  {
    key: 'x_thread', family: 'social', label: 'X-Thread',
    fields: [
      { key: 'topic', label: 'Thema', type: 'text', required: true },
      { key: 'tweet_count', label: 'Anzahl Tweets', type: 'select', options: [3, 5, 7, 10], default: 5 },
    ],
    output: ['hooks', 'items', 'hashtags', 'char_count'],
    longForm: false, maxTokens: 3000, charLimit: 280,
  },
  {
    key: 'instagram_post', family: 'social', label: 'Instagram-Post',
    fields: [
      { key: 'topic', label: 'Thema', type: 'text', required: true },
      { key: 'cta', label: 'Call-to-Action', type: 'text', advanced: true },
    ],
    output: ['hooks', 'body', 'hashtags', 'char_count'],
    longForm: false, maxTokens: 2000, charLimit: 2200,
  },
  {
    key: 'facebook_post', family: 'social', label: 'Facebook-Post',
    fields: [{ key: 'topic', label: 'Thema', type: 'text', required: true }],
    output: ['hooks', 'body', 'hashtags', 'char_count'],
    longForm: false, maxTokens: 2000, charLimit: 2000,
  },
  {
    key: 'youtube_script', family: 'social', label: 'YouTube-Skript',
    fields: [
      { key: 'topic', label: 'Thema', type: 'text', required: true },
      { key: 'duration_min', label: 'Länge (Min.)', type: 'select', options: [3, 5, 8, 12], default: 5, advanced: true },
    ],
    output: ['hooks', 'outline', 'body_markdown', 'cta_label'],
    longForm: true, maxTokens: 6000,
  },
  {
    key: 'youtube_short', family: 'social', label: 'YouTube-Short / Reel',
    fields: [
      { key: 'topic', label: 'Thema', type: 'text', required: true },
      { key: 'hook_style', label: 'Hook-Stil', type: 'text', advanced: true },
    ],
    output: ['hooks', 'body', 'char_count'],
    longForm: false, maxTokens: 1500, charLimit: 100,
  },
]

// Lookup-Maps + Helper (datengetriebenes Rendering/Validierung).
const FORMAT_BY_KEY = Object.fromEntries(CONTENT_FORMATS.map((f) => [f.key, f]))

export function getFormat(key) {
  return FORMAT_BY_KEY[key] || null
}

export function formatsForFamily(familyKey) {
  return CONTENT_FORMATS.filter((f) => f.family === familyKey)
}

export function isValidFormatKey(key) {
  return !!FORMAT_BY_KEY[key]
}

// format_input auf die im Katalog definierten Feld-Keys begrenzen (nichts Rohes in DB/Prompt).
export function filterFormatInput(formatKey, rawInput) {
  const fmt = FORMAT_BY_KEY[formatKey]
  if (!fmt || !rawInput || typeof rawInput !== 'object') return {}
  const allowed = new Set(fmt.fields.map((x) => x.key))
  const out = {}
  for (const k of Object.keys(rawInput)) {
    if (allowed.has(k)) out[k] = rawInput[k]
  }
  return out
}

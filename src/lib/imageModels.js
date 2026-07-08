// Zentrale Liste der Bildmodelle (Spiegel der bisherigen Liste in Visuals.jsx).
// Wert-Format: "<model>|<quality>" — wird vor dem Edge-Call gesplittet.
// Genutzt in der Content-Werkstatt (In-Chat-Bilder + Designer) und in der Visuals-Galerie.

export const IMAGE_MODELS = [
  { value: 'gemini-3-pro-image|medium',      name: 'Nano Banana Pro', label: 'Nano Banana Pro — beste Qualität', provider: 'Google' },
  { value: 'gemini-3.1-flash-image|medium',  name: 'Nano Banana 2',   label: 'Nano Banana 2 — schnell',         provider: 'Google' },
  { value: 'gpt-image-2|high',               name: 'GPT Image 2 Pro', label: 'GPT Image 2 — Premium',           provider: 'OpenAI' },
  { value: 'gpt-image-2|medium',             name: 'GPT Image 2',     label: 'GPT Image 2 — Standard',          provider: 'OpenAI' },
  { value: 'gpt-image-1-mini|low',           name: 'GPT Image Mini',  label: 'GPT Image Mini — schnell',        provider: 'OpenAI' },
]

// Default: Nano Banana Pro (beste Qualität) — auf Wunsch immer vorausgewählt, auch im Automatisch-Modus.
export const DEFAULT_IMAGE_MODEL = 'gemini-3-pro-image|medium'

// "<model>|<quality>" -> { model, quality }
export function splitModelValue(v) {
  const [model, quality] = String(v || DEFAULT_IMAGE_MODEL).split('|')
  return { model, quality: quality || 'medium' }
}

export function imageModelLabel(v) {
  const m = IMAGE_MODELS.find(x => x.value === v)
  return m ? m.label : 'Bildmodell'
}

// Nur der Modellname (ohne Speed/Qualitäts-Beschreibung), für das Composer-Dropdown.
export function imageModelName(v) {
  const m = IMAGE_MODELS.find(x => x.value === v)
  return m ? (m.name || m.label) : 'Bildmodell'
}

// Seitenverhältnis-Presets für die Bildgenerierung im Chat / Designer.
export const ASPECT_PRESETS = [
  { value: '1:1',  label: 'Quadrat 1:1' },
  { value: '4:5',  label: 'Hochformat 4:5' },
  { value: '16:9', label: 'Querformat 16:9' },
  { value: '9:16', label: 'Story 9:16' },
  { value: '1.91:1', label: 'Link-Vorschau 1.91:1' },
]
export const DEFAULT_ASPECT = '1:1'

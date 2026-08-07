// Macht einen Dateinamen storage-api-safe (nur [A-Za-z0-9._-]).
//
// Die self-hosted Supabase storage-api (isValidKey) lehnt Keys mit nicht-ASCII
// (z.B. deutscher Umlaut "ü" in "München") oder anderen Sonderzeichen mit
// 400 "Invalid key: ..." ab. Der Storage-Key wird clientseitig aus dem rohen
// Dateinamen gebaut — deshalb hier zentral sanitisieren:
//   - deutsche Umlaute werden transliteriert (ä→ae, ü→ue, ß→ss …)
//   - restliche Diakritika (é, ñ …) werden via NFKD entfernt
//   - alles übrige Nicht-Safe zu "_" kollabiert
//
// Sanitisiert wird NUR der Storage-Key. Der Original-Dateiname wird separat
// (z.B. DB-Spalte file_name / State) für die Anzeige gespeichert.

const UMLAUT = {
  'ä': 'ae', 'ö': 'oe', 'ü': 'ue',
  'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue',
  'ß': 'ss',
}

export function sanitizeFilename(name) {
  const raw = String(name ?? '')
  const dot = raw.lastIndexOf('.')
  const base = dot > 0 ? raw.slice(0, dot) : raw
  const rawExt = dot > 0 ? raw.slice(dot + 1) : ''

  const translit = base.replace(/[äöüÄÖÜß]/g, c => UMLAUT[c] ?? c)
  // NFKD zerlegt akzentuierte Buchstaben in Basis + kombinierendes Diakritikum;
  // ̀-ͯ = "Combining Diacritical Marks" → entfernen.
  const ascii = translit.normalize('NFKD').replace(/[̀-ͯ]/g, '')

  const safeBase = (ascii
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 120)) || 'file'

  const safeExt = rawExt.replace(/[^A-Za-z0-9]+/g, '').toLowerCase()
  return safeExt ? `${safeBase}.${safeExt}` : safeBase
}

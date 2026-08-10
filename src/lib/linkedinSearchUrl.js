// Validierung einer gespeicherten LinkedIn-Such-URL (Frontend, beim Speichern).
// SPIEGEL: identische Logik in supabase/functions/_shared/linkedinSearchUrl.ts (dort autoritativ).
//
// Positive Allowlist statt Profil-Block: akzeptiere NUR echte Such-Ergebnis-URLs.
// Quell-agnostisch (Unipile leitet den Suchtyp aus der URL ab; SN-URL mit api=classic
// funktioniert). Guard greift nur, wenn eine URL gesetzt ist — Keyword-Suchen bleiben frei.

export function validateSearchUrl(url) {
  const u = (url ?? '').trim()
  if (!u) return { ok: true }
  const ok = /linkedin\.com\/(search\/results\/|sales\/search\/)/i.test(u)
  if (ok) return { ok: true }
  return {
    ok: false,
    message:
      'Das ist keine Such-Ergebnis-URL (z. B. ein Profil-Link …/in/…). Füge eine LinkedIn-Suche ein (…/search/results/people/… oder …/sales/search/people…) oder nutze die Keyword-Felder.',
  }
}

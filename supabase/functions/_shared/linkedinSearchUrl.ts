// Validierung einer gespeicherten LinkedIn-Such-URL (autoritativ im EF).
// SPIEGEL: identische Logik in src/lib/linkedinSearchUrl.js — beide synchron halten.
//
// Positive Allowlist statt Profil-Block: akzeptiere NUR echte Such-Ergebnis-URLs.
// Quell-AGNOSTISCH — der Runner schickt bei gesetzter URL `{ url }` an Unipile, das den
// Suchtyp aus der URL ableitet; eine Sales-Navigator-URL mit api=classic funktioniert
// nachweislich (regression-verifiziert: importierte 50 Leads). Darum KEIN api↔URL-Match.
// Guard greift nur, wenn eine URL gesetzt ist — reine Keyword-Suchen bleiben unberührt.

export function validateSearchUrl(url: string | null | undefined): { ok: boolean; message?: string } {
  const u = (url ?? "").trim();
  if (!u) return { ok: true }; // keine URL → Keyword-Suche, Guard n/a
  const ok = /linkedin\.com\/(search\/results\/|sales\/search\/)/i.test(u);
  if (ok) return { ok: true };
  return {
    ok: false,
    message:
      "Das ist keine Such-Ergebnis-URL (z. B. ein Profil-Link …/in/…). Füge eine LinkedIn-Suche ein (…/search/results/people/… oder …/sales/search/people…) oder nutze die Keyword-Felder.",
  };
}

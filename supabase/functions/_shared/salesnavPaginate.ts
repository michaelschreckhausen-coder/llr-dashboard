// Testbarer Pagination-Kern für den Sales-Nav-Import-Guard.
// Von import-unipile-salesnav genutzt (Preview + Import teilen sich diese Schleife),
// mit injizierbarem fetchPage → deterministisch gegen Fixtures testbar (kein Live-Unipile).

export const PAGE = 50;
export const IMPORT_MAX_PAGES = 10; // harte Obergrenze 500 (vorher 20 = 1000) — Overfetch-Guard (D1)
export const PREVIEW_MAX_PAGES = 6; // Preview zählt bis 300, dann „mehr verfügbar" (D2), ohne zu schreiben

export interface SearchPage {
  items: any[];
  cursor: string | null;
}

// Cursor-basierte Suche mit hartem Seiten-Cap paginieren.
// Ruft fetchPage(cursor) je Seite; onPage(items, page) für Seiteneffekte (Zählen bzw. Upsert).
// Rückgabe: { pages, truncated }. truncated=true GENAU DANN, wenn nach dem Cap noch ein Cursor
// übrig war (= es gäbe mehr Treffer, wurden gedeckelt). Das ist die ehrliche Overfetch-Wahrheit.
export async function fetchSearchPages(
  fetchPage: (cursor: string | null) => Promise<SearchPage>,
  maxPages: number,
  onPage?: (items: any[], page: number) => void | Promise<void>,
): Promise<{ pages: number; truncated: boolean }> {
  let cursor: string | null = null;
  let pages = 0;
  do {
    const res = await fetchPage(cursor);
    pages++;
    if (onPage) await onPage(res.items ?? [], pages);
    cursor = res.cursor ?? null;
  } while (cursor && pages < maxPages);
  return { pages, truncated: !!cursor };
}

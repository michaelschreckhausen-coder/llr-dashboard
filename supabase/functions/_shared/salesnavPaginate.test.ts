// Fixture-Proof des Sales-Nav-Import-Guards (kein Live-Unipile nötig).
// Beweist die ECHTE Code-Pfad-Logik: import-unipile-salesnav nutzt exakt fetchSearchPages.
//   deno test supabase/functions/_shared/salesnavPaginate.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fetchSearchPages, IMPORT_MAX_PAGES, PAGE, PREVIEW_MAX_PAGES, type SearchPage } from "./salesnavPaginate.ts";

// Mock-Unipile: liefert `total` Treffer in Seiten à PAGE, mit Cursor solange mehr da ist.
function mockSource(total: number) {
  let served = 0;
  return (_cursor: string | null): Promise<SearchPage> => {
    const n = Math.min(PAGE, Math.max(0, total - served));
    served += n;
    const cursor = served < total ? `c${served}` : null;
    return Promise.resolve({ items: Array.from({ length: n }, (_, i) => ({ id: `id${served - n + i}` })), cursor });
  };
}

Deno.test("IMPORT: schmale Suche (120) → exakt, KEIN truncated", async () => {
  let count = 0;
  const { pages, truncated } = await fetchSearchPages(mockSource(120), IMPORT_MAX_PAGES, (items) => { count += items.length; });
  assertEquals(count, 120);
  assertEquals(pages, 3);          // 50 + 50 + 20
  assertEquals(truncated, false);
});

Deno.test("IMPORT: Overfetch (5000) → auf 500 gedeckelt + truncated=true (der Bug-Fix)", async () => {
  let count = 0;
  const { pages, truncated } = await fetchSearchPages(mockSource(5000), IMPORT_MAX_PAGES, (items) => { count += items.length; });
  assertEquals(pages, IMPORT_MAX_PAGES);         // 10 Seiten
  assertEquals(count, IMPORT_MAX_PAGES * PAGE);  // 500 — NICHT 1000, NICHT 5000
  assertEquals(truncated, true);                 // ehrlich: es gäbe mehr
});

Deno.test("IMPORT: exakt am Cap (500), Cursor endet natürlich → NICHT truncated", async () => {
  let count = 0;
  const { pages, truncated } = await fetchSearchPages(mockSource(500), IMPORT_MAX_PAGES, (items) => { count += items.length; });
  assertEquals(count, 500);
  assertEquals(pages, 10);
  assertEquals(truncated, false);                // 500 exakt, kein Rest → kein Overfetch
});

Deno.test("PREVIEW: kleine Suche (35) → exakter Count, exhausted (kein Confirm nötig)", async () => {
  let count = 0;
  const { truncated } = await fetchSearchPages(mockSource(35), PREVIEW_MAX_PAGES, (items) => { count += items.length; });
  assertEquals(count, 35);
  assertEquals(truncated, false);                // → exhausted:true, more_available:false
});

Deno.test("PREVIEW: breite Suche (5000) → geboundet 300, more_available (Confirm feuert)", async () => {
  let count = 0;
  const { pages, truncated } = await fetchSearchPages(mockSource(5000), PREVIEW_MAX_PAGES, (items) => { count += items.length; });
  assertEquals(pages, PREVIEW_MAX_PAGES);        // 6 Seiten
  assertEquals(count, PREVIEW_MAX_PAGES * PAGE); // 300 → „mindestens 300"
  assertEquals(truncated, true);                 // → more_available:true → Frontend-Confirm
});

Deno.test("onPage feuert genau einmal pro Seite, mit den Items der Seite", async () => {
  const sizes: number[] = [];
  await fetchSearchPages(mockSource(120), IMPORT_MAX_PAGES, (items) => { sizes.push(items.length); });
  assertEquals(sizes, [50, 50, 20]);
});

Deno.test("leeres Ergebnis (0) → 1 Seite, count 0, kein truncated", async () => {
  let count = 0;
  const { pages, truncated } = await fetchSearchPages(mockSource(0), IMPORT_MAX_PAGES, (items) => { count += items.length; });
  assertEquals(count, 0);
  assertEquals(pages, 1);
  assertEquals(truncated, false);
});

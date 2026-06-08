-- 20260608200000_knowledge_base_product_fields.sql
--
-- Zusatzfelder für Wissens-Einträge der Kategorie 'produkt':
--   product_form  — 'physisch' | 'digital'        (Auswahl)
--   product_kind  — 'produkt'  | 'dienstleistung' (Auswahl)
--   price         — Freitext (z.B. "49,00 €", "ab 99 €/Monat", "auf Anfrage")
--
-- Bewusst alle text (keine CHECK-Constraints) — Frontend-Select schraenkt die
-- Werte ein, und text vermeidet Silent-Fail-Fallen beim kombinierten Insert
-- (Top-Fallstrick #1). price als text statt numeric = flexibel (Spannen, Komma,
-- "auf Anfrage").
--
-- Idempotent.

ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS product_form text,
  ADD COLUMN IF NOT EXISTS product_kind text,
  ADD COLUMN IF NOT EXISTS price        text;

NOTIFY pgrst, 'reload schema';

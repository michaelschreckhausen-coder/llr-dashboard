-- 20260608210000_deals_product_id.sql
--
-- Verknuepfung Deal -> Produkt aus der Wissensdatenbank (knowledge_base mit
-- category='produkt'). ON DELETE SET NULL: wird das Produkt geloescht, bleibt
-- der Deal erhalten, nur die Verknuepfung faellt weg.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS + FK via DO-Block, falls Spalte schon
-- ohne Constraint existiert).

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS product_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.deals'::regclass
      AND contype = 'f'
      AND conname = 'deals_product_id_fkey'
  ) THEN
    ALTER TABLE public.deals
      ADD CONSTRAINT deals_product_id_fkey
      FOREIGN KEY (product_id)
      REFERENCES public.knowledge_base(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS deals_product_id_idx
  ON public.deals (product_id) WHERE product_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

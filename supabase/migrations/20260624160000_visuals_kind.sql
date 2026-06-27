-- Bilder vs. Designs unterscheiden.
--   kind = 'image'  → einzelnes (KI-/Upload-)Bild, lebt in den Medien
--   kind = 'design' → mehrseitiges Design (design_json v2 mit pages[]), im Designer bearbeitet
-- Bestehende Einträge bleiben 'image'. Idempotent.

BEGIN;

ALTER TABLE public.visuals
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'image';

CREATE INDEX IF NOT EXISTS visuals_kind_idx ON public.visuals (kind);

COMMIT;

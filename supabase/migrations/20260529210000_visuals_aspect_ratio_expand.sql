-- Migration: visuals_aspect_ratio_check erweitern
-- Bisher: nur LinkedIn-Formate (1:1, 4:5, 1.91:1, 4:1)
-- Neu: alle Neuroflash-Style Standard-Ratios

BEGIN;

ALTER TABLE public.visuals
  DROP CONSTRAINT IF EXISTS visuals_aspect_ratio_check;

ALTER TABLE public.visuals
  ADD CONSTRAINT visuals_aspect_ratio_check
  CHECK (aspect_ratio = ANY (ARRAY[
    -- Standard
    '1:1'::text,
    '3:2'::text, '2:3'::text,
    '4:3'::text, '3:4'::text,
    '5:4'::text, '4:5'::text,
    '16:9'::text, '9:16'::text,
    '21:9'::text,
    -- Legacy LinkedIn
    '1.91:1'::text, '4:1'::text
  ]));

NOTIFY pgrst, 'reload schema';

COMMIT;

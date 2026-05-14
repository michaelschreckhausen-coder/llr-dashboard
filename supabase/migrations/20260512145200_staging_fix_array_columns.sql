-- Migration: Staging-DB Schema-Fix — ARRAY-Spalten auf text aendern
-- target_audiences hatte legacy text[]-Spalten (industries, job_titles,
-- pain_points), prod hat dieselben als text. Code schreibt komma-getrennte
-- Strings → text[] choked mit "malformed array literal".
-- Sicher zu droppen: 0 rows in target_audiences auf staging.

BEGIN;

-- Drop & recreate als text. Default leerer String fuer Konsistenz mit den
-- anderen Zielgruppen-Feldern.
ALTER TABLE public.target_audiences DROP COLUMN IF EXISTS industries;
ALTER TABLE public.target_audiences DROP COLUMN IF EXISTS job_titles;
ALTER TABLE public.target_audiences DROP COLUMN IF EXISTS pain_points;
ALTER TABLE public.target_audiences DROP COLUMN IF EXISTS goals;
ALTER TABLE public.target_audiences DROP COLUMN IF EXISTS geography;
ALTER TABLE public.target_audiences DROP COLUMN IF EXISTS company_sizes;

ALTER TABLE public.target_audiences ADD COLUMN industries  text DEFAULT '';
ALTER TABLE public.target_audiences ADD COLUMN job_titles  text DEFAULT '';
ALTER TABLE public.target_audiences ADD COLUMN pain_points text DEFAULT '';

GRANT ALL ON public.target_audiences TO authenticated;

COMMIT;

-- Verify
SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name='target_audiences' AND column_name IN ('industries','job_titles','pain_points')
  ORDER BY column_name;

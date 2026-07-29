-- Neue Bedingung 'if_not_accepted' (wenn nicht angenommen) — v.a. fuer 'Anfrage zurueckziehen'.
BEGIN;
ALTER TABLE public.la_steps DROP CONSTRAINT IF EXISTS la_steps_condition_check;
ALTER TABLE public.la_steps ADD CONSTRAINT la_steps_condition_check
  CHECK (condition = ANY (ARRAY['always','if_accepted','if_no_reply','if_not_accepted']));
ALTER TABLE public.la_enrollments ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- lead_tasks.lead_id DROP NOT NULL — Standalone-Tasks erlauben
-- 2026-05-29
-- ════════════════════════════════════════════════════════════════════════════
--
-- Hintergrund: lead_tasks.lead_id war NOT NULL via 20260416000001_staging_schema
-- — jede Aufgabe musste einem Kontakt zugeordnet sein. User-Wunsch 2026-05-29:
-- Aufgaben auf /aufgaben sollen auch ohne Kontakt-Bezug erstellbar sein
-- (z.B. "Marketing-Plan Q3 fertig", "Team-Meeting vorbereiten").
--
-- ON DELETE CASCADE bleibt unverändert: wenn ein Lead gelöscht wird, werden
-- dessen Tasks weiterhin mit-gelöscht. Standalone-Tasks (lead_id IS NULL)
-- sind davon nicht betroffen.
--
-- Apply-Pfad:
--   ssh root@178.104.210.216 'docker exec -i supabase-db psql -U supabase_admin -d postgres' \
--     < supabase/migrations/20260528104100_lead_tasks_lead_id_nullable.sql
--
-- Idempotent durch DO-Block-Wrapping — wenn lead_id schon NULL-able, kein
-- Schaden bei Re-Apply.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lead_tasks'
      AND column_name = 'lead_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.lead_tasks
      ALTER COLUMN lead_id DROP NOT NULL;
    RAISE NOTICE 'lead_tasks.lead_id ist jetzt NULL-able (vorher NOT NULL).';
  ELSE
    RAISE NOTICE 'lead_tasks.lead_id ist bereits NULL-able — no-op.';
  END IF;
END $$;

COMMENT ON COLUMN public.lead_tasks.lead_id IS
  '2026-05-29 · NULL-able seit Migration 20260528104100. Wenn gesetzt: FK auf leads(id) ON DELETE CASCADE. Wenn NULL: standalone-Task ohne Kontakt-Bezug (über /aufgaben anlegbar).';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- Verifikation (nach Apply):
-- ════════════════════════════════════════════════════════════════════════════
--
-- -- a) lead_id ist jetzt NULL-able?
-- SELECT column_name, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='lead_tasks' AND column_name='lead_id';
-- -- Erwartung: is_nullable='YES'
--
-- -- b) FK-Constraint bleibt erhalten (ON DELETE CASCADE)?
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid='public.lead_tasks'::regclass AND contype='f'
--   AND pg_get_constraintdef(oid) LIKE '%lead_id%';
-- ════════════════════════════════════════════════════════════════════════════

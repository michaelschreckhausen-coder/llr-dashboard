-- 2026-05-27 — Phase F — profiles.plan_id text → uuid + FK auf plans
--
-- Staging:
--   - profiles.plan_id ist text (Drift gegen Prod-uuid)
--   - profiles_id_fkey existiert bereits → kein zusätzlicher FK nötig
--   - profiles_plan_id_check fehlt auf Staging (CLAUDE.md war veraltet)
--   - 1 Row mit plan_id = 'free' (slug-string)
--
-- Prod:
--   - profiles.plan_id ist uuid mit FK auf plans(id)
--   - profiles_id_fkey FEHLT → Tech-Debt für separaten Sprint (Prod-DB-Only-Fix)
--
-- Strategie (Staging-only):
--   1) Backfill: 'free' → Free-Plan-UUID via plans-Lookup
--   2) ALTER COLUMN plan_id TYPE uuid USING plan_id::uuid
--   3) ADD FK profiles.plan_id → plans(id) (matching Prod)
--
-- Frontend-Impact: profiles wird vom Frontend selten direkt geschrieben
-- (sign-up, settings). Plan_id wird read-only angezeigt + via Edge-Function
-- gesetzt (Stripe-Webhook etc.). Frontend liest plan-Slug via Embed
-- profiles?select=plan_id,plans(name) — uuid vs. text transparent für JSON.
--
-- Idempotent durch state-checks.

BEGIN;

-- ─── Step 1: Backfill 'free' → uuid (1 Row auf Staging) ────────────────────

UPDATE public.profiles p
   SET plan_id = (SELECT id::text FROM public.plans WHERE LOWER(name) = 'free' LIMIT 1)
 WHERE p.plan_id = 'free';

-- Generic backfill für andere Slugs falls vorhanden (safety net)
UPDATE public.profiles p
   SET plan_id = pl.id::text
  FROM public.plans pl
 WHERE LOWER(pl.name) = LOWER(p.plan_id)
   AND p.plan_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- ─── Step 2: Falls Constraint-Drift vorhanden, droppen (idempotent) ────────

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_id_check;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_id_fkey;

-- ─── Step 3: ALTER plan_id TYPE text → uuid ────────────────────────────────

DO $$
DECLARE
  current_type text;
BEGIN
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='profiles' AND column_name='plan_id';

  IF current_type = 'text' THEN
    -- Default zuerst weg — 'free'::text kann nicht zu uuid gecastet werden.
    -- Prod hat keinen Default (handle_new_user-Trigger setzt initial-Wert).
    ALTER TABLE public.profiles ALTER COLUMN plan_id DROP DEFAULT;

    ALTER TABLE public.profiles
      ALTER COLUMN plan_id TYPE uuid USING plan_id::uuid;
  END IF;
END $$;

-- ─── Step 4: ADD FK profiles.plan_id → plans(id) ────────────────────────────

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id);

-- ─── Step 5: Verifikation ──────────────────────────────────────────────────

DO $$
DECLARE
  plan_id_type    text;
  plan_id_default text;
  has_fk          boolean;
  has_check       boolean;
  orphan_count    integer;
BEGIN
  SELECT data_type, column_default INTO plan_id_type, plan_id_default
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='profiles' AND column_name='plan_id';

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.profiles'::regclass
      AND contype='f'
      AND conname='profiles_plan_id_fkey'
  ) INTO has_fk;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.profiles'::regclass
      AND contype='c'
      AND conname='profiles_plan_id_check'
  ) INTO has_check;

  -- profiles ohne matching plans-Entry
  SELECT count(*) FROM public.profiles p
   WHERE p.plan_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.plans pl WHERE pl.id = p.plan_id)
   INTO orphan_count;

  IF plan_id_type != 'uuid' THEN
    RAISE EXCEPTION 'plan_id type wrong: % (expected uuid)', plan_id_type;
  END IF;
  IF plan_id_default IS NOT NULL THEN
    RAISE EXCEPTION 'plan_id default should be NULL (matches Prod), got: %', plan_id_default;
  END IF;
  IF NOT has_fk THEN RAISE EXCEPTION 'profiles_plan_id_fkey missing'; END IF;
  IF has_check  THEN RAISE EXCEPTION 'profiles_plan_id_check still exists (should be dropped)'; END IF;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Found % profiles with plan_id not in plans table', orphan_count;
  END IF;

  RAISE NOTICE 'Phase F verification PASSED — plan_id uuid, no default, FK + 0 orphans';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

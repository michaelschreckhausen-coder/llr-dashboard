-- Accounts/Teams-Refactor Phase 2: Daten-Migration.
-- Für jeden bestehenden Team-Eintrag wird ein passender Account erzeugt
-- und teams.account_id befüllt.
-- IDEMPOTENT: kann mehrfach ausgeführt werden, springt vorhandene über.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. Für jedes Team ohne account_id: Account erzeugen
-- ─────────────────────────────────────────────────────────────

INSERT INTO public.accounts (
  id, name, billing_email, owner_user_id, plan_id, seat_limit,
  plan_managed_by, status, settings, created_at, updated_at
)
SELECT
  gen_random_uuid() AS id,
  t.name,
  COALESCE(
    (SELECT email FROM auth.users WHERE id = t.owner_id),
    'unknown@leadesk.de'
  ) AS billing_email,
  t.owner_id AS owner_user_id,
  t.plan_id,
  COALESCE(t.max_seats, 5) AS seat_limit,
  'leadesk' AS plan_managed_by,
  COALESCE(
    CASE
      WHEN t.is_active = false THEN 'suspended'
      ELSE 'active'
    END,
    'active'
  ) AS status,
  COALESCE(t.settings, '{}'::jsonb) AS settings,
  t.created_at,
  t.updated_at
FROM public.teams t
WHERE t.account_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. teams.account_id befüllen
-- ─────────────────────────────────────────────────────────────

UPDATE public.teams t
SET account_id = a.id
FROM public.accounts a
WHERE t.account_id IS NULL
  AND a.name = t.name
  AND a.created_at = t.created_at
  AND COALESCE(a.owner_user_id::text, '') = COALESCE(t.owner_id::text, '');

-- ─────────────────────────────────────────────────────────────
-- 3. Verifikation: jeder Team-Eintrag hat genau einen Account
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  orphan_count integer;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM public.teams WHERE account_id IS NULL;

  IF orphan_count > 0 THEN
    RAISE WARNING 'Phase 2 Migration: % teams ohne account_id verblieben', orphan_count;
  ELSE
    RAISE NOTICE 'Phase 2 Migration: alle teams haben account_id ✓';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 4. user_preferences initial befüllen mit erstem Team des Users
-- ─────────────────────────────────────────────────────────────

INSERT INTO public.user_preferences (user_id, active_team_id)
SELECT DISTINCT ON (tm.user_id)
  tm.user_id,
  tm.team_id AS active_team_id
FROM public.team_members tm
ORDER BY tm.user_id, tm.joined_at ASC NULLS LAST
ON CONFLICT (user_id) DO NOTHING;

COMMIT;

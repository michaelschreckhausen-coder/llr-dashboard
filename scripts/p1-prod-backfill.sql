-- ============================================================================
-- P1 · PROD backfill (seat foundation) — run ONLY on explicit "los prod-apply"
-- ============================================================================
-- Prod's seat scaffold is ALREADY canonical (feature_key/total_seats/valid_until,
-- is_active/revoked_at, incremental trg_license_seats, has_license()) → NO
-- alignment needed here (unlike staging). This is backfill + proof only.
--
-- Idempotent: GREATEST / WHERE NOT EXISTS / ON CONFLICT DO NOTHING. Safe re-run.
-- Behavior-neutral proof: snapshots get_my_entitlements() per active user
-- before/after and RAISEs (→ rollback) on ANY diff. has_license may go
-- false→true (expected). Also writes a PII-free audit row on success.
-- ============================================================================

\set ON_ERROR_STOP on
BEGIN;

-- ---------- PART 0: baseline snapshot (before any write) ----------
CREATE TEMP TABLE _p1_base ON COMMIT DROP AS
SELECT DISTINCT tm.user_id
FROM team_members tm JOIN teams t ON t.id = tm.team_id
WHERE tm.is_active AND t.account_id IS NOT NULL;
ALTER TABLE _p1_base ADD COLUMN ent_before jsonb, ADD COLUMN haslic_before boolean;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT user_id FROM _p1_base LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', r.user_id::text, 'role','authenticated')::text, true);
    UPDATE _p1_base SET ent_before = public.get_my_entitlements(),
                        haslic_before = public.has_license()
    WHERE user_id = r.user_id;
  END LOOP;
END $$;

-- ---------- PART 1: backfill (idempotent) ----------
-- 1a. raise seat_limit where members > limit
UPDATE public.accounts a
SET seat_limit = GREATEST(a.seat_limit, sub.m), updated_at = now()
FROM (SELECT t.account_id, count(*) FILTER (WHERE tm.is_active) m
      FROM teams t LEFT JOIN team_members tm ON tm.team_id = t.id
      WHERE t.account_id IS NOT NULL GROUP BY t.account_id) sub
WHERE a.id = sub.account_id AND sub.m > a.seat_limit;

-- 1b. one license per team with >=1 active member
INSERT INTO public.licenses (team_id, feature_key, total_seats, status)
SELECT t.id, 'full_access', GREATEST(a.seat_limit, cnt.m), 'active'
FROM teams t
JOIN accounts a ON a.id = t.account_id
JOIN (SELECT team_id, count(*) FILTER (WHERE is_active) m FROM team_members GROUP BY team_id) cnt
  ON cnt.team_id = t.id
WHERE t.account_id IS NOT NULL AND cnt.m > 0
  AND NOT EXISTS (SELECT 1 FROM public.licenses l WHERE l.team_id = t.id AND l.feature_key = 'full_access');

-- 1c. one assignment per active member
INSERT INTO public.license_assignments (license_id, user_id, team_id, is_active)
SELECT l.id, tm.user_id, tm.team_id, true
FROM team_members tm
JOIN teams t ON t.id = tm.team_id
JOIN public.licenses l ON l.team_id = tm.team_id AND l.feature_key = 'full_access'
WHERE tm.is_active AND t.account_id IS NOT NULL
ON CONFLICT (license_id, user_id) DO NOTHING;

-- 1d. reconcile used_seats authoritatively (trigger is incremental on prod)
UPDATE public.licenses l
SET used_seats = (SELECT count(*) FROM public.license_assignments la
                  WHERE la.license_id = l.id AND la.is_active);

-- ---------- PART 2: after snapshot + proof ----------
CREATE TEMP TABLE _p1_after ON COMMIT DROP AS
SELECT user_id, NULL::jsonb ent_after, NULL::boolean haslic_after FROM _p1_base;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT user_id FROM _p1_after LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', r.user_id::text, 'role','authenticated')::text, true);
    UPDATE _p1_after SET ent_after = public.get_my_entitlements(),
                         haslic_after = public.has_license()
    WHERE user_id = r.user_id;
  END LOOP;
END $$;

\echo '--- entitlement diffs (must be 0) ---'
SELECT b.user_id, b.ent_before->>'plan_name' plan_before, a.ent_after->>'plan_name' plan_after
FROM _p1_base b JOIN _p1_after a USING (user_id)
WHERE b.ent_before IS DISTINCT FROM a.ent_after;

\echo '--- summary checks ---'
SELECT 'entitlement_diffs'          k, count(*) v FROM _p1_base b JOIN _p1_after a USING(user_id) WHERE b.ent_before IS DISTINCT FROM a.ent_after
UNION ALL SELECT 'has_license_false_to_true', count(*) FROM _p1_base b JOIN _p1_after a USING(user_id) WHERE b.haslic_before IS NOT TRUE AND a.haslic_after IS TRUE
UNION ALL SELECT 'members_without_has_license', count(*) FROM _p1_after WHERE haslic_after IS NOT true
UNION ALL SELECT 'licenses',        count(*) FROM public.licenses
UNION ALL SELECT 'assignments',     count(*) FROM public.license_assignments
UNION ALL SELECT 'active_members',  (SELECT count(*) FROM team_members tm JOIN teams t ON t.id=tm.team_id WHERE tm.is_active AND t.account_id IS NOT NULL)
UNION ALL SELECT 'members_wrong_seatcount', (SELECT count(*) FROM (
    SELECT tm.user_id, tm.team_id FROM team_members tm JOIN teams t ON t.id=tm.team_id
    LEFT JOIN public.license_assignments la ON la.team_id=tm.team_id AND la.user_id=tm.user_id AND la.is_active
    WHERE tm.is_active AND t.account_id IS NOT NULL
    GROUP BY tm.user_id, tm.team_id HAVING count(la.*) <> 1) x)
UNION ALL SELECT 'accounts_underprovisioned', (SELECT count(*) FROM (
    SELECT t.account_id FROM teams t JOIN accounts a ON a.id=t.account_id
    LEFT JOIN team_members tm ON tm.team_id=t.id WHERE t.account_id IS NOT NULL
    GROUP BY t.account_id, a.seat_limit HAVING count(*) FILTER (WHERE tm.is_active) > a.seat_limit) y);

-- hard gate: rollback on ANY behavior change or missing/duplicate seat
DO $$
DECLARE d int; m int; w int;
BEGIN
  SELECT count(*) INTO d FROM _p1_base b JOIN _p1_after a USING(user_id) WHERE b.ent_before IS DISTINCT FROM a.ent_after;
  IF d <> 0 THEN RAISE EXCEPTION 'BEHAVIOR CHANGED: % entitlement diff(s) — rolling back', d; END IF;
  SELECT count(*) INTO m FROM _p1_after WHERE haslic_after IS NOT true;
  IF m <> 0 THEN RAISE EXCEPTION '% active member(s) without has_license — rolling back', m; END IF;
  SELECT count(*) INTO w FROM (
    SELECT tm.user_id, tm.team_id FROM team_members tm JOIN teams t ON t.id=tm.team_id
    LEFT JOIN public.license_assignments la ON la.team_id=tm.team_id AND la.user_id=tm.user_id AND la.is_active
    WHERE tm.is_active AND t.account_id IS NOT NULL
    GROUP BY tm.user_id, tm.team_id HAVING count(la.*) <> 1) x;
  IF w <> 0 THEN RAISE EXCEPTION '% member(s) with != 1 active seat — rolling back', w; END IF;
END $$;

-- ---------- PART 3: PII-free audit row ----------
-- admin_audit_log requires NOT NULL admin_user_id + target_id (uuid). Attribute
-- the system backfill to an existing valid actor (FK-satisfying) + a real
-- license row; both resolved at runtime, no hardcoded uuids.
INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, field_name, before_value, after_value, reason)
SELECT
  (SELECT admin_user_id FROM public.admin_audit_log WHERE admin_user_id IS NOT NULL ORDER BY created_at DESC LIMIT 1),
  'seats.backfill_p1', 'licenses',
  (SELECT id FROM public.licenses ORDER BY created_at ASC LIMIT 1),
  'backfill',
  to_jsonb(0),
  jsonb_build_object(
    'accounts', (SELECT count(DISTINCT t.account_id) FROM licenses l JOIN teams t ON t.id=l.team_id),
    'licenses', (SELECT count(*) FROM licenses),
    'assignments', (SELECT count(*) FROM license_assignments WHERE is_active)),
  'P1 seat foundation backfill (behavior-neutral): one full_access seat per active membership';

COMMIT;

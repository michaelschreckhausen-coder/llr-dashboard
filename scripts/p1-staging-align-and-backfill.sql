-- ============================================================================
-- P1 · STAGING one-off: align divergent seat scaffold to canonical + backfill
-- ============================================================================
-- WHY a scripts/ one-off and NOT a numbered migration:
--   * PROD + repo (20260416000001_staging_schema.sql) already define the
--     CANONICAL seat scaffold (feature_key/total_seats/valid_until +
--     is_active/revoked_at, incremental trg_license_seats, has_license()).
--   * Only THIS Hetzner-STAGING instance drifted to an older shape
--     (plan_id/seats/expires_at, no is_active/revoked_at, recompute trigger,
--     no has_license) AND its admin layer differs (is_leadesk_admin_* instead
--     of is_admin/is_team_admin). A prod-running migration could not create
--     prod's is_admin-based policies here, and prod needs no change → repair
--     belongs in scripts/, applied to staging only.
--
-- SAFETY: aborts unless the divergent shape is present AND both tables empty.
--   Re-run after success aborts at the guard (total_seats already present).
-- PROOF: snapshots get_my_entitlements() per active user before/after and
--   RAISEs (→ rollback) on ANY diff. has_license may go false→true (expected).
--
-- Divergence accepted vs prod (documented, non-load-bearing for P1):
--   * has_license() here omits prod's `is_admin() OR ...` bypass branch
--     (staging has no is_admin(); the branch only affects admins, not the
--     member seat-check the proof exercises). Member behavior is identical.
--   * RLS policies keep staging's own/team style (prod uses is_admin/
--     is_team_admin). Irrelevant to P1: backfill runs as supabase_admin
--     (RLS bypass) and the invariant is about get_my_entitlements, not RLS.
-- ============================================================================

\set ON_ERROR_STOP on
BEGIN;

-- ---------- GUARD ----------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='licenses' AND column_name='total_seats') THEN
    RAISE EXCEPTION 'licenses already canonical (total_seats present) — one-off already applied; aborting';
  END IF;
  IF (SELECT count(*) FROM public.licenses) <> 0 OR (SELECT count(*) FROM public.license_assignments) <> 0 THEN
    RAISE EXCEPTION 'seat tables not empty — refusing to realign';
  END IF;
END $$;

-- ---------- PART 0: baseline snapshot (before any change) ----------
CREATE TEMP TABLE _p1_base ON COMMIT DROP AS
SELECT DISTINCT tm.user_id
FROM team_members tm JOIN teams t ON t.id = tm.team_id
WHERE tm.is_active AND t.account_id IS NOT NULL;
ALTER TABLE _p1_base ADD COLUMN ent_before jsonb;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT user_id FROM _p1_base LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', r.user_id::text, 'role','authenticated')::text, true);
    UPDATE _p1_base SET ent_before = public.get_my_entitlements() WHERE user_id = r.user_id;
  END LOOP;
END $$;

-- ---------- PART 1: align scaffold to canonical (empty tables) ----------
DROP TABLE IF EXISTS public.license_assignments CASCADE;
DROP TABLE IF EXISTS public.licenses CASCADE;

CREATE TABLE public.licenses (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id         uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  subscription_id uuid,
  feature_key     text DEFAULT 'full_access' NOT NULL,
  total_seats     integer DEFAULT 1 NOT NULL,
  used_seats      integer DEFAULT 0 NOT NULL,
  status          license_status DEFAULT 'active',
  valid_from      timestamptz DEFAULT now(),
  valid_until     timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  CONSTRAINT seats_chk CHECK (used_seats <= total_seats)
);
CREATE INDEX idx_lic_team ON public.licenses(team_id);

CREATE TABLE public.license_assignments (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  license_id  uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  team_id     uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  assigned_by uuid,
  assigned_at timestamptz DEFAULT now(),
  revoked_at  timestamptz,
  is_active   boolean DEFAULT true,
  CONSTRAINT license_assignments_license_id_user_id_key UNIQUE (license_id, user_id)
);
CREATE INDEX idx_la_team ON public.license_assignments(team_id);
CREATE INDEX idx_la_user ON public.license_assignments(user_id);

-- incremental trigger fn (matches prod)
CREATE OR REPLACE FUNCTION public.update_license_used_seats()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_active = true THEN
    UPDATE public.licenses SET used_seats = used_seats + 1 WHERE id = NEW.license_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_active = true AND NEW.is_active = false THEN
      UPDATE public.licenses SET used_seats = GREATEST(0, used_seats - 1) WHERE id = NEW.license_id;
    ELSIF OLD.is_active = false AND NEW.is_active = true THEN
      UPDATE public.licenses SET used_seats = used_seats + 1 WHERE id = NEW.license_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.is_active = true THEN
    UPDATE public.licenses SET used_seats = GREATEST(0, used_seats - 1) WHERE id = OLD.license_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $fn$;

CREATE TRIGGER trg_license_seats
  AFTER INSERT OR UPDATE OR DELETE ON public.license_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_license_used_seats();

-- has_license() — member seat-check (admin-bypass branch omitted on staging)
CREATE OR REPLACE FUNCTION public.has_license(p_feature text DEFAULT 'full_access')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.license_assignments la
    JOIN public.licenses l ON l.id = la.license_id
    WHERE la.user_id = auth.uid() AND la.is_active = true
      AND l.status = 'active'
      AND (l.feature_key = p_feature OR l.feature_key = 'full_access')
      AND (l.valid_until IS NULL OR l.valid_until > now())
  );
$fn$;

-- RLS: reproduce staging's own/team policy style
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY licenses_team ON public.licenses
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = uid()));
CREATE POLICY license_assignments_own ON public.license_assignments
  USING (user_id = uid());

-- ---------- PART 2: backfill (idempotent) ----------
-- 2a. raise seat_limit where members > limit
UPDATE public.accounts a
SET seat_limit = GREATEST(a.seat_limit, sub.m), updated_at = now()
FROM (SELECT t.account_id, count(*) FILTER (WHERE tm.is_active) m
      FROM teams t LEFT JOIN team_members tm ON tm.team_id = t.id
      WHERE t.account_id IS NOT NULL GROUP BY t.account_id) sub
WHERE a.id = sub.account_id AND sub.m > a.seat_limit;

-- 2b. one license per team with >=1 active member (idempotent)
INSERT INTO public.licenses (team_id, feature_key, total_seats, status)
SELECT t.id, 'full_access', GREATEST(a.seat_limit, cnt.m), 'active'
FROM teams t
JOIN accounts a ON a.id = t.account_id
JOIN (SELECT team_id, count(*) FILTER (WHERE is_active) m FROM team_members GROUP BY team_id) cnt
  ON cnt.team_id = t.id
WHERE t.account_id IS NOT NULL AND cnt.m > 0
  AND NOT EXISTS (SELECT 1 FROM public.licenses l WHERE l.team_id = t.id AND l.feature_key = 'full_access');

-- 2c. one assignment per active member (idempotent)
INSERT INTO public.license_assignments (license_id, user_id, team_id, is_active)
SELECT l.id, tm.user_id, tm.team_id, true
FROM team_members tm
JOIN teams t ON t.id = tm.team_id
JOIN public.licenses l ON l.team_id = tm.team_id AND l.feature_key = 'full_access'
WHERE tm.is_active AND t.account_id IS NOT NULL
ON CONFLICT (license_id, user_id) DO NOTHING;

-- 2d. reconcile used_seats authoritatively
UPDATE public.licenses l
SET used_seats = (SELECT count(*) FROM public.license_assignments la
                  WHERE la.license_id = l.id AND la.is_active);

-- ---------- PART 3: after snapshot + behavior-neutral proof ----------
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
UNION ALL SELECT 'members_without_has_license', count(*) FROM _p1_after WHERE haslic_after IS NOT true
UNION ALL SELECT 'licenses',        count(*) FROM public.licenses
UNION ALL SELECT 'assignments',     count(*) FROM public.license_assignments
UNION ALL SELECT 'active_members',  (SELECT count(*) FROM team_members tm JOIN teams t ON t.id=tm.team_id WHERE tm.is_active AND t.account_id IS NOT NULL)
UNION ALL SELECT 'members_wrong_seatcount', (SELECT count(*) FROM (
    SELECT tm.user_id, tm.team_id
    FROM team_members tm JOIN teams t ON t.id=tm.team_id
    LEFT JOIN public.license_assignments la ON la.team_id=tm.team_id AND la.user_id=tm.user_id AND la.is_active
    WHERE tm.is_active AND t.account_id IS NOT NULL
    GROUP BY tm.user_id, tm.team_id HAVING count(la.*) <> 1) x)
UNION ALL SELECT 'accounts_underprovisioned', (SELECT count(*) FROM (
    SELECT t.account_id FROM teams t JOIN accounts a ON a.id=t.account_id
    LEFT JOIN team_members tm ON tm.team_id=t.id WHERE t.account_id IS NOT NULL
    GROUP BY t.account_id, a.seat_limit HAVING count(*) FILTER (WHERE tm.is_active) > a.seat_limit) y);

-- hard gate: rollback on ANY behavior change or missing seat
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

COMMIT;

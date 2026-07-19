-- ============================================================================
-- P4a — Auto-Assign: Seat-Lifecycle = Membership-Lifecycle
-- ============================================================================
-- Modell (b): IMMER assign (Join bricht nie), Overage = max(0, used-total) computed
-- → used_seats ist der Billing-Input, muss jederzeit die Wahrheit sein.
-- Symmetrie: Join/Reaktivierung → Seat (grant), Entfernen → Seat frei (revoke, SOFT).
-- SOFT-Revoke (is_active=false, KEIN DELETE): Reaktivierung reaktiviert dieselbe
-- (user,license)-Row per ON CONFLICT statt INSERT (Unique-Constraint würde INSERT
-- sonst hart verletzen). Kein FOR UPDATE (kein Cap-Gate am Join; ON CONFLICT +
-- trg_license_seats-Row-Lock sind der Concurrency-Schutz). Uniform: jeder aktive
-- Account = Seat (Seat trägt die Unipile-Verbindung; auch Marketing verbindet).
-- ============================================================================
BEGIN;

-- ── Modell (b) enablement: seats_chk (used<=total, = harter Cap Modell a) relaxen ──
-- Overage muss erlaubt sein (used_seats > total_seats), Overage = max(0, used-total)
-- wird zur Billing-Zeit berechnet (P4c). Untere Schranke bleibt (used_seats>=0, safe:
-- trg nutzt GREATEST(0,..), revoke ist doppelt-safe). Cap-Consent zieht ins UI/P4c um.
ALTER TABLE public.licenses DROP CONSTRAINT IF EXISTS seats_chk;
ALTER TABLE public.licenses ADD  CONSTRAINT seats_chk CHECK (used_seats >= 0);

-- ── Core GRANT: echter UPSERT (neu ODER revoked-Row reaktivieren; schon-aktiv=no-op) ──
CREATE OR REPLACE FUNCTION public.grant_seat(p_team_id uuid, p_user_id uuid, p_assigned_by uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_license_id uuid;
BEGIN
  SELECT id INTO v_license_id FROM public.licenses
   WHERE team_id = p_team_id AND status = 'active' AND feature_key = 'full_access' LIMIT 1;
  IF v_license_id IS NULL THEN RETURN; END IF;  -- lizenzlos → no-op, kein Error
  INSERT INTO public.license_assignments (id, license_id, user_id, team_id, is_active, assigned_by, assigned_at)
  VALUES (gen_random_uuid(), v_license_id, p_user_id, p_team_id, true, p_assigned_by, now())
  ON CONFLICT (license_id, user_id) DO UPDATE
     SET is_active = true, revoked_at = NULL, assigned_at = now(), assigned_by = EXCLUDED.assigned_by
   WHERE public.license_assignments.is_active = false;  -- nur reaktivieren wenn revoked (schon-aktiv → kein UPDATE, trg zählt nicht doppelt)
END $fn$;

-- ── Core REVOKE: SOFT (is_active=false), damit die Reaktivierungs-Row erhalten bleibt ──
CREATE OR REPLACE FUNCTION public.revoke_seat_core(p_team_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_license_id uuid;
BEGIN
  SELECT id INTO v_license_id FROM public.licenses
   WHERE team_id = p_team_id AND status = 'active' AND feature_key = 'full_access' LIMIT 1;
  IF v_license_id IS NULL THEN RETURN; END IF;
  UPDATE public.license_assignments SET is_active = false, revoked_at = now()
   WHERE license_id = v_license_id AND user_id = p_user_id AND is_active = true;  -- soft → trg_license_seats -1
END $fn$;

-- ── Trigger-Glue ──
CREATE OR REPLACE FUNCTION public.tg_grant_seat_on_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$ BEGIN PERFORM public.grant_seat(NEW.team_id, NEW.user_id, NULL); RETURN NULL; END $fn$;

CREATE OR REPLACE FUNCTION public.tg_revoke_seat_on_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$ BEGIN PERFORM public.revoke_seat_core(OLD.team_id, OLD.user_id); RETURN NULL; END $fn$;

-- Grant: Neu-Join
DROP TRIGGER IF EXISTS trg_seat_grant_insert ON public.team_members;
CREATE TRIGGER trg_seat_grant_insert AFTER INSERT ON public.team_members FOR EACH ROW
  WHEN (NEW.is_active) EXECUTE FUNCTION public.tg_grant_seat_on_member();

-- Grant: Reaktivierung (echter false→true)
DROP TRIGGER IF EXISTS trg_seat_grant_reactivate ON public.team_members;
CREATE TRIGGER trg_seat_grant_reactivate AFTER UPDATE OF is_active ON public.team_members FOR EACH ROW
  WHEN (NEW.is_active AND OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION public.tg_grant_seat_on_member();

-- Revoke: Leave (echter true→false) — die Symmetrie, damit used_seats nicht driftet
DROP TRIGGER IF EXISTS trg_seat_revoke_on_leave ON public.team_members;
CREATE TRIGGER trg_seat_revoke_on_leave AFTER UPDATE OF is_active ON public.team_members FOR EACH ROW
  WHEN (OLD.is_active AND NOT NEW.is_active)
  EXECUTE FUNCTION public.tg_revoke_seat_on_member();

-- ── UI-RPCs (auth-gated, is_admin-frei → portabel; nutzen die Core-Fns) ──
CREATE OR REPLACE FUNCTION public.assign_seat(p_team_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
  IF NOT (COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) OR EXISTS (
      SELECT 1 FROM public.team_members tm WHERE tm.team_id = p_team_id
        AND tm.user_id = auth.uid() AND tm.role IN ('owner','admin') AND tm.is_active)) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  PERFORM public.grant_seat(p_team_id, p_user_id, auth.uid());
END $fn$;

CREATE OR REPLACE FUNCTION public.revoke_seat(p_team_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
  IF NOT (COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) OR EXISTS (
      SELECT 1 FROM public.team_members tm WHERE tm.team_id = p_team_id
        AND tm.user_id = auth.uid() AND tm.role IN ('owner','admin') AND tm.is_active)) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  PERFORM public.revoke_seat_core(p_team_id, p_user_id);
END $fn$;

-- ── Grants ──
REVOKE ALL ON FUNCTION public.grant_seat(uuid,uuid,uuid)       FROM public;
REVOKE ALL ON FUNCTION public.revoke_seat_core(uuid,uuid)      FROM public;
REVOKE ALL ON FUNCTION public.assign_seat(uuid,uuid)           FROM public;
REVOKE ALL ON FUNCTION public.revoke_seat(uuid,uuid)           FROM public;
GRANT EXECUTE ON FUNCTION public.assign_seat(uuid,uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_seat(uuid,uuid)        TO authenticated;

COMMIT;

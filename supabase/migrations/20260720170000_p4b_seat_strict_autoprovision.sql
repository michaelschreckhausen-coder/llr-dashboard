-- ============================================================================
-- P4b Hälfte 1 — License-Auto-Provision (grant_seat erweitert) + UNIQUE(team_id)
-- ============================================================================
-- Symmetrisches Gegenstück zu P4a's Seat-Auto-Assign: P4a assigned pro Member,
-- das hier provisioniert die Lizenz pro Team on-demand — zusammen self-healen sie
-- die Invariante "jeder aktive seat-tragende Member hat einen Seat", statt sie
-- einmalig zu backfillen. handle_new_user legt KEINE Lizenz an → ohne das hier
-- gebiert jeder Signup ein lizenzloses Team → seat-strikt (Hälfte 2) = Lockout-Maschine.
--
-- (a) on-demand in grant_seat (self-healt an jedem Join; keine Ordering-Abhängigkeit
-- wie ein Account-Creation-Trigger). Race-sicher: UNIQUE(team_id) + ON CONFLICT.
-- Plan-Filter (self-adjusting, permission-basiert): provisioniert NUR wenn der Plan
-- eine Unipile-Verbindung braucht = grantet linkedin.* ODER content.calendar
-- (content.studio = Library/KI, KEIN Unipile → zählt bewusst NICHT; heute kein
-- Library-only-Plan, aber das enge Prädikat ist future-proof). Free → no-op.
-- total_seats = accounts.seat_limit zum Erzeugungszeitpunkt.
-- ============================================================================
BEGIN;

-- UNIQUE(team_id) = der ON-CONFLICT-Arbiter (alle 53 Teams haben genau 1 Lizenz → safe)
ALTER TABLE public.licenses DROP CONSTRAINT IF EXISTS licenses_team_id_key;
ALTER TABLE public.licenses ADD  CONSTRAINT licenses_team_id_key UNIQUE (team_id);

CREATE OR REPLACE FUNCTION public.grant_seat(p_team_id uuid, p_user_id uuid, p_assigned_by uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_license_id uuid; v_seat_limit int; v_needs_seat boolean;
BEGIN
  -- 1. aktive full_access-Lizenz des Teams
  SELECT id INTO v_license_id FROM public.licenses
   WHERE team_id = p_team_id AND status = 'active' AND feature_key = 'full_access' LIMIT 1;

  -- 2. keine? → Auto-Provision, aber nur wenn der Plan einen Unipile-Seat braucht
  IF v_license_id IS NULL THEN
    SELECT COALESCE(a.seat_limit, 1),
           (EXISTS (SELECT 1 FROM jsonb_array_elements_text(p.permissions) k WHERE k LIKE 'linkedin.%')
            OR (p.permissions ? 'content.calendar'))
      INTO v_seat_limit, v_needs_seat
      FROM public.teams t
      JOIN public.accounts a ON a.id = t.account_id
      JOIN public.plans    p ON p.id = a.plan_id
     WHERE t.id = p_team_id;
    IF NOT COALESCE(v_needs_seat, false) THEN RETURN; END IF;  -- Free/Library-only → kein Connection-Seat (no-op)

    INSERT INTO public.licenses (team_id, feature_key, status, total_seats, used_seats)
    VALUES (p_team_id, 'full_access', 'active', GREATEST(COALESCE(v_seat_limit,1),1), 0)
    ON CONFLICT (team_id) DO NOTHING;                 -- race: 2 gleichzeitige Joins → nur 1 Lizenz

    SELECT id INTO v_license_id FROM public.licenses  -- re-select (eigene ODER die des Race-Gewinners)
     WHERE team_id = p_team_id AND status = 'active' AND feature_key = 'full_access' LIMIT 1;
    IF v_license_id IS NULL THEN RETURN; END IF;      -- defensiv (z.B. nur inaktive Lizenz existiert)
  END IF;

  -- 3. UPSERT assignment (wie P4a: neu ODER revoked reaktivieren; schon-aktiv = no-op)
  INSERT INTO public.license_assignments (id, license_id, user_id, team_id, is_active, assigned_by, assigned_at)
  VALUES (gen_random_uuid(), v_license_id, p_user_id, p_team_id, true, p_assigned_by, now())
  ON CONFLICT (license_id, user_id) DO UPDATE
     SET is_active = true, revoked_at = NULL, assigned_at = now(), assigned_by = EXCLUDED.assigned_by
   WHERE public.license_assignments.is_active = false;
END $fn$;

COMMIT;

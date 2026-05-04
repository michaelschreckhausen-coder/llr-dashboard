-- Phase 5 Block 3.5: get_my_entitlements RPC erweitern
--
-- Discovery (PHASE_5_BLOCK_3-5_DISCOVERY.md): Frontend-Refactor in
-- app.leadesk.de braucht die Block-2-Spalten plan_expires_at + granted_via
-- plus plan_managed_by als Authority-Quelle, damit TrialBanner-Logik korrekt
-- entscheiden kann (plan_managed_by + expires_at + trial_ends_at primary,
-- granted_via NUR fuer Provenance-Badge).
--
-- Aenderung gegenueber existing RPC (Migration 20260502110000):
--   accounts-SELECT um 3 Felder erweitert: plan_expires_at, granted_via, plan_managed_by
--   Return-jsonb um 3 Keys erweitert (additive — bestehende Caller bleiben heil)
--
-- Signatur unveraendert: get_my_entitlements() RETURNS jsonb
-- account_status + trial_ends_at sind bereits in der Response (existing).

CREATE OR REPLACE FUNCTION public.get_my_entitlements()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_account_id uuid;
  v_plan       record;
  v_account    record;
  v_is_active  boolean;
  v_days_left  integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Account des Users über aktives Team finden.
  -- Bevorzugt: user_preferences.active_team_id (falls gesetzt).
  -- Fallback: erstes team_members-Team, das ein account_id hat.
  SELECT t.account_id INTO v_account_id
  FROM teams t
  JOIN team_members tm ON tm.team_id = t.id
  LEFT JOIN user_preferences up ON up.user_id = v_user_id
  WHERE tm.user_id = v_user_id
    AND t.account_id IS NOT NULL
    AND (up.active_team_id IS NULL OR up.active_team_id = t.id)
  ORDER BY (up.active_team_id = t.id) DESC NULLS LAST,
           t.created_at ASC
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- accounts-SELECT erweitert um plan_expires_at, granted_via, plan_managed_by
  SELECT a.id, a.plan_id, a.status, a.trial_ends_at, a.seat_limit,
         a.plan_expires_at, a.granted_via, a.plan_managed_by
    INTO v_account
  FROM accounts a
  WHERE a.id = v_account_id;

  IF v_account IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.id, p.name, p.modules, p.is_trial, p.trial_days, p.is_active
    INTO v_plan
  FROM plans p
  WHERE p.id = v_account.plan_id;

  -- Falls Plan unauffindbar oder deaktiviert: leeres Modul-Set,
  -- aber neue Felder trotzdem mitgeben (sonst ist Frontend-Banner-Logik blind)
  IF v_plan IS NULL OR v_plan.is_active = false THEN
    RETURN jsonb_build_object(
      'account_id',      v_account.id,
      'plan_id',         v_account.plan_id,
      'plan_name',       NULL,
      'modules',         '[]'::jsonb,
      'is_trial',        (v_account.status = 'trialing'),
      'trial_ends_at',   v_account.trial_ends_at,
      'trial_days_left', NULL,
      'account_status',  v_account.status,
      'is_active',       false,
      'plan_expires_at', v_account.plan_expires_at,
      'granted_via',     v_account.granted_via,
      'plan_managed_by', v_account.plan_managed_by
    );
  END IF;

  -- Aktivitäts-Check (gleiche Logik wie account_has_module)
  v_is_active := v_account.status IN ('trialing','active')
    AND (
      v_account.status <> 'trialing'
      OR v_account.trial_ends_at IS NULL
      OR v_account.trial_ends_at > now()
    );

  v_days_left := CASE
    WHEN v_account.trial_ends_at IS NULL THEN NULL
    ELSE GREATEST(0, EXTRACT(DAY FROM v_account.trial_ends_at - now())::integer)
  END;

  RETURN jsonb_build_object(
    'account_id',      v_account.id,
    'plan_id',         v_plan.id,
    'plan_name',       v_plan.name,
    'modules',         to_jsonb(v_plan.modules),
    'is_trial',        v_plan.is_trial OR v_account.status = 'trialing',
    'trial_ends_at',   v_account.trial_ends_at,
    'trial_days_left', v_days_left,
    'account_status',  v_account.status,
    'is_active',       v_is_active,
    'plan_expires_at', v_account.plan_expires_at,
    'granted_via',     v_account.granted_via,
    'plan_managed_by', v_account.plan_managed_by
  );
END;
$$;

COMMENT ON FUNCTION public.get_my_entitlements IS
  'Phase 5 Block 3.5: Returns entitlements jsonb for current user via accounts-SoT. New keys: plan_expires_at, granted_via, plan_managed_by (Block-2-spalten). Existing keys: account_id, plan_id, plan_name, modules, is_trial, trial_ends_at, trial_days_left, account_status, is_active.';

NOTIFY pgrst, 'reload schema';

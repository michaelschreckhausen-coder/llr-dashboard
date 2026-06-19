-- 20260629150000_entitlements_merge_active_addon_modules.sql
-- B1 (Sidebar-Gating-Fix): get_my_entitlements() merged jetzt die activates_modules
-- AKTIVER account_addons (status='active') in das modules-Array — zusätzlich zu
-- plan.modules. Vorher kam modules NUR aus plan.modules → Addon-aktivierte Module
-- (strike2_zielgruppen_plus, sponsoring, …) waren NIE in den Entitlements → hasModule()
-- für Addon-Module immer false → Section bei aktivem Addon ausgeblendet (für Nicht-Admins;
-- bei Admins durch Layout-Bypass maskiert). Plus: Cancel entfernt das Modul jetzt korrekt.
--
-- ⚠ HOHER BLAST-RADIUS: gated alle Module für alle User. Addon-Module greifen plan-
--   unabhängig (auch im Plan-null/inactive-Pfad). Dedup via array_agg(DISTINCT).
-- Memory-Drift-Befund: das früher "hand-merged" (Sponsoring-Cutover, Staging) war auf
--   BEIDEN Envs nicht (mehr) vorhanden — diese Migration ist der kanonische Merge.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_entitlements()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id      uuid := auth.uid();
  v_account_id   uuid;
  v_plan         record;
  v_account      record;
  v_is_active    boolean;
  v_days_left    integer;
  v_is_ent       boolean;
  v_addon_mods   text[];
  v_merged_mods  text[];
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Account des Users über aktives Team finden.
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

  SELECT a.id, a.plan_id, a.status, a.trial_ends_at, a.seat_limit,
         a.plan_expires_at, a.granted_via, a.plan_managed_by
    INTO v_account
  FROM accounts a
  WHERE a.id = v_account_id;

  IF v_account IS NULL THEN
    RETURN NULL;
  END IF;

  -- B1: Module aus AKTIVEN Addons dieses Accounts (plan-unabhängig)
  SELECT COALESCE(array_agg(DISTINCT m), ARRAY[]::text[])
    INTO v_addon_mods
  FROM public.account_addons aa
  JOIN public.addons ad ON ad.id = aa.addon_id
  CROSS JOIN LATERAL unnest(COALESCE(ad.activates_modules, ARRAY[]::text[])) AS m
  WHERE aa.account_id = v_account_id
    AND aa.status = 'active';

  -- Plan-Lookup erweitert um permissions (Block 5.2 Q6=B)
  SELECT p.id, p.name, p.modules, p.is_trial, p.trial_days, p.is_active, p.permissions
    INTO v_plan
  FROM plans p
  WHERE p.id = v_account.plan_id;

  -- Enterprise-Check via Plan-ID-Konstante (Q2)
  v_is_ent := (v_account.plan_id = 'c4c11445-9f97-409a-bfd3-9c9f873c049b'::uuid);

  -- Falls Plan unauffindbar oder deaktiviert: nur Addon-Module (plan-unabhängig),
  -- aber neue Felder trotzdem mitgeben
  IF v_plan IS NULL OR v_plan.is_active = false THEN
    RETURN jsonb_build_object(
      'account_id',      v_account.id,
      'plan_id',         v_account.plan_id,
      'plan_name',       NULL,
      'modules',         to_jsonb(v_addon_mods),
      'is_trial',        (v_account.status = 'trialing'),
      'trial_ends_at',   v_account.trial_ends_at,
      'trial_days_left', NULL,
      'account_status',  v_account.status,
      'is_active',       false,
      'plan_expires_at', v_account.plan_expires_at,
      'granted_via',     v_account.granted_via,
      'plan_managed_by', v_account.plan_managed_by,
      'permissions',     '[]'::jsonb,
      'is_enterprise',   v_is_ent
    );
  END IF;

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

  -- B1: plan.modules ∪ Addon-Module (dedup)
  SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::text[])
    INTO v_merged_mods
  FROM unnest(COALESCE(v_plan.modules, ARRAY[]::text[]) || v_addon_mods) AS x;

  RETURN jsonb_build_object(
    'account_id',      v_account.id,
    'plan_id',         v_plan.id,
    'plan_name',       v_plan.name,
    'modules',         to_jsonb(v_merged_mods),
    'is_trial',        v_plan.is_trial OR v_account.status = 'trialing',
    'trial_ends_at',   v_account.trial_ends_at,
    'trial_days_left', v_days_left,
    'account_status',  v_account.status,
    'is_active',       v_is_active,
    'plan_expires_at', v_account.plan_expires_at,
    'granted_via',     v_account.granted_via,
    'plan_managed_by', v_account.plan_managed_by,
    'permissions',     COALESCE(v_plan.permissions, '[]'::jsonb),
    'is_enterprise',   v_is_ent
  );
END;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';

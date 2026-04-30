-- Module-Entitlements — RPCs
-- ─────────────────────────────────────────────────────────────────────────────
-- Liefert dem Frontend die aktive Modul-Liste eines Users (über sein Account)
-- und dient als Backend-Helper für RLS-Policies, die Modul-Zugriff prüfen.
--
-- Architektur: Plan → Account → Team → User. Ein User „hat" ein Modul, wenn
-- der Plan seines aktiven Accounts dieses Modul enthält UND der Account-
-- Status aktiv ist (kein expired-Trial, nicht suspended/canceled).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. account_has_module(account_id, module) → boolean
--    Verwendung: in RLS-Policies modul-spezifischer Tabellen.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.account_has_module(
  p_account_id uuid,
  p_module     text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM accounts a
    JOIN plans   p ON p.id = a.plan_id
    WHERE a.id = p_account_id
      AND p.is_active = true
      AND p_module = ANY(p.modules)
      -- Account muss in einem nutzbaren Status sein
      AND a.status IN ('trialing', 'active')
      -- Bei Trial: trial_ends_at muss in der Zukunft liegen
      AND (
        a.status <> 'trialing'
        OR a.trial_ends_at IS NULL
        OR a.trial_ends_at > now()
      )
  );
$$;

COMMENT ON FUNCTION public.account_has_module IS
  'Prüft, ob der Plan des Accounts das Modul enthält und der Account-Status nutzbar ist. Verwendung: in RLS-Policies.';

GRANT EXECUTE ON FUNCTION public.account_has_module(uuid, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. get_my_entitlements() → jsonb
--    Verwendung: Frontend-Hook useEntitlements().
--    Liefert Plan, Module, Trial-Status, Restlaufzeit für den auth.uid()-User
--    über seinen aktiven Team→Account-Pfad.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_entitlements()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
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

  SELECT a.id, a.plan_id, a.status, a.trial_ends_at, a.seat_limit
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

  -- Falls Plan unauffindbar oder deaktiviert: leeres Modul-Set
  IF v_plan IS NULL OR v_plan.is_active = false THEN
    RETURN jsonb_build_object(
      'account_id',     v_account.id,
      'plan_id',        v_account.plan_id,
      'plan_name',      NULL,
      'modules',        '[]'::jsonb,
      'is_trial',       (v_account.status = 'trialing'),
      'trial_ends_at',  v_account.trial_ends_at,
      'trial_days_left', NULL,
      'account_status', v_account.status,
      'is_active',      false
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
    'account_id',     v_account.id,
    'plan_id',        v_plan.id,
    'plan_name',      v_plan.name,
    'modules',        to_jsonb(v_plan.modules),
    'is_trial',       v_plan.is_trial OR v_account.status = 'trialing',
    'trial_ends_at',  v_account.trial_ends_at,
    'trial_days_left', v_days_left,
    'account_status', v_account.status,
    'is_active',      v_is_active
  );
END;
$$;

COMMENT ON FUNCTION public.get_my_entitlements IS
  'Liefert die Modul-Freischaltung des aktuellen Users via Account→Plan. Frontend-Hook: useEntitlements.';

GRANT EXECUTE ON FUNCTION public.get_my_entitlements() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Konsistenz-Bonus: i_have_module(module) als Convenience-Wrapper
--    Verwendung: kann in RLS-Policies anstelle des account_id-Joins genutzt
--    werden, wenn man sowieso schon im User-Kontext ist.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.i_have_module(p_module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM team_members tm
    JOIN teams        t ON t.id = tm.team_id
    JOIN accounts     a ON a.id = t.account_id
    JOIN plans        p ON p.id = a.plan_id
    WHERE tm.user_id = auth.uid()
      AND p.is_active = true
      AND p_module = ANY(p.modules)
      AND a.status IN ('trialing','active')
      AND (
        a.status <> 'trialing'
        OR a.trial_ends_at IS NULL
        OR a.trial_ends_at > now()
      )
  );
$$;

COMMENT ON FUNCTION public.i_have_module IS
  'Convenience-Wrapper für RLS: prüft ob auth.uid() das Modul über irgendeinen seiner Account-Zugänge hat.';

GRANT EXECUTE ON FUNCTION public.i_have_module(text) TO authenticated, service_role;

COMMIT;

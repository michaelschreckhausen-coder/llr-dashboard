-- Unipile-Allowance auf LIZENZ = USER umstellen (nicht pro Team/Account-via-Teams).
-- 1 Verknüpfung inkl. pro Lizenz (Plan.included_unipile_accounts, i.d.R. 1); weitere = Automation-Addon (5€).
-- Ein neues Team gibt KEINE zusätzliche Allowance mehr. Abgerechnet werden nur die EXTRA-Verknüpfungen.

-- Anzahl OK-Verknüpfungen eines Users (über alle Teams/Marken)
CREATE OR REPLACE FUNCTION public.count_user_unipile(p_user_id uuid)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT count(*)::int FROM public.unipile_accounts WHERE user_id = p_user_id AND status = 'OK';
$$;

-- Abrechenbare Extras für den Lizenz-Account (verbundene des Owners minus inklusive)
CREATE OR REPLACE FUNCTION public.account_billable_unipile(p_account_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT GREATEST(0,
    public.count_user_unipile((SELECT owner_user_id FROM public.accounts WHERE id = p_account_id))
    - public.account_included_unipile(p_account_id))::int;
$$;

-- Allowance pro Lizenz (= User): zählt die Verknüpfungen des eingeloggten Users
CREATE OR REPLACE FUNCTION public.unipile_allowance()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_user uuid := auth.uid(); v_account uuid; v_included int; v_connected int; v_addon boolean;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('included',1,'connected',0,'addon_active',false,'can_add',true);
  END IF;
  -- Lizenz = der Account, den dieser User besitzt; Fallback: Account des aktiven Teams
  SELECT id INTO v_account FROM public.accounts WHERE owner_user_id = v_user LIMIT 1;
  IF v_account IS NULL THEN
    SELECT t.account_id INTO v_account FROM public.user_preferences up
      JOIN public.teams t ON t.id = up.active_team_id WHERE up.user_id = v_user;
  END IF;
  v_included  := COALESCE(public.account_included_unipile(v_account), 1);
  v_connected := public.count_user_unipile(v_user);
  SELECT EXISTS(SELECT 1 FROM public.account_addons aa JOIN public.addons ad ON ad.id = aa.addon_id
               WHERE aa.account_id = v_account AND ad.slug = 'automation' AND aa.status = 'active') INTO v_addon;
  RETURN jsonb_build_object('included', v_included, 'connected', v_connected, 'addon_active', COALESCE(v_addon,false),
    'can_add', (v_connected < v_included) OR COALESCE(v_addon,false));
END $$;

-- Billing-Trigger: auf dem LIZENZ-Account des verbindenden Users abrechnen (auch wenn Team account_id NULL)
CREATE OR REPLACE FUNCTION public.unipile_accounts_quantity_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_account uuid;
BEGIN
  SELECT id INTO v_account FROM public.accounts WHERE owner_user_id = COALESCE(NEW.user_id, OLD.user_id) LIMIT 1;
  IF v_account IS NULL THEN
    SELECT account_id INTO v_account FROM public.teams WHERE id = COALESCE(NEW.team_id, OLD.team_id);
  END IF;
  PERFORM public.trigger_sync_automation_quantity(v_account);
  RETURN COALESCE(NEW, OLD);
END $$;

GRANT EXECUTE ON FUNCTION public.count_user_unipile(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.account_billable_unipile(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unipile_allowance() TO authenticated;

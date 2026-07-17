-- Slice 3: Freimenge "1 Unipile-Profil pro Lizenz inklusive, jedes weitere kostenpflichtig".
-- Nutzt die bestehende automation-Addon-Quantity-Maschinerie; ergänzt nur die Freimenge (Overage).
BEGIN;

-- 1) Freimenge am Plan (Muster wie seats_included). NULL = unbegrenzt.
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS included_unipile_accounts integer NOT NULL DEFAULT 1;
COMMENT ON COLUMN public.plans.included_unipile_accounts IS
  'Anzahl inklusiver verbundener LinkedIn-Profile (Unipile). Weitere kostenpflichtig via automation-Addon (5€/Monat).';

-- 2) Overage = zahlbare Profile = max(0, verbunden - inklusive)
CREATE OR REPLACE FUNCTION public.account_included_unipile(p_account_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(
    (SELECT p.included_unipile_accounts FROM public.accounts a
       LEFT JOIN public.plans p ON p.id = a.plan_id WHERE a.id = p_account_id), 1);
$$;
GRANT EXECUTE ON FUNCTION public.account_included_unipile(uuid) TO service_role, authenticated;

CREATE OR REPLACE FUNCTION public.account_billable_unipile(p_account_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT GREATEST(0, public.count_account_unipile(p_account_id) - public.account_included_unipile(p_account_id));
$$;
GRANT EXECUTE ON FUNCTION public.account_billable_unipile(uuid) TO service_role, authenticated;

-- 3) Caller-scoped Allowance (für Connect-Gate + UI). Account via aktives Team (wie get_my_entitlements).
CREATE OR REPLACE FUNCTION public.unipile_allowance()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_account uuid; v_included int; v_connected int; v_addon boolean;
BEGIN
  SELECT t.account_id INTO v_account
    FROM public.user_preferences up JOIN public.teams t ON t.id = up.active_team_id
    WHERE up.user_id = auth.uid();
  IF v_account IS NULL THEN
    SELECT t.account_id INTO v_account
      FROM public.team_members tm JOIN public.teams t ON t.id = tm.team_id
      WHERE tm.user_id = auth.uid() ORDER BY tm.created_at LIMIT 1;
  END IF;
  IF v_account IS NULL THEN
    RETURN jsonb_build_object('included',1,'connected',0,'addon_active',false,'can_add',true);
  END IF;
  v_included  := public.account_included_unipile(v_account);
  v_connected := public.count_account_unipile(v_account);
  SELECT EXISTS(SELECT 1 FROM public.account_addons aa JOIN public.addons ad ON ad.id = aa.addon_id
                WHERE aa.account_id = v_account AND ad.slug = 'automation' AND aa.status = 'active')
    INTO v_addon;
  RETURN jsonb_build_object(
    'included', v_included, 'connected', v_connected, 'addon_active', v_addon,
    'can_add', (v_connected < v_included) OR v_addon);
END $$;
GRANT EXECUTE ON FUNCTION public.unipile_allowance() TO authenticated, service_role;

-- 4) Addon-Anzeigepreis 5,99€ -> 5,00€ (Stripe-Price-Objekt muss separat neu angelegt werden!)
UPDATE public.addons SET price_monthly_cents = 500
  WHERE slug = 'automation' AND price_monthly_cents <> 500;

COMMIT;

-- Manuelle Addon-Zuweisung im Admin: account-weit ODER pro Member, comped/external mit Pflicht-Begründung.
-- ⚠️ Fasst den prod-live i_have_addon-Gate an → STAGING zuerst, Automatisierungs-Gating re-verifizieren.
-- Additiv, idempotent. is_grandfathered NICHT droppen (Backward-Compat).

BEGIN;

-- 1) Schema additiv
ALTER TABLE public.account_addons
  ADD COLUMN IF NOT EXISTS member_user_id uuid,   -- NULL = account-weit, gesetzt = einzelner User des Accounts
  ADD COLUMN IF NOT EXISTS billing_type   text,   -- stripe | grandfathered | comped | external
  ADD COLUMN IF NOT EXISTS granted_by     uuid,
  ADD COLUMN IF NOT EXISTS grant_reason   text;

-- Backfill billing_type: is_grandfathered→grandfathered, stripe_item→stripe, sonst→stripe (aus Checkout)
UPDATE public.account_addons SET billing_type = CASE
  WHEN is_grandfathered THEN 'grandfathered'
  WHEN stripe_subscription_item_id IS NOT NULL THEN 'stripe'
  ELSE 'stripe' END
WHERE billing_type IS NULL;

ALTER TABLE public.account_addons DROP CONSTRAINT IF EXISTS account_addons_billing_type_check;
ALTER TABLE public.account_addons ADD CONSTRAINT account_addons_billing_type_check
  CHECK (billing_type IN ('stripe','grandfathered','comped','external'));

-- Alte (account_id, addon_id)-Unique blockt Member+Account-weit-Koexistenz → durch partielle Indexe ersetzen.
ALTER TABLE public.account_addons DROP CONSTRAINT IF EXISTS account_addons_account_id_addon_id_key;
DROP INDEX IF EXISTS public.account_addons_active_uniq;
-- Account-weit: max. 1 Zeile pro (account, addon) mit member NULL — Ziel für den Stripe-Upsert-ON-CONFLICT.
CREATE UNIQUE INDEX IF NOT EXISTS account_addons_accountwide_uniq
  ON public.account_addons (account_id, addon_id) WHERE member_user_id IS NULL;
-- Member: max. 1 AKTIVER Grant pro (account, addon, member).
CREATE UNIQUE INDEX IF NOT EXISTS account_addons_member_active_uniq
  ON public.account_addons (account_id, addon_id, member_user_id) WHERE member_user_id IS NOT NULL AND status = 'active';

-- 2) i_have_addon MEMBER-AWARE (account-weit ODER member=auth.uid()). Bestehende Grants (member NULL) → identisch.
CREATE OR REPLACE FUNCTION public.i_have_addon(p_slug text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_account_id uuid; v_count integer;
BEGIN
  SELECT t.account_id INTO v_account_id
  FROM public.teams t JOIN public.team_members tm ON tm.team_id = t.id
  LEFT JOIN public.user_preferences up ON up.user_id = auth.uid()
  WHERE tm.user_id = auth.uid() AND t.account_id IS NOT NULL
    AND (up.active_team_id IS NULL OR up.active_team_id = t.id)
  ORDER BY (up.active_team_id = t.id) DESC NULLS LAST, t.created_at ASC LIMIT 1;
  IF v_account_id IS NULL THEN RETURN false; END IF;
  SELECT count(*) INTO v_count
  FROM public.account_addons aa JOIN public.addons a ON a.id = aa.addon_id
  WHERE aa.account_id = v_account_id AND a.slug = p_slug AND aa.status = 'active'
    AND (aa.member_user_id IS NULL OR aa.member_user_id = auth.uid());
  RETURN v_count > 0;
END; $$;

-- 3) Member-aware Runner-Gate (Team→Account; account-weit ODER member=p_user_id). Account-weit = identisch zu team_has_addon.
CREATE OR REPLACE FUNCTION public.team_member_has_addon(p_team_id uuid, p_user_id uuid, p_slug text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.account_addons aa
    JOIN public.addons a ON a.id = aa.addon_id
    JOIN public.teams  t ON t.account_id = aa.account_id
    WHERE t.id = p_team_id AND a.slug = p_slug AND aa.status = 'active'
      AND (aa.current_period_end IS NULL OR aa.current_period_end > now())
      AND (aa.member_user_id IS NULL OR aa.member_user_id = p_user_id)
  );
$$;
GRANT EXECUTE ON FUNCTION public.team_member_has_addon(uuid, uuid, text) TO service_role, authenticated;

-- 4) Admin-RPCs (is_leadesk_admin-Guard + Reason-Pflicht + Audit)
CREATE OR REPLACE FUNCTION public.admin_grant_addon(p_account_id uuid, p_addon_key text, p_member_user_id uuid, p_billing_type text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_admin uuid := auth.uid(); v_addon_id uuid; v_id uuid;
BEGIN
  IF v_admin IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN RAISE EXCEPTION 'Reason required (min 10 Zeichen)'; END IF;
  IF p_billing_type NOT IN ('comped','external') THEN RAISE EXCEPTION 'billing_type muss comped oder external sein'; END IF;
  SELECT id INTO v_addon_id FROM public.addons WHERE slug = p_addon_key;
  IF v_addon_id IS NULL THEN RAISE EXCEPTION 'Addon not found: %', p_addon_key; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_account_id) THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF p_member_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.team_members tm JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = p_member_user_id AND t.account_id = p_account_id
  ) THEN RAISE EXCEPTION 'Member gehört nicht zum Account'; END IF;
  INSERT INTO public.account_addons (account_id, addon_id, member_user_id, status, billing_type, is_grandfathered, granted_by, grant_reason, activated_at)
  VALUES (p_account_id, v_addon_id, p_member_user_id, 'active', p_billing_type, false, v_admin, p_reason, now())
  RETURNING id INTO v_id;
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, after_value, reason)
  VALUES (v_admin, 'grant_addon', 'account_addons', v_id,
    jsonb_build_object('account_id', p_account_id, 'addon', p_addon_key, 'member_user_id', p_member_user_id, 'billing_type', p_billing_type), p_reason);
  RETURN jsonb_build_object('id', v_id, 'ok', true);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_revoke_addon(p_account_addon_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_admin uuid := auth.uid(); v_row public.account_addons%ROWTYPE;
BEGIN
  IF v_admin IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN RAISE EXCEPTION 'Reason required (min 10 Zeichen)'; END IF;
  SELECT * INTO v_row FROM public.account_addons WHERE id = p_account_addon_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_addon not found'; END IF;
  UPDATE public.account_addons SET status = 'canceled', canceled_at = now() WHERE id = p_account_addon_id;
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, before_value, reason)
  VALUES (v_admin, 'revoke_addon', 'account_addons', p_account_addon_id,
    jsonb_build_object('account_id', v_row.account_id, 'addon_id', v_row.addon_id, 'member_user_id', v_row.member_user_id, 'billing_type', v_row.billing_type), p_reason);
  RETURN jsonb_build_object('ok', true);
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_grant_addon(uuid, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_addon(uuid, text) TO authenticated;

-- 5) READ-RPC erweitern um id (Row-ID für Row-basierten Revoke) + member + billing_type (DROP wegen Signatur-Änderung)
DROP FUNCTION IF EXISTS public.admin_get_account_addons(uuid);
CREATE FUNCTION public.admin_get_account_addons(p_account_id uuid)
RETURNS TABLE(id uuid, addon_id uuid, slug text, name text, type text, status text,
              activated_at timestamptz, canceled_at timestamptz, is_grandfathered boolean,
              stripe_subscription_id text, current_period_end timestamptz,
              member_user_id uuid, member_email text, billing_type text, grant_reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth','pg_temp' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required'; END IF;
  RETURN QUERY
  SELECT aa.id, a.id, a.slug, a.name, a.type, aa.status, aa.activated_at, aa.canceled_at,
         aa.is_grandfathered, aa.stripe_subscription_id, aa.current_period_end,
         aa.member_user_id, u.email::text, aa.billing_type, aa.grant_reason
  FROM public.account_addons aa
  JOIN public.addons a ON a.id = aa.addon_id
  LEFT JOIN auth.users u ON u.id = aa.member_user_id
  WHERE aa.account_id = p_account_id
  ORDER BY aa.status, a.sort_order, a.slug;
END; $$;

-- 6) Stripe-Upsert an die member-aware Welt anpassen: setzt billing_type='stripe',
--    ON CONFLICT auf den account-weiten Partial-Index (member_user_id IS NULL). Sonst NULL billing_type → Quantity-Sync skippt.
CREATE OR REPLACE FUNCTION public.upsert_account_addon_from_stripe(p_account_id uuid, p_addon_id uuid, p_status text, p_stripe_subscription_id text, p_stripe_subscription_item_id text, p_current_period_end timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.account_addons (account_id, addon_id, member_user_id, status, stripe_subscription_id, stripe_subscription_item_id, current_period_end, activated_at, canceled_at, is_grandfathered, billing_type)
  VALUES (p_account_id, p_addon_id, NULL, p_status, p_stripe_subscription_id, p_stripe_subscription_item_id, p_current_period_end, now(),
          CASE WHEN p_status = 'canceled' THEN now() ELSE NULL END, false, 'stripe')
  ON CONFLICT (account_id, addon_id) WHERE member_user_id IS NULL DO UPDATE
    SET status                      = EXCLUDED.status,
        stripe_subscription_id      = COALESCE(EXCLUDED.stripe_subscription_id, public.account_addons.stripe_subscription_id),
        stripe_subscription_item_id = COALESCE(EXCLUDED.stripe_subscription_item_id, public.account_addons.stripe_subscription_item_id),
        current_period_end          = EXCLUDED.current_period_end,
        canceled_at                 = CASE WHEN EXCLUDED.status = 'canceled' THEN now() ELSE public.account_addons.canceled_at END,
        updated_at                  = now(),
        is_grandfathered            = false,
        billing_type                = 'stripe'
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

COMMIT;

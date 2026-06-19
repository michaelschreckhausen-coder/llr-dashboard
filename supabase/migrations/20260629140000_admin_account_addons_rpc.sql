-- 20260629140000_admin_account_addons_rpc.sql
-- Phase 4c — Admin-Sicht auf die Add-ons eines Accounts (leadesk-admin, AccountDetail-Tab).
--   admin_get_account_addons(p_account_id)  → READ: account_addons × addons-JOIN
--   admin_revoke_account_addon(p_account_id, p_addon_id, p_reason) → status='canceled'
--     + canceled_at + Audit-Log (Reason ≥10 Zeichen, Pattern admin_account_set_plan).
-- Gate: auth.uid() + is_leadesk_admin-JWT-Claim (CLAUDE.md #9). SECURITY DEFINER.
-- 4c setzt nur den DB-Status (status='canceled'). Stripe-Sub-Cancel = 4d (Sync-Dashboard).

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_get_account_addons(p_account_id uuid)
 RETURNS TABLE(
   addon_id uuid, slug text, name text, type text,
   status text, activated_at timestamptz, canceled_at timestamptz,
   is_grandfathered boolean, stripe_subscription_id text, current_period_end timestamptz
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
  END IF;

  RETURN QUERY
  SELECT a.id, a.slug, a.name, a.type,
         aa.status, aa.activated_at, aa.canceled_at,
         aa.is_grandfathered, aa.stripe_subscription_id, aa.current_period_end
  FROM public.account_addons aa
  JOIN public.addons a ON a.id = aa.addon_id
  WHERE aa.account_id = p_account_id
  ORDER BY aa.status, a.sort_order, a.slug;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_revoke_account_addon(p_account_id uuid, p_addon_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_admin_id uuid := auth.uid();
  v_aa       public.account_addons%ROWTYPE;
  v_slug     text;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason required (mindestens 10 Zeichen)';
  END IF;

  SELECT * INTO v_aa FROM public.account_addons
  WHERE account_id = p_account_id AND addon_id = p_addon_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activation not found for account % / addon %', p_account_id, p_addon_id;
  END IF;

  SELECT slug INTO v_slug FROM public.addons WHERE id = p_addon_id;

  UPDATE public.account_addons
  SET status = 'canceled', canceled_at = now(), updated_at = now()
  WHERE id = v_aa.id;

  INSERT INTO public.admin_audit_log (
    admin_user_id, action, target_table, target_id,
    field_name, before_value, after_value, reason
  ) VALUES (
    v_admin_id, 'addon_revoke', 'account_addons', v_aa.id,
    'status',
    jsonb_build_object('status', v_aa.status, 'addon_slug', v_slug),
    jsonb_build_object('status', 'canceled', 'addon_slug', v_slug),
    p_reason
  );

  RETURN jsonb_build_object('ok', true, 'account_id', p_account_id, 'addon_id', p_addon_id, 'status', 'canceled');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_get_account_addons(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_account_addon(uuid, uuid, text) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

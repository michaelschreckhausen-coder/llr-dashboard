-- 20260629170000_stripe_sync_audit_rpcs.sql
-- Phase 4d — Stripe-Sync-Status-Dashboard (leadesk-admin, MarketplaceStripeSyncTab).
--   admin_get_stripe_sync_rows()
--     → READ: alle Pattern-C account_addons (addons.stripe_price_id IS NOT NULL)
--       × accounts × addons. Reine DB-Sicht (KEIN Stripe-Call) — Basis für den
--       Initial-Render und für den Drift-Merge nach EF-Live-Sync.
--   admin_heal_addon_sync(p_account_addon_id, p_new_status, p_reason)
--     → UPDATE account_addons.status auf die Stripe-Wahrheit + canceled_at-Pflege
--       + admin_audit_log (action='stripe_drift_healed', before/after-status).
--       Reason ≥10 Zeichen, p_new_status gegen CHECK-Allowlist validiert.
-- Gate: is_leadesk_admin-JWT-Claim (CLAUDE.md #9). SECURITY DEFINER, search_path
-- inkl. auth (auth.jwt()/auth.uid()). Owner-JOIN via accounts (Prod hat KEIN owner_id).
-- Pattern-C := addons.stripe_price_id IS NOT NULL (Konvention aus cancel_addon_rpc /
-- MarketplaceCard.jsx hasStripe). Die Drift-Klassifikation (none/orange/unlinked/red)
-- passiert in der EF admin-stripe-sync-audit, NICHT hier — diese RPC liefert nur Rohdaten.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_get_stripe_sync_rows()
 RETURNS TABLE(
   account_addon_id uuid, account_id uuid, account_name text,
   addon_slug text, addon_name text,
   db_status text, stripe_subscription_id text,
   current_period_end timestamptz, is_grandfathered boolean
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
  END IF;

  RETURN QUERY
  SELECT aa.id, a.id, a.name,
         ad.slug, ad.name,
         aa.status, aa.stripe_subscription_id,
         aa.current_period_end, aa.is_grandfathered
  FROM public.account_addons aa
  JOIN public.addons ad ON ad.id = aa.addon_id
  JOIN public.accounts a ON a.id = aa.account_id
  WHERE ad.stripe_price_id IS NOT NULL          -- Pattern C: nur Stripe-managte Add-ons
  ORDER BY a.name, ad.slug;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_heal_addon_sync(
  p_account_addon_id uuid,
  p_new_status text,
  p_reason text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_admin_id uuid := auth.uid();
  v_aa       public.account_addons%ROWTYPE;
  v_slug     text;
  v_new_canceled_at timestamptz;
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
  IF p_new_status IS NULL OR p_new_status NOT IN ('active','past_due','canceled','paused','pending') THEN
    RAISE EXCEPTION 'Invalid status %, allowed: active/past_due/canceled/paused/pending', p_new_status;
  END IF;

  SELECT * INTO v_aa FROM public.account_addons WHERE id = p_account_addon_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'account_addon % not found', p_account_addon_id;
  END IF;

  IF v_aa.status = p_new_status THEN
    RAISE EXCEPTION 'account_addon % already has status %', p_account_addon_id, p_new_status;
  END IF;

  SELECT slug INTO v_slug FROM public.addons WHERE id = v_aa.addon_id;

  -- canceled_at folgt dem Zielstatus: gesetzt beim Kündigen, geleert beim Reaktivieren.
  v_new_canceled_at := CASE WHEN p_new_status = 'canceled' THEN now() ELSE NULL END;

  UPDATE public.account_addons
  SET status      = p_new_status,
      canceled_at = v_new_canceled_at,
      updated_at  = now()
  WHERE id = v_aa.id;

  INSERT INTO public.admin_audit_log (
    admin_user_id, action, target_table, target_id,
    field_name, before_value, after_value, reason
  ) VALUES (
    v_admin_id, 'stripe_drift_healed', 'account_addons', v_aa.id,
    'status',
    jsonb_build_object('status', v_aa.status, 'addon_slug', v_slug, 'account_id', v_aa.account_id),
    jsonb_build_object('status', p_new_status, 'addon_slug', v_slug, 'account_id', v_aa.account_id),
    p_reason
  );

  RETURN jsonb_build_object(
    'ok', true,
    'account_addon_id', v_aa.id,
    'before_status', v_aa.status,
    'after_status', p_new_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_stripe_sync_rows() FROM public;
REVOKE ALL ON FUNCTION public.admin_heal_addon_sync(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_stripe_sync_rows() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_heal_addon_sync(uuid, text, text) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

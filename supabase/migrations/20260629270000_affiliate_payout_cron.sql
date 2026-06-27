-- 20260629270000_affiliate_payout_cron.sql
-- Affiliate-System Phase 6 — Monthly-Payout-Cron + Dashboard-Read.
-- Cron → SQL-Fn (liest app.service_role_key-GUC) → net.http_post an EF
-- affiliate-payout-monthly (Pattern wie send_daily_task_digest_cron). Die
-- eigentliche Payout-Logik (Stripe-Transfers) liegt in der EF. Admin-Force-Payout
-- ruft die EF direkt (kein RPC — Transfer geht eh nur in der EF).

BEGIN;

-- 1. Affiliate-Dashboard: eigene Payout-Historie
CREATE OR REPLACE FUNCTION public.get_my_affiliate_payouts()
 RETURNS TABLE(
   id uuid, period_start date, period_end date, total_amount_cents bigint,
   status text, stripe_transfer_id text, failure_reason text,
   created_at timestamptz, paid_at timestamptz
 )
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_aff uuid;
BEGIN
  SELECT a.id INTO v_aff FROM public.affiliates a WHERE a.user_id = auth.uid() LIMIT 1;
  IF v_aff IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT p.id, p.period_start, p.period_end, p.total_amount_cents,
         p.status, p.stripe_transfer_id, p.failure_reason, p.created_at, p.paid_at
  FROM public.affiliate_payouts p
  WHERE p.affiliate_id = v_aff
  ORDER BY p.created_at DESC;
END;
$function$;

-- 2. Cron-Trigger-Fn → EF (service-role-Bearer aus GUC)
CREATE OR REPLACE FUNCTION public.affiliate_payout_monthly_cron()
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_svc_key text := current_setting('app.service_role_key', true);
  v_req_id  bigint;
BEGIN
  IF v_svc_key IS NULL OR length(v_svc_key) < 20 THEN
    RAISE WARNING 'affiliate_payout_monthly_cron: app.service_role_key not set';
    RETURN jsonb_build_object('error', 'no_service_role_key');
  END IF;
  SELECT net.http_post(
    url     := 'http://kong:8000/functions/v1/affiliate-payout-monthly',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_svc_key),
    body    := '{}'::jsonb
  ) INTO v_req_id;
  RETURN jsonb_build_object('ok', true, 'request_id', v_req_id);
END;
$function$;

-- 3. Schedule: 1. jedes Monats 09:00 Server-TZ (≈10:00 Berlin im Sommer)
SELECT cron.schedule('affiliate_payout_monthly', '0 9 1 * *', $cron$SELECT public.affiliate_payout_monthly_cron();$cron$);

REVOKE ALL ON FUNCTION public.get_my_affiliate_payouts() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_affiliate_payouts() TO authenticated;
-- affiliate_payout_monthly_cron läuft als Job-Owner (supabase_admin), kein Grant nötig.

COMMIT;

NOTIFY pgrst, 'reload schema';

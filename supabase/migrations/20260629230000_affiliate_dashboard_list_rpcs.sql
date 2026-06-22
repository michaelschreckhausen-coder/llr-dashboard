-- 20260629230000_affiliate_dashboard_list_rpcs.sql
-- Affiliate-System Phase 4 — 3 Listen-RPCs fürs affiliate.leadesk.de Dashboard.
-- Alle SECURITY DEFINER, Caller-Affiliate via affiliates.user_id = auth.uid().
--
-- DSGVO: KEINE Customer-PII an den Affiliate. Clicks ohne ip_hash/ua_hash;
-- Conversions/Commissions nur mit anonymized_customer_label =
--   'Kunde #' || left(md5(user_id || salt), 6)  → stabiles Pseudonym, nicht reversibel,
-- konsistent über beide Listen (gleicher Salt+Algo). md5 = built-in (kein pgcrypto).
-- stripe_invoice_id wird NICHT exponiert (Stripe-Internal).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_affiliate_clicks(p_limit int DEFAULT 50, p_offset int DEFAULT 0)
 RETURNS TABLE(created_at timestamptz, code text, utm_source text, utm_medium text, utm_campaign text, landed_at_url text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_aff uuid;
BEGIN
  SELECT a.id INTO v_aff FROM public.affiliates a WHERE a.user_id = auth.uid() LIMIT 1;
  IF v_aff IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT c.created_at, c.code, c.utm_source, c.utm_medium, c.utm_campaign, c.landed_at_url
  FROM public.affiliate_clicks c
  WHERE c.affiliate_id = v_aff
  ORDER BY c.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 50), 0) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_affiliate_conversions_list(p_limit int DEFAULT 50, p_offset int DEFAULT 0)
 RETURNS TABLE(id uuid, signup_at timestamptz, first_paid_at timestamptz, status text,
               commission_rate_bps_snapshot int, commission_end_at timestamptz, anonymized_customer_label text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_aff uuid;
BEGIN
  SELECT a.id INTO v_aff FROM public.affiliates a WHERE a.user_id = auth.uid() LIMIT 1;
  IF v_aff IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT c.id, c.signup_at, c.first_paid_at, c.status,
         c.commission_rate_bps_snapshot, c.commission_end_at,
         'Kunde #' || left(md5(c.user_id::text || 'aff-salt-2026'), 6)
  FROM public.affiliate_conversions c
  WHERE c.affiliate_id = v_aff
  ORDER BY c.signup_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 50), 0) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_affiliate_commission_events_list(p_limit int DEFAULT 50, p_offset int DEFAULT 0)
 RETURNS TABLE(id uuid, conversion_anonymized_label text, payment_amount_cents bigint,
               commission_amount_cents bigint, status text, paid_at timestamptz, payout_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_aff uuid;
BEGIN
  SELECT a.id INTO v_aff FROM public.affiliates a WHERE a.user_id = auth.uid() LIMIT 1;
  IF v_aff IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT e.id,
         'Kunde #' || left(md5(cv.user_id::text || 'aff-salt-2026'), 6),
         e.payment_amount_cents, e.commission_amount_cents, e.status, e.paid_at, e.payout_id
  FROM public.affiliate_commission_events e
  JOIN public.affiliate_conversions cv ON cv.id = e.conversion_id
  WHERE e.affiliate_id = v_aff
  ORDER BY e.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 50), 0) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_affiliate_clicks(int, int) FROM public;
REVOKE ALL ON FUNCTION public.get_my_affiliate_conversions_list(int, int) FROM public;
REVOKE ALL ON FUNCTION public.get_my_affiliate_commission_events_list(int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_affiliate_clicks(int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_affiliate_conversions_list(int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_affiliate_commission_events_list(int, int) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

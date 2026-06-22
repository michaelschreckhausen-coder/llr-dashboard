-- 20260629200000_affiliate_system_schema.sql
-- Affiliate-System Phase 1 — 5 Tabellen + 5 RPCs + RLS + Indexes + Grants.
-- Konzept: docs/architecture/affiliate-system.md (§4 Schema, §5 Flows, §7 Self-Referral).
--
-- Design-Invarianten:
--   * Writes NUR über SECURITY-DEFINER-RPCs → authenticated/anon haben SELECT (RLS-gefiltert),
--     aber kein INSERT/UPDATE/DELETE (REVOKE). Verhindert Tampering an commission_rate_bps etc.
--   * Self-Host-GRANTs (CLAUDE.md #3/#12): explizit SELECT→authenticated + ALL→service_role
--     (sonst 403/Silent-NULL bei EF-service-role-Reads in Phase 3/6).
--   * is_leadesk_admin-JWT-Claim als Admin-Authority (CLAUDE.md #9).
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS / CREATE OR REPLACE).

BEGIN;

-- =====================================================================
-- 1. TABELLEN
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.affiliates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',         -- pending|active|suspended|closed
  commission_rate_bps int NOT NULL DEFAULT 2000,  -- 2000 = 20.00%
  commission_duration_months int NOT NULL DEFAULT 12,
  stripe_connect_account_id text,
  stripe_connect_charges_enabled boolean DEFAULT false,
  stripe_connect_payouts_enabled boolean DEFAULT false,
  total_clicks int DEFAULT 0,
  total_conversions int DEFAULT 0,
  total_earnings_cents bigint DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  CONSTRAINT affiliates_status_chk CHECK (status IN ('pending','active','suspended','closed')),
  CONSTRAINT affiliates_rate_chk CHECK (commission_rate_bps BETWEEN 0 AND 10000)
);

CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  code text NOT NULL,
  ip_hash text,
  ua_hash text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  landed_at_url text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.affiliate_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  account_id uuid REFERENCES public.accounts(id),
  code_used text NOT NULL,
  signup_at timestamptz NOT NULL DEFAULT now(),
  first_paid_at timestamptz,
  status text NOT NULL DEFAULT 'pending_payment',
    -- pending_payment|pending_confirm|confirmed|refunded|rejected_self_referral
  commission_rate_bps_snapshot int NOT NULL,
  commission_end_at timestamptz,
  click_id uuid REFERENCES public.affiliate_clicks(id),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT affiliate_conversions_status_chk CHECK (status IN
    ('pending_payment','pending_confirm','confirmed','refunded','rejected_self_referral'))
);

CREATE TABLE IF NOT EXISTS public.affiliate_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_amount_cents bigint NOT NULL,
  stripe_transfer_id text UNIQUE,
  status text NOT NULL DEFAULT 'pending',          -- pending|paid|failed
  failure_reason text,
  triggered_by uuid REFERENCES auth.users(id),     -- null = pg_cron, uuid = Admin
  created_at timestamptz DEFAULT now(),
  paid_at timestamptz,
  CONSTRAINT affiliate_payouts_status_chk CHECK (status IN ('pending','paid','failed'))
);

CREATE TABLE IF NOT EXISTS public.affiliate_commission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversion_id uuid NOT NULL REFERENCES public.affiliate_conversions(id),
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id),
  stripe_invoice_id text NOT NULL UNIQUE,          -- Idempotenz: 1 Event pro Invoice
  payment_amount_cents bigint NOT NULL,
  commission_amount_cents bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',           -- pending|paid|clawed_back
  paid_at timestamptz,
  payout_id uuid REFERENCES public.affiliate_payouts(id),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT affiliate_commission_events_status_chk CHECK (status IN ('pending','paid','clawed_back'))
);

-- =====================================================================
-- 2. INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_affiliates_code ON public.affiliates(code) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_affiliates_user ON public.affiliates(user_id);
CREATE INDEX IF NOT EXISTS idx_clicks_affiliate ON public.affiliate_clicks(affiliate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversions_affiliate ON public.affiliate_conversions(affiliate_id, status);
CREATE INDEX IF NOT EXISTS idx_conversions_user ON public.affiliate_conversions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversions_user_unique ON public.affiliate_conversions(user_id);
CREATE INDEX IF NOT EXISTS idx_commission_events_affiliate ON public.affiliate_commission_events(affiliate_id, status);

-- =====================================================================
-- 3. RLS — SELECT-only (own + admin); clicks admin-only (PII). Writes via RPCs.
-- =====================================================================

ALTER TABLE public.affiliates                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_clicks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_conversions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_commission_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_payouts          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS affiliates_select_own_or_admin ON public.affiliates;
CREATE POLICY affiliates_select_own_or_admin ON public.affiliates FOR SELECT
  USING (user_id = auth.uid()
         OR COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false));

DROP POLICY IF EXISTS affiliate_clicks_select_admin ON public.affiliate_clicks;
CREATE POLICY affiliate_clicks_select_admin ON public.affiliate_clicks FOR SELECT
  USING (COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false));

DROP POLICY IF EXISTS affiliate_conversions_select_own_or_admin ON public.affiliate_conversions;
CREATE POLICY affiliate_conversions_select_own_or_admin ON public.affiliate_conversions FOR SELECT
  USING (affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid())
         OR COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false));

DROP POLICY IF EXISTS affiliate_commission_events_select_own_or_admin ON public.affiliate_commission_events;
CREATE POLICY affiliate_commission_events_select_own_or_admin ON public.affiliate_commission_events FOR SELECT
  USING (affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid())
         OR COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false));

DROP POLICY IF EXISTS affiliate_payouts_select_own_or_admin ON public.affiliate_payouts;
CREATE POLICY affiliate_payouts_select_own_or_admin ON public.affiliate_payouts FOR SELECT
  USING (affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid())
         OR COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false));

-- =====================================================================
-- 4. GRANTS (Self-Host: explizit, sonst 403/Silent-NULL — CLAUDE.md #3/#12)
-- =====================================================================

GRANT SELECT ON public.affiliates, public.affiliate_clicks, public.affiliate_conversions,
                public.affiliate_commission_events, public.affiliate_payouts TO authenticated;

-- Writes NIE direkt: nur SECURITY-DEFINER-RPCs (laufen als owner).
REVOKE INSERT, UPDATE, DELETE ON public.affiliates, public.affiliate_clicks,
       public.affiliate_conversions, public.affiliate_commission_events,
       public.affiliate_payouts FROM authenticated;

-- service_role für EF-Reads/Writes (Phase 3 Webhook, Phase 6 Payout).
GRANT ALL ON public.affiliates, public.affiliate_clicks, public.affiliate_conversions,
              public.affiliate_commission_events, public.affiliate_payouts TO service_role;

-- =====================================================================
-- 5. RPCs (alle SECURITY DEFINER)
-- =====================================================================

-- 5.1 register_affiliate_click — public/anon callable (Edge-Function), liefert click_id (oder NULL).
CREATE OR REPLACE FUNCTION public.register_affiliate_click(
  p_code text, p_ip_hash text, p_ua_hash text,
  p_utm_source text, p_utm_medium text, p_utm_campaign text, p_landed_at_url text
) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_aff_id uuid;
  v_click_id uuid;
BEGIN
  SELECT id INTO v_aff_id FROM public.affiliates WHERE code = p_code AND status = 'active';
  IF v_aff_id IS NULL THEN
    RETURN NULL;  -- unbekannter/inaktiver Code → kein Error, einfach kein Tracking
  END IF;

  INSERT INTO public.affiliate_clicks (affiliate_id, code, ip_hash, ua_hash,
         utm_source, utm_medium, utm_campaign, landed_at_url)
  VALUES (v_aff_id, p_code, p_ip_hash, p_ua_hash,
          p_utm_source, p_utm_medium, p_utm_campaign, p_landed_at_url)
  RETURNING id INTO v_click_id;

  UPDATE public.affiliates SET total_clicks = total_clicks + 1 WHERE id = v_aff_id;
  RETURN v_click_id;
END;
$function$;

-- 5.2 attach_conversion_to_signup — aus handle_new_user-Trigger (Phase 2/3-Wiring).
--     Self-Referral-Block via Email-Match; UNIQUE(user_id) → ein Affiliate pro Customer.
CREATE OR REPLACE FUNCTION public.attach_conversion_to_signup(
  p_user_id uuid, p_code text, p_click_id uuid
) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_aff       public.affiliates%ROWTYPE;
  v_new_email text;
  v_aff_email text;
  v_account   uuid;
  v_status    text;
  v_conv_id   uuid;
BEGIN
  SELECT * INTO v_aff FROM public.affiliates WHERE code = p_code AND status = 'active';
  IF v_aff.id IS NULL THEN
    RETURN false;  -- unbekannter Code
  END IF;

  SELECT lower(email) INTO v_new_email FROM auth.users WHERE id = p_user_id;
  SELECT lower(email) INTO v_aff_email FROM auth.users WHERE id = v_aff.user_id;

  IF v_new_email IS NOT NULL AND v_new_email = v_aff_email THEN
    v_status := 'rejected_self_referral';
  ELSE
    v_status := 'pending_payment';
  END IF;

  -- Account best-effort (kann NULL bleiben, ist nullable)
  SELECT t.account_id INTO v_account
  FROM public.teams t JOIN public.team_members tm ON tm.team_id = t.id
  WHERE tm.user_id = p_user_id AND t.account_id IS NOT NULL
  ORDER BY t.created_at ASC LIMIT 1;

  INSERT INTO public.affiliate_conversions (
    affiliate_id, user_id, account_id, code_used, status, commission_rate_bps_snapshot, click_id
  ) VALUES (
    v_aff.id, p_user_id, v_account, p_code, v_status, v_aff.commission_rate_bps, p_click_id
  )
  ON CONFLICT (user_id) DO NOTHING
  RETURNING id INTO v_conv_id;

  IF v_conv_id IS NULL THEN
    RETURN false;  -- Customer hatte schon eine Conversion (First-Touch gewinnt)
  END IF;

  IF v_status = 'rejected_self_referral' THEN
    RETURN false;
  END IF;

  UPDATE public.affiliates SET total_conversions = total_conversions + 1 WHERE id = v_aff.id;
  RETURN true;
END;
$function$;

-- 5.3 confirm_conversion — pg_cron / service_role / admin: flippt pending_confirm → confirmed
--     nach Ablauf des 14d-Refund-Windows.
CREATE OR REPLACE FUNCTION public.confirm_conversion(p_conversion_id uuid)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  IF NOT (
    COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false)
    OR current_user IN ('postgres', 'supabase_admin', 'service_role')
  ) THEN
    RAISE EXCEPTION 'Not authorized: confirm_conversion is service_role/admin-only';
  END IF;

  UPDATE public.affiliate_conversions
  SET status = 'confirmed'
  WHERE id = p_conversion_id
    AND status = 'pending_confirm'
    AND first_paid_at < now() - INTERVAL '14 days';
END;
$function$;

-- 5.4 admin_set_affiliate_commission_rate — is_leadesk_admin, Reason ≥10, Audit.
--     Ändert nur künftige Conversions (Bestehende behalten commission_rate_bps_snapshot).
CREATE OR REPLACE FUNCTION public.admin_set_affiliate_commission_rate(
  p_affiliate_id uuid, p_rate_bps int, p_reason text
) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_old   int;
BEGIN
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason required (mindestens 10 Zeichen)';
  END IF;
  IF p_rate_bps IS NULL OR p_rate_bps < 0 OR p_rate_bps > 10000 THEN
    RAISE EXCEPTION 'rate_bps must be 0..10000 (got %)', p_rate_bps;
  END IF;

  SELECT commission_rate_bps INTO v_old FROM public.affiliates WHERE id = p_affiliate_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'affiliate % not found', p_affiliate_id;
  END IF;

  UPDATE public.affiliates SET commission_rate_bps = p_rate_bps WHERE id = p_affiliate_id;

  INSERT INTO public.admin_audit_log (
    admin_user_id, action, target_table, target_id, field_name, before_value, after_value, reason
  ) VALUES (
    v_admin, 'affiliate_rate_changed', 'affiliates', p_affiliate_id, 'commission_rate_bps',
    jsonb_build_object('commission_rate_bps', v_old),
    jsonb_build_object('commission_rate_bps', p_rate_bps),
    p_reason
  );
END;
$function$;

-- 5.5 get_my_affiliate_stats — Caller-Affiliate via auth.uid(), Dashboard-Aggregat.
CREATE OR REPLACE FUNCTION public.get_my_affiliate_stats()
 RETURNS TABLE(
   total_clicks bigint, total_conversions bigint,
   pending_conversions bigint, confirmed_conversions bigint,
   pending_earnings_cents bigint, paid_earnings_cents bigint,
   active_commission_period_count bigint
 )
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_aff_id uuid;
BEGIN
  SELECT id INTO v_aff_id FROM public.affiliates WHERE user_id = auth.uid() LIMIT 1;
  IF v_aff_id IS NULL THEN
    RETURN;  -- kein Affiliate für diesen User
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.affiliate_clicks WHERE affiliate_id = v_aff_id),
    (SELECT count(*) FROM public.affiliate_conversions WHERE affiliate_id = v_aff_id),
    (SELECT count(*) FROM public.affiliate_conversions
       WHERE affiliate_id = v_aff_id AND status IN ('pending_payment','pending_confirm')),
    (SELECT count(*) FROM public.affiliate_conversions
       WHERE affiliate_id = v_aff_id AND status = 'confirmed'),
    COALESCE((SELECT sum(commission_amount_cents) FROM public.affiliate_commission_events
       WHERE affiliate_id = v_aff_id AND status = 'pending'), 0)::bigint,
    COALESCE((SELECT sum(commission_amount_cents) FROM public.affiliate_commission_events
       WHERE affiliate_id = v_aff_id AND status = 'paid'), 0)::bigint,
    (SELECT count(*) FROM public.affiliate_conversions
       WHERE affiliate_id = v_aff_id AND commission_end_at > now());
END;
$function$;

-- =====================================================================
-- 6. RPC-GRANTS
-- =====================================================================

REVOKE ALL ON FUNCTION public.register_affiliate_click(text,text,text,text,text,text,text) FROM public;
REVOKE ALL ON FUNCTION public.attach_conversion_to_signup(uuid,text,uuid) FROM public;
REVOKE ALL ON FUNCTION public.confirm_conversion(uuid) FROM public;
REVOKE ALL ON FUNCTION public.admin_set_affiliate_commission_rate(uuid,int,text) FROM public;
REVOKE ALL ON FUNCTION public.get_my_affiliate_stats() FROM public;

-- register_click: Edge-Function callt mit anon-Key → anon + authenticated.
GRANT EXECUTE ON FUNCTION public.register_affiliate_click(text,text,text,text,text,text,text) TO anon, authenticated;
-- attach: aus Signup-Trigger (definer-Kontext) + service_role.
GRANT EXECUTE ON FUNCTION public.attach_conversion_to_signup(uuid,text,uuid) TO anon, authenticated, service_role;
-- confirm: nur Cron/service_role/admin (Body gated zusätzlich).
GRANT EXECUTE ON FUNCTION public.confirm_conversion(uuid) TO authenticated, service_role;
-- admin-rate: authenticated (Body prüft is_leadesk_admin).
GRANT EXECUTE ON FUNCTION public.admin_set_affiliate_commission_rate(uuid,int,text) TO authenticated;
-- stats: Affiliate-Dashboard.
GRANT EXECUTE ON FUNCTION public.get_my_affiliate_stats() TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

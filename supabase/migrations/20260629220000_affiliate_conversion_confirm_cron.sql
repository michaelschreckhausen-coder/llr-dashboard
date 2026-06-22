-- 20260629220000_affiliate_conversion_confirm_cron.sql
-- Affiliate-System Phase 3 — täglicher Confirm-Sweep.
-- Flippt Conversions pending_confirm → confirmed nach Ablauf des 14d-Refund-Windows,
-- ausser es gibt einen Clawback (refundetes Commission-Event) für die Conversion.
--
-- pg_cron 1.6 auf Prod installiert (Pre-Flight). cron.schedule(name,...) upsertet
-- by name → idempotent. Läuft in Server-TZ (UTC) — ~04:00 Berlin, low-traffic.
-- Job läuft als supabase_admin → confirm_conversion (SECURITY DEFINER) passt.

BEGIN;

SELECT cron.schedule(
  'affiliate_confirm_conversions_daily',
  '0 3 * * *',
  $cron$
  SELECT public.confirm_conversion(id)
  FROM public.affiliate_conversions
  WHERE status = 'pending_confirm'
    AND first_paid_at < now() - interval '14 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.affiliate_commission_events ce
      WHERE ce.conversion_id = affiliate_conversions.id
        AND ce.status = 'clawed_back'
    );
  $cron$
);

COMMIT;

-- 20260518150000_marketplace_sevdesk_seed.sql
--
-- Marketplace — 4. Stub-Add-on: sevDesk-Integration.
--
-- Vorgänger-Migration 20260518140000 (Phase 0) ist bereits auf Staging applied
-- mit 3 Seeds (ai-boost, slack-integration, sales-nav-sync). Diese hier ergänzt
-- den 4. Seed atomar, ohne die Phase-0-Datei zu editieren (Migration-Files
-- sind nach Apply Append-only).
--
-- stripe_price_id bleibt NULL → Frontend rendert „Auf Warteliste"-Button.
-- Phase 2 (Stripe-Setup) wird die Spalte später per UPDATE setzen.
--
-- Workflow:
--   1. Auf Hetzner-Staging applien:
--        ssh root@178.104.210.216 'docker exec -i supabase-db psql -U postgres -d postgres' \
--          < supabase/migrations/20260518150000_marketplace_sevdesk_seed.sql
--   2. NOTIFY pgrst, 'reload schema'
--   3. Smoke: SELECT slug, name FROM addons WHERE slug = 'sevdesk-integration';
--   4. Erst nach Bestätigung: gleicher Apply auf Prod (128.140.123.163).

BEGIN;

INSERT INTO public.addons (
  slug, name, short_description, long_description, category, type,
  price_monthly_cents, currency, icon, highlight_color,
  features, ai_quota_increment, activates_modules, integration_config,
  is_active, is_featured, sort_order
) VALUES (
  'sevdesk-integration',
  'sevDesk-Integration',
  'Kunden und Rechnungen automatisch mit sevDesk synchronisieren',
  'Verbindet Leadesk mit deinem sevDesk-Konto. Gewonnene Deals legen automatisch Kunden + Angebote in sevDesk an, Rechnungs-Status fließt zurück ins CRM. OAuth-Login mit deinem sevDesk-Account, keine API-Keys im Klartext.',
  'integration',
  'integration',
  999, 'EUR', 'Receipt', '#76B729',
  '["Kunden-Sync aus gewonnenen Deals","Automatische Angebot-Erstellung","Rechnungs-Status zurück ins CRM","OAuth mit deinem sevDesk-Account"]'::jsonb,
  NULL, NULL,
  '{"provider":"sevdesk","oauth_scopes":["customers","invoices","offers"]}'::jsonb,
  true, true, 25
)
ON CONFLICT (slug) DO NOTHING;

COMMIT;

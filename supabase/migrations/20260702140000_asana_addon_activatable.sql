-- =====================================================================
-- Asana-Addon im Marketplace kostenlos aktivierbar machen (Phase 1)
-- Repo-Ziel: llr-dashboard/supabase/migrations/
-- Stand: 2026-07-02
--
-- Bisher war die Asana-Kachel (slug 'asana-integration', Seed
-- 20260629120000_marketplace_integrations_seed.sql) eine reine
-- Waitlist-Card: activates_modules = ARRAY[] und kein stripe_price_id
-- => Frontend rendert "Auf Warteliste".
--
-- Nach Instagram-Vorbild (20260701100000_instagram_addon_connections.sql)
-- wird die Kachel free-activatable: activates_modules nicht leer +
-- weiterhin kein stripe_price_id => Frontend rendert "Kostenlos aktivieren"
-- (isFreeActivatable = !hasStripe && activates_modules.length > 0).
--
-- Dediziertes Modul 'asana' (nicht 'delivery'), damit die Aktivierung
-- KEINE Delivery-Section freischaltet — sie ist reine Integrations-
-- Kennzeichnung in get_my_entitlements(). Kein Route-Gate hängt an 'asana'.
--
-- Preis bleibt price_monthly_cents = 900 hinterlegt (kostenfrei bis
-- 30.08.2026; danach greift ein Stripe-Preis / Feature-Flag). Solange
-- kein stripe_price_id gesetzt ist, zeigt die Karte "Kostenlos".
--
-- Idempotent: reines UPDATE auf die vorhandene Zeile.
-- =====================================================================

BEGIN;

UPDATE public.addons
   SET activates_modules = ARRAY['asana']::text[]
 WHERE slug = 'asana-integration';

COMMIT;

NOTIFY pgrst, 'reload schema';

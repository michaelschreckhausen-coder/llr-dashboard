-- 20260707120000_sales_nav_sync_price_9eur.sql
-- Sales-Nav-Sync — maßgeblicher Preis-Wert auf 9 €/Monat (900 Cent).
--
-- Autoritative Entscheidung (07.07.2026): sales-nav-sync ist kostenfrei bis
-- EINSCHLIESSLICH 31.08.2026. Der Preis-Switch auf 9 €/Monat wird zum
-- 01.09.2026 00:00 (Europe/Berlin) wirksam.
--
-- Diese Migration setzt den maßgeblichen Preis-Wert in der DB (Single Source of
-- Truth für den Betrag) von 2900 (Seed-Altwert 29 €) auf 900 (9 €). Der Seed
-- 20260518140000_marketplace_phase_0.sql legte sales-nav-sync mit 2900 an;
-- die Grandfather-Gate-Migration 20260629180000 nannte fälschlich „5€".
--
-- Kein User-sichtbarer Effekt beim Apply: solange addons.stripe_price_id IS NULL
-- ist und activates_modules nicht leer, rendert der Marketplace „Kostenlos"
-- (isFreeActivatable in MarketplaceCard.jsx). Der 9-€-Preis wird erst mit dem
-- Switch (stripe_price_id gesetzt) sichtbar/abgerechnet — geplant 01.09.2026 00:00.
--
-- Frontend-Frist-Texte lesen aus src/lib/addonPricing.js (SSOT). Es gibt bewusst
-- KEINE is_free_until-Spalte (siehe 20260628200000_strike2_zielgruppen_plus_schema.sql).
--
-- Idempotent: UPDATE per WHERE-Slug, Re-Apply ist ein No-Op.
--
-- Apply: ssh root@<server> 'docker exec -i supabase-db psql -U supabase_admin
--   -d postgres -v ON_ERROR_STOP=1' < this_file.sql

BEGIN;

UPDATE public.addons
   SET price_monthly_cents = 900,
       updated_at          = now()
 WHERE slug = 'sales-nav-sync'
   AND price_monthly_cents IS DISTINCT FROM 900;

-- Verifikation
DO $$
DECLARE
  v_cents integer;
BEGIN
  SELECT price_monthly_cents INTO v_cents
    FROM public.addons WHERE slug = 'sales-nav-sync';

  IF v_cents IS NULL THEN
    RAISE EXCEPTION 'sales-nav-sync-Addon nicht gefunden — Seed (marketplace_phase_0) fehlt auf dieser DB?';
  END IF;
  IF v_cents <> 900 THEN
    RAISE EXCEPTION 'sales-nav-sync price_monthly_cents ist %, erwartet 900', v_cents;
  END IF;

  RAISE NOTICE 'sales-nav-sync price_monthly_cents = 900 (9 €). Kostenfrei bis einschl. 31.08.2026, Switch 01.09.2026 00:00 Europe/Berlin.';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

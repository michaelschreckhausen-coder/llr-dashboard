-- 20260608120000_auralis_addon_marketplace.sql
-- Sprint N.1 — Auralis "KI-Sichtbarkeit" als Marketplace-Add-on (Branding-Bereich)
--
-- Auralis (auralis-plum.vercel.app, betrieben von Entrenous) misst, wie gut eine
-- Person in KI-Antworten (Claude, GPT, Gemini, Mistral) gefunden wird. Anbindung
-- über die Auralis Public-API v1 mit ZENTRALEM Enterprise-Key (EF-Secret
-- AURALIS_API_KEY) + Sub-Account-Provisioning pro Leadesk-Team:
--
--   POST /sub-accounts            → sub_account_id pro Team
--   POST /topics?sub_account_id=… → topic_id (= scheduleId)
--   POST /analyze/{topicId}?sub_account_id=…
--   GET  /scores/latest?sub_account_id=…
--   GET/POST/DELETE /competitors…?sub_account_id=…
--
-- Diese Migration ist rein DB-seitig:
--   1) addons-Seed slug='auralis' (9 €/Monat). stripe_price_id NULL → Frontend
--      rendert vorerst Waitlist-Button; nach Stripe-Setup (€9 recurring) per
--      UPDATE setzen → Card wird zu "Abonnieren".
--   2) service_role-GRANT auf public.integrations (Top-Fallstrick #12):
--      die EF auralis-proxy liest/schreibt das Team→Sub-Account-Mapping als
--      provider='auralis'-Row via service_role. integrations stammt aus der
--      Cutover-Ära (2026-04-16) → service_role-Grant fehlt sonst → silent-deny.
--
-- Idempotent: ON CONFLICT (slug) DO UPDATE, GRANT ist re-runnable.
--
-- Apply (Staging zuerst):
--   ssh root@178.104.210.216 'docker exec -i supabase-db psql -U supabase_admin \
--     -d postgres -v ON_ERROR_STOP=1' < supabase/migrations/20260608120000_auralis_addon_marketplace.sql
--   Smoke: SELECT slug, name, price_monthly_cents, stripe_price_id FROM addons WHERE slug='auralis';
--   Nach Freigabe identisch auf Prod (128.140.123.163).

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1) addons-Seed: Auralis KI-Sichtbarkeit
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.addons (
  slug, name, short_description, long_description,
  category, type,
  price_monthly_cents, currency,
  stripe_product_id, stripe_price_id,
  icon, highlight_color,
  features,
  activates_modules, ai_quota_increment, integration_config,
  is_active, is_featured, sort_order
) VALUES (
  'auralis',
  'KI-Sichtbarkeit',
  'Miss, wie gut du in ChatGPT, Claude & Co. gefunden wirst',
  'Bindet Auralis an deinen Branding-Bereich an. Auralis fragt führende KI-Modelle '
  || '(Claude, GPT, Gemini, Mistral) zu deinem Namen und deinem Thema ab und misst, '
  || 'ob und an welcher Stelle du genannt wirst. Du erhältst vier Master-Scores '
  || '(Aura, GEO, Thought Leadership, Digitale Autorität), eine Erwähnungsrate und '
  || 'einen direkten Wettbewerber-Vergleich — alles in Leadesk, ohne separaten Login.',
  'integration', 'integration',
  900, 'EUR',
  NULL, NULL,
  'Globe', '#6366F1',
  '["Aura-, GEO-, Thought-Leadership- & Autoritäts-Score","Erwähnungsrate über Claude, GPT, Gemini & Mistral","Wettbewerber in der KI-Sichtbarkeit vergleichen","Direkt im Branding-Bereich, kein zweiter Login"]'::jsonb,
  NULL, NULL,
  '{"provider":"auralis","api_base":"https://auralis-plum.vercel.app/api/v1","auth":"central_enterprise_key"}'::jsonb,
  true, true, 5
)
ON CONFLICT (slug) DO UPDATE
   SET name                = EXCLUDED.name,
       short_description   = EXCLUDED.short_description,
       long_description    = EXCLUDED.long_description,
       category            = EXCLUDED.category,
       type                = EXCLUDED.type,
       price_monthly_cents = EXCLUDED.price_monthly_cents,
       currency            = EXCLUDED.currency,
       icon                = EXCLUDED.icon,
       highlight_color     = EXCLUDED.highlight_color,
       features            = EXCLUDED.features,
       integration_config  = EXCLUDED.integration_config,
       is_active           = EXCLUDED.is_active,
       is_featured         = EXCLUDED.is_featured,
       sort_order          = EXCLUDED.sort_order,
       updated_at          = now();
       -- stripe_product_id/stripe_price_id BEWUSST nicht überschrieben:
       -- nach Stripe-Setup per separatem UPDATE gesetzt, Re-Run der Migration
       -- darf die Price-ID nicht auf NULL zurücksetzen.

-- ════════════════════════════════════════════════════════════════════════════
-- 2) service_role-Grant auf integrations (Top-Fallstrick #12)
--    EF auralis-proxy nutzt provider='auralis'-Rows als Team→Sub-Account-Mapping.
-- ════════════════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE ON public.integrations TO service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 3) Verifikation
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_slug text;
  v_has_grant boolean;
BEGIN
  SELECT slug INTO v_slug FROM public.addons WHERE slug = 'auralis' AND is_active = true;
  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'Auralis verify: addon-Seed nicht gefunden';
  END IF;

  SELECT has_table_privilege('service_role', 'public.integrations', 'SELECT') INTO v_has_grant;
  IF NOT v_has_grant THEN
    RAISE EXCEPTION 'Auralis verify: service_role hat keinen SELECT auf integrations';
  END IF;

  RAISE NOTICE 'Auralis (Sprint N.1) verification PASSED: addon seeded, integrations service_role grant aktiv';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

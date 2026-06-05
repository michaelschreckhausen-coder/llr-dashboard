-- File: 20260605130000_pricing_v2_addons_extension_premium_sales.sql
-- Sprint M.2 — Pricing v2: Premium-Addon Sales via bestehender addons-Tabelle
--
-- Statt eine neue plan_addons-Tabelle zu bauen wird die existierende
-- addons-Tabelle (Marketplace Phase 0, 2026-05-18) um plan-Targeting und
-- Tier-Promotion erweitert:
--
--   ADD applicable_plan_slugs text[]     — auf welche plans.slug applicable
--                                          (NULL = alle Plans)
--   ADD price_yearly_cents    integer    — Yearly-Preis in Cent
--   ADD stripe_price_id_yearly text      — Stripe-Yearly-Price-ID
--   ADD promotes_model_tiers  text[]     — welche allowed_model_tiers das
--                                          Addon dem Account hinzufügt
--
-- Premium-Addon Sales wird als neue addons-Row seeded:
--   slug:                  'premium-models-sales'
--   type:                  'feature_unlock'
--   applicable_plan_slugs: ['sales', 'sales-team']  (KMU = Cross-Lizenz, Phase 4)
--   price_monthly_cents:   1500   (€15)
--   price_yearly_cents:    14400  (€144 = 15*12 - 20% Yearly-Rabatt)
--   promotes_model_tiers:  ['premium']
--   stripe_price_id*:      NULL   → kommt in M.3 nach Stripe-Setup
--
-- Helper-RPC get_effective_model_tiers(p_account_id):
--   Liefert text[] mit plans.allowed_model_tiers UNION promoted_tiers von
--   aktiven addons. Default = plans.allowed_model_tiers wenn kein Addon aktiv.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, ON CONFLICT (slug) DO UPDATE,
-- CREATE OR REPLACE FUNCTION.
--
-- Apply: ssh root@<server> 'docker exec -i supabase-db psql -U supabase_admin
--   -d postgres -v ON_ERROR_STOP=1' < this_file.sql

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1) Schema-Erweiterung addons
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.addons ADD COLUMN IF NOT EXISTS applicable_plan_slugs  text[];
ALTER TABLE public.addons ADD COLUMN IF NOT EXISTS price_yearly_cents     integer;
ALTER TABLE public.addons ADD COLUMN IF NOT EXISTS stripe_price_id_yearly text;
ALTER TABLE public.addons ADD COLUMN IF NOT EXISTS promotes_model_tiers   text[];

-- CHECK: price_yearly_cents >= 0 wenn NOT NULL
ALTER TABLE public.addons DROP CONSTRAINT IF EXISTS addons_price_yearly_cents_check;
ALTER TABLE public.addons ADD CONSTRAINT addons_price_yearly_cents_check
  CHECK (price_yearly_cents IS NULL OR price_yearly_cents >= 0);

-- CHECK: promotes_model_tiers ist Subset der model-tier-Whitelist
ALTER TABLE public.addons DROP CONSTRAINT IF EXISTS addons_promotes_model_tiers_check;
ALTER TABLE public.addons ADD CONSTRAINT addons_promotes_model_tiers_check
  CHECK (promotes_model_tiers IS NULL OR promotes_model_tiers <@ ARRAY['basic','premium']::text[]);

COMMENT ON COLUMN public.addons.applicable_plan_slugs IS
  'Liste von plans.slug auf die dieses Addon kaufbar ist. NULL = alle Plans.';
COMMENT ON COLUMN public.addons.promotes_model_tiers IS
  'Liste von Model-Tiers, die dieses Addon dem Account hinzufügt. Werden mit plans.allowed_model_tiers UNIONt.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2) Premium-Addon Sales — Seed
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.addons (
  slug, name, short_description, long_description,
  category, type,
  price_monthly_cents, price_yearly_cents, currency,
  stripe_product_id, stripe_price_id, stripe_price_id_yearly,
  icon, highlight_color,
  features,
  activates_modules, ai_quota_increment, integration_config,
  applicable_plan_slugs, promotes_model_tiers,
  is_active, is_featured, sort_order
) VALUES (
  'premium-models-sales',
  'Premium-Modelle',
  'Freischaltung der Premium-AI-Modelle für Sales-Lizenzen',
  'Aktiviert Claude Opus, GPT-5 und Gemini Pro für deine Sales-Lizenz. Ohne Add-On nutzt deine Sales-Lizenz die Basic-Modelle (Sonnet, GPT-4o-mini, Gemini Flash). Im Add-On-Preis bereits enthalten: die Premium-Modelle verbrauchen aus deinem regulären Credit-Pool (3-5x pro Generierung).',
  'ai_models', 'feature_unlock',
  1500, 14400, 'EUR',
  NULL, NULL, NULL,
  'sparkles', '#7C3AED',
  '["Claude Opus 4.7", "GPT-5", "Gemini 2.5 Pro", "Mistral Large 2"]'::jsonb,
  NULL, NULL, NULL,
  ARRAY['sales', 'sales-team']::text[], ARRAY['premium']::text[],
  true, true, 100
)
ON CONFLICT (slug) DO UPDATE
   SET name                    = EXCLUDED.name,
       short_description       = EXCLUDED.short_description,
       long_description        = EXCLUDED.long_description,
       category                = EXCLUDED.category,
       type                    = EXCLUDED.type,
       price_monthly_cents     = EXCLUDED.price_monthly_cents,
       price_yearly_cents      = EXCLUDED.price_yearly_cents,
       features                = EXCLUDED.features,
       applicable_plan_slugs   = EXCLUDED.applicable_plan_slugs,
       promotes_model_tiers    = EXCLUDED.promotes_model_tiers,
       is_active               = EXCLUDED.is_active,
       is_featured             = EXCLUDED.is_featured,
       sort_order              = EXCLUDED.sort_order,
       icon                    = EXCLUDED.icon,
       highlight_color         = EXCLUDED.highlight_color;

-- ════════════════════════════════════════════════════════════════════════════
-- 3) Helper-RPC get_effective_model_tiers(p_account_id)
--    Liefert text[] = plans.allowed_model_tiers UNION promoted-tiers von aktiven
--    addons mit applicable_plan_slugs ⊇ {account.plan.slug}.
--
--    SECURITY DEFINER: muss auch von service_role aus EFs aufrufbar sein.
--    Kein auth.uid()-Check — Caller (EF) verantwortlich, dass account_id zum
--    eingeloggten User gehört. Für Frontend gibt's i_have_addon().
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_effective_model_tiers(p_account_id uuid)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_plan_tiers text[];
  v_plan_slug  text;
  v_addon_tiers text[];
  v_result text[];
BEGIN
  IF p_account_id IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;

  -- 1) Plan-Tiers laden
  SELECT pl.allowed_model_tiers, pl.slug INTO v_plan_tiers, v_plan_slug
    FROM public.accounts a
    JOIN public.plans pl ON pl.id = a.plan_id
   WHERE a.id = p_account_id;

  IF v_plan_tiers IS NULL THEN
    v_plan_tiers := ARRAY['basic']::text[];
  END IF;

  -- 2) Aktive Addons mit promotes_model_tiers, applicable für diesen Plan
  SELECT COALESCE(array_agg(DISTINCT t), ARRAY[]::text[]) INTO v_addon_tiers
    FROM public.account_addons aa
    JOIN public.addons ad ON ad.id = aa.addon_id
   CROSS JOIN LATERAL unnest(ad.promotes_model_tiers) AS t
   WHERE aa.account_id = p_account_id
     AND aa.status = 'active'
     AND ad.is_active = true
     AND ad.promotes_model_tiers IS NOT NULL
     AND (ad.applicable_plan_slugs IS NULL OR v_plan_slug = ANY(ad.applicable_plan_slugs));

  -- 3) UNION (dedupliziert)
  SELECT ARRAY(SELECT DISTINCT unnest(v_plan_tiers || v_addon_tiers)) INTO v_result;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.get_effective_model_tiers(uuid) IS
  'Sprint M.2 (2026-06-05): Liefert effektive Model-Tiers für einen Account = plans.allowed_model_tiers UNION addon-Promotion. Für Premium-Addon-Sales-Logik.';

REVOKE EXECUTE ON FUNCTION public.get_effective_model_tiers(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_effective_model_tiers(uuid) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 4) Verifikation
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_addon_count int;
  v_premium_slug text;
  v_test_tiers text[];
BEGIN
  -- 4.1: Premium-Addon-Sales existiert
  SELECT slug INTO v_premium_slug
    FROM public.addons WHERE slug = 'premium-models-sales' AND is_active = true;
  IF v_premium_slug IS NULL THEN
    RAISE EXCEPTION 'Sprint M.2 verify: premium-models-sales addon nicht gefunden';
  END IF;

  -- 4.2: addons-Spalten existieren
  PERFORM 1 FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'addons' AND column_name = 'applicable_plan_slugs';
  IF NOT FOUND THEN RAISE EXCEPTION 'Sprint M.2 verify: addons.applicable_plan_slugs fehlt'; END IF;

  PERFORM 1 FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'addons' AND column_name = 'promotes_model_tiers';
  IF NOT FOUND THEN RAISE EXCEPTION 'Sprint M.2 verify: addons.promotes_model_tiers fehlt'; END IF;

  PERFORM 1 FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'addons' AND column_name = 'price_yearly_cents';
  IF NOT FOUND THEN RAISE EXCEPTION 'Sprint M.2 verify: addons.price_yearly_cents fehlt'; END IF;

  -- 4.3: get_effective_model_tiers RPC existiert
  PERFORM 1 FROM pg_proc
   WHERE proname = 'get_effective_model_tiers' AND pronamespace = 'public'::regnamespace;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sprint M.2 verify: get_effective_model_tiers RPC fehlt'; END IF;

  -- 4.4: Smoke gegen einen Sales-Account ohne Addon → erwartet ['basic']
  --      (skipped wenn kein Sales-Account auf der DB)
  DECLARE
    v_sales_account_id uuid;
  BEGIN
    SELECT a.id INTO v_sales_account_id
      FROM public.accounts a JOIN public.plans pl ON pl.id = a.plan_id
     WHERE pl.slug = 'sales' LIMIT 1;
    IF v_sales_account_id IS NOT NULL THEN
      v_test_tiers := public.get_effective_model_tiers(v_sales_account_id);
      IF NOT ('basic' = ANY(v_test_tiers)) THEN
        RAISE EXCEPTION 'Sprint M.2 verify: Sales-Account ohne Addon sollte basic-tier haben, got %', v_test_tiers;
      END IF;
      IF 'premium' = ANY(v_test_tiers) THEN
        RAISE EXCEPTION 'Sprint M.2 verify: Sales-Account ohne Addon hat unerwartet premium-tier (Daten-Inkonsistenz?), got %', v_test_tiers;
      END IF;
      RAISE NOTICE 'Sprint M.2 smoke: Sales-Account % effective tiers = %', v_sales_account_id, v_test_tiers;
    ELSE
      RAISE NOTICE 'Sprint M.2 smoke: kein Sales-Account auf dieser DB — Live-Test übersprungen';
    END IF;
  END;

  -- 4.5: Plan-Total (sanity)
  SELECT count(*) INTO v_addon_count FROM public.addons WHERE is_active = true;
  RAISE NOTICE 'Sprint M.2 (Pricing v2 addons) verification PASSED: % active addons, premium-models-sales seeded, get_effective_model_tiers verfügbar', v_addon_count;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

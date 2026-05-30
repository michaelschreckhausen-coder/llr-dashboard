-- Credits Phase 1 — plans Schema-Erweiterung
-- ─────────────────────────────────────────────────────────────────
-- Erweitert public.plans um die Felder für das neue Credit-/Storage-/
-- Limit-System:
--   - credits_quota integer        → Credits-Pool pro Monat (NULL = unlimited)
--   - storage_quota_gb numeric     → Storage-Limit in GB
--   - crm_quota_companies integer  → Unternehmen-Limit (NULL = unlimited)
--   - crm_quota_contacts integer   → Kontakt-Limit (NULL = unlimited)
--   - brand_voices_limit integer   → Brand-Voice-Limit (NULL = unlimited)
--   - audiences_limit integer      → Zielgruppen-Limit (NULL = unlimited)
--   - knowledge_resources_limit    → Wissensressourcen (NULL = unlimited)
--   - license_type text            → 'sales'|'marketing'|'all-in'|'team'|'trial'|'free'|'custom'
--   - allowed_model_tiers text[]   → ['basic'] oder ['basic','premium']
--   - is_team_plan boolean         → für UI-Differenzierung
--   - seats_included integer       → Anzahl Seats (NULL für Single)
--
-- IDEMPOTENT, ADDITIV. Alte Cols (price_eur, max_ai_generations,
-- max_vernetzungen_per_day, max_brand_voices) bleiben erhalten und werden
-- in Phase 1.1 (späterer Sprint) deprecated, nicht in dieser Migration.

BEGIN;

ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS credits_quota integer;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS storage_quota_gb numeric;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS crm_quota_companies integer;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS crm_quota_contacts integer;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS brand_voices_limit integer;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS audiences_limit integer;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS knowledge_resources_limit integer;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS license_type text;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS allowed_model_tiers text[] NOT NULL DEFAULT ARRAY['basic']::text[];
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS is_team_plan boolean NOT NULL DEFAULT false;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS seats_included integer;

-- Constraint: license_type-Whitelist (nullable für Bestandspläne erlaubt,
-- werden in Sprint B Backfill-Migration auf Werte gesetzt)
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_license_type_check;
ALTER TABLE public.plans ADD CONSTRAINT plans_license_type_check
  CHECK (
    license_type IS NULL
    OR license_type IN ('sales','marketing','all-in','team','trial','free','custom')
  );

-- Constraint: allowed_model_tiers-Whitelist
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_allowed_model_tiers_check;
ALTER TABLE public.plans ADD CONSTRAINT plans_allowed_model_tiers_check
  CHECK (allowed_model_tiers <@ ARRAY['basic','premium']::text[]);

-- Constraint: Team-Konsistenz — is_team_plan=true → seats_included >= 2
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_team_seats_check;
ALTER TABLE public.plans ADD CONSTRAINT plans_team_seats_check
  CHECK (
    (is_team_plan = false)
    OR (is_team_plan = true AND seats_included >= 2)
  );

-- Komfort-Index für license_type-Lookup
CREATE INDEX IF NOT EXISTS idx_plans_license_type ON public.plans (license_type);

-- Verifikation
DO $$
DECLARE
  v_missing_cols text;
BEGIN
  SELECT string_agg(c, ', ')
  INTO v_missing_cols
  FROM unnest(ARRAY[
    'credits_quota','storage_quota_gb','crm_quota_companies','crm_quota_contacts',
    'brand_voices_limit','audiences_limit','knowledge_resources_limit',
    'license_type','allowed_model_tiers','is_team_plan','seats_included'
  ]) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='plans' AND column_name=c
  );

  IF v_missing_cols IS NOT NULL THEN
    RAISE EXCEPTION 'Migration FAILED: missing cols: %', v_missing_cols;
  END IF;

  RAISE NOTICE 'Migration OK: alle 11 neuen Cols vorhanden in plans';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

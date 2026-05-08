-- Block 5.1: plans.permissions schema + Auto-Expand Initial-Matrix
--
-- Decisions (Block-5.1-Implementation):
--   Q1=A: Business-Plan via INSERT angelegt (0 Account-Risk)
--   Q2=D: Free kriegt Enterprise-Permissions (Funktionalitaet fuer 1 existing
--         Free-Account erhalten)
--   plans.modules-Spalte BLEIBT (Backwards-Compat, gedroppt in Block 5.7)
--
-- Schema:
--   - plans.permissions: jsonb-Array mit Dotted-Keys (25 Permissions total)
--   - plans.archived: boolean fuer Soft-Delete (Block 5.5 Plan-Editor)
--   - GIN-Index fuer schnelle Permission-Containment-Lookups
--   - Partial-Index auf archived=false fuer Active-Plans-Queries
--
-- Initial-Matrix (siehe Block-5-Discovery):
--   Free        : alle 25 Permissions (Q2=D, kein Funktionsverlust)
--   Starter     : 13 (basic CRM + Brand + LinkedIn-Connections + Content-Studio)
--   Pro         : 21 (+ enrichment, automation, calendar, reports, team_management, knowledge, icp)
--   Business    : 25 (alles, NEW)
--   Enterprise  : 25 (alles)
--
-- Reversibel via:
--   ALTER TABLE plans DROP COLUMN permissions, DROP COLUMN archived;
--   DROP INDEX plans_permissions_gin_idx, plans_archived_idx;
--   DELETE FROM plans WHERE id='11111111-3636-5151-bbbb-bbbbbbbbbbbb';

BEGIN;

-- ============================================================
-- A. Schema-Adds
-- ============================================================
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS archived    boolean NOT NULL DEFAULT false;

-- ============================================================
-- B. CHECK-Constraint: permissions muss jsonb-Array sein
-- ============================================================
-- Nach ADD COLUMN haben alle existing rows permissions='[]' (default) →
-- jsonb_typeof='array' → CHECK greift sofort safe.
ALTER TABLE public.plans
  DROP CONSTRAINT IF EXISTS plans_permissions_is_array;
ALTER TABLE public.plans
  ADD CONSTRAINT plans_permissions_is_array
  CHECK (jsonb_typeof(permissions) = 'array');

-- ============================================================
-- C. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS plans_permissions_gin_idx
  ON public.plans USING gin (permissions);

CREATE INDEX IF NOT EXISTS plans_archived_idx
  ON public.plans (archived) WHERE archived = false;

-- ============================================================
-- D. Auto-Expand existing Pläne (Initial-Matrix)
-- ============================================================

-- Free → alle 25 (Q2=D)
UPDATE public.plans SET permissions = jsonb_build_array(
  'branding.voice','branding.audiences','branding.knowledge','branding.linkedin_texts','branding.icp',
  'crm.contacts','crm.organizations','crm.deals','crm.tasks','crm.enrichment',
  'linkedin.connections','linkedin.messages','linkedin.automation','linkedin.cloud',
  'content.studio','content.calendar',
  'delivery.projects','delivery.time_tracking',
  'reports.sales','reports.ssi',
  'core.integrations','core.team_management','core.whitelabel','core.multi_account',
  'assistant.basic'
), updated_at = now()
WHERE slug = 'free';

-- Starter → 13 Permissions
UPDATE public.plans SET permissions = jsonb_build_array(
  'branding.voice','branding.audiences','branding.linkedin_texts',
  'crm.contacts','crm.organizations','crm.deals','crm.tasks',
  'linkedin.connections','linkedin.messages','linkedin.cloud',
  'content.studio',
  'core.integrations',
  'assistant.basic'
), updated_at = now()
WHERE slug = 'starter';

-- Pro → 21 Permissions
UPDATE public.plans SET permissions = jsonb_build_array(
  'branding.voice','branding.audiences','branding.knowledge','branding.linkedin_texts','branding.icp',
  'crm.contacts','crm.organizations','crm.deals','crm.tasks','crm.enrichment',
  'linkedin.connections','linkedin.messages','linkedin.automation','linkedin.cloud',
  'content.studio','content.calendar',
  'reports.sales','reports.ssi',
  'core.integrations','core.team_management',
  'assistant.basic'
), updated_at = now()
WHERE slug = 'pro';

-- Enterprise → alle 25
UPDATE public.plans SET permissions = jsonb_build_array(
  'branding.voice','branding.audiences','branding.knowledge','branding.linkedin_texts','branding.icp',
  'crm.contacts','crm.organizations','crm.deals','crm.tasks','crm.enrichment',
  'linkedin.connections','linkedin.messages','linkedin.automation','linkedin.cloud',
  'content.studio','content.calendar',
  'delivery.projects','delivery.time_tracking',
  'reports.sales','reports.ssi',
  'core.integrations','core.team_management','core.whitelabel','core.multi_account',
  'assistant.basic'
), updated_at = now()
WHERE slug = 'enterprise';

-- ============================================================
-- E. INSERT Business (NEW, alle 25, fixe UUID fuer Reproducibility)
-- ============================================================
INSERT INTO public.plans (
  id, name, slug, modules,
  price_monthly, price_yearly,
  is_active, is_trial, is_default_trial,
  permissions, archived
) VALUES (
  '11111111-3636-5151-bbbb-bbbbbbbbbbbb',
  'Business', 'business',
  ARRAY['branding','crm','linkedin','content','delivery','reports']::text[],
  199, 159,
  true, false, false,
  jsonb_build_array(
    'branding.voice','branding.audiences','branding.knowledge','branding.linkedin_texts','branding.icp',
    'crm.contacts','crm.organizations','crm.deals','crm.tasks','crm.enrichment',
    'linkedin.connections','linkedin.messages','linkedin.automation','linkedin.cloud',
    'content.studio','content.calendar',
    'delivery.projects','delivery.time_tracking',
    'reports.sales','reports.ssi',
    'core.integrations','core.team_management','core.whitelabel','core.multi_account',
    'assistant.basic'
  ),
  false
)
ON CONFLICT (id) DO NOTHING;  -- idempotent re-apply

-- ============================================================
-- F. Verifikation: alle aktiven Plans haben non-empty permissions
-- ============================================================
DO $$
DECLARE
  v_empty_count int;
  v_business_exists boolean;
  v_starter_count int;
  v_pro_count int;
  v_enterprise_count int;
  v_business_count int;
  v_free_count int;
BEGIN
  SELECT count(*) INTO v_empty_count FROM public.plans
  WHERE jsonb_array_length(permissions) = 0 AND NOT archived AND is_active;

  IF v_empty_count > 0 THEN
    RAISE EXCEPTION 'Migration FAILED: % active plans without permissions', v_empty_count;
  END IF;

  -- Business muss existieren
  SELECT EXISTS(SELECT 1 FROM public.plans WHERE slug='business' AND archived = false)
  INTO v_business_exists;
  IF NOT v_business_exists THEN
    RAISE EXCEPTION 'Migration FAILED: Business plan not present';
  END IF;

  -- Permission-Counts pro Plan verifizieren
  SELECT jsonb_array_length(permissions) INTO v_starter_count    FROM public.plans WHERE slug='starter';
  SELECT jsonb_array_length(permissions) INTO v_pro_count        FROM public.plans WHERE slug='pro';
  SELECT jsonb_array_length(permissions) INTO v_business_count   FROM public.plans WHERE slug='business';
  SELECT jsonb_array_length(permissions) INTO v_enterprise_count FROM public.plans WHERE slug='enterprise';
  SELECT jsonb_array_length(permissions) INTO v_free_count       FROM public.plans WHERE slug='free';

  IF v_starter_count    IS DISTINCT FROM 13 THEN RAISE EXCEPTION 'Starter has % perms, expected 13',    v_starter_count;    END IF;
  IF v_pro_count        IS DISTINCT FROM 21 THEN RAISE EXCEPTION 'Pro has % perms, expected 21',        v_pro_count;        END IF;
  IF v_business_count   IS DISTINCT FROM 25 THEN RAISE EXCEPTION 'Business has % perms, expected 25',   v_business_count;   END IF;
  IF v_enterprise_count IS DISTINCT FROM 25 THEN RAISE EXCEPTION 'Enterprise has % perms, expected 25', v_enterprise_count; END IF;
  IF v_free_count       IS DISTINCT FROM 25 THEN RAISE EXCEPTION 'Free has % perms, expected 25',       v_free_count;       END IF;

  RAISE NOTICE 'Migration OK: 5 plans (free=25, starter=13, pro=21, business=25, enterprise=25)';
END $$;

COMMIT;

-- PostgREST Schema-Cache reload
NOTIFY pgrst, 'reload schema';

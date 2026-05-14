-- Block 5.1 Hotfix: Migration 20260504201508 fix fuer Prod-Schema-Drift.
--
-- Ursache:
--   Original-Migration setzte `updated_at = now()` in 4 UPDATE-Statements.
--   Prod-`plans` hat keine `updated_at`-Spalte (Staging hat sie). Original-
--   Migration crashed atomic auf Prod beim ersten UPDATE → Schema-Adds
--   (permissions, archived) wurden alle zurueckgerollt.
--
-- Fix:
--   `updated_at = now()` aus den 4 UPDATE-Statements entfernt. Idempotent
--   re-applybar:
--     - ALTER TABLE ... ADD COLUMN IF NOT EXISTS  → skipped wenn schon da
--     - ADD CONSTRAINT mit DROP IF EXISTS davor   → idempotent
--     - CREATE INDEX IF NOT EXISTS                → skipped wenn schon da
--     - UPDATE setzt selbe Permissions             → no-op auf Staging
--     - INSERT ON CONFLICT DO NOTHING              → skipped auf Staging
--
-- Phase-4-Cleanup-Item (separate Phase, nicht hier):
--   Schema-Harmonisierung Prod-plans: ADD COLUMN updated_at timestamptz
--   DEFAULT now(), plus Trigger fuer auto-update. Aktuell hat Prod keinen
--   updated_at — Staging schon. Drift dokumentiert in Block-5.1-Hotfix-Memory.

BEGIN;

-- ============================================================
-- A. Schema-Adds (idempotent via IF NOT EXISTS)
-- ============================================================
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS archived    boolean NOT NULL DEFAULT false;

-- ============================================================
-- B. CHECK-Constraint (DROP+ADD-Pattern fuer Idempotenz)
-- ============================================================
ALTER TABLE public.plans
  DROP CONSTRAINT IF EXISTS plans_permissions_is_array;
ALTER TABLE public.plans
  ADD CONSTRAINT plans_permissions_is_array
  CHECK (jsonb_typeof(permissions) = 'array');

-- ============================================================
-- C. Indexes (idempotent via IF NOT EXISTS)
-- ============================================================
CREATE INDEX IF NOT EXISTS plans_permissions_gin_idx
  ON public.plans USING gin (permissions);

CREATE INDEX IF NOT EXISTS plans_archived_idx
  ON public.plans (archived) WHERE archived = false;

-- ============================================================
-- D. Auto-Expand existing Plaene (OHNE updated_at — Prod hat keine)
-- ============================================================

-- Free → alle 25
UPDATE public.plans SET permissions = jsonb_build_array(
  'branding.voice','branding.audiences','branding.knowledge','branding.linkedin_texts','branding.icp',
  'crm.contacts','crm.organizations','crm.deals','crm.tasks','crm.enrichment',
  'linkedin.connections','linkedin.messages','linkedin.automation','linkedin.cloud',
  'content.studio','content.calendar',
  'delivery.projects','delivery.time_tracking',
  'reports.sales','reports.ssi',
  'core.integrations','core.team_management','core.whitelabel','core.multi_account',
  'assistant.basic'
)
WHERE slug = 'free';

-- Starter → 13
UPDATE public.plans SET permissions = jsonb_build_array(
  'branding.voice','branding.audiences','branding.linkedin_texts',
  'crm.contacts','crm.organizations','crm.deals','crm.tasks',
  'linkedin.connections','linkedin.messages','linkedin.cloud',
  'content.studio',
  'core.integrations',
  'assistant.basic'
)
WHERE slug = 'starter';

-- Pro → 21
UPDATE public.plans SET permissions = jsonb_build_array(
  'branding.voice','branding.audiences','branding.knowledge','branding.linkedin_texts','branding.icp',
  'crm.contacts','crm.organizations','crm.deals','crm.tasks','crm.enrichment',
  'linkedin.connections','linkedin.messages','linkedin.automation','linkedin.cloud',
  'content.studio','content.calendar',
  'reports.sales','reports.ssi',
  'core.integrations','core.team_management',
  'assistant.basic'
)
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
)
WHERE slug = 'enterprise';

-- ============================================================
-- E. INSERT Business (NEW, idempotent ON CONFLICT)
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
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- F. Verifikation
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

  SELECT EXISTS(SELECT 1 FROM public.plans WHERE slug='business' AND archived = false)
  INTO v_business_exists;
  IF NOT v_business_exists THEN
    RAISE EXCEPTION 'Migration FAILED: Business plan not present';
  END IF;

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

  RAISE NOTICE 'Hotfix OK: 5 plans (free=25, starter=13, pro=21, business=25, enterprise=25)';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

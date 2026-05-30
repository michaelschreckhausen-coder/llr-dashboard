-- Credits Phase 1 — Plan-Seed (9 neue Pläne nach Pricing-Doc 2026-05-29)
-- ─────────────────────────────────────────────────────────────────
-- Anlegen der 9 neuen Pläne aus Leadesk_Pricing_Vorschlag.docx:
--   Single:  sales, marketing, all-in
--   Team:    sales-team, marketing-team, kmu, customized
--   System:  trial (3 Tage), free (Post-Trial-Restricted)
--
-- Pre-Step: alter slug='free'-Plan wird auf slug='free-legacy' umbenannt,
-- damit der neue 'free'-Slug frei ist. UUIDs bleiben stabil → Account-FKs
-- brechen nicht.
--
-- Achtung: handle_new_user-Trigger sucht aktuell via LOWER(name)='free'.
-- Nach diesem Seed UND der Trigger-Refactor-Migration 20260601107000 läuft
-- das Lookup über is_default_trial=true — siehe dort.
--
-- Stripe: alle stripe_price_id bleiben NULL — Leadesk wechselt auf NEUEN
-- Stripe-Account, Products werden in Phase 3 separat angelegt.
--
-- Idempotenz: ON CONFLICT (slug) DO NOTHING beim INSERT; Rename-Step nur
-- wenn alter free-Plan noch nicht umbenannt ist.

BEGIN;

-- ── 1. Alten "free"-Plan auf "free-legacy" umbenennen ────────────
-- Damit Slug 'free' für den neuen Post-Trial-Plan frei wird.
-- Bedingung: nur wenn slug='free' UND license_type IS NULL (alt-Schema)
UPDATE public.plans
   SET slug = 'free-legacy',
       name = 'Free (Legacy)'
 WHERE slug = 'free'
   AND license_type IS NULL;

-- Safety: vorher den is_default_trial-Unique-Constraint vorbereiten —
-- kein bestehender Plan darf is_default_trial=true sein wenn wir neuen
-- Trial einfügen mit is_default_trial=true.
UPDATE public.plans SET is_default_trial = false WHERE is_default_trial = true;

-- ── 2. 9 neue Pläne einfügen ─────────────────────────────────────

-- Sales Single — €29/Mo
INSERT INTO public.plans (
  slug, name, description, license_type,
  price_monthly, price_yearly,
  credits_quota, storage_quota_gb,
  crm_quota_companies, crm_quota_contacts,
  brand_voices_limit, audiences_limit, knowledge_resources_limit,
  modules, allowed_model_tiers,
  is_team_plan, seats_included,
  is_active, is_trial, is_default_trial,
  plan_managed_by
) VALUES (
  'sales', 'Sales', 'CRM, LinkedIn-Vernetzung und Sales-Reporting für Einzelnutzer', 'sales',
  29, 23,
  6000, 5,
  500, 2500,
  1, 3, 10,
  ARRAY['branding','crm','linkedin','reports']::text[], ARRAY['basic']::text[],
  false, NULL,
  true, false, false,
  'leadesk'
) ON CONFLICT (slug) DO NOTHING;

-- Marketing Single — €79/Mo
INSERT INTO public.plans (
  slug, name, description, license_type,
  price_monthly, price_yearly,
  credits_quota, storage_quota_gb,
  crm_quota_companies, crm_quota_contacts,
  brand_voices_limit, audiences_limit, knowledge_resources_limit,
  modules, allowed_model_tiers,
  is_team_plan, seats_included,
  is_active, is_trial, is_default_trial,
  plan_managed_by
) VALUES (
  'marketing', 'Marketing', 'Brand-Voice-Vielfalt und Content-Produktion für Solo-Marketing', 'marketing',
  79, 63,
  10000, 25,
  NULL, NULL,
  3, 3, 10,
  ARRAY['branding','linkedin','content','reports']::text[], ARRAY['basic']::text[],
  false, NULL,
  true, false, false,
  'leadesk'
) ON CONFLICT (slug) DO NOTHING;

-- All-In Single — €119/Mo
INSERT INTO public.plans (
  slug, name, description, license_type,
  price_monthly, price_yearly,
  credits_quota, storage_quota_gb,
  crm_quota_companies, crm_quota_contacts,
  brand_voices_limit, audiences_limit, knowledge_resources_limit,
  modules, allowed_model_tiers,
  is_team_plan, seats_included,
  is_active, is_trial, is_default_trial,
  plan_managed_by
) VALUES (
  'all-in', 'All-In', 'Komplette Suite für Solo-Founder inkl. Premium-Modelle', 'all-in',
  119, 95,
  20000, 50,
  NULL, NULL,
  NULL, NULL, NULL,
  ARRAY['branding','crm','linkedin','content','delivery','reports']::text[], ARRAY['basic','premium']::text[],
  false, NULL,
  true, false, false,
  'leadesk'
) ON CONFLICT (slug) DO NOTHING;

-- Sales Team — €49/Mo, 2 Seats
INSERT INTO public.plans (
  slug, name, description, license_type,
  price_monthly, price_yearly,
  credits_quota, storage_quota_gb,
  crm_quota_companies, crm_quota_contacts,
  brand_voices_limit, audiences_limit, knowledge_resources_limit,
  modules, allowed_model_tiers,
  is_team_plan, seats_included,
  is_active, is_trial, is_default_trial,
  plan_managed_by
) VALUES (
  'sales-team', 'Sales Team', 'Sales-Team-Pool für 2 Vertriebler mit zentraler Verwaltung', 'team',
  49, 43,
  12000, 10,
  1000, 5000,
  2, 3, 10,
  ARRAY['branding','crm','linkedin','reports']::text[], ARRAY['basic']::text[],
  true, 2,
  true, false, false,
  'leadesk'
) ON CONFLICT (slug) DO NOTHING;

-- Marketing Team — €134/Mo, 2 Seats
INSERT INTO public.plans (
  slug, name, description, license_type,
  price_monthly, price_yearly,
  credits_quota, storage_quota_gb,
  crm_quota_companies, crm_quota_contacts,
  brand_voices_limit, audiences_limit, knowledge_resources_limit,
  modules, allowed_model_tiers,
  is_team_plan, seats_included,
  is_active, is_trial, is_default_trial,
  plan_managed_by
) VALUES (
  'marketing-team', 'Marketing Team', 'Content-Team-Pool für 2 Marketing-User mit Brand-Voice-Diversität', 'team',
  134, 107,
  20000, 50,
  NULL, NULL,
  6, 6, 30,
  ARRAY['branding','linkedin','content','reports']::text[], ARRAY['basic']::text[],
  true, 2,
  true, false, false,
  'leadesk'
) ON CONFLICT (slug) DO NOTHING;

-- KMU — €159/Mo, 3 Seats (2 Sales + 1 All-In)
-- Phase 1: Plan-Ebene gibt ['basic','premium'] frei. Seat-Level-Gating
-- (Sales-Seats ohne Premium, All-In-Seat mit Premium) ist Phase-4-Material.
INSERT INTO public.plans (
  slug, name, description, license_type,
  price_monthly, price_yearly,
  credits_quota, storage_quota_gb,
  crm_quota_companies, crm_quota_contacts,
  brand_voices_limit, audiences_limit, knowledge_resources_limit,
  modules, allowed_model_tiers,
  is_team_plan, seats_included,
  is_active, is_trial, is_default_trial,
  plan_managed_by
) VALUES (
  'kmu', 'KMU', 'Typisches 3-Personen-B2B-Setup: 2 Sales + 1 All-In, geteilte Credits + Storage', 'team',
  159, 149,
  32000, 60,
  NULL, NULL,
  NULL, NULL, NULL,
  ARRAY['branding','crm','linkedin','content','reports']::text[], ARRAY['basic','premium']::text[],
  true, 3,
  true, false, false,
  'leadesk'
) ON CONFLICT (slug) DO NOTHING;

-- Customized Team — ab €499/Mo, individuell (Placeholder)
INSERT INTO public.plans (
  slug, name, description, license_type,
  price_monthly, price_yearly,
  credits_quota, storage_quota_gb,
  crm_quota_companies, crm_quota_contacts,
  brand_voices_limit, audiences_limit, knowledge_resources_limit,
  modules, allowed_model_tiers,
  is_team_plan, seats_included,
  is_active, is_trial, is_default_trial,
  plan_managed_by
) VALUES (
  'customized', 'Customized Team', 'Individuelles Team-Setup ab 4 Seats — Bedarfsanalyse + Vertragsverhandlung', 'custom',
  499, NULL,
  NULL, NULL,
  NULL, NULL,
  NULL, NULL, NULL,
  ARRAY['branding','crm','linkedin','content','delivery','reports']::text[], ARRAY['basic','premium']::text[],
  true, 4,
  true, false, false,
  'leadesk'
) ON CONFLICT (slug) DO NOTHING;

-- Trial — 3 Tage kostenlos, Sales-Feature-Set, is_default_trial=true
INSERT INTO public.plans (
  slug, name, description, license_type,
  price_monthly, price_yearly,
  credits_quota, storage_quota_gb,
  crm_quota_companies, crm_quota_contacts,
  brand_voices_limit, audiences_limit, knowledge_resources_limit,
  modules, allowed_model_tiers,
  is_team_plan, seats_included,
  is_active, is_trial, is_default_trial, trial_days,
  plan_managed_by
) VALUES (
  'trial', 'Trial', '3-Tage kostenloser Vollzugriff auf Sales-Features', 'trial',
  0, 0,
  1000, 1,
  50, 250,
  1, 1, 5,
  ARRAY['branding','crm','linkedin','reports']::text[], ARRAY['basic']::text[],
  false, NULL,
  true, true, true, 3,
  'leadesk'
) ON CONFLICT (slug) DO NOTHING;

-- Free (Post-Trial Restricted) — 100 Credits, 50 MB
-- storage_quota_gb=0.05 entspricht 50 MB
INSERT INTO public.plans (
  slug, name, description, license_type,
  price_monthly, price_yearly,
  credits_quota, storage_quota_gb,
  crm_quota_companies, crm_quota_contacts,
  brand_voices_limit, audiences_limit, knowledge_resources_limit,
  modules, allowed_model_tiers,
  is_team_plan, seats_included,
  is_active, is_trial, is_default_trial,
  plan_managed_by
) VALUES (
  'free', 'Free', 'Eingeschränkter Read-Mostly-Zugang nach abgelaufenem Trial', 'free',
  0, 0,
  100, 0.05,
  50, 100,
  1, 1, 3,
  ARRAY['branding','crm']::text[], ARRAY['basic']::text[],
  false, NULL,
  true, false, false,
  'leadesk'
) ON CONFLICT (slug) DO NOTHING;

-- ── 3. Verifikation ──────────────────────────────────────────────
DO $$
DECLARE
  v_inserted int;
  v_default_trial int;
BEGIN
  SELECT count(*) INTO v_inserted
  FROM public.plans
  WHERE slug IN ('sales','marketing','all-in','sales-team','marketing-team','kmu','customized','trial','free')
    AND license_type IS NOT NULL;

  IF v_inserted < 9 THEN
    RAISE EXCEPTION 'Migration FAILED: only % of 9 new plans inserted', v_inserted;
  END IF;

  SELECT count(*) INTO v_default_trial FROM public.plans WHERE is_default_trial = true AND is_active = true;
  IF v_default_trial != 1 THEN
    RAISE EXCEPTION 'Migration FAILED: expected exactly 1 default-trial-Plan, got %', v_default_trial;
  END IF;

  RAISE NOTICE 'Migration OK: 9 neue Pläne seeded, 1 default-trial';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

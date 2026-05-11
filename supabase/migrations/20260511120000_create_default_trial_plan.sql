-- =============================================================================
-- Sprint 1: Default-Trial-Plan in public.plans
-- =============================================================================
-- Voraussetzung für Sprint 2 (handle_new_user nutzt is_default_trial=true für
-- plan_id-Lookup statt hardcoded Free).
--
-- Pattern: Copy von Free-Plan (modules + permissions + Limits + Features),
-- override nur Trial-spezifische Felder (slug, name, is_trial, trial_days,
-- is_default_trial, description, sort_order).
--
-- Plus Safety-UPDATE: kein anderer Plan darf is_default_trial=true haben.
--
-- Idempotent? NEIN — INSERT würde bei Re-Apply auf UNIQUE(slug) crashen.
-- Wir lassen das so: fresh-deploy-only. Bei Re-Run: ON CONFLICT DO NOTHING
-- via UPSERT-Pattern wäre Option, aber für Phase 4-rollback wäre dann DELETE
-- klarer. Migration wird genau einmal angewendet.
-- =============================================================================

BEGIN;

-- 1. Trial-Plan anlegen (Felder von Free kopiert, Trial-spezifisch überschrieben)
INSERT INTO public.plans (
  name, slug, description,
  is_active, is_trial, is_default_trial, trial_days,
  archived, plan_managed_by,
  modules, permissions, features,
  -- Limits (von Free)
  max_leads, max_lists, max_team_members, max_brand_voices,
  max_ai_generations, max_vernetzungen_per_day,
  daily_limit, ai_calls_monthly, leads_monthly,
  ai_access, feature_pipeline, feature_brand_voice, feature_reports,
  -- Price (Trial = kostenlos)
  price_eur, price_monthly, price_yearly,
  -- Misc
  seats, sort_order
)
SELECT
  'Trial', 'trial', 'Automatisch zugewiesener Trial-Plan für neue Sign-ups (14 Tage)',
  true, true, true, 14,
  false, 'leadesk',
  modules, permissions, features,
  max_leads, max_lists, max_team_members, max_brand_voices,
  max_ai_generations, max_vernetzungen_per_day,
  daily_limit, ai_calls_monthly, leads_monthly,
  ai_access, feature_pipeline, feature_brand_voice, feature_reports,
  0, 0, 0,
  seats, 1
FROM public.plans
WHERE slug = 'free';

-- 2. Safety: kein anderer Plan darf is_default_trial=true sein
UPDATE public.plans
   SET is_default_trial = false
 WHERE slug != 'trial'
   AND is_default_trial = true;

COMMIT;

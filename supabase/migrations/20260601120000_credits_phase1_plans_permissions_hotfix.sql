-- Credits Phase 1 — Hotfix: plans.permissions für 9 neue Pläne
-- ─────────────────────────────────────────────────────────────────
-- Bug entdeckt 2026-05-31 durch Michael's Browser-Smoke:
-- Trotz All-In-Plan und korrekten modules-Array waren nur Visuals + Medien
-- in der Sidebar sichtbar. Root-Cause: Mig 105000_seed_new_plans hat
-- plans.permissions nicht explizit gesetzt → DEFAULT '[]'::jsonb → leer.
-- Layout.jsx filtert NavItems via hasPermission() → leer-Array = alles weg.
--
-- Existing Custom-Pläne (salesplay_webinar=11, trail_bochum=16, trial-classic=22,
-- vorstellung=25) waren manuell befüllt. Meine neuen 9 Pläne brauchen das gleiche.
--
-- Permission-Mapping pro Plan basierend auf modules + tier (Premium nur für All-In/KMU):
--
--   Sales (sales):
--     branding all 4 + crm 4 (kein enrichment) + linkedin 4 (kein automation/cloud)
--     + reports.sales + assistant.basic = 14
--
--   Marketing (marketing):
--     branding all 4 + linkedin 4 (kein automation/cloud) + content 2
--     + reports.sales + assistant.basic = 12
--
--   All-In (all-in):
--     ALLE 25 Permissions (Premium-Plan)
--
--   Sales Team (sales-team):
--     wie Sales + core.team_management = 15
--
--   Marketing Team (marketing-team):
--     wie Marketing + core.team_management = 13
--
--   KMU (kmu):
--     branding 4 + crm 5 (inkl enrichment) + linkedin 6 + content 2 + reports 1
--     + core.team_management + core.integrations + assistant.basic = 21
--     (kein delivery weil Modul nicht in KMU enthalten, kein whitelabel/multi_account)
--
--   Customized (customized):
--     ALLE 25 (Default-Setup, Admin kann später per UI/SQL trimmen)
--
--   Trial (trial):
--     wie Sales = 14
--
--   Free (free):
--     branding.voice + crm.contacts + assistant.basic = 3 (minimal)
--
-- Idempotent: UPDATE-Statements überschreiben permissions. Re-Run safe.
-- Falls Admin später manuelle Anpassungen per UI macht: dieser Re-Run würde
-- die wieder überschreiben → vor Re-Apply Audit-Log checken.

BEGIN;

-- Sales
UPDATE public.plans SET permissions = '[
  "branding.voice","branding.audiences","branding.knowledge","branding.icp",
  "crm.contacts","crm.organizations","crm.deals","crm.tasks",
  "linkedin.ssi_tracker","linkedin.profile_texts","linkedin.connections","linkedin.messages",
  "reports.sales",
  "assistant.basic"
]'::jsonb WHERE slug = 'sales';

-- Marketing
UPDATE public.plans SET permissions = '[
  "branding.voice","branding.audiences","branding.knowledge","branding.icp",
  "linkedin.ssi_tracker","linkedin.profile_texts","linkedin.connections","linkedin.messages",
  "content.studio","content.calendar",
  "reports.sales",
  "assistant.basic"
]'::jsonb WHERE slug = 'marketing';

-- All-In (alle 25 Permissions)
UPDATE public.plans SET permissions = '[
  "branding.voice","branding.audiences","branding.knowledge","branding.icp",
  "crm.contacts","crm.organizations","crm.deals","crm.tasks","crm.enrichment",
  "linkedin.ssi_tracker","linkedin.profile_texts","linkedin.connections","linkedin.messages","linkedin.automation","linkedin.cloud",
  "content.studio","content.calendar",
  "delivery.projects","delivery.time_tracking",
  "reports.sales",
  "core.integrations","core.team_management","core.whitelabel","core.multi_account",
  "assistant.basic"
]'::jsonb WHERE slug = 'all-in';

-- Sales Team (= Sales + core.team_management)
UPDATE public.plans SET permissions = '[
  "branding.voice","branding.audiences","branding.knowledge","branding.icp",
  "crm.contacts","crm.organizations","crm.deals","crm.tasks",
  "linkedin.ssi_tracker","linkedin.profile_texts","linkedin.connections","linkedin.messages",
  "reports.sales",
  "core.team_management",
  "assistant.basic"
]'::jsonb WHERE slug = 'sales-team';

-- Marketing Team (= Marketing + core.team_management)
UPDATE public.plans SET permissions = '[
  "branding.voice","branding.audiences","branding.knowledge","branding.icp",
  "linkedin.ssi_tracker","linkedin.profile_texts","linkedin.connections","linkedin.messages",
  "content.studio","content.calendar",
  "reports.sales",
  "core.team_management",
  "assistant.basic"
]'::jsonb WHERE slug = 'marketing-team';

-- KMU (5 Module + Premium-CRM-Features für den All-In-Seat im Team)
UPDATE public.plans SET permissions = '[
  "branding.voice","branding.audiences","branding.knowledge","branding.icp",
  "crm.contacts","crm.organizations","crm.deals","crm.tasks","crm.enrichment",
  "linkedin.ssi_tracker","linkedin.profile_texts","linkedin.connections","linkedin.messages","linkedin.automation","linkedin.cloud",
  "content.studio","content.calendar",
  "reports.sales",
  "core.integrations","core.team_management",
  "assistant.basic"
]'::jsonb WHERE slug = 'kmu';

-- Customized (alle 25, Admin kann trimmen)
UPDATE public.plans SET permissions = '[
  "branding.voice","branding.audiences","branding.knowledge","branding.icp",
  "crm.contacts","crm.organizations","crm.deals","crm.tasks","crm.enrichment",
  "linkedin.ssi_tracker","linkedin.profile_texts","linkedin.connections","linkedin.messages","linkedin.automation","linkedin.cloud",
  "content.studio","content.calendar",
  "delivery.projects","delivery.time_tracking",
  "reports.sales",
  "core.integrations","core.team_management","core.whitelabel","core.multi_account",
  "assistant.basic"
]'::jsonb WHERE slug = 'customized';

-- Trial (wie Sales)
UPDATE public.plans SET permissions = '[
  "branding.voice","branding.audiences","branding.knowledge","branding.icp",
  "crm.contacts","crm.organizations","crm.deals","crm.tasks",
  "linkedin.ssi_tracker","linkedin.profile_texts","linkedin.connections","linkedin.messages",
  "reports.sales",
  "assistant.basic"
]'::jsonb WHERE slug = 'trial';

-- Free (minimal)
UPDATE public.plans SET permissions = '[
  "branding.voice",
  "crm.contacts",
  "assistant.basic"
]'::jsonb WHERE slug = 'free' AND license_type = 'free';

-- Verifikation
DO $$
DECLARE
  v_plan record;
  v_zero_perm_plans text[];
BEGIN
  SELECT array_agg(slug ORDER BY slug) INTO v_zero_perm_plans
  FROM public.plans
  WHERE slug IN ('sales','marketing','all-in','sales-team','marketing-team','kmu','customized','trial','free')
    AND (permissions IS NULL OR jsonb_array_length(permissions) = 0)
    AND (slug != 'free' OR license_type = 'free');

  IF v_zero_perm_plans IS NOT NULL AND array_length(v_zero_perm_plans, 1) > 0 THEN
    RAISE EXCEPTION 'Migration FAILED: plans still without permissions: %', v_zero_perm_plans;
  END IF;

  RAISE NOTICE 'Migration OK: Permissions seeded für sales(14) marketing(12) all-in(25) sales-team(15) marketing-team(13) kmu(21) customized(25) trial(14) free(3)';

  FOR v_plan IN
    SELECT slug, jsonb_array_length(permissions) AS perm_count
    FROM public.plans
    WHERE slug IN ('sales','marketing','all-in','sales-team','marketing-team','kmu','customized','trial','free')
      AND is_active = true
    ORDER BY slug
  LOOP
    RAISE NOTICE '  %  → % permissions', v_plan.slug, v_plan.perm_count;
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

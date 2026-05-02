-- ================================================================
-- Leadesk: Staging-Plans-Seed aus Prod-Replikat
-- ================================================================
--
-- Quelle:    Hetzner-Prod (128.140.123.163), public.plans, Stand 2026-05-02
-- Ziel:      Hetzner-Staging (178.104.210.216), public.plans
-- Datum:     2026-05-02
-- Begründung: Phase 3 wurde nur auf Prod geseedet, Staging hat 0 Plans →
--             handle_new_user-Trigger crashed bei jedem Sign-Up.
--
-- ── Strategie ──
--
-- Pfad A aus Session-Handoff: Prod→Staging-Replikat mit hardcoded
-- Prod-UUIDs für Cross-Env-Konsistenz beim Debugging.
--
-- Schema-Drift Prod (32 cols) vs Staging (18 cols) ist bewusst:
--   - 15 Spalten nur in Prod (Legacy: price_eur, seats, daily_limit,
--     sort_order, max_lists, leads_monthly, ai_calls_monthly,
--     feature_pipeline, feature_brand_voice, feature_reports, ai_access,
--     description, stripe_price_id, wix_plan_id, wix_plan_name)
--     → werden NICHT transferiert (Staging hat sie nicht; moderne
--        Spalten wie max_team_members spiegeln die Information)
--   - 1 Spalte nur in Staging (updated_at) → Default now() greift
--
-- ── Idempotenz ──
--
-- ON CONFLICT (id) DO NOTHING — Re-Run nach erstem erfolgreichen Seed
-- ist no-op. Bei Schema-Updates oder Daten-Korrekturen: manuell
-- TRUNCATE plans CASCADE und re-run.
--
-- ── NOT NULL Coverage ──
--
-- Staging-NOT-NULL-Spalten: id, is_default_trial, is_trial, modules, name
-- Alle 5 werden explizit gesetzt → kein NULL-Constraint-Risiko.
--
-- ── Gesetzte Spalten (14 von 17 common) ──
--
-- Explicit:  id, name, slug, price_monthly, price_yearly, max_leads,
--            max_team_members, max_brand_voices, max_ai_generations,
--            max_vernetzungen_per_day, modules, features, is_active,
--            is_trial, is_default_trial
-- Default:   created_at (now()), updated_at (now()), trial_days (NULL)
-- ================================================================

INSERT INTO public.plans (
  id, name, slug,
  price_monthly, price_yearly,
  max_leads, max_team_members, max_brand_voices, max_ai_generations, max_vernetzungen_per_day,
  modules, features,
  is_active, is_trial, is_default_trial
) VALUES
  -- Free
  ('ea98eafd-0e71-4755-a275-982e6f5aaea6'::uuid, 'Free', 'free',
   0, 0,
   50, 1, 1, 50, 10,
   ARRAY['branding','crm','linkedin','content','delivery','reports'],
   '{}'::jsonb,
   true, false, false),

  -- Starter
  ('7dd9eb1d-6c4c-4564-9098-e82389fde433'::uuid, 'Starter', 'starter',
   29, 290,
   200, 1, 3, 500, 50,
   ARRAY['branding','crm','linkedin','content','delivery','reports'],
   '{}'::jsonb,
   true, false, false),

  -- Pro
  ('5d68d70a-4c54-4daf-b57b-ae98851851b1'::uuid, 'Pro', 'pro',
   79, 790,
   1000, 5, 10, 2000, 200,
   ARRAY['branding','crm','linkedin','content','delivery','reports'],
   '{}'::jsonb,
   true, false, false),

  -- Enterprise
  ('c4c11445-9f97-409a-bfd3-9c9f873c049b'::uuid, 'Enterprise', 'enterprise',
   199, 1990,
   -1, -1, -1, -1, -1,
   ARRAY['branding','crm','linkedin','content','delivery','reports'],
   '{}'::jsonb,
   true, false, false)

ON CONFLICT (id) DO NOTHING;

-- ── Verifikation (manuell nach Apply ausführen) ──
--
-- SELECT id, name, slug, is_active, is_trial, is_default_trial,
--        array_length(modules, 1) AS module_count
-- FROM public.plans ORDER BY price_monthly;
--
-- Erwartete 4 Rows: free/starter/pro/enterprise, alle is_active=t,
-- is_trial=f, is_default_trial=f, module_count=6.

-- ================================================================
-- Leadesk: Default-Plans Seed (Phase 3)
-- ================================================================
--
-- Seedet die 4 Standard-Pläne nach Cutover.
--
-- Idempotenz: bricht ab falls plans nicht leer ist (Pre-Check).
-- Manuelles Re-Seeden erfordert vorheriges TRUNCATE plans CASCADE.
--
-- Module: alle 4 Pläne bekommen alle 6 Module (inert, deckt Sidebar
-- voll ab — kein User merkt was bis Plan-Modules-Roll-out scharf ist).
--
-- Trial: keiner aktiv, kein Default-Trial. Markierst du später im
-- AdminUI (/admin/plans) bei Bedarf.
--
-- Apply NACH allen Phase-1+2-Migrations.
-- ================================================================

-- Pre-Check: nicht doppelt seeden
DO $$
DECLARE
  existing_count int;
BEGIN
  SELECT count(*) INTO existing_count FROM public.plans;
  IF existing_count > 0 THEN
    RAISE EXCEPTION 'plans-Tabelle ist nicht leer (% Rows) — Seed übersprungen. Manuell prüfen.', existing_count;
  END IF;
END $$;

INSERT INTO public.plans (
  name, slug, description,
  price_monthly, price_yearly,
  max_leads, max_team_members, max_brand_voices, max_ai_generations, max_vernetzungen_per_day,
  modules,
  is_active, is_trial, is_default_trial,
  feature_pipeline, feature_brand_voice, feature_reports, ai_access,
  sort_order,
  -- Legacy-Spalten parallel mitgesetzt für Code-Pfade die noch darauf zugreifen
  price_eur, seats, daily_limit, max_lists, leads_monthly, ai_calls_monthly,
  features
) VALUES
  ('Free', 'free', 'Zum Ausprobieren — alle Features, harte Mengen-Limits.',
   0, 0,
   50, 1, 1, 50, 10,
   ARRAY['branding','crm','linkedin','content','delivery','reports'],
   true, false, false,
   true, true, true, true,
   0,
   0, 1, 10, 3, 50, 50,
   '{}'::jsonb),

  ('Starter', 'starter', 'Für Einzelpersonen, die regelmäßig auf LinkedIn aktiv sind.',
   29, 290,
   200, 1, 3, 500, 50,
   ARRAY['branding','crm','linkedin','content','delivery','reports'],
   true, false, false,
   true, true, true, true,
   1,
   29, 1, 50, 10, 200, 500,
   '{}'::jsonb),

  ('Pro', 'pro', 'Für Teams, die Pipeline und Content-Produktion ernst nehmen.',
   79, 790,
   1000, 5, 10, 2000, 200,
   ARRAY['branding','crm','linkedin','content','delivery','reports'],
   true, false, false,
   true, true, true, true,
   2,
   79, 5, 200, 50, 1000, 2000,
   '{}'::jsonb),

  ('Enterprise', 'enterprise', 'Unbegrenzte Limits, Whitelabel, Custom-Onboarding.',
   199, 1990,
   -1, -1, -1, -1, -1,
   ARRAY['branding','crm','linkedin','content','delivery','reports'],
   true, false, false,
   true, true, true, true,
   3,
   199, -1, -1, -1, -1, -1,
   '{}'::jsonb);

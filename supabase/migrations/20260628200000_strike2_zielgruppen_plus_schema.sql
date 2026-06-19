-- 20260628200000_strike2_zielgruppen_plus_schema.sql
-- Strike2 Zielgruppen-Plus — Phase 0 (Schema). Marketplace-Addon + Personas-Tabelle.
-- Pre-Flight verifiziert (Staging+Prod, 2026-06-19): greenfield (kein strike-Addon,
-- keine strike2_personas), get_my_team_ids() + i_have_addon vorhanden.
--
-- addons-INSERT-Korrekturen ggü. Erst-Entwurf (Pre-Flight-Funde):
--   - 'description' existiert NICHT → short_description + long_description
--   - 'is_free_until' existiert NICHT → Free-Until läuft über Frontend-
--     ADDON_FREE_UNTIL-Map (wie sales-nav-sync), nicht über die DB
--   - category + type sind NOT NULL → gesetzt; type='feature_unlock' (CHECK)
-- Idempotent.

BEGIN;

-- 1. addons-Eintrag (free-activatable: stripe_price_id NULL + activates_modules nicht leer)
INSERT INTO public.addons (
  slug, name, short_description, long_description, category, type, activates_modules, is_active, price_monthly_cents
) VALUES (
  'strike2-zielgruppen-plus',
  'Strike2 Zielgruppen-Plus',
  'B2B-Personas nach dem Schuster-Modell® + 70 KI-Content-Ideen für den Redaktionsplan.',
  'Partnership mit Strike2 (Norbert Schuster): Erstelle B2B-Personas nach dem Schuster-Modell® und Empathischen Funnel®, lass KI 70 Content-Ideen für deinen Redaktionsplan generieren.',
  'feature',
  'feature_unlock',
  ARRAY['strike2_zielgruppen_plus'],
  true,
  0  -- NOT NULL; free-Addon → 0 Cent (CHECK price_monthly_cents >= 0)
)
ON CONFLICT (slug) DO UPDATE SET
  short_description = EXCLUDED.short_description,
  long_description  = EXCLUDED.long_description,
  category          = EXCLUDED.category,
  type              = EXCLUDED.type,
  activates_modules = EXCLUDED.activates_modules,
  is_active         = EXCLUDED.is_active;

-- 2. strike2_personas-Tabelle
CREATE TABLE IF NOT EXISTS public.strike2_personas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  team_id         UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','in_progress','review','completed','archived')),
  current_step    INTEGER NOT NULL DEFAULT 0,  -- 0=Grunddaten, 1=PER, ..., 7=IMP-RUC, 8=Review

  persona_grunddaten JSONB DEFAULT '{}'::jsonb,
  antworten          JSONB DEFAULT '{}'::jsonb,  -- {PER: {...}, INF: {...}, ...}
  generated_ideas    JSONB DEFAULT '[]'::jsonb,  -- [{phase_tag, content_type, title, hook, beschreibung, target_format}]

  generation_status TEXT DEFAULT 'pending'
                      CHECK (generation_status IN ('pending','running','done','failed')),
  generation_error  TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS strike2_personas_team_status_idx
  ON public.strike2_personas (team_id, status, created_at DESC);

-- updated_at-Trigger
CREATE OR REPLACE FUNCTION public.touch_strike2_personas_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS strike2_personas_touch ON public.strike2_personas;
CREATE TRIGGER strike2_personas_touch
  BEFORE UPDATE ON public.strike2_personas
  FOR EACH ROW EXECUTE FUNCTION public.touch_strike2_personas_updated_at();

-- 3. RLS (Vorlage lead_tasks_team_* / sales_nav_import_jobs)
ALTER TABLE public.strike2_personas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS strike2_personas_team_select ON public.strike2_personas;
CREATE POLICY strike2_personas_team_select ON public.strike2_personas FOR SELECT
  USING (team_id = ANY(get_my_team_ids()));

DROP POLICY IF EXISTS strike2_personas_team_insert ON public.strike2_personas;
CREATE POLICY strike2_personas_team_insert ON public.strike2_personas FOR INSERT
  WITH CHECK (user_id = auth.uid() AND team_id = ANY(get_my_team_ids()));

DROP POLICY IF EXISTS strike2_personas_team_update ON public.strike2_personas;
CREATE POLICY strike2_personas_team_update ON public.strike2_personas FOR UPDATE
  USING (team_id = ANY(get_my_team_ids()))
  WITH CHECK (team_id = ANY(get_my_team_ids()));

DROP POLICY IF EXISTS strike2_personas_team_delete ON public.strike2_personas;
CREATE POLICY strike2_personas_team_delete ON public.strike2_personas FOR DELETE
  USING (user_id = auth.uid() AND team_id = ANY(get_my_team_ids()));

-- 4. GRANTs (Self-Host — sonst 42501 trotz RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strike2_personas TO authenticated;
GRANT ALL ON public.strike2_personas TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

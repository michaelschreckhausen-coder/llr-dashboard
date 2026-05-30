-- Credits Phase 1 — credit_pricing Lookup-Tabelle
-- ─────────────────────────────────────────────────────────────────
-- Mapping pro (provider, model, operation, unit) → credits_per_unit.
-- Architektur: Pricing-Updates per UPDATE statt Re-Deploy.
--
-- tier ('basic' | 'premium') gating: Modelle mit tier='premium' nur in
-- Plänen mit 'premium' in plans.allowed_model_tiers verfügbar.
--
-- Seed-Werte sind initial-Schätzungen basierend auf $0.001/Credit-Logik
-- und API-Pricing-Doc (Stand 2026-05-29). Pro Modell + Tier UPDATE-tunebar
-- ohne Schema-Change.
--
-- Achtung Model-Strings: Die seedet werden hier als generic / Marketing-Names
-- ('claude-sonnet-4-6', 'gpt-5.4-mini', 'gemini-2.0-flash' usw.) — die
-- konkreten Model-Strings die generate-Edge-Function tatsächlich verwendet
-- können davon abweichen (Frontend-Model-Dropdown-Drift, siehe Known-Bugs).
-- Im Mismatch-Fall fällt record_usage auf Fallback-Min-Credit zurück + loggt
-- Warning. Anpassbar per UPDATE-Statement.

BEGIN;

CREATE TABLE IF NOT EXISTS public.credit_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model text NOT NULL,
  operation text NOT NULL,
  tier text NOT NULL DEFAULT 'basic',
  credits_per_unit numeric NOT NULL CHECK (credits_per_unit >= 0),
  unit text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, model, operation, unit)
);

ALTER TABLE public.credit_pricing
  DROP CONSTRAINT IF EXISTS credit_pricing_tier_check;
ALTER TABLE public.credit_pricing
  ADD CONSTRAINT credit_pricing_tier_check
  CHECK (tier IN ('basic','premium'));

ALTER TABLE public.credit_pricing
  DROP CONSTRAINT IF EXISTS credit_pricing_unit_check;
ALTER TABLE public.credit_pricing
  ADD CONSTRAINT credit_pricing_unit_check
  CHECK (unit IN ('call','1k_input_tokens','1k_output_tokens','image','minute','second'));

CREATE INDEX IF NOT EXISTS idx_credit_pricing_lookup
  ON public.credit_pricing (provider, model, operation)
  WHERE is_active = true;

-- updated_at-Auto-Trigger
CREATE OR REPLACE FUNCTION public.credit_pricing_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_pricing_updated_at ON public.credit_pricing;
CREATE TRIGGER trg_credit_pricing_updated_at
  BEFORE UPDATE ON public.credit_pricing
  FOR EACH ROW EXECUTE FUNCTION public.credit_pricing_set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────
ALTER TABLE public.credit_pricing ENABLE ROW LEVEL SECURITY;

-- Read für alle authenticated (Pricing-Preview im UI), Write nur Leadesk-Admin
DROP POLICY IF EXISTS credit_pricing_read_all ON public.credit_pricing;
CREATE POLICY credit_pricing_read_all ON public.credit_pricing FOR SELECT USING (true);

DROP POLICY IF EXISTS credit_pricing_write_admin ON public.credit_pricing;
CREATE POLICY credit_pricing_write_admin ON public.credit_pricing FOR ALL
USING (
  COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) = true
) WITH CHECK (
  COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) = true
);

-- Hetzner-Self-Host Grants (Fallstrick #3 + #12)
GRANT SELECT ON public.credit_pricing TO authenticated;
GRANT SELECT ON public.credit_pricing TO service_role;
GRANT ALL    ON public.credit_pricing TO postgres;

-- ── Seed: Basic-Modelle (verfügbar in Sales/Marketing/All-In) ─────
INSERT INTO public.credit_pricing (provider, model, operation, tier, credits_per_unit, unit, description) VALUES
  -- Anthropic Sonnet 4.6 (Default Text)
  ('anthropic','claude-sonnet-4-6','text_generate','basic',3,'1k_input_tokens','Sonnet 4.6 Input'),
  ('anthropic','claude-sonnet-4-6','text_generate','basic',15,'1k_output_tokens','Sonnet 4.6 Output'),
  -- Anthropic Haiku 4.5
  ('anthropic','claude-haiku-4-5','text_generate','basic',1,'1k_input_tokens','Haiku 4.5 Input'),
  ('anthropic','claude-haiku-4-5','text_generate','basic',5,'1k_output_tokens','Haiku 4.5 Output'),
  -- OpenAI GPT-5.4 Mini
  ('openai','gpt-5.4-mini','text_generate','basic',1,'1k_input_tokens','GPT-5.4 Mini Input'),
  ('openai','gpt-5.4-mini','text_generate','basic',4,'1k_output_tokens','GPT-5.4 Mini Output'),
  -- Google Gemini Flash
  ('google','gemini-2.0-flash','text_generate','basic',1,'1k_input_tokens','Gemini Flash Input'),
  ('google','gemini-2.0-flash','text_generate','basic',3,'1k_output_tokens','Gemini Flash Output'),
  -- Mistral Small
  ('mistral','mistral-small-latest','text_generate','basic',1,'1k_input_tokens','Mistral Small Input'),
  ('mistral','mistral-small-latest','text_generate','basic',3,'1k_output_tokens','Mistral Small Output'),
  -- Mistral Medium
  ('mistral','mistral-medium-latest','text_generate','basic',2,'1k_input_tokens','Mistral Medium Input'),
  ('mistral','mistral-medium-latest','text_generate','basic',6,'1k_output_tokens','Mistral Medium Output'),
  -- Bilder Basic
  ('openai','gpt-image-mini','image_generate','basic',11,'image','GPT-Image-Mini (Standard)'),
  ('google','gemini-nano-banana','image_generate','basic',40,'image','Nano Banana (Gemini Flash Image)'),
  -- Voice
  ('openai','whisper-1','transcribe','basic',6,'minute','Whisper Voice-to-Text')
ON CONFLICT (provider, model, operation, unit) DO NOTHING;

-- ── Seed: Premium-Modelle (nur All-In) ────────────────────────────
INSERT INTO public.credit_pricing (provider, model, operation, tier, credits_per_unit, unit, description) VALUES
  -- Anthropic Opus 4.7
  ('anthropic','claude-opus-4-7','text_generate','premium',15,'1k_input_tokens','Opus 4.7 Input'),
  ('anthropic','claude-opus-4-7','text_generate','premium',75,'1k_output_tokens','Opus 4.7 Output'),
  -- OpenAI GPT-5.5
  ('openai','gpt-5.5','text_generate','premium',10,'1k_input_tokens','GPT-5.5 Input'),
  ('openai','gpt-5.5','text_generate','premium',40,'1k_output_tokens','GPT-5.5 Output'),
  -- Google Gemini 2.5 Pro
  ('google','gemini-2.5-pro','text_generate','premium',8,'1k_input_tokens','Gemini 2.5 Pro Input'),
  ('google','gemini-2.5-pro','text_generate','premium',32,'1k_output_tokens','Gemini 2.5 Pro Output'),
  -- Mistral Large
  ('mistral','mistral-large-latest','text_generate','premium',8,'1k_input_tokens','Mistral Large Input'),
  ('mistral','mistral-large-latest','text_generate','premium',24,'1k_output_tokens','Mistral Large Output'),
  -- Premium-Bilder
  ('openai','gpt-image-1-high','image_generate','premium',167,'image','GPT-Image-1 High Quality'),
  ('google','gemini-3-pro-image','image_generate','premium',300,'image','Gemini 3 Pro Image')
ON CONFLICT (provider, model, operation, unit) DO NOTHING;

-- Verifikation
DO $$
DECLARE
  v_basic_count int;
  v_premium_count int;
BEGIN
  SELECT count(*) INTO v_basic_count   FROM public.credit_pricing WHERE tier='basic'   AND is_active=true;
  SELECT count(*) INTO v_premium_count FROM public.credit_pricing WHERE tier='premium' AND is_active=true;

  RAISE NOTICE 'Migration OK: credit_pricing seeded — basic=%, premium=%', v_basic_count, v_premium_count;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Tier-2-Update: neue Modelle in credit_pricing.
-- Konvention: 1 Credit = $0.001 → credits_per_unit = $/M Tokens (input/output separat)
-- Bildmodelle: 1 Credit ≈ $0.001 → credits_per_unit = $0.001-Eintraege fuer Image-Cost.

BEGIN;

-- Anthropic Opus 4.8 (NEU): $5/$25 per M tokens (laut webrecherche, identisch zu 4.7)
INSERT INTO credit_pricing (provider, model, operation, unit, credits_per_unit, description)
VALUES
  ('anthropic','claude-opus-4-8','text_generate','1k_input_tokens', 5, 'Claude Opus 4.8 — Mai 2026'),
  ('anthropic','claude-opus-4-8','text_generate','1k_output_tokens',25,'Claude Opus 4.8 — Mai 2026')
ON CONFLICT (provider, model, operation, unit) DO UPDATE
  SET credits_per_unit = EXCLUDED.credits_per_unit, updated_at = NOW();

-- OpenAI GPT-5.5 (NEU): $5/$30 per M tokens
INSERT INTO credit_pricing (provider, model, operation, unit, credits_per_unit, description)
VALUES
  ('openai','gpt-5.5','text_generate','1k_input_tokens', 5,'GPT-5.5 — Juni 2026 1M context'),
  ('openai','gpt-5.5','text_generate','1k_output_tokens',30,'GPT-5.5 — Juni 2026 1M context')
ON CONFLICT (provider, model, operation, unit) DO UPDATE
  SET credits_per_unit = EXCLUDED.credits_per_unit, updated_at = NOW();

-- Google Gemini 3 Pro Preview (NEU, Tier 2+)
-- Pricing aus Web-Recherche: ~$2/M input, $12/M output (Pro-Klasse)
INSERT INTO credit_pricing (provider, model, operation, unit, credits_per_unit, description)
VALUES
  ('google','gemini-3-pro-preview','text_generate','1k_input_tokens', 2,'Gemini 3 Pro Preview — Tier 2'),
  ('google','gemini-3-pro-preview','text_generate','1k_output_tokens',12,'Gemini 3 Pro Preview — Tier 2'),
  ('google','gemini-3.5-flash','text_generate','1k_input_tokens',     1.5,'Gemini 3.5 Flash — Mai 2026'),
  ('google','gemini-3.5-flash','text_generate','1k_output_tokens',    9,'Gemini 3.5 Flash — Mai 2026'),
  ('google','gemini-2.5-pro','text_generate','1k_input_tokens',       1.25,'Gemini 2.5 Pro'),
  ('google','gemini-2.5-pro','text_generate','1k_output_tokens',      10,'Gemini 2.5 Pro')
ON CONFLICT (provider, model, operation, unit) DO UPDATE
  SET credits_per_unit = EXCLUDED.credits_per_unit, updated_at = NOW();

-- Mistral Magistral Medium (Reasoning-Modell, NEU)
INSERT INTO credit_pricing (provider, model, operation, unit, credits_per_unit, description)
VALUES
  ('mistral','magistral-medium-latest','text_generate','1k_input_tokens', 2,'Magistral Medium — Reasoning-Modell'),
  ('mistral','magistral-medium-latest','text_generate','1k_output_tokens',5,'Magistral Medium — Reasoning-Modell')
ON CONFLICT (provider, model, operation, unit) DO UPDATE
  SET credits_per_unit = EXCLUDED.credits_per_unit, updated_at = NOW();

-- Nano Banana Pro (gemini-3-pro-image-preview) — Bildmodell, Tier 2+
-- Pricing: $0.039 @ 1K (Std), $0.134 @ 2K, $0.24 @ 4K — wir setzen 1K-Stage als Default
INSERT INTO credit_pricing (provider, model, operation, unit, credits_per_unit, description)
VALUES
  ('google','gemini-3-pro-image-preview','image_generate','image', 39,'Nano Banana Pro 1024x1024 — Tier 2')
ON CONFLICT (provider, model, operation, unit) DO UPDATE
  SET credits_per_unit = EXCLUDED.credits_per_unit, updated_at = NOW();

-- Outdate-Aliase fuer Frontend-Strings die Edge function nutzt
INSERT INTO credit_pricing (provider, model, operation, unit, credits_per_unit, description)
VALUES
  ('google','gemini-2.5-flash-image','image_generate','image', 39,'Nano Banana — Gemini 2.5 Flash Image'),
  ('google','gemini-3.1-flash-image-preview','image_generate','image', 39,'Nano Banana 2 — Gemini 3.1 Flash Image Preview')
ON CONFLICT (provider, model, operation, unit) DO UPDATE
  SET credits_per_unit = EXCLUDED.credits_per_unit, updated_at = NOW();

COMMIT;

SELECT provider, model, operation, unit, credits_per_unit
FROM credit_pricing WHERE is_active=true AND
  (model LIKE 'claude-opus-4-8%' OR model LIKE 'gpt-5.5%' OR model LIKE 'gemini-3%' OR model LIKE 'gemini-3.5%' OR model LIKE 'magistral%' OR model LIKE 'gemini-2.5-pro' OR model LIKE 'gemini-2.5-flash-image' OR model LIKE 'gemini-3.1-flash-image-preview')
ORDER BY provider, model, operation;

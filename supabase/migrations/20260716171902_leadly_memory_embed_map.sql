-- Re-Embedding-Fundament: embedding_json wird von einem einzelnen Vektor (array)
-- auf eine Map { "<provider>": <vektor> } umgestellt. So kann eine Notiz in mehreren
-- Anbieter-"Sprachen" vorliegen; fehlende Sprachen werden beim Abruf im Hintergrund
-- nachgefüllt (Self-Healing nach Anbieterwechsel). Idempotent (nur array/NULL wird konvertiert).

-- 1) Bereits als Flat-Array gespeicherte Embeddings -> { provider: array }
UPDATE public.leadly_memory
  SET embedding_json = jsonb_build_object(COALESCE(embed_provider,'openai'), embedding_json)
  WHERE jsonb_typeof(embedding_json) = 'array';
UPDATE public.leadly_account_memory
  SET embedding_json = jsonb_build_object(COALESCE(embed_provider,'openai'), embedding_json)
  WHERE jsonb_typeof(embedding_json) = 'array';

-- 2) Legacy-Vektoren (vector-Spalte, OpenAI-Raum) -> { "openai": array }
UPDATE public.leadly_memory
  SET embedding_json = jsonb_build_object('openai', embedding::text::jsonb)
  WHERE embedding_json IS NULL AND embedding IS NOT NULL;
UPDATE public.leadly_account_memory
  SET embedding_json = jsonb_build_object('openai', embedding::text::jsonb)
  WHERE embedding_json IS NULL AND embedding IS NOT NULL;

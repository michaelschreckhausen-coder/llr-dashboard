-- ISO 27001 / Datenresidenz: Leadly-Memory-Embeddings folgen dem gewählten Anbieter.
-- Da die Ähnlichkeit in JS gerechnet wird, speichern wir Vektoren als jsonb (variable
-- Dimension: OpenAI 1536 / Mistral 1024 / Google 768) + den erzeugenden Provider.
-- Verglichen wird immer nur innerhalb desselben Vektorraums (embed_provider gleich).
-- Legacy-Spalte `embedding` (vector, OpenAI-Raum) bleibt für Altbestand erhalten.

ALTER TABLE public.leadly_memory
  ADD COLUMN IF NOT EXISTS embed_provider text,
  ADD COLUMN IF NOT EXISTS embedding_json jsonb;

ALTER TABLE public.leadly_account_memory
  ADD COLUMN IF NOT EXISTS embed_provider text,
  ADD COLUMN IF NOT EXISTS embedding_json jsonb;

-- Altbestand: bestehende Rows haben ein OpenAI-Embedding in `embedding`.
-- Markiere sie als 'openai', damit OpenAI-Nutzer ihre alten Memories weiter treffen.
UPDATE public.leadly_memory         SET embed_provider = 'openai' WHERE embed_provider IS NULL AND embedding IS NOT NULL;
UPDATE public.leadly_account_memory SET embed_provider = 'openai' WHERE embed_provider IS NULL AND embedding IS NOT NULL;

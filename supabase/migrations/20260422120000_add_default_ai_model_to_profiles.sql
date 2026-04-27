-- Migration: default_ai_model zu profiles hinzufügen
-- Für Multi-Provider KI-Modell-Auswahl (Anthropic/OpenAI/Google/Mistral)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_ai_model TEXT DEFAULT 'claude-sonnet-4-6';

UPDATE public.profiles
  SET default_ai_model = 'claude-sonnet-4-6'
  WHERE default_ai_model IS NULL;

-- Add source_url column to knowledge_base
-- Enables URL-based knowledge import in Wissensdatenbank (Link als dritte Import-Option
-- neben Datei-Upload und Text-Eingabe).
-- Staging wurde am 2026-04-17 bereits mit diesem Schema rebuilt; Production muss diese
-- Migration noch anwenden.

ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS source_url text DEFAULT ''::text;

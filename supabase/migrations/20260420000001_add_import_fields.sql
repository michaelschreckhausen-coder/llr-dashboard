-- Add import fields to brand_voices and target_audiences
-- Enables file/URL import (via KnowledgeImporter) for Brand Voice and Zielgruppen,
-- analog zum URL-Import der Wissensdatenbank (v2.7.3).
-- Zielgruppen bekommen zusätzlich hobbies + linkedin_template_url.

ALTER TABLE public.brand_voices
  ADD COLUMN IF NOT EXISTS imported_context text DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS file_name text DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS file_url text DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS file_type text DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS source_url text DEFAULT ''::text;

ALTER TABLE public.target_audiences
  ADD COLUMN IF NOT EXISTS hobbies text DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS imported_context text DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS file_name text DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS file_url text DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS file_type text DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS source_url text DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS linkedin_template_url text DEFAULT ''::text;

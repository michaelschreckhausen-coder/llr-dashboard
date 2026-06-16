-- Multi-Company für Content: Personal Brands können bei der Generierung
-- (Brainstorm, Text-Werkstatt, Visuals, Post-Editor) mehrere Company Brands wählen.
-- Alle gewählten Company-Kontexte fließen in EINE kombinierte Generierung.
-- Angewandt auf STAGING 2026-06-16. content_chats gehört supabase_admin → als supabase_admin fahren.
ALTER TABLE public.content_chats ADD COLUMN IF NOT EXISTS company_voice_ids uuid[];
ALTER TABLE public.content_posts ADD COLUMN IF NOT EXISTS company_voice_ids uuid[];
-- Backfill aus bestehendem Single-Wert
UPDATE public.content_chats SET company_voice_ids = ARRAY[company_voice_id]
  WHERE company_voice_id IS NOT NULL AND company_voice_ids IS NULL;
UPDATE public.content_posts SET company_voice_ids = ARRAY[company_voice_id]
  WHERE company_voice_id IS NOT NULL AND company_voice_ids IS NULL;

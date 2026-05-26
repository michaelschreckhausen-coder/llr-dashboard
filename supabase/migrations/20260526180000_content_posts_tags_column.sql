-- Mini-Migration: content_posts.tags-Spalte (TEXT[])
-- UI-Code in Redaktionsplan.jsx liest+schreibt tags seit längerem, Spalte
-- existierte aber nie. PGRST204-Fehler beim Insert ("Could not find the
-- 'tags' column"). Behebt damit den UI-Bug bei "+Erstellen".

ALTER TABLE public.content_posts
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}'::text[];

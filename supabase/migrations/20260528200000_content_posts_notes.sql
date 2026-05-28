-- Migration: content_posts.notes
-- Im PostModal gibt es ein "Notizen"-Textfeld (interne Notes), die Spalte
-- existierte aber noch nicht auf der Tabelle. Wird hinzugefügt.

BEGIN;

ALTER TABLE public.content_posts
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.content_posts.notes IS
  'Interne Notizen zum Beitrag (Recherche-Quellen, Ideen, Anmerkungen) — nicht Teil des veröffentlichten LinkedIn-Posts.';

NOTIFY pgrst, 'reload schema';

COMMIT;

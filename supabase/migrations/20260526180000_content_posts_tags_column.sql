-- Mini-Migration: content_posts.tags-Spalte (TEXT[])
-- UI-Code in Redaktionsplan.jsx liest+schreibt tags seit längerem, Spalte
-- existierte aber nie. PGRST204-Fehler beim Insert ("Could not find the
-- 'tags' column"). Behebt damit den UI-Bug bei "+Erstellen".

ALTER TABLE public.content_posts
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}'::text[];

-- Plus: post_publish_queue.service_role-Grant fehlte (content_v2_foundation hatte
-- nur authenticated). Edge-Function linkedin-publish-post konnte content_posts
-- updaten (hat service_role-Grant) aber NICHT post_publish_queue → queue-Status
-- blieb auf 'in_progress' bei failed/success-Calls aus dem Cron-Worker.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_publish_queue TO service_role;

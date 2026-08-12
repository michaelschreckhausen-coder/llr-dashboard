-- KI-Kennzeichnung (EU-KI-VO Art. 50): pro Beitrag optionaler KI-Hinweis.
ALTER TABLE public.content_posts
  ADD COLUMN IF NOT EXISTS ai_disclosure text NOT NULL DEFAULT 'none';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_posts_ai_disclosure_chk') THEN
    ALTER TABLE public.content_posts
      ADD CONSTRAINT content_posts_ai_disclosure_chk
      CHECK (ai_disclosure IN ('none','ai_generated','ai_modified'));
  END IF;
END $$;

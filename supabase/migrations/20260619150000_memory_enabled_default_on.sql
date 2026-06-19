-- Memory standardmäßig AN: Default true + NULLs auffüllen (explizite false bleiben).
ALTER TABLE public.user_preferences ALTER COLUMN memory_enabled SET DEFAULT true;
UPDATE public.user_preferences SET memory_enabled = true WHERE memory_enabled IS NULL;

-- Prüft ob eine Brand Voice ein aktives (nicht widerrufenes) LinkedIn-OAuth-Token hat
-- (= kann posten/planen). SECURITY DEFINER, gibt nur Boolean zurück (keine Token-Preisgabe).
CREATE OR REPLACE FUNCTION public.bv_linkedin_connected(bv_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT bv_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM linkedin_oauth_tokens t
    WHERE t.brand_voice_id = bv_id AND t.revoked_at IS NULL
  );
$$;
GRANT EXECUTE ON FUNCTION public.bv_linkedin_connected(uuid) TO authenticated;

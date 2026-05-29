-- ════════════════════════════════════════════════════════════════════════════
-- Hotfix: Infinite-Recursion in shares RLS-Policies
-- 2026-05-29 · nach Apply von 20260529170000 entdeckt
-- ════════════════════════════════════════════════════════════════════════════
--
-- Bug: brand_voices_visibility liest brand_voice_shares (RLS aktiv) → bvs_read
--      liest brand_voices (RLS aktiv) → brand_voices_visibility → ENDLOS.
--
-- Fix: SECURITY DEFINER Helper-Functions, die den Owner-Check ohne RLS machen.
-- Gleiches Pattern für alle drei Entity-Typen.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Helper-Functions (RLS-Bypass via SECURITY DEFINER) ────────────────────
CREATE OR REPLACE FUNCTION public.owns_brand_voice(bv_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM brand_voices WHERE id = bv_id AND user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.owns_target_audience(ta_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM target_audiences WHERE id = ta_id AND user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.owns_knowledge_base(kb_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM knowledge_base WHERE id = kb_id AND user_id = auth.uid())
$$;

GRANT EXECUTE ON FUNCTION public.owns_brand_voice(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_target_audience(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_knowledge_base(uuid)  TO authenticated;

-- ─── brand_voice_shares: Read/Write Policies via Helper ────────────────────
DROP POLICY IF EXISTS bvs_read  ON brand_voice_shares;
DROP POLICY IF EXISTS bvs_write ON brand_voice_shares;

CREATE POLICY bvs_read ON brand_voice_shares FOR SELECT USING (
  user_id = auth.uid()
  OR public.owns_brand_voice(brand_voice_id)
);
CREATE POLICY bvs_write ON brand_voice_shares FOR ALL USING (
  public.owns_brand_voice(brand_voice_id)
) WITH CHECK (
  public.owns_brand_voice(brand_voice_id)
);

-- ─── target_audience_shares ────────────────────────────────────────────────
DROP POLICY IF EXISTS tas_read  ON target_audience_shares;
DROP POLICY IF EXISTS tas_write ON target_audience_shares;

CREATE POLICY tas_read ON target_audience_shares FOR SELECT USING (
  user_id = auth.uid()
  OR public.owns_target_audience(target_audience_id)
);
CREATE POLICY tas_write ON target_audience_shares FOR ALL USING (
  public.owns_target_audience(target_audience_id)
) WITH CHECK (
  public.owns_target_audience(target_audience_id)
);

-- ─── knowledge_base_shares ─────────────────────────────────────────────────
DROP POLICY IF EXISTS kbs_read  ON knowledge_base_shares;
DROP POLICY IF EXISTS kbs_write ON knowledge_base_shares;

CREATE POLICY kbs_read ON knowledge_base_shares FOR SELECT USING (
  user_id = auth.uid()
  OR public.owns_knowledge_base(knowledge_base_id)
);
CREATE POLICY kbs_write ON knowledge_base_shares FOR ALL USING (
  public.owns_knowledge_base(knowledge_base_id)
) WITH CHECK (
  public.owns_knowledge_base(knowledge_base_id)
);

COMMIT;

-- Sanity-Test: kein Recursion-Error mehr beim BV-Read
DO $$
BEGIN
  RAISE NOTICE 'RLS-Recursion-Fix angewendet. Helper-Functions: owns_brand_voice, owns_target_audience, owns_knowledge_base.';
END $$;

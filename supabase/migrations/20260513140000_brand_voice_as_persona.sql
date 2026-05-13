-- ============================================================
-- Brand Voice als zentraler Auftritt — Schema-Refactor
-- ============================================================
-- Konzept: Brand Voice repräsentiert ab jetzt einen konkreten
-- LinkedIn-Auftritt (Privat-Profil oder Company-Page). Sie wird zum
-- zentralen Anker, von dem aus Redaktionsplan, Text-Werkstatt, Visuals,
-- Zielgruppen und Wissensdatenbank kontextualisiert werden.
--
-- Variante B fuer ZG/KB: M:N-Verknüpfung (eine ZG kann zu mehreren BVs
-- gehoeren, eine BV kann mehrere ZGs haben).
--
-- Existierende Posts ohne BV werden geloescht (Julians Anweisung).

BEGIN;

-- ============================================================
-- 1) brand_voices: neue Felder fuer Auftritts-Konzept
-- ============================================================
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS account_type text
  CHECK (account_type IN ('personal','company_page','other'))
  DEFAULT 'personal';

ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS linkedin_url text;

-- is_shared existiert schon — Semantik klarstellen via Kommentar:
-- TRUE = mit allen Team-Mitgliedern geteilt (sichtbar im Switcher).
-- FALSE = privat (nur Owner sieht sie).
COMMENT ON COLUMN public.brand_voices.is_shared IS
  'TRUE = mit Team geteilt, FALSE = privat. Steuert Sichtbarkeit im BV-Switcher.';

-- ============================================================
-- 2) content_posts: BV-Verknüpfung wird Pflicht
-- ============================================================

-- 2a) Posts ohne BV loeschen (laut Julian: 'einfach löschen, gibts kaum')
DELETE FROM public.content_posts WHERE brand_voice_id IS NULL;

-- 2b) NOT NULL erzwingen
ALTER TABLE public.content_posts ALTER COLUMN brand_voice_id SET NOT NULL;

-- 2c) Workspace-Spalte wird redundant — wir behalten sie aber als Legacy
-- (fuer evtl. spaetere Differenzierung 'team_support' bleibt nuetzlich)
-- Default kann auf 'personal' bleiben.

-- ============================================================
-- 3) M:N — Zielgruppen ↔ Brand Voices
-- ============================================================
CREATE TABLE IF NOT EXISTS public.target_audience_brand_voices (
  target_audience_id uuid NOT NULL REFERENCES public.target_audiences(id) ON DELETE CASCADE,
  brand_voice_id     uuid NOT NULL REFERENCES public.brand_voices(id)    ON DELETE CASCADE,
  team_id            uuid NOT NULL REFERENCES public.teams(id),
  created_at         timestamptz DEFAULT now(),
  PRIMARY KEY (target_audience_id, brand_voice_id)
);
CREATE INDEX IF NOT EXISTS idx_ta_bv_bv  ON public.target_audience_brand_voices(brand_voice_id);
CREATE INDEX IF NOT EXISTS idx_ta_bv_ta  ON public.target_audience_brand_voices(target_audience_id);

-- ============================================================
-- 4) M:N — Wissensdatenbank ↔ Brand Voices
-- ============================================================
CREATE TABLE IF NOT EXISTS public.knowledge_base_brand_voices (
  knowledge_base_id uuid NOT NULL REFERENCES public.knowledge_base(id) ON DELETE CASCADE,
  brand_voice_id    uuid NOT NULL REFERENCES public.brand_voices(id)   ON DELETE CASCADE,
  team_id           uuid NOT NULL REFERENCES public.teams(id),
  created_at        timestamptz DEFAULT now(),
  PRIMARY KEY (knowledge_base_id, brand_voice_id)
);
CREATE INDEX IF NOT EXISTS idx_kb_bv_bv ON public.knowledge_base_brand_voices(brand_voice_id);
CREATE INDEX IF NOT EXISTS idx_kb_bv_kb ON public.knowledge_base_brand_voices(knowledge_base_id);

-- ============================================================
-- 5) user_preferences: aktive Brand Voice merken
-- ============================================================
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS active_brand_voice_id uuid REFERENCES public.brand_voices(id) ON DELETE SET NULL;

-- ============================================================
-- 6) RLS-Policies — alle neuen Tabellen team-scoped
-- ============================================================
ALTER TABLE public.target_audience_brand_voices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ta_bv_team ON public.target_audience_brand_voices;
CREATE POLICY ta_bv_team ON public.target_audience_brand_voices FOR ALL USING (
  team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
) WITH CHECK (
  team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
);

ALTER TABLE public.knowledge_base_brand_voices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kb_bv_team ON public.knowledge_base_brand_voices;
CREATE POLICY kb_bv_team ON public.knowledge_base_brand_voices FOR ALL USING (
  team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
) WITH CHECK (
  team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
);

-- brand_voices Read-Policy erweitern: User sieht eigene + team-geteilte BVs
ALTER TABLE public.brand_voices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brand_voices_own_or_shared ON public.brand_voices;
DROP POLICY IF EXISTS brand_voices_select ON public.brand_voices;
DROP POLICY IF EXISTS brand_voices_user_owned ON public.brand_voices;
CREATE POLICY brand_voices_select ON public.brand_voices FOR SELECT USING (
  user_id = auth.uid()  -- eigene BVs
  OR (
    is_shared = true
    AND team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  )
);
DROP POLICY IF EXISTS brand_voices_write_own ON public.brand_voices;
CREATE POLICY brand_voices_write_own ON public.brand_voices FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
DROP POLICY IF EXISTS brand_voices_update_own ON public.brand_voices;
CREATE POLICY brand_voices_update_own ON public.brand_voices FOR UPDATE USING (
  user_id = auth.uid()
);
DROP POLICY IF EXISTS brand_voices_delete_own ON public.brand_voices;
CREATE POLICY brand_voices_delete_own ON public.brand_voices FOR DELETE USING (
  user_id = auth.uid()
);

-- ============================================================
-- 7) Grants
-- ============================================================
GRANT ALL ON public.target_audience_brand_voices  TO authenticated;
GRANT ALL ON public.knowledge_base_brand_voices   TO authenticated;
GRANT ALL ON public.brand_voices                  TO authenticated;
GRANT ALL ON public.content_posts                 TO authenticated;
GRANT ALL ON public.user_preferences              TO authenticated;

COMMIT;

-- ============================================================
-- Verifikation
-- ============================================================
SELECT 'brand_voices' AS t, column_name FROM information_schema.columns
WHERE table_name='brand_voices' AND column_name IN ('account_type','linkedin_url','is_shared')
ORDER BY column_name;

SELECT 'content_posts.brand_voice_id NOT NULL' AS check_, is_nullable
FROM information_schema.columns
WHERE table_name='content_posts' AND column_name='brand_voice_id';

SELECT 'rel-tables' AS t, table_name FROM information_schema.tables
WHERE table_schema='public'
AND table_name IN ('target_audience_brand_voices','knowledge_base_brand_voices');

-- ============================================================================
-- Granulare LinkedIn-Freigabe pro Marke × Team — SLICE A (Fundament)
-- Spalte + Home-Team-Backfill + Scope-Helper + get_brand_linkedin_caps.
-- NUR Fundament: KEIN RLS-Rewrite (Slice B), KEIN DEFINER-Gating (Slice C).
-- Nach Slice A ist Verhalten UNVERÄNDERT (alle Bereiche geteilt) — die Helper
-- werden erst in B/C an die RLS/RPCs verdrahtet.
--
-- Lifecycle-Sicherheit (Reviewer P1): Home-Team-Zugriff läuft über bv.is_shared;
-- has_brand_linkedin_scope gated Home-Rows ZUSÄTZLICH an b.is_shared=true. Damit
-- darf die gebackfillte Home-Row gefahrlos stehenbleiben — entteilen (is_shared=
-- false) entzieht LinkedIn zwingend, kein Stale-Leak. Kein Trigger nötig.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off
BEGIN;

-- ── 1) Scope-Spalte (idempotent, Default = alle 6 Bereiche → Back-Compat) ────
ALTER TABLE public.brand_voice_team_shares
  ADD COLUMN IF NOT EXISTS linkedin_scopes text[] NOT NULL
  DEFAULT ARRAY['inbox','network','search','automation','engagement','analytics'];

-- ── 2) Pre-Flight: wie viele Home-Team-Freigaben werden gebackfillt? ─────────
\echo '--- Pre-Flight: Home-Team-shared Brands (is_shared=true AND team_id NOT NULL) ---'
SELECT count(*) AS home_backfill_kandidaten
FROM public.brand_voices WHERE is_shared = true AND team_id IS NOT NULL;

-- ── 3) Backfill: je Home-Team-Brand eine brand_voice_team_shares-Row (alle Scopes)
--    Idempotent: UNIQUE(brand_voice_id, team_id) + ON CONFLICT DO NOTHING →
--    keine Doppel-Row, falls schon eine (Cross-)Row fürs selbe Team existiert. ─
INSERT INTO public.brand_voice_team_shares (brand_voice_id, team_id, shared_by, linkedin_scopes)
SELECT bv.id, bv.team_id, bv.user_id,
       ARRAY['inbox','network','search','automation','engagement','analytics']
FROM public.brand_voices bv
WHERE bv.is_shared = true AND bv.team_id IS NOT NULL
ON CONFLICT (brand_voice_id, team_id) DO NOTHING;

-- ── 4) Helper: has_brand_access_direct — Owner ODER Per-User-Share → IMMER voll
--    (kein Team-Grant; MVP-Entscheidung: Per-User-Share bleibt ungescoped voll). ─
CREATE OR REPLACE FUNCTION public.has_brand_access_direct(bv_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT bv_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM brand_voices b       WHERE b.id = bv_id AND b.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM brand_voice_shares s WHERE s.brand_voice_id = bv_id AND s.user_id = auth.uid())
  );
$fn$;
GRANT EXECUTE ON FUNCTION public.has_brand_access_direct(uuid) TO authenticated, service_role;

-- ── 5) Helper: has_brand_linkedin_scope(bv, scope) — greift der Bereich für den
--    aktuellen User? Owner/Per-User (voll) · Home-Team (is_shared-gated, Scope aus
--    Home-Row oder default-alle) · Cross-Team (eigene Row, Scope muss drin sein).
--    SECURITY DEFINER liest brand_voices/brand_voice_team_shares direkt (bypass
--    RLS) → keine Rekursion (Muster get_my_team_ids / has_brand_access). ────────
CREATE OR REPLACE FUNCTION public.has_brand_linkedin_scope(bv_id uuid, scope text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT bv_id IS NOT NULL AND (
    has_brand_access_direct(bv_id)
    -- Home-Team-Grant: NUR wenn die Marke aktuell home-geteilt ist (is_shared);
    -- Scope kommt aus der Home-Row (team_id = bv.team_id) oder default = alle.
    OR EXISTS (
      SELECT 1 FROM brand_voices b
      WHERE b.id = bv_id AND b.is_shared = true AND b.team_id = ANY (get_my_team_ids())
        AND COALESCE(
              (SELECT scope = ANY (ts.linkedin_scopes)
                 FROM brand_voice_team_shares ts
                WHERE ts.brand_voice_id = bv_id AND ts.team_id = b.team_id),
              true)
    )
    -- Cross-Team-Grant: eigene Row (team_id <> Home-Team), Scope muss enthalten sein.
    OR EXISTS (
      SELECT 1 FROM brand_voice_team_shares ts
      JOIN brand_voices b2 ON b2.id = ts.brand_voice_id
      WHERE ts.brand_voice_id = bv_id
        AND ts.team_id = ANY (get_my_team_ids())
        AND ts.team_id IS DISTINCT FROM b2.team_id
        AND scope = ANY (ts.linkedin_scopes)
    )
  );
$fn$;
GRANT EXECUTE ON FUNCTION public.has_brand_linkedin_scope(uuid, text) TO authenticated, service_role;

-- ── 6) RPC: get_brand_linkedin_caps — pro Bereich granted-Flag fürs UI-Gating.
--    has_brand_access-Gate oben (nur wer die Marke sieht, kriegt Caps). ─────────
CREATE OR REPLACE FUNCTION public.get_brand_linkedin_caps(p_brand_voice_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT CASE
    WHEN p_brand_voice_id IS NULL OR NOT has_brand_access(p_brand_voice_id)
      THEN jsonb_build_object('error','forbidden')
    ELSE jsonb_build_object(
      'inbox',      has_brand_linkedin_scope(p_brand_voice_id,'inbox'),
      'network',    has_brand_linkedin_scope(p_brand_voice_id,'network'),
      'search',     has_brand_linkedin_scope(p_brand_voice_id,'search'),
      'automation', has_brand_linkedin_scope(p_brand_voice_id,'automation'),
      'engagement', has_brand_linkedin_scope(p_brand_voice_id,'engagement'),
      'analytics',  has_brand_linkedin_scope(p_brand_voice_id,'analytics')
    )
  END;
$fn$;
GRANT EXECUTE ON FUNCTION public.get_brand_linkedin_caps(uuid) TO authenticated, service_role;

-- ── 7) Verifikation ─────────────────────────────────────────────────────────
\echo '--- Verify: Home-Rows in brand_voice_team_shares (scopes = alle?) ---'
SELECT count(*) AS team_share_rows,
       count(*) FILTER (WHERE cardinality(linkedin_scopes) = 6) AS full_scope_rows
FROM public.brand_voice_team_shares;
\echo '--- Verify: Helper + RPC existieren ---'
SELECT proname FROM pg_proc WHERE proname IN ('has_brand_access_direct','has_brand_linkedin_scope','get_brand_linkedin_caps') ORDER BY proname;

COMMIT;

NOTIFY pgrst, 'reload schema';

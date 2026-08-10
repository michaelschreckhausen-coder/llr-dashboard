-- ============================================================================
-- Listen-Freigabe mit expliziter Team-Auswahl (Mehrfach)
-- Neue Join-Tabelle inbox_list_team_shares (Muster: brand_voice_team_shares).
-- + RLS/GRANTs (self-host), inbox_lists-RLS erweitert, Backfill, Set-RPC.
-- Additiv & reversibel. In einer Transaktion mit Pre-Flight-Count.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off
BEGIN;

-- ── Pre-Flight: wie viele Bestands-Freigaben wandern in die Join-Tabelle? ─────
\echo '--- Pre-Flight: Backfill-Kandidaten (is_shared=true AND team_id NOT NULL) ---'
SELECT count(*) AS backfill_candidates
FROM public.inbox_lists WHERE is_shared = true AND team_id IS NOT NULL;
\echo '--- (davon ohne team_id -> KEIN implizites Ziel, bleiben ungeteilt) ---'
SELECT count(*) AS shared_without_team
FROM public.inbox_lists WHERE is_shared = true AND team_id IS NULL;

-- ── 1) Join-Tabelle ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inbox_list_team_shares (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_list_id  uuid NOT NULL REFERENCES public.inbox_lists(id) ON DELETE CASCADE,
  team_id        uuid NOT NULL REFERENCES public.teams(id)       ON DELETE CASCADE,
  shared_by      uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inbox_list_id, team_id)
);
CREATE INDEX IF NOT EXISTS inbox_list_team_shares_team_idx ON public.inbox_list_team_shares (team_id);
CREATE INDEX IF NOT EXISTS inbox_list_team_shares_list_idx ON public.inbox_list_team_shares (inbox_list_id);

-- Self-Host: neue Tabelle braucht explizite GRANTs (RLS allein = 403).
GRANT ALL ON public.inbox_list_team_shares TO authenticated, service_role;

ALTER TABLE public.inbox_list_team_shares ENABLE ROW LEVEL SECURITY;

-- ── 2) RLS auf der Join-Tabelle (Muster brand_voice_team_shares) ────────────
--    „manage" = Owner der Liste (user_id = uid()).
DROP POLICY IF EXISTS ilts_select ON public.inbox_list_team_shares;
CREATE POLICY ilts_select ON public.inbox_list_team_shares
  FOR SELECT USING (
    team_id = ANY (get_my_team_ids())
    OR EXISTS (SELECT 1 FROM public.inbox_lists il
               WHERE il.id = inbox_list_id AND il.user_id = uid())
  );

DROP POLICY IF EXISTS ilts_insert ON public.inbox_list_team_shares;
CREATE POLICY ilts_insert ON public.inbox_list_team_shares
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.inbox_lists il
            WHERE il.id = inbox_list_id AND il.user_id = uid())
  );

DROP POLICY IF EXISTS ilts_delete ON public.inbox_list_team_shares;
CREATE POLICY ilts_delete ON public.inbox_list_team_shares
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.inbox_lists il
            WHERE il.id = inbox_list_id AND il.user_id = uid())
  );

-- ── 3) inbox_lists-RLS erweitern: Join-Tabelle = Sichtbarkeits-Wahrheit ─────
--    is_shared-Klausel raus; Team-Share-Klausel rein. Owner/Brand/legacy-null bleiben.
DROP POLICY IF EXISTS inbox_lists_brand_read ON public.inbox_lists;
CREATE POLICY inbox_lists_brand_read ON public.inbox_lists
  FOR SELECT USING (
    (user_id = uid())
    OR has_brand_access(brand_voice_id)
    OR (id IN (SELECT s.inbox_list_id FROM public.inbox_list_team_shares s
               WHERE s.team_id = ANY (get_my_team_ids())))
    OR ((brand_voice_id IS NULL) AND (team_id = ANY (get_my_team_ids())))
  );

-- ── 4) Backfill: Bestands-Freigaben → je Home-team_id ───────────────────────
INSERT INTO public.inbox_list_team_shares (inbox_list_id, team_id, shared_by)
SELECT il.id, il.team_id, il.user_id
FROM public.inbox_lists il
WHERE il.is_shared = true AND il.team_id IS NOT NULL
ON CONFLICT (inbox_list_id, team_id) DO NOTHING;

-- is_shared-Mirror konsistent nachziehen (= EXISTS share).
UPDATE public.inbox_lists il
SET is_shared = EXISTS (SELECT 1 FROM public.inbox_list_team_shares s WHERE s.inbox_list_id = il.id);

-- ── 5) Set-Shares-RPC (SECURITY DEFINER, Owner-Guard + Ziel⊆meine Teams) ────
CREATE OR REPLACE FUNCTION public.set_inbox_list_team_shares(p_list_id uuid, p_team_ids uuid[])
RETURNS TABLE(team_id uuid, team_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_owner   uuid;
  v_allowed uuid[];
  v_targets uuid[];
BEGIN
  SELECT il.user_id INTO v_owner FROM public.inbox_lists il WHERE il.id = p_list_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Liste % nicht gefunden', p_list_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Nicht berechtigt: nur der Eigentümer der Liste darf die Freigabe ändern'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Ziel-Teams strikt auf Teams des Users beschränken (kein Fremd-Team-Leak).
  v_allowed := get_my_team_ids();
  SELECT COALESCE(array_agg(DISTINCT t), '{}'::uuid[])
    INTO v_targets
    FROM unnest(COALESCE(p_team_ids, '{}'::uuid[])) AS t
    WHERE t = ANY (v_allowed);

  DELETE FROM public.inbox_list_team_shares s
   WHERE s.inbox_list_id = p_list_id
     AND NOT (s.team_id = ANY (v_targets));

  INSERT INTO public.inbox_list_team_shares (inbox_list_id, team_id, shared_by)
  SELECT p_list_id, t, auth.uid() FROM unnest(v_targets) AS t
  ON CONFLICT (inbox_list_id, team_id) DO NOTHING;

  UPDATE public.inbox_lists il
     SET is_shared = (cardinality(v_targets) > 0), updated_at = now()
   WHERE il.id = p_list_id;

  RETURN QUERY
    SELECT s.team_id, tm.name
      FROM public.inbox_list_team_shares s
      JOIN public.teams tm ON tm.id = s.team_id
     WHERE s.inbox_list_id = p_list_id
     ORDER BY tm.name;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.set_inbox_list_team_shares(uuid, uuid[]) TO authenticated, service_role;

-- ── 6) Verifikation ─────────────────────────────────────────────────────────
\echo '--- Verify: Join-Rows nach Backfill ---'
SELECT s.inbox_list_id, il.name AS list_name, s.team_id, t.name AS team_name, s.shared_by
FROM public.inbox_list_team_shares s
JOIN public.inbox_lists il ON il.id = s.inbox_list_id
JOIN public.teams t ON t.id = s.team_id
ORDER BY il.name;
\echo '--- Verify: is_shared-Mirror stimmt mit EXISTS(share) ueberein? (0 = ok) ---'
SELECT count(*) AS mismatches
FROM public.inbox_lists il
WHERE il.is_shared <> EXISTS (SELECT 1 FROM public.inbox_list_team_shares s WHERE s.inbox_list_id = il.id);
\echo '--- Verify: RPC existiert ---'
SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname = 'set_inbox_list_team_shares';

COMMIT;

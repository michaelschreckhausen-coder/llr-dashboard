-- ============================================================================
-- inbox_lists: Loeschen fuer Ersteller UND Team-Owner (+ Helfer is_team_owner)
-- ----------------------------------------------------------------------------
-- Symptom (2026-08-19 gemeldet): Listen in den LinkedIn-Kontakten liessen sich nicht
-- loeschen — ohne Fehlermeldung. Die Liste verschwand aus der Ansicht und war beim
-- naechsten Laden wieder da.
--
-- Ursache: die einzige DELETE-erlaubende Policy war inbox_lists_own mit
-- USING (user_id = auth.uid()). Gelesen werden darf viel mehr (inbox_lists_brand_read).
-- Bei einer fremden Liste traf das DELETE also NULL Zeilen — und PostgREST meldet dafuer
-- keinen Fehler. Der Hook entfernte die Liste optimistisch aus dem State: Scheinerfolg.
-- Die Frontend-Haelfte steckt im zugehoerigen useInboxLists-Commit.
--
-- inbox_lists_own bleibt UNVERAENDERT — diese Migration ergaenzt nur.
--
-- ── Warum ein SECURITY-DEFINER-Helfer und keine Inline-Subquery ───────────────
-- RLS ist auf teams UND team_members aktiv (2026-08-19 geprueft). Eine Subquery direkt
-- in der Policy laeuft unter der RLS des Aufrufers und haengt damit an
-- teams_member_select / team_members_select — die Berechtigung, eine Liste zu loeschen,
-- wuerde also von der Lesbarkeit fremder Tabellen abhaengen und bei jeder kuenftigen
-- Verschaerfung dort still kippen. Der Bestand loest das durchgehend mit
-- SECURITY-DEFINER-Helfern (get_my_team_ids, is_team_member, is_inbox_list_owner);
-- einen Owner-Helfer gab es noch nicht.
--
-- ── is_active ist Pflicht, nicht Kosmetik — in BEIDEN Zweigen ────────────────
-- team_members.is_active existiert und wird im Seats-Pfad ausgewertet; user_in_team() und
-- get_my_team_ids() filtern beide darauf. Ohne diesen Filter entstuende „Loeschen ohne
-- Lesen": ein deaktivierter Owner kommt ueber get_my_team_ids() nicht mehr an die Liste
-- heran (inbox_lists_brand_read), duerfte sie aber loeschen. Ein solches Recht gibt es
-- sonst nirgends im Schema. Deshalb verlangt der Helfer eine AKTIVE Mitgliedschaft —
-- auch im owner_id-Zweig, nicht nur bei role='owner'.
-- Konkret betroffen auf Prod: Team „Linkedin Consulting", dessen teams.owner_id auf eine
-- Person mit is_active=false zeigt.
--
-- „Team-Owner" am laufenden Schema geprueft, nicht geraten:
--   * Enum user_role: admin | team_member | user | member | owner
--   * teams.owner_id ist die verlaesslichere Quelle: auf Prod ist die Person aus owner_id
--     in allen 67 Teams Mitglied, aber nur in 64 traegt sie role='owner'. Drei Owner
--     wuerden durchfallen, wenn man nur die Rolle prueft. Deshalb BEIDE Wege.
--     (Eigener Befund: dieselben drei fallen auch in der Seat-Vergabe durch.)
--   * 'admin' bewusst NICHT — der Auftrag lautet Ersteller + Team-Owner.
--
-- Rollback: .rollback.sql (Policy zuerst, dann der Helfer).
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

-- Helfer: bin ich Owner dieses Teams? SECURITY DEFINER, damit die Entscheidung nicht an
-- der RLS von teams/team_members haengt. STABLE — pro Statement einmal ausgewertet.
CREATE OR REPLACE FUNCTION public.is_team_owner(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- Eine AKTIVE Mitgliedschaft im Team ist die gemeinsame Vorbedingung beider Wege.
  -- Darin dann: role='owner' ODER die Person, auf die teams.owner_id zeigt.
  SELECT p_team_id IS NOT NULL AND auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.team_members tm
     WHERE tm.team_id = p_team_id
       AND tm.user_id = auth.uid()
       AND tm.is_active = true
       AND ( tm.role::text = 'owner'
             OR EXISTS (SELECT 1 FROM public.teams t
                         WHERE t.id = p_team_id AND t.owner_id = auth.uid()) )
  );
$function$;

REVOKE ALL   ON FUNCTION public.is_team_owner(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_team_owner(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS inbox_lists_delete_creator_or_team_owner ON public.inbox_lists;
CREATE POLICY inbox_lists_delete_creator_or_team_owner ON public.inbox_lists
  FOR DELETE USING (
    user_id = auth.uid() OR public.is_team_owner(team_id)
  );

COMMIT;

\echo '--- Verify: Helfer (SECURITY DEFINER, prueft is_active) ---'
SELECT p.proname, p.prosecdef, p.provolatile,
       (pg_get_functiondef(p.oid) ILIKE '%is_active%')  AS prueft_is_active,
       (pg_get_functiondef(p.oid) ILIKE '%owner_id%')   AS prueft_owner_id
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='is_team_owner';
\echo '--- Verify: ACL des Helfers (kein PUBLIC) ---'
SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee, a.privilege_type
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace, LATERAL aclexplode(p.proacl) a
 WHERE n.nspname='public' AND p.proname='is_team_owner' ORDER BY 1;
\echo '--- Verify: beide Policies, inbox_lists_own unveraendert ---'
SELECT policyname, cmd, permissive, qual
  FROM pg_policies WHERE schemaname='public' AND tablename='inbox_lists' ORDER BY cmd, policyname;

NOTIFY pgrst, 'reload schema';

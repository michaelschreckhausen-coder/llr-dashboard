-- ============================================================================
-- inbox_lists: Loeschen fuer Ersteller UND Team-Owner
-- ----------------------------------------------------------------------------
-- Symptom (2026-08-19 gemeldet): Listen in den LinkedIn-Kontakten liessen sich nicht
-- loeschen — ohne Fehlermeldung. Die Liste verschwand aus der Ansicht und war beim
-- naechsten Laden wieder da.
--
-- Ursache: die einzige DELETE-erlaubende Policy war inbox_lists_own mit
-- USING (user_id = auth.uid()). Gelesen werden darf viel mehr (inbox_lists_brand_read).
-- Bei einer fremden Liste traf das DELETE also NULL Zeilen — und PostgREST meldet dafuer
-- keinen Fehler. Der Hook entfernte die Liste optimistisch aus dem State: es sah aus wie
-- Erfolg. Stiller RLS-Nulltreffer. Die Frontend-Haelfte (ehrliche Meldung statt
-- Scheinerfolg) steckt im zugehoerigen Commit an useInboxLists.
--
-- inbox_lists_own bleibt UNVERAENDERT — diese Policy ergaenzt nur, permissive, FOR DELETE.
--
-- „Team-Owner" am laufenden Schema geprueft, nicht geraten:
--   * Enum user_role hat die Werte: admin | team_member | user | member | owner
--     (Bestand: owner 64, member 30, admin 3, user 1)
--   * teams.owner_id existiert und ist die verlaesslichere Quelle: in 67 Teams ist die
--     Person aus owner_id immer Mitglied, aber nur in 64 traegt sie role='owner'.
--     Drei Owner wuerden also durchfallen, wenn man nur die Rolle prueft.
--   Deshalb beide Wege: teams.owner_id ODER team_members.role='owner'. 'admin' bewusst
--   NICHT — der Auftrag lautet Ersteller + Team-Owner.
--
-- Cross-Table-Subquery → GRANT SELECT auf die referenzierten Tabellen (CLAUDE.md
-- Fallstrick #3). authenticated hat beide bereits, die GRANTs stehen fuer frisch
-- aufgebaute Umgebungen mit drin und sind idempotent.
-- Rollback: .rollback.sql (entfernt nur diese Policy).
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

DROP POLICY IF EXISTS inbox_lists_delete_creator_or_team_owner ON public.inbox_lists;
CREATE POLICY inbox_lists_delete_creator_or_team_owner ON public.inbox_lists
  FOR DELETE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.teams t
       WHERE t.id = inbox_lists.team_id AND t.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
       WHERE tm.team_id = inbox_lists.team_id
         AND tm.user_id = auth.uid()
         AND tm.role::text = 'owner'
    )
  );

GRANT SELECT ON public.teams        TO authenticated, service_role;
GRANT SELECT ON public.team_members TO authenticated, service_role;

COMMIT;

\echo '--- Verify: beide Policies stehen, inbox_lists_own unveraendert ---'
SELECT policyname, cmd, permissive, qual
  FROM pg_policies WHERE schemaname='public' AND tablename='inbox_lists' ORDER BY cmd, policyname;

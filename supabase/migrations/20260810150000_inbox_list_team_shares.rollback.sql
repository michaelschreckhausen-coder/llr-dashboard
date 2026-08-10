-- ============================================================================
-- ROLLBACK zu 20260810150000_inbox_list_team_shares.sql
-- Stellt das alte is_shared-basierte Freigabe-Modell wieder her.
-- Reihenfolge: RPC weg -> inbox_lists-RLS zurueck auf is_shared -> Join-Tabelle weg.
-- is_shared bleibt korrekt (wurde als Mirror = EXISTS(share) gepflegt) und trifft
-- damit exakt die Bestands-Freigaben, die vor der Migration galten.
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

DROP FUNCTION IF EXISTS public.set_inbox_list_team_shares(uuid, uuid[]);

-- inbox_lists-RLS zurueck auf die urspruengliche is_shared-Klausel.
DROP POLICY IF EXISTS inbox_lists_brand_read ON public.inbox_lists;
CREATE POLICY inbox_lists_brand_read ON public.inbox_lists
  FOR SELECT USING (
    (user_id = uid())
    OR has_brand_access(brand_voice_id)
    OR ((is_shared = true) AND (team_id IS NOT NULL)
        AND (team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = uid())))
    OR ((brand_voice_id IS NULL)
        AND (team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = uid())))
  );

-- Join-Tabelle (mit ihren Policies) entfernen.
DROP TABLE IF EXISTS public.inbox_list_team_shares;  -- CASCADE nicht noetig: nur eigene FKs

COMMIT;

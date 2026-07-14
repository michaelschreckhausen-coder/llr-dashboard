-- delete_leads(uuid[]) — Hard-Delete für Leads (team-scoped) mit LinkedIn-Inbox-Kaskade + Open-Deal-Block.
-- Michael-Entscheidungen (2026-07-14, freigegeben):
--   • Hard-Delete: Zeile endgültig weg (irreversibel) — nicht Soft/archived.
--   • Team-scope: team-weit via get_my_team_ids() (solo: team_id IS NULL AND user_id=uid()) — wie Archivieren.
--   • Block: >=1 offener verknüpfter Deal → Lead NICHT löschen (erst Deal schließen).
--   • Mitgelöscht: Lead + linkedin_inbox-Zeile(n) + activities (Aktivitäts-Feed) + CASCADE-Set (lead_tasks,
--     contact_notes, saved_comments, lead_field_history = lead-INTERNE Feld-Historie, lead_list_members,
--     connection_queue, automation_campaign_leads).
--   • ENTKOPPELT (bleibt erhalten, Bezug → NULL): LinkedIn-Konversationshistorie (linkedin_messages/
--     linkedin_connections/vernetzungen), Projekte (pm_projects), geschlossene Deals. Deren leads-FKs sind
--     ON DELETE SET NULL — verifiziert 2026-07-14 (nicht CASCADE, nicht RESTRICT).
--
-- Bulk-Sicherheit: alles set-basiert IN der RPC (kein Client-.in()+updated_at-Bundle → kein silent-fail,
-- vgl. Top-Fallstrick #1). Pro-Lead-Sub-Transaktion (BEGIN/EXCEPTION) → ein Fehler kippt den Batch nicht.
-- Rückgabe pro Lead: {lead_id, status: 'deleted' | 'blocked_open_deal' | 'not_found' | 'error', open_deal_count}.

CREATE OR REPLACE FUNCTION public.delete_leads(p_lead_ids uuid[])
RETURNS TABLE(lead_id uuid, status text, open_deal_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_teams uuid[] := get_my_team_ids();
  v_uid   uuid   := auth.uid();
  v_id    uuid;
  v_open  int;
BEGIN
  IF p_lead_ids IS NULL THEN RETURN; END IF;

  FOREACH v_id IN ARRAY p_lead_ids LOOP
    BEGIN
      -- Team-Guard (analog leads_team_select/update): berechtigtes Team ODER solo-eigener Lead.
      -- Fremd-Team / nicht existent → not_found (kein Info-Leak).
      PERFORM 1 FROM public.leads l
      WHERE l.id = v_id
        AND ( (l.team_id IS NOT NULL AND l.team_id = ANY(v_teams))
              OR (l.team_id IS NULL AND l.user_id = v_uid) );
      IF NOT FOUND THEN
        lead_id := v_id; status := 'not_found'; open_deal_count := 0; RETURN NEXT; CONTINUE;
      END IF;

      -- Block bei >=1 offenem verknüpftem Deal (offen = closed_at IS NULL UND stage nicht gewonnen/verloren/kein_deal;
      -- Custom-Stages gelten als offen → blocken).
      SELECT count(*) INTO v_open
      FROM public.deals d
      WHERE d.lead_id = v_id
        AND d.closed_at IS NULL
        AND d.stage NOT IN ('gewonnen','verloren','kein_deal');
      IF v_open > 0 THEN
        lead_id := v_id; status := 'blocked_open_deal'; open_deal_count := v_open; RETURN NEXT; CONTINUE;
      END IF;

      -- (a) LinkedIn-Inbox-Zeile(n) explizit löschen (FK promoted_lead_id ist SET NULL → würde nur entkoppeln).
      --     Kopplung: promoted_lead_id ODER raw.lead_id-Provenance. team-scoped (inbox.team_id ist NOT NULL).
      DELETE FROM public.linkedin_inbox
      WHERE team_id = ANY(v_teams)
        AND (promoted_lead_id = v_id OR raw->>'lead_id' = v_id::text);

      -- (b) Aktivitäts-Feed explizit löschen (activities.lead_id ist SET NULL → sonst verwaist).
      DELETE FROM public.activities WHERE lead_id = v_id;

      -- (c) Lead löschen. CASCADE räumt die lead-eigenen Unterdaten; SET-NULL-FKs entkoppeln automatisch
      --     (LinkedIn-Historie/Projekte/geschlossene Deals bleiben erhalten).
      DELETE FROM public.leads WHERE id = v_id;

      lead_id := v_id; status := 'deleted'; open_deal_count := 0; RETURN NEXT;

    EXCEPTION WHEN OTHERS THEN
      -- Sub-Transaktion dieses Leads rollt zurück; Batch läuft weiter.
      lead_id := v_id; status := 'error'; open_deal_count := 0; RETURN NEXT;
    END;
  END LOOP;
END;
$fn$;

-- Self-Host: RPC braucht expliziten Grant (RLS wird via SECURITY DEFINER umgangen; Team-Guard steckt im Body).
REVOKE ALL ON FUNCTION public.delete_leads(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_leads(uuid[]) TO authenticated;

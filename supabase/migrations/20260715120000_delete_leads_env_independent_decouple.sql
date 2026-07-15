-- delete_leads(uuid[]) — env-unabhängige Entkopplung der Preserve-Tabellen (CREATE OR REPLACE).
-- Grund: deals.lead_id ist auf PROD CASCADE, auf STAGING SET NULL (verifiziert 2026-07-15). Die Vorversion
-- (20260714100000... eigentlich 20260714160000) verließ sich fürs "geschlossene Deals bleiben erhalten" auf die
-- FK-SET-NULL-Semantik → auf Prod hätte ein Lead-Delete geschlossene (gewonnen/verloren) Deals mit-CASCADE-
-- gelöscht (Datenverlust; offene Deals sind eh geblockt). FIX: vor DELETE leads JEDE Preserve-Tabelle explizit
-- entkoppeln (UPDATE ... SET lead_id=NULL), NICHT auf FK ON DELETE verlassen. Existenz-Guard, weil das Schema
-- driftet: pm_projects/linkedin_connections haben nur auf Staging eine lead_id, content_posts nur auf Prod.
-- Nach dem expliziten NULL referenziert die Preserve-Tabelle den Lead nicht mehr → der CASCADE-FK findet nichts
-- → Zeile bleibt erhalten (auf beiden Envs identisch). Rest unverändert.

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
  -- Preserve-Tabellen: bleiben erhalten, Bezug → NULL (LinkedIn-Historie, Projekte, geschlossene Deals).
  v_preserve text[] := ARRAY['deals','linkedin_messages','linkedin_connections','vernetzungen','pm_projects','content_posts'];
  v_tbl   text;
BEGIN
  IF p_lead_ids IS NULL THEN RETURN; END IF;

  FOREACH v_id IN ARRAY p_lead_ids LOOP
    BEGIN
      -- Team-Guard (analog leads_team_select/update). Fremd-Team / nicht existent → not_found.
      PERFORM 1 FROM public.leads l
      WHERE l.id = v_id
        AND ( (l.team_id IS NOT NULL AND l.team_id = ANY(v_teams))
              OR (l.team_id IS NULL AND l.user_id = v_uid) );
      IF NOT FOUND THEN
        lead_id := v_id; status := 'not_found'; open_deal_count := 0; RETURN NEXT; CONTINUE;
      END IF;

      -- Block bei >=1 offenem verknüpftem Deal.
      SELECT count(*) INTO v_open
      FROM public.deals d
      WHERE d.lead_id = v_id
        AND d.closed_at IS NULL
        AND d.stage NOT IN ('gewonnen','verloren','kein_deal');
      IF v_open > 0 THEN
        lead_id := v_id; status := 'blocked_open_deal'; open_deal_count := v_open; RETURN NEXT; CONTINUE;
      END IF;

      -- (0) Preserve-Tabellen EXPLIZIT entkoppeln — env-unabhängig, nur wo lead_id-Spalte existiert.
      --     (deals ist auf Prod CASCADE → hier zwingend, sonst Datenverlust.)
      FOREACH v_tbl IN ARRAY v_preserve LOOP
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'lead_id') THEN
          EXECUTE format('UPDATE public.%I SET lead_id = NULL WHERE lead_id = $1', v_tbl) USING v_id;
        END IF;
      END LOOP;

      -- (a) LinkedIn-Inbox-Zeile(n) explizit löschen (promoted_lead_id ist SET NULL → würde sonst nur entkoppeln).
      DELETE FROM public.linkedin_inbox
      WHERE team_id = ANY(v_teams)
        AND (promoted_lead_id = v_id OR raw->>'lead_id' = v_id::text);

      -- (b) Aktivitäts-Feed explizit löschen (activities.lead_id QUALIFIZIERT wg. OUT-Param-Kollision).
      DELETE FROM public.activities a WHERE a.lead_id = v_id;

      -- (c) Lead löschen. CASCADE räumt lead-eigene Unterdaten (lead_tasks/contact_notes/saved_comments/
      --     lead_field_history/lead_list_members/connection_queue/automation_campaign_leads). Die Preserve-
      --     Tabellen sind in (0) bereits entkoppelt → bleiben erhalten (env-unabhängig, auch bei Prod-CASCADE).
      DELETE FROM public.leads WHERE id = v_id;

      lead_id := v_id; status := 'deleted'; open_deal_count := 0; RETURN NEXT;

    EXCEPTION WHEN OTHERS THEN
      lead_id := v_id; status := 'error'; open_deal_count := 0; RETURN NEXT;
    END;
  END LOOP;
END;
$fn$;

REVOKE ALL ON FUNCTION public.delete_leads(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_leads(uuid[]) TO authenticated;

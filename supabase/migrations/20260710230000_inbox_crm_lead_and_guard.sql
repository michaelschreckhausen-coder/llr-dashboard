-- LinkedIn Kontakte · CRM-Lead → Inbox + Bulk-Delete-Guard.
-- (1) source-CHECK um 'crm_lead' erweitern (Provenienz: Kontakt kam aus CRM-Lead).
-- (2) add_lead_to_inbox(lead): erzeugt eine linkedin_inbox-Row aus einem CRM-Lead,
--     dedupt team-scoped über linkedin_url (nutzt Unique-Index team_id,linkedin_url).
-- (3) inbox_active_campaign_refs(ids[]): Guard für Bulk-Löschen — wie viele der
--     Kontakte hängen in einer Liste, die eine AKTIVE la_-Kampagne als Zielgruppe nutzt.
--     (linkedin_inbox hat KEINEN FK aus la_enrollments/la_jobs → Löschen bricht nichts;
--      inbox_list_members cascadet. Der Guard ist informativ, kein Blocker.)
-- Self-Host: linkedin_inbox-GRANTs existieren bereits (authenticated INSERT/DELETE).
-- Idempotent. Zuerst Staging, dann nach Freigabe Prod.

BEGIN;

-- (1) source-CHECK erweitern.
ALTER TABLE public.linkedin_inbox DROP CONSTRAINT IF EXISTS linkedin_inbox_source_check;
ALTER TABLE public.linkedin_inbox ADD CONSTRAINT linkedin_inbox_source_check
  CHECK (source = ANY (ARRAY[
    'sales_nav','linkedin_scrape','extension_import','manual',
    'unipile_relations','unipile_salesnav','linkedin_search','crm_lead'
  ]));

-- (2) CRM-Lead → linkedin_inbox (dedup über linkedin_url, team-scoped).
CREATE OR REPLACE FUNCTION public.add_lead_to_inbox(p_lead_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_team uuid; v_user uuid; v_fn text; v_ln text; v_comp text; v_url text;
  v_name text; v_existing uuid; v_id uuid;
BEGIN
  -- leads hat KEIN name-Feld (Fallstrick #4) → aus first/last_name bauen.
  SELECT team_id, user_id, first_name, last_name, company, NULLIF(trim(linkedin_url), '')
    INTO v_team, v_user, v_fn, v_ln, v_comp, v_url
    FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'lead_not_found'; END IF;
  IF v_team IS NULL THEN RAISE EXCEPTION 'lead_has_no_team'; END IF;
  IF NOT public.user_in_team(v_team) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_url IS NULL THEN RAISE EXCEPTION 'no_linkedin_url'; END IF;

  SELECT id INTO v_existing FROM public.linkedin_inbox
    WHERE team_id = v_team AND linkedin_url = v_url LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_existing, 'created', false);
  END IF;

  v_name := NULLIF(trim(coalesce(v_fn, '') || ' ' || coalesce(v_ln, '')), '');
  INSERT INTO public.linkedin_inbox (team_id, user_id, source, name, first_name, last_name, company, linkedin_url)
    VALUES (v_team, v_user, 'crm_lead', COALESCE(v_name, 'Unbekannt'),
            NULLIF(v_fn, ''), NULLIF(v_ln, ''), NULLIF(v_comp, ''), v_url)
    RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'created', true);
EXCEPTION WHEN unique_violation THEN
  SELECT id INTO v_existing FROM public.linkedin_inbox WHERE team_id = v_team AND linkedin_url = v_url LIMIT 1;
  RETURN jsonb_build_object('id', v_existing, 'created', false);
END $fn$;

REVOKE ALL ON FUNCTION public.add_lead_to_inbox(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.add_lead_to_inbox(uuid) TO authenticated, service_role;

-- (3) Bulk-Delete-Guard: Kontakte in Listen aktiver la_-Kampagnen zählen.
CREATE OR REPLACE FUNCTION public.inbox_active_campaign_refs(p_inbox_ids uuid[])
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $fn$
  WITH refs AS (
    SELECT DISTINCT m.inbox_id, c.name AS campaign
    FROM public.inbox_list_members m
    JOIN public.la_audiences a ON a.kind = 'list' AND a.query->>'list_id' = m.list_id::text
    JOIN public.la_campaigns c ON c.audience_id = a.id AND c.status = 'active'
    WHERE m.inbox_id = ANY(p_inbox_ids)
  )
  SELECT jsonb_build_object(
    'count', (SELECT count(DISTINCT inbox_id) FROM refs),
    'campaigns', COALESCE((SELECT jsonb_agg(DISTINCT campaign) FROM refs), '[]'::jsonb)
  );
$fn$;

REVOKE ALL ON FUNCTION public.inbox_active_campaign_refs(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.inbox_active_campaign_refs(uuid[]) TO authenticated, service_role;

COMMIT;

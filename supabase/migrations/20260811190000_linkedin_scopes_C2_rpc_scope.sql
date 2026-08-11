-- ============================================================================
-- Slice C2 — RPC-Scope-Rewrite (granulare LinkedIn-Freigabe)
-- ----------------------------------------------------------------------------
-- SECURITY-DEFINER-RPCs, die bisher grob per has_brand_access(bv) ODER
-- user_in_team(team) gaten, auf den je passenden LinkedIn-Scope umstellen.
-- Slice A/B haben Fundament (linkedin_scopes[] + Helper) + RLS bereits scharf.
-- C2 schließt die DEFINER-Lese-/Aktions-Pfade, die RLS umgehen.
--
--  B-Gruppe (network) — Kontakte/Netzwerk-Review-Inbox (linkedin_inbox):
--    inbox_counts, inbox_recipient_search : has_brand_access -> _scope(bv,'network')
--    inbox_feed                           : ROW-LEVEL — has_brand_access-Early-Return
--                                           BLEIBT (grobe Marken-Sicht), zusätzlich
--                                           Brand-Zweig auf 'network' gegatet;
--                                           geteilter-Listen-Zweig bleibt offen (P3).
--
--  D-Gruppe (automation) — Sequenz-Verwaltung (la_campaigns):
--    la_campaign_accepted/funnel/save_steps/set_archived :
--       user_in_team(team) -> ( user_in_team(team) OR _scope(bv,'automation') )
--    la_campaign_delete : OWNER-ONLY (Michael-Entscheid) — destruktives Cascade
--       (steps/enrollments/jobs) ist andere Risikoklasse als Bearbeiten. Guard:
--       has_brand_access_direct(bv) OR (bv IS NULL AND user_in_team(team)).
--       -> geteiltes Automation-Team kann NICHT löschen; null-brand-Kampagnen
--          (6/32) bleiben team-gegatet (kein Regress). KEIN automation-Scope-OR.
--    inbox_active_campaign_refs : Kampagnen-Refs nach automation-Scope filtern.
--
--  BEWUSST NICHT geändert (Team-/CRM-Operationen, kein Brand-View — ein
--  Scope-OR würde ein geteiltes Team ins FREMDE CRM/Inbox schreiben lassen):
--    add_lead_to_inbox      — CRM-Lead (eigenes Team) -> eigenes Team-Inbox
--    promote_inbox_contact  — Inbox -> Lead im eigenen Team-CRM
--    import_linkedin_to_inbox — Extension-Import ins EIGENE Team-Inbox
--       (gatet user_in_team(p_team_id); has_brand_access dort nur permissiver
--        Fallback zum Ableiten der aktiven Marke — bleibt).
--
--  MVP-Regel (bestätigt): "Bereich teilen = auch bearbeiten dürfen" — daher
--  automation-Scope-OR auch auf schreibende la_campaign_*-RPCs (inkl. delete).
--
-- Reversibel: .rollback.sql stellt die Vor-C2-Bodies wieder her.
-- ============================================================================

BEGIN;

-- ============================== B-Gruppe (network) ==========================

-- inbox_counts: Badge-Zahlen Kontakte/Netzwerk. network OFF -> {0,0}.
CREATE OR REPLACE FUNCTION public.inbox_counts(p_brand_voice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_net int; v_kon int;
BEGIN
  IF NOT public.has_brand_linkedin_scope(p_brand_voice_id, 'network') THEN
    RETURN jsonb_build_object('kontakte',0,'netzwerk',0);
  END IF;
  SELECT count(*) FILTER (WHERE source = 'unipile_relations'),
         count(*) FILTER (WHERE source <> 'unipile_relations' OR is_prospect = true)
    INTO v_net, v_kon
  FROM linkedin_inbox
  WHERE brand_voice_id = p_brand_voice_id AND review_status = 'new';
  RETURN jsonb_build_object('kontakte', coalesce(v_kon,0), 'netzwerk', coalesce(v_net,0));
END $function$;

-- inbox_recipient_search: Empfänger-Suche aus dem Netzwerk. network OFF -> leer.
CREATE OR REPLACE FUNCTION public.inbox_recipient_search(p_brand_voice_id uuid, p_src text, p_q text DEFAULT NULL::text)
 RETURNS TABLE(provider_id text, linkedin_url text, name text, first_name text, last_name text, headline text, avatar_url text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_like text := NULLIF(btrim(regexp_replace(coalesce(p_q,''), '[,()*%]', ' ', 'g')), '');
  v_lim  int  := CASE WHEN v_like IS NULL THEN 500 ELSE 100 END;
BEGIN
  IF NOT public.has_brand_linkedin_scope(p_brand_voice_id, 'network') THEN RETURN; END IF;
  RETURN QUERY
  SELECT li.provider_id, li.linkedin_url, li.name, li.first_name, li.last_name, li.headline, li.avatar_url
  FROM linkedin_inbox li
  WHERE li.brand_voice_id = p_brand_voice_id
    AND ( (p_src = 'netzwerk' AND li.source = 'unipile_relations' AND li.provider_id IS NOT NULL)
       OR (p_src <> 'netzwerk' AND (li.source <> 'unipile_relations' OR li.is_prospect = true)
           AND (li.provider_id IS NOT NULL OR li.linkedin_url IS NOT NULL)) )
    AND ( v_like IS NULL OR (
          li.name ILIKE '%'||v_like||'%' OR li.first_name ILIKE '%'||v_like||'%'
       OR li.last_name ILIKE '%'||v_like||'%' OR li.headline ILIKE '%'||v_like||'%') )
  ORDER BY li.name
  LIMIT v_lim;
END $function$;

-- inbox_feed: ROW-LEVEL. has_brand_access-Early-Return BLEIBT (grobe Marken-Sicht:
-- geteilt-aber-network-OFF ist weiterhin has_brand_access=true -> läuft durch).
-- Brand-Zweig zusätzlich auf network gegatet (v_net konstant je Aufruf, gehoistet).
-- Geteilter-Listen-Zweig UNVERÄNDERT offen -> P3 "Liste sticht":
-- network-OFF bei geteilter Marke -> nur Listen-Rows.
CREATE OR REPLACE FUNCTION public.inbox_feed(p_brand_voice_id uuid, p_mode text, p_limit integer DEFAULT 500)
 RETURNS TABLE(id uuid, source text, sales_nav_id text, linkedin_url text, name text, first_name text, last_name text, headline text, job_title text, company text, location text, avatar_url text, imported_at timestamp with time zone, promoted_lead_id uuid, provider_id text, in_crm boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lim int := greatest(1, least(coalesce(p_limit,500), 1000));
  v_net boolean := public.has_brand_linkedin_scope(p_brand_voice_id, 'network');
BEGIN
  IF NOT public.has_brand_access(p_brand_voice_id) THEN RETURN; END IF;
  RETURN QUERY
  WITH sl AS (
    SELECT il.id FROM inbox_lists il
    WHERE il.is_shared = true
      AND il.team_id IN (SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid())
  ),
  base AS (
    SELECT li.* FROM linkedin_inbox li
    WHERE li.review_status = 'new'
      AND ( (p_mode = 'netzwerk' AND li.source = 'unipile_relations')
         OR (p_mode <> 'netzwerk' AND (li.source <> 'unipile_relations' OR li.is_prospect = true)) )
      AND ( (li.brand_voice_id = p_brand_voice_id AND v_net)
         OR EXISTS (SELECT 1 FROM inbox_list_members m WHERE m.inbox_id = li.id AND m.list_id IN (SELECT sl.id FROM sl)) )
    ORDER BY li.imported_at DESC
    LIMIT v_lim
  )
  SELECT b.id,b.source,b.sales_nav_id,b.linkedin_url,b.name,b.first_name,b.last_name,b.headline,b.job_title,b.company,
         b.location,b.avatar_url,b.imported_at,b.promoted_lead_id,b.provider_id,
         (b.sales_nav_id is not null and exists(select 1 from leads le where le.sales_nav_id=b.sales_nav_id and le.archived=false)) as in_crm
  FROM base b;
END $function$;

-- ============================== D-Gruppe (automation) =======================

-- la_campaign_accepted: löst v_brand bereits auf -> nur Guard erweitern.
CREATE OR REPLACE FUNCTION public.la_campaign_accepted(p_campaign_id uuid)
 RETURNS TABLE(provider_id text, name text, public_identifier text, headline text, profile_url text, accepted_at timestamp with time zone, already_messaged boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_team uuid; v_brand uuid;
BEGIN
  SELECT team_id, brand_voice_id INTO v_team, v_brand FROM public.la_campaigns WHERE id = p_campaign_id;
  IF v_team IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (public.user_in_team(v_team) OR public.has_brand_linkedin_scope(v_brand, 'automation')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
    SELECT e.provider_id,
           e.person->>'name'        AS name,
           e.public_identifier,
           e.person->>'headline'    AS headline,
           e.person->>'profile_url' AS profile_url,
           e.accepted_at,
           EXISTS (
             SELECT 1 FROM public.linkedin_chats ch
              WHERE ch.brand_voice_id = e.brand_voice_id
                AND ch.attendee_provider_id = e.provider_id
           ) AS already_messaged
    FROM public.la_enrollments e
    WHERE e.campaign_id = p_campaign_id
      AND e.accepted_at IS NOT NULL
    ORDER BY e.accepted_at DESC;
END $function$;

-- la_campaign_funnel: v_brand ergänzt, Guard erweitert.
CREATE OR REPLACE FUNCTION public.la_campaign_funnel(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_team uuid; v_brand uuid; v_res jsonb; v_accepted integer; v_invited integer;
BEGIN
  SELECT team_id, brand_voice_id INTO v_team, v_brand FROM public.la_campaigns WHERE id = p_campaign_id;
  IF v_team IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF NOT (public.user_in_team(v_team) OR public.has_brand_linkedin_scope(v_brand, 'automation')) THEN RETURN jsonb_build_object('error', 'forbidden'); END IF;
  SELECT count(*) INTO v_accepted
    FROM public.la_enrollments
   WHERE campaign_id = p_campaign_id AND accepted_at IS NOT NULL;
  SELECT count(*) INTO v_invited
    FROM public.la_jobs j JOIN public.la_enrollments e ON e.id = j.enrollment_id
   WHERE e.campaign_id = p_campaign_id AND j.action = 'invite' AND j.state = 'done';
  SELECT jsonb_build_object(
    'campaign_id', p_campaign_id,
    'status', (SELECT status FROM public.la_campaigns WHERE id = p_campaign_id),
    'enrollment_total', (SELECT count(*) FROM public.la_enrollments WHERE campaign_id = p_campaign_id),
    'accepted', v_accepted,
    'invited',  v_invited,
    'pending',  GREATEST(0, v_invited - v_accepted),
    'enrollments', COALESCE((SELECT jsonb_object_agg(state, n) FROM
      (SELECT state, count(*) n FROM public.la_enrollments WHERE campaign_id = p_campaign_id GROUP BY state) s), '{}'::jsonb),
    'jobs', COALESCE((SELECT jsonb_object_agg(st, n) FROM
      (SELECT j.state st, count(*) n FROM public.la_jobs j JOIN public.la_enrollments e ON e.id = j.enrollment_id
       WHERE e.campaign_id = p_campaign_id GROUP BY j.state) s), '{}'::jsonb),
    'done_by_action', COALESCE((SELECT jsonb_object_agg(act, n) FROM
      (SELECT j.action act, count(*) n FROM public.la_jobs j JOIN public.la_enrollments e ON e.id = j.enrollment_id
       WHERE e.campaign_id = p_campaign_id AND j.state = 'done' GROUP BY j.action) s), '{}'::jsonb),
    'oldest_pending', (SELECT min(j.scheduled_at) FROM public.la_jobs j JOIN public.la_enrollments e ON e.id = j.enrollment_id
       WHERE e.campaign_id = p_campaign_id AND j.state = 'pending'),
    'due_now', (SELECT count(*) FROM public.la_jobs j JOIN public.la_enrollments e ON e.id = j.enrollment_id
       WHERE e.campaign_id = p_campaign_id AND j.state = 'pending' AND j.scheduled_at <= now()),
    'real_invites',      (SELECT count(*) FROM public.la_enrollments WHERE campaign_id = p_campaign_id AND state = 'active' AND relation_status = 'not_connected'),
    'already_connected', (SELECT count(*) FROM public.la_enrollments WHERE campaign_id = p_campaign_id AND state = 'active' AND relation_status IN ('first_degree','pending')),
    'unknown',           (SELECT count(*) FROM public.la_enrollments WHERE campaign_id = p_campaign_id AND state = 'active' AND relation_status = 'unknown'),
    'scan_complete',     (SELECT count(*) = 0 FROM public.la_enrollments WHERE campaign_id = p_campaign_id AND state = 'active' AND relation_status = 'unknown')
  ) INTO v_res;
  RETURN v_res;
END $function$;

-- la_campaign_delete: OWNER-ONLY. Kein automation-Scope-OR (destruktives Cascade).
-- has_brand_access_direct = Owner (bv.user_id=auth.uid()) OR Per-User-Share.
-- null-brand-Kampagnen: Team-Gate wie bisher (kein Regress, 6/32 betroffen).
CREATE OR REPLACE FUNCTION public.la_campaign_delete(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_team uuid; v_brand uuid; v_status text; v_enr int; v_jobs int;
BEGIN
  SELECT team_id, brand_voice_id, status INTO v_team, v_brand, v_status FROM public.la_campaigns WHERE id = p_campaign_id;
  IF v_team IS NULL THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
  IF NOT ( public.has_brand_access_direct(v_brand)
           OR (v_brand IS NULL AND public.user_in_team(v_team)) ) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_status = 'active' THEN RAISE EXCEPTION 'campaign_active_stop_first'; END IF;
  SELECT count(*) INTO v_enr FROM public.la_enrollments WHERE campaign_id = p_campaign_id;
  SELECT count(*) INTO v_jobs FROM public.la_jobs j
    JOIN public.la_enrollments e ON e.id = j.enrollment_id
    WHERE e.campaign_id = p_campaign_id;
  DELETE FROM public.la_campaigns WHERE id = p_campaign_id;  -- Cascade: steps/enrollments/jobs
  RETURN jsonb_build_object('deleted_campaign', p_campaign_id,
                            'deleted_enrollments', v_enr, 'deleted_jobs', v_jobs);
END $function$;

-- la_campaign_save_steps: v_brand ergänzt, Guard erweitert.
CREATE OR REPLACE FUNCTION public.la_campaign_save_steps(p_campaign_id uuid, p_steps jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_team uuid; v_brand uuid; v_status text;
  v_incoming uuid[];
  v_elem jsonb; v_ord int;
  v_removed int; v_saved int := 0;
  v_remat int := 0; v_completed int := 0;
  v_step public.la_steps; v_rec record;
BEGIN
  SELECT team_id, brand_voice_id, status INTO v_team, v_brand, v_status FROM public.la_campaigns WHERE id = p_campaign_id;
  IF v_team IS NULL THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
  IF NOT (public.user_in_team(v_team) OR public.has_brand_linkedin_scope(v_brand, 'automation')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_status = 'active' THEN RAISE EXCEPTION 'campaign_active_pause_first'; END IF;
  IF jsonb_typeof(p_steps) <> 'array' THEN RAISE EXCEPTION 'steps_must_be_array'; END IF;
  DROP TABLE IF EXISTS _la_remat;
  CREATE TEMP TABLE _la_remat ON COMMIT DROP AS
    SELECT e.id AS enrollment_id, e.team_id, e.current_position, min(j.scheduled_at) AS sched
    FROM public.la_enrollments e JOIN public.la_jobs j ON j.enrollment_id = e.id
    WHERE e.campaign_id = p_campaign_id AND j.state = 'pending' AND e.state = 'active'
    GROUP BY e.id, e.team_id, e.current_position;
  v_incoming := ARRAY(
    SELECT (e->>'id')::uuid FROM jsonb_array_elements(p_steps) e WHERE NULLIF(e->>'id','') IS NOT NULL
  );
  WITH del AS (
    DELETE FROM public.la_steps s
      WHERE s.campaign_id = p_campaign_id AND s.id <> ALL(v_incoming) RETURNING 1
  ) SELECT count(*) INTO v_removed FROM del;
  UPDATE public.la_steps SET position = position + 100000 WHERE campaign_id = p_campaign_id;
  FOR v_elem, v_ord IN
    SELECT value, ordinality FROM jsonb_array_elements(p_steps) WITH ORDINALITY
  LOOP
    IF NULLIF(v_elem->>'id','') IS NOT NULL THEN
      UPDATE public.la_steps SET
        position  = v_ord - 1,
        action    = v_elem->>'action',
        condition = COALESCE(NULLIF(v_elem->>'condition',''), 'always'),
        template  = COALESCE(v_elem->'template', '{}'::jsonb),
        wait_after = COALESCE(NULLIF(v_elem->>'wait_after','')::interval, '00:00:00'::interval)
      WHERE id = (v_elem->>'id')::uuid AND campaign_id = p_campaign_id;
    ELSE
      INSERT INTO public.la_steps (campaign_id, position, action, condition, template, wait_after)
      VALUES (p_campaign_id, v_ord - 1, v_elem->>'action',
              COALESCE(NULLIF(v_elem->>'condition',''), 'always'),
              COALESCE(v_elem->'template', '{}'::jsonb),
              COALESCE(NULLIF(v_elem->>'wait_after','')::interval, '00:00:00'::interval));
    END IF;
    v_saved := v_saved + 1;
  END LOOP;
  FOR v_rec IN SELECT * FROM _la_remat LOOP
    DELETE FROM public.la_jobs WHERE enrollment_id = v_rec.enrollment_id AND state = 'pending';
    SELECT * INTO v_step FROM public.la_steps
      WHERE campaign_id = p_campaign_id AND position = v_rec.current_position;
    IF FOUND THEN
      INSERT INTO public.la_jobs (enrollment_id, team_id, step_id, action, scheduled_at, idempotency_key)
      VALUES (v_rec.enrollment_id, v_rec.team_id, v_step.id, v_step.action, COALESCE(v_rec.sched, now()),
              v_rec.enrollment_id::text || ':' || v_step.id::text || ':r' || floor(extract(epoch FROM clock_timestamp()))::text);
      v_remat := v_remat + 1;
    ELSE
      UPDATE public.la_enrollments SET state = 'completed', updated_at = now() WHERE id = v_rec.enrollment_id;
      v_completed := v_completed + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('saved_steps', v_saved, 'removed_steps', v_removed,
                            'rematerialized', v_remat, 'completed', v_completed);
END $function$;

-- la_campaign_set_archived: v_brand ergänzt, Guard erweitert.
CREATE OR REPLACE FUNCTION public.la_campaign_set_archived(p_campaign_id uuid, p_archived boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_team uuid; v_brand uuid; v_at timestamptz;
BEGIN
  SELECT team_id, brand_voice_id INTO v_team, v_brand FROM public.la_campaigns WHERE id = p_campaign_id;
  IF v_team IS NULL THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
  IF NOT (public.user_in_team(v_team) OR public.has_brand_linkedin_scope(v_brand, 'automation')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.la_campaigns
    SET archived_at = CASE WHEN p_archived THEN now() ELSE NULL END,
        updated_at  = now()
  WHERE id = p_campaign_id
  RETURNING archived_at INTO v_at;
  RETURN jsonb_build_object('id', p_campaign_id, 'archived', v_at IS NOT NULL, 'archived_at', v_at);
END $function$;

-- inbox_active_campaign_refs: Kampagnen-Referenzen (für Kontakt-Löschwarnung) nach
-- automation-Scope filtern — nur Kampagnen zeigen, deren Marke der Aufrufer per
-- automation sehen darf. Kein Guard vorher -> Filter im JOIN.
CREATE OR REPLACE FUNCTION public.inbox_active_campaign_refs(p_inbox_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH refs AS (
    SELECT DISTINCT m.inbox_id, c.name AS campaign
    FROM public.inbox_list_members m
    JOIN public.la_audiences a ON a.kind = 'list' AND a.query->>'list_id' = m.list_id::text
    JOIN public.la_campaigns c ON c.audience_id = a.id AND c.status = 'active'
    WHERE m.inbox_id = ANY(p_inbox_ids)
      AND public.has_brand_linkedin_scope(c.brand_voice_id, 'automation')
  )
  SELECT jsonb_build_object(
    'count', (SELECT count(DISTINCT inbox_id) FROM refs),
    'campaigns', COALESCE((SELECT jsonb_agg(DISTINCT campaign) FROM refs), '[]'::jsonb)
  );
$function$;

COMMIT;

-- ============================== Verify ======================================
\echo '--- C2 Verify: Guards enthalten jetzt has_brand_linkedin_scope ---'
SELECT proname,
       pg_get_functiondef(oid) LIKE '%has_brand_linkedin_scope%' AS has_scope_gate
FROM pg_proc
WHERE proname IN ('inbox_counts','inbox_recipient_search','inbox_feed',
                  'la_campaign_accepted','la_campaign_funnel','la_campaign_delete',
                  'la_campaign_save_steps','la_campaign_set_archived','inbox_active_campaign_refs')
ORDER BY proname;

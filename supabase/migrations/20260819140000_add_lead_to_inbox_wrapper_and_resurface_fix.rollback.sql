-- ============================================================================
-- ROLLBACK zu 20260819140000_add_lead_to_inbox_wrapper_and_resurface_fix.sql
-- ----------------------------------------------------------------------------
-- Stellt den Stand VOR der Migration wieder her:
--   * add_lead_to_inbox: zurueck auf die alte 1-arg-Funktion (uuid) — die 2-arg-
--     Wrapper-Version wird gedroppt. Diese alte Funktion ist die DEFEKTE (setzt kein
--     brand_voice_id, nullt promoted_lead_id nicht). Rollback ist Rueckabwicklung,
--     nicht Neu-Reparatur: der Zustand danach ist bit-genau der von vor der Migration.
--   * add_leads_to_inbox: zurueck auf den Rumpf aus 20260819090000 OHNE die
--     promoted_lead_id=NULL-Zeile im Resurface-UPDATE.
--
-- Der Backfill (scripts/backfill_20260819_inbox_brand_and_promoted.sql) ist NICHT Teil
-- dieser Migration und wird von diesem Rollback bewusst NICHT rueckgaengig gemacht —
-- eine nachgetragene Marke oder ein genulltes promoted_lead_id ist korrigierte Altlast,
-- kein Migrationsartefakt. Wer auch das zuruecknehmen will, braucht einen Daten-Restore.
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

-- Wrapper (2-arg) entfernen, alte 1-arg-Funktion wiederherstellen.
DROP FUNCTION IF EXISTS public.add_lead_to_inbox(uuid, uuid);

CREATE OR REPLACE FUNCTION public.add_lead_to_inbox(p_lead_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_team uuid; v_user uuid; v_fn text; v_ln text; v_comp text; v_url text;
  v_name text; v_existing uuid; v_status text; v_resurfaced boolean := false; v_id uuid;
BEGIN
  SELECT team_id, user_id, first_name, last_name, company, NULLIF(trim(linkedin_url), '')
    INTO v_team, v_user, v_fn, v_ln, v_comp, v_url
    FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'lead_not_found'; END IF;
  IF v_team IS NULL THEN RAISE EXCEPTION 'lead_has_no_team'; END IF;
  IF NOT public.user_in_team(v_team) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_url IS NULL THEN RAISE EXCEPTION 'no_linkedin_url'; END IF;

  SELECT id, review_status INTO v_existing, v_status FROM public.linkedin_inbox
    WHERE team_id = v_team AND linkedin_url = v_url LIMIT 1;
  IF v_existing IS NOT NULL THEN
    -- Schon vorhanden: falls promoted/dismissed → wieder auf 'new' heben (sichtbar machen).
    IF v_status IS DISTINCT FROM 'new' THEN
      UPDATE public.linkedin_inbox SET review_status = 'new', updated_at = now() WHERE id = v_existing;
      v_resurfaced := true;
    END IF;
    RETURN jsonb_build_object('id', v_existing, 'created', false, 'resurfaced', v_resurfaced);
  END IF;

  v_name := NULLIF(trim(coalesce(v_fn, '') || ' ' || coalesce(v_ln, '')), '');
  INSERT INTO public.linkedin_inbox (team_id, user_id, source, name, first_name, last_name, company, linkedin_url)
    VALUES (v_team, v_user, 'crm_lead', COALESCE(v_name, 'Unbekannt'),
            NULLIF(v_fn, ''), NULLIF(v_ln, ''), NULLIF(v_comp, ''), v_url)
    RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'created', true, 'resurfaced', false);
EXCEPTION WHEN unique_violation THEN
  SELECT id INTO v_existing FROM public.linkedin_inbox WHERE team_id = v_team AND linkedin_url = v_url LIMIT 1;
  IF v_existing IS NOT NULL THEN
    UPDATE public.linkedin_inbox SET review_status = 'new', updated_at = now()
      WHERE id = v_existing AND review_status IS DISTINCT FROM 'new';
  END IF;
  RETURN jsonb_build_object('id', v_existing, 'created', false, 'resurfaced', true);
END $function$;

REVOKE ALL ON FUNCTION public.add_lead_to_inbox(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.add_lead_to_inbox(uuid) TO authenticated, service_role;

-- add_leads_to_inbox zurueck auf den Stand ohne promoted_lead_id=NULL.
CREATE OR REPLACE FUNCTION public.add_leads_to_inbox(
  p_brand_voice_id uuid,
  p_lead_ids       uuid[] DEFAULT NULL,
  p_dry_run        boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_teams        uuid[];
  v_total        int := 0;
  v_no_url       int := 0;
  v_dup_in_batch int := 0;
  v_created      int := 0;
  v_backfilled   int := 0;
  v_resurfaced   int := 0;
  v_same_brand   int := 0;
  v_other_brand  int := 0;
BEGIN
  IF p_brand_voice_id IS NULL THEN RAISE EXCEPTION 'brand_voice_id_required'; END IF;
  IF NOT public.has_brand_access(p_brand_voice_id) THEN RAISE EXCEPTION 'forbidden'; END IF;

  v_teams := public.get_my_team_ids();
  IF v_teams IS NULL OR array_length(v_teams, 1) IS NULL THEN
    RETURN jsonb_build_object('total_candidates',0,'created',0,'brand_backfilled',0,
                              'resurfaced',0,'skipped_no_url',0,'already_other_brand',0,
                              'already_same_brand',0,'duplicate_url_in_batch',0,'dry_run',p_dry_run);
  END IF;

  -- Kandidaten EINMAL bestimmen. DISTINCT ON (team_id, url): zwei Leads mit derselben
  -- URL wuerden sonst im selben Statement zweimal auf dieselbe Konfliktzeile treffen
  -- ("cannot affect row a second time").
  -- DROP davor: ON COMMIT DROP raeumt erst beim Commit auf, ein zweiter Aufruf in
  -- DERSELBEN Transaktion waere sonst „relation _cand already exists". Gleiches Muster
  -- wie la_campaign_save_steps (_la_remat). Im Frontend sind Dry-Run und Schreiblauf
  -- getrennte Requests, im psql-Test aber nicht — und ein Aufrufer darf das duerfen.
  DROP TABLE IF EXISTS _cand;
  DROP TABLE IF EXISTS _pre;
  CREATE TEMP TABLE _cand ON COMMIT DROP AS
  SELECT DISTINCT ON (l.team_id, nullif(btrim(l.linkedin_url), ''))
         l.id, l.team_id, l.user_id, l.first_name, l.last_name, l.company, l.name AS lead_name,
         nullif(btrim(l.linkedin_url), '') AS url
    FROM public.leads l
   WHERE l.archived = false
     AND l.team_id = ANY(v_teams)
     AND (p_lead_ids IS NULL OR l.id = ANY(p_lead_ids))
   ORDER BY l.team_id, nullif(btrim(l.linkedin_url), ''), l.updated_at DESC NULLS LAST, l.id;

  -- Gesamtzahl inkl. der durch DISTINCT ON verworfenen Doubletten separat ermitteln.
  SELECT count(*) INTO v_total
    FROM public.leads l
   WHERE l.archived = false AND l.team_id = ANY(v_teams)
     AND (p_lead_ids IS NULL OR l.id = ANY(p_lead_ids));
  SELECT count(*) FILTER (WHERE url IS NULL) INTO v_no_url FROM _cand;
  SELECT v_total - count(*) INTO v_dup_in_batch FROM _cand;

  -- Vorzustand je Kandidat festhalten (danach wird geschrieben, also jetzt zaehlen).
  CREATE TEMP TABLE _pre ON COMMIT DROP AS
  SELECT c.id AS lead_id, c.team_id, c.url,
         i.id AS inbox_id, i.brand_voice_id AS ist_marke, i.review_status AS ist_status
    FROM _cand c
    LEFT JOIN LATERAL (
      SELECT x.id, x.brand_voice_id, x.review_status
        FROM public.linkedin_inbox x
       WHERE x.team_id = c.team_id AND x.linkedin_url = c.url
       ORDER BY x.imported_at DESC NULLS LAST LIMIT 1
    ) i ON true
   WHERE c.url IS NOT NULL;

  SELECT count(*) FILTER (WHERE inbox_id IS NULL),
         count(*) FILTER (WHERE inbox_id IS NOT NULL AND ist_marke IS NULL),
         count(*) FILTER (WHERE inbox_id IS NOT NULL
                            AND (ist_marke IS NULL OR ist_marke = p_brand_voice_id)
                            AND ist_status IS DISTINCT FROM 'new'),
         count(*) FILTER (WHERE ist_marke = p_brand_voice_id),
         count(*) FILTER (WHERE ist_marke IS NOT NULL AND ist_marke <> p_brand_voice_id)
    INTO v_created, v_backfilled, v_resurfaced, v_same_brand, v_other_brand
    FROM _pre;

  IF NOT p_dry_run THEN
    -- 1) Bestehende Zeilen: Marke nachtragen (nur NULL) und/oder sichtbar machen.
    --    Fremde Marke bleibt komplett unberuehrt — kein updated_at, kein Status.
    UPDATE public.linkedin_inbox i
       SET brand_voice_id = COALESCE(i.brand_voice_id, p_brand_voice_id),
           review_status  = 'new',
           updated_at     = now()
      FROM _pre p
     WHERE i.id = p.inbox_id
       AND (p.ist_marke IS NULL OR p.ist_marke = p_brand_voice_id)
       AND (p.ist_marke IS NULL OR p.ist_status IS DISTINCT FROM 'new');

    -- 2) Wirklich neue Zeilen. ON CONFLICT DO NOTHING nur als Race-Guard —
    --    die fachliche Dedup steckt im NOT-EXISTS ueber _pre.
    INSERT INTO public.linkedin_inbox
           (team_id, user_id, brand_voice_id, source, name, first_name, last_name, company, linkedin_url)
    SELECT c.team_id, c.user_id, p_brand_voice_id, 'crm_lead',
           -- Name: erst Vor+Nachname, dann leads.name, erst dann 'Unbekannt'. Die alte
           -- Funktion kannte nur first/last und schrieb fuer Leads, die ihren Namen nur in
           -- leads.name tragen, sichtbar „Unbekannt" in die Kontakte-Liste.
           COALESCE(NULLIF(btrim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''),
                    NULLIF(btrim(coalesce(c.lead_name,'')), ''), 'Unbekannt'),
           NULLIF(c.first_name, ''), NULLIF(c.last_name, ''), NULLIF(c.company, ''), c.url
      FROM _cand c
      JOIN _pre p ON p.lead_id = c.id
     WHERE c.url IS NOT NULL AND p.inbox_id IS NULL
    ON CONFLICT DO NOTHING;

    -- created auf die TATSAECHLICH geschriebene Zahl korrigieren: der Vorzustand ist
    -- eine Schaetzung, ON CONFLICT DO NOTHING kann bei einem Race weniger anlegen.
    -- Im Dry-Run bleibt die Schaetzung stehen — genau das zeigt der Dialog an.
    GET DIAGNOSTICS v_created = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'total_candidates',       v_total,
    'created',                v_created,
    'brand_backfilled',       v_backfilled,
    'resurfaced',             v_resurfaced,
    'skipped_no_url',         v_no_url,
    'already_same_brand',     v_same_brand,
    'already_other_brand',    v_other_brand,
    'duplicate_url_in_batch', v_dup_in_batch,
    'dry_run',                p_dry_run
  );
END $function$;
REVOKE ALL   ON FUNCTION public.add_leads_to_inbox(uuid, uuid[], boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.add_leads_to_inbox(uuid, uuid[], boolean) TO authenticated, service_role;

COMMIT;

\echo '--- Verify: add_lead_to_inbox ist wieder 1-arg (uuid), 2-arg weg ---'
SELECT p.oid::regprocedure AS signatur FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='add_lead_to_inbox' ORDER BY 1;
\echo '--- Verify: add_leads_to_inbox nullt promoted_lead_id NICHT mehr (erwartet f) ---'
SELECT (pg_get_functiondef(p.oid) ILIKE '%promoted_lead_id = NULL%') AS setzt_promoted_null
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='add_leads_to_inbox';

NOTIFY pgrst, 'reload schema';

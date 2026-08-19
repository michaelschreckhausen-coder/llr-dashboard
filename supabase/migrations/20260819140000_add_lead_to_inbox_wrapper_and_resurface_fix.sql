-- ============================================================================
-- add_lead_to_inbox -> Wrapper um add_leads_to_inbox + Resurface nullt promoted_lead_id
-- ----------------------------------------------------------------------------
-- Befund (2026-08-19 gegen Prod verifiziert, nicht aus Migrationen abgeleitet):
--
-- (1) MARKENLOS-UNSICHTBAR. 4.821 von 52.000 linkedin_inbox-Zeilen haben
--     brand_voice_id IS NULL. Die RLS (linkedin_inbox_brand) laesst sie ausdruecklich
--     durch (brand_voice_id IS NULL AND user_in_team(team_id)), aber inbox_feed zeigt
--     nur (brand=aktive Marke AND network-scope) ODER Mitglied einer geteilten Liste.
--     Eine markenlose Zeile erfuellt keins von beidem -> sie erscheint nie, ohne Fehler,
--     ohne Leerzustand. Der Einzel-Button add_lead_to_inbox(lead) hat das verursacht:
--     sein INSERT setzte KEIN brand_voice_id.
--
-- (2) RESURFACE-NICHT-BEDIENBAR. add_lead_to_inbox hob beim Zurueckholen review_status
--     auf 'new', liess promoted_lead_id aber stehen (Haupt- UND EXCEPTION-Zweig — live
--     per pg_get_functiondef geprueft). Das Frontend liest
--     isFromCrm = source='crm_lead' OR !!promoted_lead_id (LinkedInInbox.jsx:558) und
--     rendert dann ein Label statt eines Buttons; promoteSelected schliesst die Zeile
--     aus. Sichtbar, aber nicht bedienbar. Live: 33 Zeilen mit
--     promoted_lead_id IS NOT NULL AND review_status='new'.
--
-- ── Warum der Einzelpfad ein Wrapper wird (Auftrag 1) ─────────────────────────
-- add_leads_to_inbox (20260819090000) macht die Marken-Regel bereits richtig:
-- brand_voice_id NUR nachtragen, wenn NULL — fremde Marke bleibt unberuehrt ("kein
-- Diebstahl an der Nachbarmarke"). Statt diese Regel ein zweites Mal zu schreiben und
-- damit ein zweites Mal falsch zu bekommen, delegiert add_lead_to_inbox jetzt an
-- add_leads_to_inbox mit einer einelementigen Liste. Ein Code-Pfad, ein Verhalten.
--   * Signaturwechsel (uuid) -> (uuid p_brand_voice_id, uuid p_lead_id): die aktive
--     Marke ist der Regel wegen jetzt Pflicht-Argument. Die alte 1-arg-Funktion wird
--     gedroppt.
--   * Kein Aufrufer haengt an ihr. Repo-weiter grep 2026-08-19: der einzige Treffer auf
--     "add_lead_to_inbox" ausserhalb der Migrationen ist ein KOMMENTAR in LeadDetail.jsx;
--     das Frontend ruft ausschliesslich add_leads_to_inbox (LeadDetail.jsx:416 mit
--     einelementiger Liste, Leads.jsx bulk). Kein anderer DB-Funktionskoerper referenziert
--     sie (pg_get_functiondef-Scan auf Prod: 0 Treffer).
--   * Die Rueckgabeform aendert sich damit bewusst von {id,created,resurfaced} auf das
--     reichere jsonb von add_leads_to_inbox. Zulaessig, weil kein Konsument die alte Form
--     liest (siehe grep). Damit greift NICHT die im Auftrag genannte Ausnahme ("falls es
--     an der Rueckgabeform scheitert") — der duenne Wrapper ist der bevorzugte Weg.
--
-- ── Warum promoted_lead_id nullen SICHER ist, obwohl inbox_feed es liest (Auftrag 2) ─
-- inbox_feed.in_crm = ( promoted_lead_id IS NOT NULL
--                       OR (sales_nav_id trifft einen nicht-archivierten Lead) ).
-- promoted_lead_id ist dort der Beleg fuer Leads, die per promote_inbox_contact OHNE
-- sales_nav_id entstanden und durch den salesnav-Match fallen. Wichtig: die beiden
-- Signale sind bereits ENTKOPPELT —
--   * "kommt aus dem CRM"      = source='crm_lead'   (bleibt unangetastet)
--   * "aktuell promoted"       = review_status='promoted' mit promoted_lead_id
-- Auf Resurface (-> 'new') ist die Zeile per Definition NICHT mehr promoted; sie SOLL
-- wieder bewertbar sein. promoted_lead_id dort zu nullen ist also die korrekte
-- Bedeutung, kein Informationsverlust: bleibt der Kontakt echt im CRM (salesnav-Lead
-- existiert), traegt in_crm ihn weiter ueber den unabhaengigen salesnav-Zweig. Nur die
-- reinen promote_inbox_contact-Faelle verlieren in_crm — genau richtig fuer eine Zeile,
-- die man bewusst zur erneuten Bewertung zurueckholt. Deshalb ist KEINE Frontend-
-- Aenderung noetig; die Invariante allein macht das bestehende isFromCrm korrekt.
--
-- Die Korrektur sitzt in add_leads_to_inbox (dem einen Schreibpfad, den jetzt auch der
-- Wrapper nutzt): der bestehende Resurface-UPDATE setzt zusaetzlich promoted_lead_id=NULL.
-- Set-basiert, daher kein Haupt-/EXCEPTION-Zweig wie in der alten Funktion — jede vom
-- UPDATE getroffene Zeile geht ohnehin auf 'new'.
--
-- ── Was diese Migration NICHT tut ────────────────────────────────────────────
-- Kein Backfill. Die 4.821 markenlosen und die 33 promoted-Altzeilen sind DATEN und
-- werden separat repariert (scripts/backfill_20260819_inbox_brand_and_promoted.sql,
-- mit Dry-Run-Count), nicht in dieser DDL versteckt.
--
-- add_leads_to_inbox wird per CREATE OR REPLACE neu gesetzt; der Rumpf ist identisch
-- zu 20260819090000 (Prod-Live-Body am 2026-08-19 gegengelesen) bis auf die eine
-- promoted_lead_id=NULL-Zeile. Rollback: .rollback.sql stellt beide Funktionen auf den
-- Stand VOR dieser Migration zurueck (inkl. der defekten 1-arg-Funktion — Rollback ist
-- Rueckabwicklung, nicht Neu-Reparatur).
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

-- Alte, defekte Einzelfunktion entfernen (wird durch den 2-arg-Wrapper ersetzt).
DROP FUNCTION IF EXISTS public.add_lead_to_inbox(uuid);

-- ── add_leads_to_inbox: unveraendert bis auf promoted_lead_id=NULL im Resurface-UPDATE ─
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
           -- Resurface macht die Zeile wieder bewertbar: promoted_lead_id MUSS mit.
           -- Bleibt er stehen, rendert das Frontend (isFromCrm = source='crm_lead'
           -- OR !!promoted_lead_id, LinkedInInbox.jsx:558) ein Label statt des Promote-
           -- Buttons und promoteSelected wirft die Zeile aus der Bulk-Auswahl. Invariante:
           -- review_status='new'  =>  promoted_lead_id IS NULL. Jede von diesem UPDATE
           -- getroffene Zeile geht auf 'new', also wird promoted_lead_id hier immer genullt.
           promoted_lead_id = NULL,
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

-- ── Einzelpfad add_lead_to_inbox: duenner Wrapper (Signatur jetzt brand + lead) ───────
CREATE OR REPLACE FUNCTION public.add_lead_to_inbox(p_brand_voice_id uuid, p_lead_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $wrap$
  -- Ein einzelner Lead ist die einelementige Menge. add_leads_to_inbox macht Auth
  -- (has_brand_access + get_my_team_ids), Marken-Regel, Dedup und Resurface.
  SELECT public.add_leads_to_inbox(p_brand_voice_id, ARRAY[p_lead_id], false);
$wrap$;

REVOKE ALL   ON FUNCTION public.add_lead_to_inbox(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.add_lead_to_inbox(uuid, uuid) TO authenticated, service_role;

COMMIT;

\echo '--- Verify: add_lead_to_inbox ist jetzt (uuid,uuid) und delegiert an add_leads_to_inbox ---'
SELECT p.oid::regprocedure AS signatur, p.prosecdef,
       (pg_get_functiondef(p.oid) ILIKE '%add_leads_to_inbox%') AS delegiert
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='add_lead_to_inbox';
\echo '--- Verify: die alte 1-arg-Funktion existiert nicht mehr (erwartet 0) ---'
SELECT count(*) AS alte_1arg_noch_da FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='add_lead_to_inbox' AND p.pronargs=1;
\echo '--- Verify: add_leads_to_inbox nullt jetzt promoted_lead_id im Resurface-UPDATE ---'
SELECT (pg_get_functiondef(p.oid) ILIKE '%promoted_lead_id = NULL%') AS setzt_promoted_null
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='add_leads_to_inbox';
\echo '--- Verify: Rechte beider Funktionen (kein PUBLIC/anon) ---'
SELECT p.oid::regprocedure AS signatur,
       CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee, a.privilege_type
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace, LATERAL aclexplode(p.proacl) a
 WHERE n.nspname='public' AND p.proname IN ('add_lead_to_inbox','add_leads_to_inbox') ORDER BY 1,2;

NOTIFY pgrst, 'reload schema';

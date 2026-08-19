-- ============================================================================
-- add_leads_to_inbox — CRM-Leads (einzeln ODER als Menge) in die LinkedIn-Kontakte
-- ----------------------------------------------------------------------------
-- Loest zwei Dinge auf einmal:
--   1. Bulk: /leads soll mehrere Leads in EINEM Statement uebernehmen. Bei 1.024
--      aktiven Leads mit URL allein im Team VfL Bochum waere ein RPC-Aufruf pro Lead
--      der Unterschied zwischen einer Sekunde und mehreren Minuten.
--   2. Marke: add_lead_to_inbox (20260710230000 / …240000) setzt KEIN brand_voice_id
--      und wurde beim Brand-Scoping-Sweep am 23.07. (20260724203000) nicht nachgezogen.
--      Die Kontakte-Ansicht filtert aber strikt auf die aktive Marke
--      (LinkedInInbox: .eq('brand_voice_id', bvId), Feed ueber inbox_feed) — eine
--      markenlose Zeile taucht dort nie auf. Diese Funktion setzt die Marke.
--
-- Befund 2026-08-19 auf Prod, der die Dringlichkeit einordnet: es gibt aktuell
-- NULL Zeilen mit source='crm_lead'. Der Einzel-Button hat also noch nie eine Zeile
-- erzeugt — nicht weil er scheitert, sondern weil fuer die probierten Leads schon eine
-- Zeile aus einer anderen Quelle existierte (1.102 von 1.618 aktiven Leads mit URL
-- liegen bereits als linkedin_inbox-Zeile im selben Team, davon nur 23 ohne Marke).
-- Die Markenluecke ist real, hat sich aber mangels Neuanlagen noch nicht gezeigt.
--
-- ── Autorisierung, bewusst ohne Abkuerzung ─────────────────────────────────────
-- Geschrieben wird ausschliesslich in Leads, deren team_id der Aufrufer traegt
-- (get_my_team_ids()) — das ist derselbe Guard wie in add_lead_to_inbox
-- (user_in_team) und die Begruendung aus 20260811190000_linkedin_scopes_C2_rpc_scope:
-- add_lead_to_inbox bekam bewusst KEIN automation/network-Scope-OR, weil ein geteiltes
-- Team sonst in eine FREMDE Inbox schreiben koennte. Das gilt hier unveraendert.
-- Fuer die Marke gilt has_brand_access(p_brand_voice_id): der Standard-Guard fuer „darf
-- diese Marke benutzen" (eigene Marke oder mit einem meiner Teams geteilt). Bewusst NICHT
-- zusaetzlich bv.team_id = lead.team_id verlangt — das wuerde den dokumentierten
-- Agentur-Fall brechen (Kontakte und Marke in verschiedenen Teams, siehe la-audience).
-- Das Schreibziel bleibt in jedem Fall das EIGENE Team.
--
-- ── Warum nicht ein einziger Upsert ───────────────────────────────────────────
-- Der Unique-Index ist linkedin_inbox_team_url_uniq (team_id, linkedin_url)
-- WHERE linkedin_url IS NOT NULL AND sales_nav_id IS NULL — er deckt Zeilen MIT
-- sales_nav_id nicht ab. Ein reiner ON-CONFLICT-Upsert wuerde deshalb neben einer
-- bestehenden Sales-Navigator-Zeile mit derselben URL eine zweite Zeile anlegen.
-- Deshalb zwei mengenbasierte Statements: ein UPDATE fuer vorhandene Zeilen, ein
-- INSERT … SELECT … ON CONFLICT DO NOTHING (nur als Race-Guard) fuer wirklich neue.
-- Kein Cursor, keine Schleife.
--
-- ── Marken-Semantik ──────────────────────────────────────────────────────────
-- Liegt der Kontakt schon unter einer ANDEREN Marke im Team, bleibt er unangetastet
-- (Zaehler already_other_brand). Ein Umschreiben wuerde den Kontakt von einer Marke
-- zur anderen verschieben — das ist keine Uebernahme, das ist Diebstahl an der
-- Nachbarmarke. Nur brand_voice_id IS NULL wird auf die Zielmarke nachgetragen; das
-- ist die Reparatur der Altlast.
-- Resurface wie in 20260710240000: promoted/dismissed → 'new', source unveraendert.
--
-- Kein DDL an Tabellen, kein neuer Index. Rollback: .rollback.sql (DROP FUNCTION).
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

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
  CREATE TEMP TABLE _cand ON COMMIT DROP AS
  SELECT DISTINCT ON (l.team_id, nullif(btrim(l.linkedin_url), ''))
         l.id, l.team_id, l.user_id, l.first_name, l.last_name, l.company,
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
           COALESCE(NULLIF(btrim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''), 'Unbekannt'),
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

\echo '--- Verify: Signatur + Rechte ---'
SELECT p.oid::regprocedure AS signatur, p.prosecdef, pg_get_userbyid(p.proowner) AS owner
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='add_leads_to_inbox';
SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee, a.privilege_type
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace, LATERAL aclexplode(p.proacl) a
 WHERE n.nspname='public' AND p.proname='add_leads_to_inbox' ORDER BY 1;
\echo '--- Verify: add_lead_to_inbox existiert unveraendert weiter ---'
SELECT count(*) AS alte_funktion_noch_da FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='add_lead_to_inbox';

NOTIFY pgrst, 'reload schema';

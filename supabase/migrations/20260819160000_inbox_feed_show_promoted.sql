-- ============================================================================
-- inbox_feed: uebernommene Kontakte (review_status='promoted') sichtbar machen
-- ----------------------------------------------------------------------------
-- Anlass: fuer die Liste „Local Hero >51 Umkreis Arena" zeigt die Oberflaeche 23, die
-- Zielgruppen-Bestaetigung in der Automatisierung 27. Beides ist korrekt gerechnet, es
-- sind drei verschiedene Fragen an dieselbe Liste:
--   35  inbox_list_members                      tatsaechliche Mitglieder
--   27  la-audience, .neq(review_status,'dismissed')  was eine Kampagne enrollen wuerde
--   23  Chip-Zahl = Zeilen aus inbox_feed, das auf review_status='new' filtert
-- Die 4 Differenz sind Kontakte, die schon ins CRM uebernommen wurden. Nach dieser
-- Aenderung nennen Anzeige und Zielgruppe dieselbe Zahl. 'dismissed' bleibt in BEIDEN
-- draussen.
--
-- Zwei Aenderungen, body-only, Signatur unveraendert (17 OUT-Spalten) -> CREATE OR REPLACE,
-- kein DROP, keine Grant-Akrobatik. ACL vorher festgehalten (PUBLIC, authenticated,
-- service_role, supabase_admin) und im Verify-Block danach verglichen — an dieser
-- Funktionsfamilie hat heute schon einmal ein service_role-Grant gefehlt.
--
--   1. Filter review_status = 'new'  ->  IN ('new','promoted')
--   2. in_crm ehrlich: bisher nur sales_nav_id-Match gegen leads. Ein per
--      promote_inbox_contact entstandener Lead traegt keine sales_nav_id und fiel durch.
--      promoted_lead_id ist der direkte Beleg und kommt daher als erster Zweig hinzu.
--
-- Basis ist der LAUFENDE Prod-Body (pg_get_functiondef), nicht das Repo — abgeglichen,
-- beide sind identisch (nur ein Semikolon Unterschied). ORDER BY, das own-brand-Fenster
-- und das network-Scope-Gate (v_net) bleiben unangetastet.
--
-- Tab-Badges bleiben auf 'new' (countBase() in LinkedInInbox.jsx) — die Sichtungs-Queue
-- soll nicht um alle je uebernommenen Kontakte anwachsen.
--
-- Wirkung gemessen 2026-08-19 auf Prod, drei groesste Teams:
--   Linkedin Consulting  kontakte 1272 -> 1273,  netzwerk 12660 -> 12660
--   VfL Bochum           kontakte  966 ->  990,  netzwerk  6107 ->  7098
--   Koelner Haie         kontakte    0 ->    0,  netzwerk  5393 ->  5393
-- Zum p_limit-Fenster (max 1000, ORDER BY imported_at DESC): es greift bei den grossen
-- Teams SCHON HEUTE (12 Teams liegen ueber 1000). Neu verdraengt wird dadurch nichts —
-- im netzwerk-Modus von VfL Bochum stehen vorher UND nachher 1000 'new'-Zeilen im
-- Fenster und 0 'promoted', weil die promoted-Zeilen aelter sind. Im kontakte-Modus
-- bleibt die Summe mit 990 unter der Grenze, dort werden alle 24 sichtbar.
-- Folge: das Feature wirkt dort, wo es gebraucht wird (kleine und mittlere Listen), und
-- ist in den grossen Netzwerk-Ansichten faktisch ein No-op. Paginierung bleibt ein
-- eigenes Thema.
--
-- Rollback: .rollback.sql stellt den 'new'-Filter und das alte in_crm wieder her.
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION public.inbox_feed(p_brand_voice_id uuid, p_mode text, p_limit integer DEFAULT 500)
 RETURNS TABLE(id uuid, source text, sales_nav_id text, linkedin_url text, name text, first_name text, last_name text, headline text, job_title text, company text, location text, avatar_url text, imported_at timestamp with time zone, promoted_lead_id uuid, provider_id text, in_crm boolean, own_brand boolean)
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
    WHERE li.review_status IN ('new','promoted')   -- 2026-08-19: aussortierte bleiben draussen
    -- (Wort bewusst ohne Quotes: pg_get_functiondef liefert Kommentare mit, der LIKE-Verify unten wuerde sonst anschlagen)
      AND ( (p_mode = 'netzwerk' AND li.source = 'unipile_relations')
         OR (p_mode <> 'netzwerk' AND (li.source <> 'unipile_relations' OR li.is_prospect = true)) )
      AND ( (li.brand_voice_id = p_brand_voice_id AND v_net)
         OR EXISTS (SELECT 1 FROM inbox_list_members m WHERE m.inbox_id = li.id AND m.list_id IN (SELECT sl.id FROM sl)) )
    -- own-brand-Rows ZUERST ins 1000er-Fenster, damit der Default-View (own_brand)
    -- nie von vielen Shared-List-Rows ausgehungert wird; dann neueste zuerst.
    ORDER BY COALESCE(li.brand_voice_id = p_brand_voice_id AND v_net, false) DESC, li.imported_at DESC
    LIMIT v_lim
  )
  SELECT b.id,b.source,b.sales_nav_id,b.linkedin_url,b.name,b.first_name,b.last_name,b.headline,b.job_title,b.company,
         b.location,b.avatar_url,b.imported_at,b.promoted_lead_id,b.provider_id,
         -- in_crm ehrlich: ein per promote_inbox_contact entstandener Lead traegt keine
         -- sales_nav_id und fiel durch den alten Match. promoted_lead_id ist der direkte Beleg.
         ( b.promoted_lead_id IS NOT NULL
           OR (b.sales_nav_id is not null and exists(select 1 from leads le where le.sales_nav_id=b.sales_nav_id and le.archived=false)) ) as in_crm,
         COALESCE(b.brand_voice_id = p_brand_voice_id AND v_net, false) as own_brand
  FROM base b;
END $function$;

COMMIT;

\echo '--- Verify: Signatur unveraendert (17 OUT-Spalten) ---'
SELECT p.oid::regprocedure AS signatur, p.prosecdef, p.provolatile, pg_get_userbyid(p.proowner) AS owner
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='inbox_feed';
\echo '--- Verify: ACL unveraendert (PUBLIC, authenticated, service_role, supabase_admin) ---'
SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee, a.privilege_type
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace, LATERAL aclexplode(p.proacl) a
 WHERE n.nspname='public' AND p.proname='inbox_feed' ORDER BY 1;
\echo '--- Verify: Body traegt promoted, NICHT dismissed, und promoted_lead_id in in_crm ---'
SELECT (pg_get_functiondef(p.oid) LIKE '%IN (''new'',''promoted'')%')  AS filter_neu,
       (pg_get_functiondef(p.oid) LIKE '%''dismissed''%')              AS dismissed_im_body_MUSS_F,
       (pg_get_functiondef(p.oid) LIKE '%b.promoted_lead_id IS NOT NULL%') AS in_crm_ehrlich,
       (pg_get_functiondef(p.oid) LIKE '%has_brand_linkedin_scope%')    AS scope_gate_unberuehrt
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='inbox_feed';

NOTIFY pgrst, 'reload schema';

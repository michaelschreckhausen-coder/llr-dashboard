-- ============================================================================
-- inbox_feed / inbox_counts / inbox_recipient_search: authenticated-Grant festschreiben
-- ----------------------------------------------------------------------------
-- Befund 2026-08-19: auf Staging haengen diese drei RPCs allein an PUBLIC EXECUTE — der
-- explizite Grant an authenticated fehlt. Auf Prod ist er vorhanden.
--
-- Ursache, exakt lokalisiert (nicht geraten):
--   * 20260812130000_inbox_feed_own_brand_flag.sql arbeitet mit DROP FUNCTION + CREATE
--     FUNCTION und vergibt danach KEINEN Grant. Die ACL entsteht also allein aus dem
--     Default.
--   * pg_default_acl fuer Funktionen im Schema public, erstellende Rolle supabase_admin:
--       Prod    -> {authenticated=X, service_role=X}
--       Staging -> {service_role=X}
--     Deshalb bekommt auf Staging jede von supabase_admin erstellte Funktion kein
--     authenticated, auf Prod schon. Das betrifft nicht nur diese drei.
--
-- Warum das nicht kosmetisch ist: heute funktionieren sie auf Staging, weil PUBLIC
-- EXECUTE hat und authenticated darin enthalten ist. Ein kuenftiges
-- REVOKE EXECUTE ... FROM PUBLIC — genau die Haertung, die bei einer anderen Funktion
-- heute schon erwogen wurde — wuerde sie auf Staging schlagartig brechen und auf Prod
-- nicht. Diese Migration macht die Abhaengigkeit explizit, statt sie vom Default zu
-- borgen.
--
-- Rein additiv und idempotent: GRANT auf eine Rolle, die das Recht schon hat, ist ein
-- No-op. Auf Prod aendert diese Datei nichts. PUBLIC wird NICHT widerrufen — das waere
-- eine stille Verschaerfung und gehoert nicht in dieselbe Migration.
-- Kein DROP, kein CREATE, keine Signaturaenderung.
--
-- Rollback: .rollback.sql (REVOKE nur des hier vergebenen Grants). Achtung, dort steht
-- ausdruecklich, dass ein Rollback auf Prod eine echte Verschaerfung waere — deshalb
-- ist die Datei bewusst ein Dokument und kein Automatismus.
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

GRANT EXECUTE ON FUNCTION public.inbox_feed(uuid, text, integer)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.inbox_counts(uuid)                                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.inbox_recipient_search(uuid, text, text)            TO authenticated;

COMMIT;

\echo '--- Verify: authenticated auf allen drei? ---'
SELECT p.proname,
       bool_or(a.grantee = 'authenticated'::regrole::oid AND a.privilege_type='EXECUTE') AS authenticated_execute,
       bool_or(a.grantee = 0 AND a.privilege_type='EXECUTE')                             AS public_execute
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace, LATERAL aclexplode(p.proacl) a
 WHERE n.nspname='public' AND p.proname IN ('inbox_feed','inbox_counts','inbox_recipient_search')
 GROUP BY 1 ORDER BY 1;

NOTIFY pgrst, 'reload schema';

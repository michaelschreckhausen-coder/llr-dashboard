-- ROLLBACK zu 20260819180000_inbox_rpcs_grant_authenticated.sql
-- ⚠️ NICHT unbedacht ausfuehren. Auf Prod trug authenticated diesen Grant schon VOR der
-- Migration (aus dem pg_default_acl); ein REVOKE hier waere dort also keine Ruecknahme,
-- sondern eine echte Verschaerfung — die RPCs liefen danach nur noch ueber PUBLIC.
-- Sinnvoll ist diese Datei praktisch nur auf einer Umgebung, die den Grant vorher nicht
-- hatte (Staging), und auch dort nur, wenn PUBLIC EXECUTE unangetastet bleibt.
\set ON_ERROR_STOP on
BEGIN;
REVOKE EXECUTE ON FUNCTION public.inbox_feed(uuid, text, integer)          FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.inbox_counts(uuid)                       FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.inbox_recipient_search(uuid, text, text) FROM authenticated;
COMMIT;
\echo '--- Verify: bleibt PUBLIC EXECUTE erhalten? (sonst sind die RPCs tot) ---'
SELECT p.proname, bool_or(a.grantee = 0 AND a.privilege_type='EXECUTE') AS public_execute
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace, LATERAL aclexplode(p.proacl) a
 WHERE n.nspname='public' AND p.proname IN ('inbox_feed','inbox_counts','inbox_recipient_search')
 GROUP BY 1 ORDER BY 1;
NOTIFY pgrst, 'reload schema';

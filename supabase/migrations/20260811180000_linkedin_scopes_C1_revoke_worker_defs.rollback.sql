-- ROLLBACK Slice C1 — stellt die ORIGINAL-Grants (anon+authenticated) wieder her.
-- ⚠️ Das reöffnet die pre-existing Sicherheitslücke — NUR nutzen, wenn ein
-- unerwarteter Feature-Bruch auftritt (sollte nicht: Frontend ruft keine davon).
BEGIN;
GRANT EXECUTE ON FUNCTION public.la_pending_accept_checks(integer)              TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.la_mark_accepted(uuid)                         TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.sales_nav_upsert_inbox(uuid, uuid, jsonb, uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.trigger_la_relations_sync()                    TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_la_enrollment_brand()                      TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_la_job_brand()                             TO PUBLIC;
COMMIT;

-- ============================================================================
-- Granulare LinkedIn-Freigabe — SLICE C1 (Security-Hardening, UNABHÄNGIG vom Feature)
-- Schließt pre-existing Löcher: 6 SECURITY-DEFINER-Funktionen waren für anon
-- (UNAUTHENTIFIZIERT, anon-Key liegt im Frontend) + authenticated ausführbar,
-- obwohl sie reine Worker/Trigger sind. Teils write auf BELIEBIGE Marken.
--
-- Beweis (Frontend-Grep leer): keine wird vom Frontend gerufen — nur von EFs mit
-- service_role-Client (sales_nav_upsert_inbox←import-*/sales-nav-import;
-- la_pending_accept_checks/la_mark_accepted←la-accept-reconcile). service_role
-- behält EXECUTE (nicht revoked) → EFs laufen unverändert.
--   set_la_*_brand sind Trigger-Funktionen (RETURNS trigger) → Direktaufruf ohnehin
--   wirkungslos, REVOKE = Hygiene.
-- Idempotent (REVOKE IF-vorhanden-egal). Reversibel (Rollback = GRANT zurück,
-- stellt aber das unsichere Original wieder her → NICHT empfohlen).
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

-- WICHTIG: Postgres grantet Funktionen per Default an PUBLIC → anon/authenticated
-- erben EXECUTE über PUBLIC. REVOKE FROM anon/authenticated allein ist ein No-op.
-- Daher FROM PUBLIC (+ anon,authenticated für etwaige Direkt-Grants) und danach
-- service_role explizit GRANTen (sonst verliert es den PUBLIC-geerbten Zugriff).
REVOKE EXECUTE ON FUNCTION public.la_pending_accept_checks(integer)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.la_mark_accepted(uuid)                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_nav_upsert_inbox(uuid, uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_la_relations_sync()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_la_enrollment_brand()                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_la_job_brand()                             FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.la_pending_accept_checks(integer)              TO service_role;
GRANT EXECUTE ON FUNCTION public.la_mark_accepted(uuid)                         TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_nav_upsert_inbox(uuid, uuid, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_la_relations_sync()                    TO service_role;
GRANT EXECUTE ON FUNCTION public.set_la_enrollment_brand()                      TO service_role;
GRANT EXECUTE ON FUNCTION public.set_la_job_brand()                             TO service_role;

COMMIT;

-- ── Verifikation: anon/authenticated dürfen NICHT mehr, service_role schon ──
\echo '--- Verify: EXECUTE-Rechte (auth/anon erwartet f, service_role t) ---'
SELECT p.proname,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
  has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
  has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
  ('la_pending_accept_checks','la_mark_accepted','sales_nav_upsert_inbox',
   'trigger_la_relations_sync','set_la_enrollment_brand','set_la_job_brand')
ORDER BY p.proname;

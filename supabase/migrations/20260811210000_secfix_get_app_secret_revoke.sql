-- ============================================================================
-- SECFIX #4-1 — get_app_secret gegen anon/PUBLIC schließen
-- ----------------------------------------------------------------------------
-- get_app_secret(secret_name text) ist SECURITY DEFINER und liest
-- vault.decrypted_secrets OHNE jeden Guard. Per Postgres-Default-Grant hat
-- PUBLIC (also auch anon + authenticated) EXECUTE -> über /rest/v1/rpc/get_app_secret
-- mit dem öffentlichen anon-Key kann JEDER ein Vault-Secret per Name auslesen.
-- Verifiziert: anon-HTTP-POST -> 200. Heute latent (Vault leer = 0 Secrets), aber
-- MUSS zu sein, BEVOR je ein Secret in den Vault kommt.
--
-- Legitime Aufrufer: NUR service_role (EFs). Grep: 0 Caller im Frontend, 0 in EFs,
-- 0 in SQL-Function-Bodies (prokind=f) -> REVOKE bricht nichts.
--
-- C1-Lehre: REVOKE FROM PUBLIC (nicht nur Rollen — sonst No-op), dann gezielt
-- GRANT TO service_role. supabase_admin (Owner) behält EXECUTE inhärent.
-- Reversibel: .rollback.sql stellt den unsicheren PUBLIC-Grant wieder her (NICHT
-- empfohlen).
-- ============================================================================
BEGIN;

REVOKE EXECUTE ON FUNCTION public.get_app_secret(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_app_secret(text) TO service_role;

COMMIT;

-- Verify: anon=f, authenticated=f, service_role=t
\echo '--- SECFIX Verify: get_app_secret EXECUTE (anon=f, auth=f, service=t) ---'
SELECT has_function_privilege('anon','public.get_app_secret(text)','EXECUTE')          AS anon,
       has_function_privilege('authenticated','public.get_app_secret(text)','EXECUTE') AS auth,
       has_function_privilege('service_role','public.get_app_secret(text)','EXECUTE')  AS svc;

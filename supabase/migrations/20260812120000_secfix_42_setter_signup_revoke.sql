-- ============================================================================
-- SECFIX #4-2 — Setter-/Signup-Audit: tote/missbrauchbare anon-Fläche schließen
-- ----------------------------------------------------------------------------
-- Vier Funktionen aus dem #4-Inventar. Diagnose (Bodies + Grep) ergab: KEINE hat
-- einen legitimen anon/User-JWT-Client-Caller — alle legitimen Pfade sind
-- server-seitig. Per Postgres-Default-Grant hatte PUBLIC (also anon+authenticated)
-- EXECUTE. REVOKE FROM PUBLIC (nicht nur Rollen — sonst No-op, C1-Lehre).
--
--  set_linkedin_brand_voice()  — TRIGGER-Fn (RETURNS trigger). Direktaufruf via RPC
--    scheitert ('trigger functions can only be called as triggers'). Trigger feuern
--    unabhängig vom EXECUTE-Grant → REVOKE = reine Hygiene, bricht nichts.
--  set_la_campaign_brand()     — TRIGGER-Fn, dito.
--  register_affiliate_click(...) — SECURITY DEFINER. Einziger Caller: EF
--    register-affiliate-click via service_role (verifiziert). REVOKE FROM PUBLIC +
--    GRANT service_role → EF behält Zugriff, direkter anon-Weg (Click-Spam auf die
--    RPC) ist zu.
--  attach_conversion_to_signup(...) — SECURITY DEFINER. Einziger Caller: Signup-
--    Trigger on_auth_user_created_affiliate_attach → handle_affiliate_attach_on_signup
--    (owner supabase_admin, holt Code aus NEW.raw_user_meta_data, übergibt die ECHTE
--    NEW.id). Die anon-Erreichbarkeit war tot UND missbrauchbar (beliebiges
--    p_user_id → Fremd-Attribution/Commission-Fraud). REVOKE schließt das; der
--    Trigger läuft owner-invoked weiter (supabase_admin besitzt die Fn → EXECUTE
--    inhärent). GRANT service_role für Defense-Konsistenz.
--
-- Verhaltensneutral für alle legitimen Flows. Reversibel: .rollback.sql stellt den
-- (unsicheren) PUBLIC-Grant wieder her (nicht empfohlen).
-- ============================================================================
BEGIN;

-- Trigger-Fns: nur Hygiene (Trigger unabhängig vom Grant).
REVOKE EXECUTE ON FUNCTION public.set_linkedin_brand_voice()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_la_campaign_brand()     FROM PUBLIC, anon, authenticated;

-- Affiliate-Funcs: server-seitige Caller behalten Zugriff, anon-Fläche zu.
REVOKE EXECUTE ON FUNCTION public.register_affiliate_click(text, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.register_affiliate_click(text, text, text, text, text, text, text)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.attach_conversion_to_signup(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.attach_conversion_to_signup(uuid, text, uuid)
  TO service_role;

COMMIT;

-- Verify: anon/auth=f für alle 4; service_role=t für die zwei Affiliate-Funcs;
-- owner (supabase_admin) behält attach_conversion (Trigger-Pfad) inhärent.
\echo '--- SECFIX #4-2 Verify (anon=f, auth=f) ---'
SELECT p.proname,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated',  p.oid, 'EXECUTE') AS auth,
       has_function_privilege('service_role',   p.oid, 'EXECUTE') AS svc,
       has_function_privilege('supabase_admin', p.oid, 'EXECUTE') AS owner
FROM pg_proc p
WHERE p.pronamespace='public'::regnamespace
  AND p.proname IN ('set_linkedin_brand_voice','set_la_campaign_brand','register_affiliate_click','attach_conversion_to_signup')
ORDER BY p.proname;

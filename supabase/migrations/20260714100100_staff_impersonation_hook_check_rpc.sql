-- Fail-closed Hook-Guard für die staff-impersonate EF: prüft zur Laufzeit, ob ein Custom-Access-Token-Hook
-- aktiv ist (die pg-functions://-Variante legt eine DB-Function 'custom_access_token_hook' an). Ist ein Hook
-- aktiv, würde ein self-signed Weg-B-Token dessen Zusatz-Claims NICHT tragen → still unfaithful. Dann verweigert
-- die EF das Signieren. Heute kein Hook — der Guard schützt gegen künftige Aktivierung. service_role-only.

BEGIN;

CREATE OR REPLACE FUNCTION public.staff_impersonation_hook_active()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'custom_access_token_hook'
      AND n.nspname IN ('public', 'auth')
  );
$fn$;

REVOKE ALL ON FUNCTION public.staff_impersonation_hook_active() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_impersonation_hook_active() TO service_role;

COMMIT;

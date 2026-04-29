-- Phase 1.3c: RLS-Aufsplittung auf accounts.
-- Nach dieser Migration ist update_account_with_audit RPC der einzige
-- zulässige Schreibpfad. Direct UPDATE durch authenticated wird durch
-- fehlende UPDATE-Policy geblockt — nur die RPC (SECURITY DEFINER mit
-- postgres-Owner-Rechten) kann schreiben.
--
-- Plus: REVOKE EXECUTE FROM PUBLIC auf der RPC, härtet Postgres-Default-Grant.
--
-- Defense-in-depth: 3 Schichten Schreibsperre für authenticated:
--   1. Keine UPDATE-Policy für authenticated (RLS-Block)
--   2. PUBLIC kann RPC nicht mehr aufrufen
--   3. RPC selbst checkt is_leadesk_admin Claim

BEGIN;

-- Alte Policy entfernen (war FOR ALL, gab UPDATE/DELETE/INSERT für Admins)
DROP POLICY IF EXISTS accounts_admin_all ON accounts;

-- Neue Policy: Admins SELECT-only
CREATE POLICY accounts_admin_select ON accounts
  FOR SELECT
  USING (
    COALESCE(((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin'))::boolean, false) = true
  );

-- PUBLIC-Härtung auf RPC (Postgres-Default-Grant aufheben)
REVOKE EXECUTE ON FUNCTION public.update_account_with_audit FROM PUBLIC;

COMMIT;

-- 20260615100000_monitoring_checks.sql
-- Persistierte Ergebnisse der synthetischen Monitoring-Checks (Phase 1c).
-- Geschrieben via record_monitoring_check (SECURITY DEFINER), aufgerufen vom
-- Monitoring-User aus GitHub Actions. Lesen nur is_leadesk_admin. Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS public.monitoring_checks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_name   text NOT NULL,
  ok           boolean NOT NULL,
  latency_ms   integer,
  error        text,
  environment  text NOT NULL DEFAULT 'production',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monitoring_checks_created      ON public.monitoring_checks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitoring_checks_name_created ON public.monitoring_checks(check_name, created_at DESC);

ALTER TABLE public.monitoring_checks ENABLE ROW LEVEL SECURITY;

-- Nur Leadesk-Admins lesen die Historie; kein direkter Insert (nur via RPC).
DROP POLICY IF EXISTS monitoring_checks_admin_select ON public.monitoring_checks;
CREATE POLICY monitoring_checks_admin_select ON public.monitoring_checks FOR SELECT TO authenticated
  USING (COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false));

-- SECURITY DEFINER: schreibt als Owner (umgeht RLS); vom Monitoring-User aufgerufen.
CREATE OR REPLACE FUNCTION public.record_monitoring_check(
  p_check text, p_ok boolean, p_latency integer DEFAULT NULL,
  p_error text DEFAULT NULL, p_env text DEFAULT 'production'
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  INSERT INTO public.monitoring_checks (check_name, ok, latency_ms, error, environment)
  VALUES (p_check, p_ok, p_latency, p_error, COALESCE(p_env, 'production'));
$$;

REVOKE ALL    ON FUNCTION public.record_monitoring_check(text, boolean, integer, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_monitoring_check(text, boolean, integer, text, text) TO authenticated;

-- Self-Host: neue Tabelle braucht explizites GRANT (RPC schreibt als Definer;
-- SELECT-Grant nötig damit die Admin-RLS-Policy überhaupt greift). Vgl. Top-Fallstrick #3.
GRANT SELECT ON public.monitoring_checks TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

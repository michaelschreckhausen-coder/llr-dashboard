-- 20260615120000_monitoring_checks.sql  (Phase 2)
BEGIN;

CREATE TABLE IF NOT EXISTS public.monitoring_checks (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  check_name  text        NOT NULL,
  ok          boolean     NOT NULL,
  latency_ms  integer,
  error       text,
  environment text        NOT NULL DEFAULT 'production',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_monitoring_checks_name_time ON public.monitoring_checks(check_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitoring_checks_time      ON public.monitoring_checks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitoring_checks_env_time  ON public.monitoring_checks(environment, created_at DESC);

ALTER TABLE public.monitoring_checks ENABLE ROW LEVEL SECURITY;
-- Bewusst keine Policies + kein Table-Grant: Zugriff nur über die SECURITY-DEFINER-RPCs.

-- Write: nur der Monitoring-User
CREATE OR REPLACE FUNCTION public.record_monitoring_check(
  p_check text, p_ok boolean, p_latency integer, p_error text, p_env text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF (SELECT email FROM auth.users WHERE id = auth.uid()) <> 'monitor@leadesk.de' THEN
    RAISE EXCEPTION 'not authorized to record monitoring checks';
  END IF;
  INSERT INTO public.monitoring_checks(check_name, ok, latency_ms, error, environment)
  VALUES (p_check, p_ok, p_latency, NULLIF(p_error, ''), COALESCE(NULLIF(p_env, ''), 'production'));
END;
$fn$;

-- Read: Overview (latest + 24h-Uptime + Ø-Latenz), is_leadesk_admin-gated
CREATE OR REPLACE FUNCTION public.get_monitoring_overview(p_env text DEFAULT 'production')
RETURNS TABLE(
  check_name text, last_ok boolean, last_latency_ms integer,
  last_checked timestamptz, last_error text,
  uptime_24h numeric, avg_latency_24h numeric, runs_24h integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_leadesk_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (mc.check_name) mc.check_name, mc.ok, mc.latency_ms, mc.created_at, mc.error
    FROM public.monitoring_checks mc WHERE mc.environment = p_env
    ORDER BY mc.check_name, mc.created_at DESC
  ),
  agg AS (
    SELECT mc.check_name,
      round(100.0 * sum((mc.ok)::int) / NULLIF(count(*), 0), 1) AS uptime_24h,
      round(avg(mc.latency_ms))                                  AS avg_latency_24h,
      count(*)::int                                              AS runs_24h
    FROM public.monitoring_checks mc
    WHERE mc.environment = p_env AND mc.created_at > now() - interval '24 hours'
    GROUP BY mc.check_name
  )
  SELECT l.check_name, l.ok, l.latency_ms, l.created_at, l.error,
         a.uptime_24h, a.avg_latency_24h, a.runs_24h
  FROM latest l LEFT JOIN agg a USING (check_name)
  ORDER BY l.check_name;
END;
$fn$;

-- Read: History (Latenz-Trend), is_leadesk_admin-gated
CREATE OR REPLACE FUNCTION public.get_monitoring_history(
  p_check text, p_hours integer DEFAULT 24, p_env text DEFAULT 'production'
)
RETURNS TABLE(created_at timestamptz, ok boolean, latency_ms integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_leadesk_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT mc.created_at, mc.ok, mc.latency_ms
  FROM public.monitoring_checks mc
  WHERE mc.check_name = p_check AND mc.environment = p_env
    AND mc.created_at > now() - make_interval(hours => p_hours)
  ORDER BY mc.created_at;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.record_monitoring_check(text,boolean,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monitoring_overview(text)                            TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monitoring_history(text,integer,text)                TO authenticated;

-- Retention: 30 Tage, nur wenn pg_cron vorhanden (guarded → failt nie)
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('monitoring-purge', '0 3 * * *',
      $purge$DELETE FROM public.monitoring_checks WHERE created_at < now() - interval '30 days'$purge$);
  ELSE
    RAISE NOTICE 'pg_cron fehlt — Retention-Purge uebersprungen, manuell nachziehen';
  END IF;
END
$do$;

COMMIT;
NOTIFY pgrst, 'reload schema';

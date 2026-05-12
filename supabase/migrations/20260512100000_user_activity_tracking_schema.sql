-- =============================================================================
-- User Activity Tracking — Schema (Phase A)
-- =============================================================================
-- Zwei Tabellen für User-Aktivität:
--   1. user_login_log — pro-Login-Event (via Trigger auf auth.users)
--   2. ai_usage_log   — pro-Request an die generate-Edge-Function
--
-- Beide admin-only via RLS. Bei User/Account-Deletion: SET NULL für historische
-- Auswertungen. Hetzner: explizite GRANTs nötig (Grant-Bug 2026-04-24).
--
-- account_id/team_id sind denormalized snapshots auf jedem Log-Row → schnelle
-- Aggregation ohne transitive teams-JOIN. Account-Scope der CRM-Tabellen läuft
-- weiter über teams.account_id-Pfad (siehe admin_get_account_activity-RPC).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_login_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id)     ON DELETE SET NULL,
  account_id   uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  team_id      uuid REFERENCES public.teams(id)    ON DELETE SET NULL,
  logged_in_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_login_log IS
  'Pro-Login-Event. Gefüllt via Trigger auf auth.users.last_sign_in_at.';

CREATE INDEX IF NOT EXISTS user_login_log_user_id_time_idx
  ON public.user_login_log (user_id, logged_in_at DESC);
CREATE INDEX IF NOT EXISTS user_login_log_account_id_time_idx
  ON public.user_login_log (account_id, logged_in_at DESC);
CREATE INDEX IF NOT EXISTS user_login_log_time_idx
  ON public.user_login_log (logged_in_at DESC);

ALTER TABLE public.user_login_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_login_log_admin_select ON public.user_login_log;
CREATE POLICY user_login_log_admin_select
  ON public.user_login_log
  FOR SELECT TO authenticated
  USING (public.is_leadesk_admin());

GRANT SELECT ON public.user_login_log TO authenticated;
GRANT ALL    ON public.user_login_log TO service_role;

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid REFERENCES auth.users(id)     ON DELETE SET NULL,
  account_id         uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  team_id            uuid REFERENCES public.teams(id)    ON DELETE SET NULL,
  provider           text NOT NULL CHECK (provider IN ('anthropic','openai','google','mistral')),
  model              text NOT NULL,
  feature            text,
  input_tokens       integer NOT NULL DEFAULT 0 CHECK (input_tokens  >= 0),
  output_tokens      integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_cost_eur numeric(12,6),
  duration_ms        integer,
  request_id         text,
  status             text NOT NULL DEFAULT 'success'
                       CHECK (status IN ('success','error')),
  error              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_usage_log IS
  'Pro-Request-Log der generate-Edge-Function. Loggt Erfolg und Fehler.';

CREATE INDEX IF NOT EXISTS ai_usage_log_user_id_time_idx
  ON public.ai_usage_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_log_account_id_time_idx
  ON public.ai_usage_log (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_log_provider_model_time_idx
  ON public.ai_usage_log (provider, model, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_log_time_idx
  ON public.ai_usage_log (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_log_errors_time_idx
  ON public.ai_usage_log (created_at DESC) WHERE status = 'error';

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_usage_log_admin_select ON public.ai_usage_log;
CREATE POLICY ai_usage_log_admin_select
  ON public.ai_usage_log
  FOR SELECT TO authenticated
  USING (public.is_leadesk_admin());

GRANT SELECT ON public.ai_usage_log TO authenticated;
GRANT ALL    ON public.ai_usage_log TO service_role;

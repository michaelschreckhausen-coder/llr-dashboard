-- Credits Phase 1 — credit_usage Append-Only Audit-Log
-- ─────────────────────────────────────────────────────────────────
-- Pro AI-Call ein Row. Budget-Aggregation auf account_id-Ebene.
-- team_id + user_id zusätzlich für Reporting/Drill-Down.
--
-- Append-only: nie UPDATE, nie DELETE (außer Maintenance-Jobs).
-- Performance: BRIN auf created_at + B-Tree auf account_id+created_at.
--
-- Write-Pfad: ausschließlich via record_usage-RPC (SECURITY DEFINER, scoped
-- auf service_role). authenticated darf nur SELECT auf eigene team-shared
-- Records. Top-Fallstrick #3 / Block-1.3a-Pattern (Hetzner-GRANT-ALL-Hotfix
-- via REVOKE kompensiert).

BEGIN;

CREATE TABLE IF NOT EXISTS public.credit_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  edge_function text NOT NULL,
  operation text NOT NULL,
  provider text,
  model text,
  credits numeric NOT NULL CHECK (credits >= 0),
  input_tokens integer,
  output_tokens integer,
  request_id text,
  status text NOT NULL DEFAULT 'success',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_usage
  DROP CONSTRAINT IF EXISTS credit_usage_status_check;
ALTER TABLE public.credit_usage
  ADD CONSTRAINT credit_usage_status_check
  CHECK (status IN ('success','error','refunded'));

-- Idempotency-Index für request_id (NULL erlaubt; eindeutig wenn gesetzt)
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_usage_request_id_unique
  ON public.credit_usage (request_id)
  WHERE request_id IS NOT NULL;

-- Aggregation-Indexes
CREATE INDEX IF NOT EXISTS idx_credit_usage_account_period
  ON public.credit_usage (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_usage_team_period
  ON public.credit_usage (team_id, created_at DESC) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_usage_user_period
  ON public.credit_usage (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_usage_created_brin
  ON public.credit_usage USING brin (created_at);

-- ── RLS ───────────────────────────────────────────────────────────
ALTER TABLE public.credit_usage ENABLE ROW LEVEL SECURITY;

-- Team-Member sieht Usage seines Accounts
DROP POLICY IF EXISTS credit_usage_read_own_team ON public.credit_usage;
CREATE POLICY credit_usage_read_own_team ON public.credit_usage FOR SELECT
USING (
  account_id IN (
    SELECT t.account_id FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = auth.uid()
  )
);

-- Leadesk-Admin sieht alles
DROP POLICY IF EXISTS credit_usage_read_admin ON public.credit_usage;
CREATE POLICY credit_usage_read_admin ON public.credit_usage FOR SELECT
USING (
  COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) = true
);

-- Hetzner-Grants
GRANT SELECT         ON public.credit_usage TO authenticated;
GRANT SELECT, INSERT ON public.credit_usage TO service_role;
GRANT ALL            ON public.credit_usage TO postgres;

-- Defensive REVOKE — Hetzner-GRANT-ALL-Hotfix kompensieren (sonst kann
-- authenticated direkt schreiben und record_usage-RPC umgehen)
REVOKE INSERT, UPDATE, DELETE ON public.credit_usage FROM authenticated;

-- Grant SELECT auf team_members für die RLS-Subquery (Top-Fallstrick #3)
GRANT SELECT ON public.team_members TO authenticated;
GRANT SELECT ON public.teams        TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

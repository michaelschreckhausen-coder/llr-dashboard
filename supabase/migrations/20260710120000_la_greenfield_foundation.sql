-- LinkedIn-Automation Greenfield · Phase 1 · Fundament (Namespace la_*, Unipile-nativ, kein Alt-Port).
-- Team-Invariante DB-erzwungen: Enrollment-Team == Kampagnen-Team == Account-Team (Composite-FKs auf (id, team_id)).
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS). RLS an; Policies via user_in_team(team_id); Runner = service_role (bypass).
-- Self-Host: GRANT ist Pflicht (RLS allein → 42501). pgcrypto/gen_random_uuid + user_in_team(uuid) per Pre-Flight verifiziert.

BEGIN;

CREATE TABLE IF NOT EXISTS public.la_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  unipile_account_id text NOT NULL,
  provider_id text, public_identifier text,
  status text NOT NULL DEFAULT 'connected',
  features jsonb NOT NULL DEFAULT '{}', env text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, team_id), UNIQUE (team_id, unipile_account_id)
);

CREATE TABLE IF NOT EXISTS public.la_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('search_classic','search_salesnav','search_recruiter','relations','list','manual')),
  query jsonb, search_url text, last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, team_id)
);

CREATE TABLE IF NOT EXISTS public.la_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  account_id uuid NOT NULL,
  audience_id uuid,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed')),
  caps jsonb NOT NULL DEFAULT '{}', schedule jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, team_id),
  FOREIGN KEY (account_id, team_id)  REFERENCES public.la_accounts (id, team_id),
  FOREIGN KEY (audience_id, team_id) REFERENCES public.la_audiences (id, team_id)
);

CREATE TABLE IF NOT EXISTS public.la_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.la_campaigns (id) ON DELETE CASCADE,
  position int NOT NULL,
  action text NOT NULL CHECK (action IN ('visit','invite','withdraw','message','follow_up','react','comment','follow','inmail','publish')),
  wait_after interval NOT NULL DEFAULT '0',
  condition text NOT NULL DEFAULT 'always' CHECK (condition IN ('always','if_accepted','if_no_reply')),
  template jsonb NOT NULL DEFAULT '{}',
  UNIQUE (campaign_id, position)
);

CREATE TABLE IF NOT EXISTS public.la_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL, team_id uuid NOT NULL,
  provider_id text, public_identifier text, person jsonb NOT NULL DEFAULT '{}',
  lead_id uuid,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','completed','stopped','replied')),
  current_position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, team_id),
  UNIQUE (campaign_id, provider_id),
  FOREIGN KEY (campaign_id, team_id) REFERENCES public.la_campaigns (id, team_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.la_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL, team_id uuid NOT NULL,
  step_id uuid REFERENCES public.la_steps (id),
  action text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','claimed','running','done','failed','dead')),
  attempts int NOT NULL DEFAULT 0, max_attempts int NOT NULL DEFAULT 5,
  next_attempt_at timestamptz, scheduled_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL UNIQUE,
  provider_ref text, request jsonb, response jsonb, error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (enrollment_id, team_id) REFERENCES public.la_enrollments (id, team_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS la_jobs_claim_idx ON public.la_jobs (state, scheduled_at) WHERE state = 'pending';

CREATE TABLE IF NOT EXISTS public.la_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.la_accounts (id),
  type text NOT NULL, payload jsonb NOT NULL, processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.la_runner_heartbeat (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_run_at timestamptz, last_claimed int, last_error text
);
INSERT INTO public.la_runner_heartbeat (id) VALUES (1) ON CONFLICT DO NOTHING;

-- GRANTs (Self-Host Pflicht) + RLS an (alle 8 Tabellen)
DO $grant$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['la_accounts','la_audiences','la_campaigns','la_steps','la_enrollments','la_jobs','la_events','la_runner_heartbeat'] LOOP
    EXECUTE format('GRANT ALL ON public.%I TO authenticated, service_role;', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END $grant$;

-- Team-Policies für die team_id-Tabellen (service_role bypasst RLS). Idempotent via DROP IF EXISTS.
-- la_steps/la_events/la_runner_heartbeat bekommen in P1 KEINE authenticated-Policy → nur service_role (Runner);
-- Frontend-Policies (steps via campaign-team) kommen mit dem UI-Build (P2+).
DO $pol$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['la_accounts','la_audiences','la_campaigns','la_enrollments','la_jobs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_team_all ON public.%1$I;', t);
    EXECUTE format('CREATE POLICY %1$s_team_all ON public.%1$I USING (public.user_in_team(team_id)) WITH CHECK (public.user_in_team(team_id));', t);
  END LOOP;
END $pol$;

COMMIT;

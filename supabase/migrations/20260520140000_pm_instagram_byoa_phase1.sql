-- 20260520140000_pm_instagram_byoa_phase1.sql
--
-- Instagram-Integration Phase 1 — BYOA-Modell (Bring-Your-Own-App).
--
-- Schema-Grundlage für:
--   - Customer-eigene Meta-App-Credentials (app_id, app_secret_encrypted)
--   - IG-Account-Verbindung pro Leadesk-Account (1:1 in Phase 1)
--   - DM-Conversations + Messages
--   - Comments + Mentions
--   - Meta Lead Ads Forms + Field-Mapping
--   - Insights-Snapshots (täglich/wöchentlich)
--   - Erweiterung leads-Tabelle um IG-Provenance
--
-- Sieben Tabellen:
--   pm_instagram_accounts            — Connection-Root, Token-Storage
--   pm_instagram_conversations       — DM-Thread-Meta + 24h-Window-Tracking
--   pm_instagram_messages            — Einzelne DMs (inbound/outbound)
--   pm_instagram_comments            — Comments + Mentions
--   pm_meta_lead_ads_forms           — Field-Mapping pro Form
--   pm_instagram_insights_snapshots  — Zeitreihe Account-Level
--   pm_instagram_oauth_state         — Pending OAuth-Flows (state-Token-Cache)
--
-- Encrypted-Token-Pattern: pgcrypto symmetric encryption.
-- Master-Key wird über supabase_admin als DB-GUC gesetzt (siehe Workflow unten),
-- Edge Functions lesen den Key aus ENV und übergeben ihn bei jedem Call.
--
-- Top-Fallstrick #3 (Cross-Table-RLS-Subquery braucht GRANT) berücksichtigt.
-- Top-Fallstrick #12 (service_role-Grants) berücksichtigt.
-- CLAUDE.md Multi-Tenant-Hard-Rule: team_id auf jeder Daten-Tabelle.
--
-- Workflow:
--   1. Erst auf Hetzner-Staging applien:
--        ssh root@178.104.210.216 'docker exec -i supabase-db psql -U postgres -d postgres' \
--          < supabase/migrations/20260520140000_pm_instagram_byoa_phase1.sql
--   2. ENV-Variable PM_INSTAGRAM_MASTER_KEY in Edge-Function-Container setzen
--      (32-Byte hex string, z.B. via `openssl rand -hex 32`).
--   3. NOTIFY pgrst, 'reload schema'.
--   4. Smoke: SELECT count(*) FROM pm_instagram_accounts;  -- 0
--            SELECT count(*) FROM pg_extension WHERE extname = 'pgcrypto';  -- 1
--   5. Erst nach Staging-Verifikation: gleicher Apply auf Prod (128.140.123.163).
--      Beim Prod-Apply ENV ebenfalls dort setzen, sonst stille Encrypt-Fehler.

BEGIN;

-- ─── Extension ───────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Helper: encrypt/decrypt via pgcrypto ────────────────────────────────────
-- Pattern: pgp_sym_encrypt/decrypt mit text-Key. Key kommt aus Edge Function ENV
-- und wird pro Call übergeben — nicht in der DB persistiert.

CREATE OR REPLACE FUNCTION public.pm_instagram_encrypt(p_plaintext text, p_key text)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT pgp_sym_encrypt(p_plaintext, p_key)::bytea;
$$;

CREATE OR REPLACE FUNCTION public.pm_instagram_decrypt(p_ciphertext bytea, p_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT pgp_sym_decrypt(p_ciphertext, p_key);
$$;

REVOKE EXECUTE ON FUNCTION public.pm_instagram_encrypt(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pm_instagram_decrypt(bytea, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.pm_instagram_encrypt(text, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.pm_instagram_decrypt(bytea, text) TO service_role;

-- ─── Tabelle 1: pm_instagram_accounts ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pm_instagram_accounts (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                      uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  team_id                         uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id                         uuid NOT NULL,  -- kein FK auf auth.users (BYOA: User kann auch wechseln)

  -- BYOA: Customer-eigene Meta-App-Credentials
  meta_app_id                     text NOT NULL,
  meta_app_secret_encrypted       bytea NOT NULL,
  webhook_verify_token            text NOT NULL,

  -- IG-API
  ig_account_id                   text,           -- erst nach OAuth gesetzt
  ig_username                     text,
  login_mode                      text NOT NULL CHECK (login_mode IN ('facebook','instagram')),
  fb_page_id                      text,
  fb_page_access_token_encrypted  bytea,
  ig_access_token_encrypted       bytea,          -- nullable bis OAuth durch
  token_expires_at                timestamptz,
  token_last_refreshed_at         timestamptz,

  -- Permissions (vom User tatsächlich gewährt; Subset der requested)
  requested_permissions           text[] NOT NULL DEFAULT '{}',
  granted_permissions             text[] NOT NULL DEFAULT '{}',

  -- Webhook-Subscription-State
  subscribed_fields               text[] NOT NULL DEFAULT '{}',
  webhook_verified_at             timestamptz,

  -- Onboarding-State
  onboarding_step                 text NOT NULL DEFAULT 'meta_app_created'
    CHECK (onboarding_step IN (
      'meta_app_created',
      'redirect_configured',
      'webhook_configured',
      'oauth_completed',
      'business_verification_pending',
      'app_review_pending',
      'live'
    )),
  business_verification_status    text CHECK (business_verification_status IN ('pending','approved','rejected')),
  app_review_status               jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Meta
  is_active                       boolean NOT NULL DEFAULT true,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT pm_ig_accounts_uq_account UNIQUE (account_id),
  CONSTRAINT pm_ig_accounts_uq_ig     UNIQUE (ig_account_id),
  CONSTRAINT pm_ig_accounts_app_ig    UNIQUE (meta_app_id, ig_account_id)
);

CREATE INDEX IF NOT EXISTS pm_ig_accounts_team_idx ON public.pm_instagram_accounts(team_id);
CREATE INDEX IF NOT EXISTS pm_ig_accounts_user_idx ON public.pm_instagram_accounts(user_id);

-- ─── Tabelle 2: pm_instagram_oauth_state ─────────────────────────────────────
-- Kurzlebige Tabelle für OAuth-Flows. state-Token = CSRF-Schutz + Connection-Lookup.

CREATE TABLE IF NOT EXISTS public.pm_instagram_oauth_state (
  state            text PRIMARY KEY,             -- 32-byte random uuid/hex
  connection_id    uuid NOT NULL REFERENCES public.pm_instagram_accounts(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '15 minutes')
);

CREATE INDEX IF NOT EXISTS pm_ig_oauth_state_expires_idx ON public.pm_instagram_oauth_state(expires_at);

-- ─── Tabelle 3: pm_instagram_conversations ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pm_instagram_conversations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id            uuid NOT NULL REFERENCES public.pm_instagram_accounts(id) ON DELETE CASCADE,
  team_id                  uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  ig_thread_id             text NOT NULL,
  participant_scoped_id    text NOT NULL,
  participant_username     text,
  lead_id                  uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  last_inbound_at          timestamptz,
  last_outbound_at         timestamptz,
  status                   text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','archived')),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pm_ig_conv_uq UNIQUE (connection_id, ig_thread_id)
);

CREATE INDEX IF NOT EXISTS pm_ig_conv_team_idx       ON public.pm_instagram_conversations(team_id);
CREATE INDEX IF NOT EXISTS pm_ig_conv_lead_idx       ON public.pm_instagram_conversations(lead_id);
CREATE INDEX IF NOT EXISTS pm_ig_conv_participant_idx ON public.pm_instagram_conversations(participant_scoped_id);

-- ─── Tabelle 4: pm_instagram_messages ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pm_instagram_messages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id      uuid NOT NULL REFERENCES public.pm_instagram_conversations(id) ON DELETE CASCADE,
  team_id              uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  ig_message_id        text NOT NULL,
  direction            text NOT NULL CHECK (direction IN ('inbound','outbound')),
  text                 text,
  attachments          jsonb NOT NULL DEFAULT '[]'::jsonb,
  sent_at              timestamptz NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pm_ig_msg_uq UNIQUE (conversation_id, ig_message_id)
);

CREATE INDEX IF NOT EXISTS pm_ig_msg_team_idx ON public.pm_instagram_messages(team_id);
CREATE INDEX IF NOT EXISTS pm_ig_msg_sent_idx ON public.pm_instagram_messages(sent_at DESC);

-- ─── Tabelle 5: pm_instagram_comments ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pm_instagram_comments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id        uuid NOT NULL REFERENCES public.pm_instagram_accounts(id) ON DELETE CASCADE,
  team_id              uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  lead_id              uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ig_comment_id        text NOT NULL UNIQUE,
  ig_media_id          text NOT NULL,
  parent_comment_id    text,
  from_username        text,
  from_scoped_id       text,
  text                 text,
  is_mention           boolean NOT NULL DEFAULT false,
  posted_at            timestamptz NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pm_ig_comments_team_idx  ON public.pm_instagram_comments(team_id);
CREATE INDEX IF NOT EXISTS pm_ig_comments_media_idx ON public.pm_instagram_comments(ig_media_id);
CREATE INDEX IF NOT EXISTS pm_ig_comments_lead_idx  ON public.pm_instagram_comments(lead_id);

-- ─── Tabelle 6: pm_meta_lead_ads_forms ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pm_meta_lead_ads_forms (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id     uuid NOT NULL REFERENCES public.pm_instagram_accounts(id) ON DELETE CASCADE,
  account_id        uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  team_id           uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  page_id           text NOT NULL,
  form_id           text NOT NULL,
  form_name         text,
  field_mapping     jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {meta_field_key: leadesk_field_path}
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pm_meta_lead_forms_uq UNIQUE (page_id, form_id)
);

CREATE INDEX IF NOT EXISTS pm_meta_lead_forms_team_idx ON public.pm_meta_lead_ads_forms(team_id);

-- ─── Tabelle 7: pm_instagram_insights_snapshots ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.pm_instagram_insights_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id   uuid NOT NULL REFERENCES public.pm_instagram_accounts(id) ON DELETE CASCADE,
  team_id         uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  metric          text NOT NULL,
  period          text NOT NULL CHECK (period IN ('day','week','lifetime')),
  breakdown       jsonb,
  value           bigint,
  value_jsonb     jsonb,                          -- für Demographics-Metriken
  measured_at     timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pm_ig_insights_team_idx     ON public.pm_instagram_insights_snapshots(team_id);
CREATE INDEX IF NOT EXISTS pm_ig_insights_metric_idx   ON public.pm_instagram_insights_snapshots(metric, measured_at DESC);

-- ─── leads: additive Erweiterung ─────────────────────────────────────────────

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS instagram_username   text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS instagram_scoped_id  text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meta_lead_ad_form_id text;

CREATE INDEX IF NOT EXISTS leads_instagram_scoped_id_idx
  ON public.leads(instagram_scoped_id)
  WHERE instagram_scoped_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_meta_lead_ad_form_idx
  ON public.leads(meta_lead_ad_form_id)
  WHERE meta_lead_ad_form_id IS NOT NULL;

-- ─── RLS aktivieren ──────────────────────────────────────────────────────────

ALTER TABLE public.pm_instagram_accounts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_instagram_oauth_state         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_instagram_conversations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_instagram_messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_instagram_comments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_meta_lead_ads_forms           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_instagram_insights_snapshots  ENABLE ROW LEVEL SECURITY;

-- ─── RLS-Policies: pm_instagram_accounts ─────────────────────────────────────
-- Team-scoped: User sieht Connections seiner Teams.
-- NICHT: Customer kann sein eigenes app_secret_encrypted lesen — das soll nur service_role.
-- Daher: SELECT excluded app_secret + tokens via column-level Grants (siehe Grants-Block).

DROP POLICY IF EXISTS "pm_ig_accounts_select_team"  ON public.pm_instagram_accounts;
CREATE POLICY "pm_ig_accounts_select_team" ON public.pm_instagram_accounts
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()));

DROP POLICY IF EXISTS "pm_ig_accounts_insert_team" ON public.pm_instagram_accounts;
CREATE POLICY "pm_ig_accounts_insert_team" ON public.pm_instagram_accounts
  FOR INSERT TO authenticated
  WITH CHECK (
    team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid())
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "pm_ig_accounts_update_team" ON public.pm_instagram_accounts;
CREATE POLICY "pm_ig_accounts_update_team" ON public.pm_instagram_accounts
  FOR UPDATE TO authenticated
  USING (team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()));

DROP POLICY IF EXISTS "pm_ig_accounts_delete_team" ON public.pm_instagram_accounts;
CREATE POLICY "pm_ig_accounts_delete_team" ON public.pm_instagram_accounts
  FOR DELETE TO authenticated
  USING (team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()));

-- ─── RLS-Policies: pm_instagram_oauth_state ──────────────────────────────────
-- User sieht/schreibt nur eigene Pending-Flows.

DROP POLICY IF EXISTS "pm_ig_oauth_state_own" ON public.pm_instagram_oauth_state;
CREATE POLICY "pm_ig_oauth_state_own" ON public.pm_instagram_oauth_state
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── RLS-Policies: Daten-Tabellen (team-scoped) ──────────────────────────────

DROP POLICY IF EXISTS "pm_ig_conv_team"     ON public.pm_instagram_conversations;
CREATE POLICY "pm_ig_conv_team" ON public.pm_instagram_conversations
  FOR ALL TO authenticated
  USING (team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()));

DROP POLICY IF EXISTS "pm_ig_msg_team" ON public.pm_instagram_messages;
CREATE POLICY "pm_ig_msg_team" ON public.pm_instagram_messages
  FOR ALL TO authenticated
  USING (team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()));

DROP POLICY IF EXISTS "pm_ig_comments_team" ON public.pm_instagram_comments;
CREATE POLICY "pm_ig_comments_team" ON public.pm_instagram_comments
  FOR ALL TO authenticated
  USING (team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()));

DROP POLICY IF EXISTS "pm_meta_lead_forms_team" ON public.pm_meta_lead_ads_forms;
CREATE POLICY "pm_meta_lead_forms_team" ON public.pm_meta_lead_ads_forms
  FOR ALL TO authenticated
  USING (team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()));

DROP POLICY IF EXISTS "pm_ig_insights_team" ON public.pm_instagram_insights_snapshots;
CREATE POLICY "pm_ig_insights_team" ON public.pm_instagram_insights_snapshots
  FOR ALL TO authenticated
  USING (team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()));

-- ─── Grants: authenticated (Read/Write — RLS schränkt ein) ───────────────────
-- Self-Host (Hetzner) hat keine Default-Grants → explizit setzen.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_instagram_accounts            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_instagram_oauth_state         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_instagram_conversations       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_instagram_messages            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_instagram_comments            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_meta_lead_ads_forms           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_instagram_insights_snapshots  TO authenticated;

-- Column-level: meta_app_secret_encrypted + Token-Spalten dürfen authenticated NICHT lesen.
-- (Defense-in-Depth — die Spalten dürfen nur via service_role aus Edge Functions ausgelesen werden.)

REVOKE SELECT (meta_app_secret_encrypted, ig_access_token_encrypted, fb_page_access_token_encrypted)
  ON public.pm_instagram_accounts FROM authenticated;

-- Cross-Table-Subquery-GRANT (Top-Fallstrick #3): team_members read benötigt
GRANT SELECT ON public.team_members TO authenticated;  -- idempotent, sollte schon stehen

-- ─── Grants: service_role (Webhook + Cron + RPC) ─────────────────────────────
-- Top-Fallstrick #12: explizit auch für service_role.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_instagram_accounts            TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_instagram_oauth_state         TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_instagram_conversations       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_instagram_messages            TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_instagram_comments            TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_meta_lead_ads_forms           TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_instagram_insights_snapshots  TO service_role;

-- ─── Default Privileges (für künftige Tabellen in public) ────────────────────
-- (Idempotent; sollten projektweit schon stehen, aber sicherheitshalber.)

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

-- ─── PostgREST-Reload-Hint ───────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─── Verifikations-Queries (manuell ausführen nach Apply) ────────────────────
--
-- SELECT count(*) FROM pm_instagram_accounts;             -- 0
-- SELECT count(*) FROM pg_extension WHERE extname = 'pgcrypto';  -- 1
-- SELECT count(*) FROM pg_policies WHERE tablename LIKE 'pm_instagram%';  -- mind. 12
-- \d pm_instagram_accounts
-- \d leads  -- prüfen: instagram_username, instagram_scoped_id, meta_lead_ad_form_id sind da

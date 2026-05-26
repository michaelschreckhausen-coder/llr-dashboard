-- 2026-05-27 — Phase B — leads-Tabelle auf Prod-Stand
--
-- Staging-only Drift-Fix. Prod ist Source-of-Truth (107 Cols vs 57 auf Staging).
--
-- Inhalte:
--   1) CREATE TYPE crm_lead_status (Prod hat 9 ENUMs, Staging nur 8)
--   2) ADD COLUMN IF NOT EXISTS für 54 fehlende Cols mit Prod-Defaults
--   3) ALTER next_followup date→timestamp with time zone
--   4) DROP 4 Staging-only Dead-Cols (ai_activity_level, ai_enrichment_data,
--      ai_reply_behavior, last_contacted_at) — Frontend-Code-Grep clean.
--
-- ENUM-Verteilung pre-checked (2026-05-27): 8 Enums byte-identisch auf
-- beiden Envs (crm_activity_level, crm_buying_intent, crm_company_size,
-- crm_connection_status, crm_deal_stage, crm_lead_source,
-- crm_lifecycle_stage, crm_reply_behavior). Nur crm_lead_status fehlt
-- auf Staging.
--
-- Idempotent durch IF NOT EXISTS / IF EXISTS Patterns.

BEGIN;

-- ─── Step 1: crm_lead_status ENUM auf Staging anlegen ──────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_lead_status') THEN
    CREATE TYPE crm_lead_status AS ENUM (
      'new',
      'open',
      'in_progress',
      'open_deal',
      'unqualified',
      'attempted_to_contact',
      'connected',
      'bad_timing'
    );
  END IF;
END $$;

-- ─── Step 2: ADD COLUMN IF NOT EXISTS für 54 fehlende Cols ─────────────────

-- AI-related
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ai_budget_signal       text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ai_next_best_action    text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ai_summary_updated_at  timestamp with time zone;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ai_use_cases           text[] DEFAULT '{}'::text[];

-- Audit / Lifecycle
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS archived_at            timestamp with time zone;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS campaign_id            uuid;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS created_by             uuid;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS updated_by             uuid;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS first_contacted_at     timestamp with time zone;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_action_at         timestamp with time zone;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_activity_at       timestamp with time zone;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_activity_date     timestamp with time zone;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_reply_at          timestamp with time zone;

-- Company-Details
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS company_address        text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS company_website        text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS recommended_action     text;

-- Connection (LinkedIn-legacy)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS connected_at           timestamp with time zone;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS connection_message     text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS connection_note        text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS connection_sent_at     timestamp with time zone;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS connection_status      text DEFAULT 'none'::text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS vernetzung_status      text DEFAULT 'nicht_vernetzt'::text;

-- Custom-Fields
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS custom_fields          jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Deal-Details
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS days_to_close          integer;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS deal_currency          character(3) DEFAULT 'EUR'::bpchar;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS deal_lost_reason       text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS deal_stage_changed_at  timestamp with time zone;

-- GDPR / Compliance
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS do_not_contact         boolean NOT NULL DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS gdpr_consent           boolean NOT NULL DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS gdpr_consent_at        timestamp with time zone;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS gdpr_consent_ip        inet;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS is_unsubscribed        boolean NOT NULL DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS unsubscribed_at        timestamp with time zone;

-- ICP / Scoring
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS icp_match              integer DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_status            crm_lead_status DEFAULT 'new'::crm_lead_status;

-- LinkedIn-Detail-Summaries
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS li_activity_level      crm_activity_level DEFAULT 'unbekannt'::crm_activity_level;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS li_activity_summary    text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS li_certifications_summary text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS li_education_summary   text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS li_experience_summary  text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS li_featured_summary    text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS li_follower_count      integer;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS li_honors_summary      text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS li_languages_summary   text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS li_post_count          integer;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS li_skills_summary      text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS li_volunteer_summary   text;

-- Pipeline
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS pipeline_entered_at    timestamp with time zone;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS pipeline_stage         text;

-- Engagement-Counters
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS num_contacts           integer NOT NULL DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS num_replies            integer NOT NULL DEFAULT 0;

-- Personalization / i18n
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS persona                text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS preferred_language     character(2) DEFAULT 'de'::bpchar;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS timezone               text;

-- ─── Step 3: ALTER next_followup date → timestamp with time zone ───────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='leads' AND column_name='next_followup' AND data_type='date'
  ) THEN
    ALTER TABLE public.leads
      ALTER COLUMN next_followup TYPE timestamp with time zone
      USING next_followup::timestamp with time zone;
  END IF;
END $$;

-- ─── Step 4: DROP 4 Staging-only Dead-Cols ─────────────────────────────────
-- Frontend-Grep clean (kein Code referenziert diese).
-- ai_activity_level → ersetzt durch li_activity_level (jetzt added)
-- ai_reply_behavior → ersetzt durch li_reply_behavior (existiert schon)
-- ai_enrichment_data → durch strukturierte ai_*-Spalten obsolet
-- last_contacted_at → durch first_contacted_at + last_reply_at ersetzt

ALTER TABLE public.leads DROP COLUMN IF EXISTS ai_activity_level;
ALTER TABLE public.leads DROP COLUMN IF EXISTS ai_enrichment_data;
ALTER TABLE public.leads DROP COLUMN IF EXISTS ai_reply_behavior;
ALTER TABLE public.leads DROP COLUMN IF EXISTS last_contacted_at;

-- ─── Step 5: Verifikation ──────────────────────────────────────────────────

DO $$
DECLARE
  cnt_cols integer;
  has_lead_status_enum boolean;
  next_followup_type text;
BEGIN
  -- Count leads-cols
  SELECT count(*) INTO cnt_cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='leads';

  -- ENUM check
  SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname='crm_lead_status') INTO has_lead_status_enum;

  -- next_followup type check
  SELECT data_type INTO next_followup_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='leads' AND column_name='next_followup';

  IF NOT has_lead_status_enum THEN RAISE EXCEPTION 'crm_lead_status ENUM missing'; END IF;
  IF next_followup_type != 'timestamp with time zone' THEN
    RAISE EXCEPTION 'next_followup type wrong: % (expected timestamp with time zone)', next_followup_type;
  END IF;
  IF cnt_cols < 100 THEN
    RAISE EXCEPTION 'leads only has % cols (expected ~107)', cnt_cols;
  END IF;

  RAISE NOTICE 'Phase B verification PASSED — leads has % cols', cnt_cols;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

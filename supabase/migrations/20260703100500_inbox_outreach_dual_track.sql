-- ════════════════════════════════════════════════════════════════
-- 20260703100500_inbox_outreach_dual_track.sql
-- Increment 3: LinkedIn-Outreach (Vernetzung + Automatisierung) arbeitet
-- direkt auf linkedin_inbox-Prospects — sie werden erst NACH Reaktion/
-- Qualifizierung zu echten leads.
-- ----------------------------------------------------------------------------
-- Heute sind die Outreach-Queues lead-zentrisch (lead_id NOT NULL FK → leads).
-- Inbox-Einträge haben keine leads-Row → kein Outreach möglich. Fix:
--   * inbox_id (FK → linkedin_inbox) auf den 3 Queue-Tabellen, lead_id nullable,
--     XOR-Check "genau eins von beiden" (wo gefahrlos).
--   * linkedin_inbox bekommt Outreach-Tracking-Spalten (li_*), damit die
--     Extension den Verbindungsstatus auf den Inbox-Eintrag zurückschreibt.
--
-- DEFENSIV: automation_jobs hat bekannten Schema-Drift (CLAUDE.md #13 —
-- Code schreibt type/lead_id, Repo-Migration hat action/target_url). Daher
-- nur additives inbox_id + guarded lead_id-Nullable, KEIN XOR-Check auf
-- automation_jobs (drift-sicher). Vor Prod-Apply LIVE-Schema pre-flighten.
--
-- Idempotent (IF NOT EXISTS / DROP IF EXISTS / guarded DO-Blocks).
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) linkedin_inbox: Outreach-Tracking ────────────────────────────
-- Gleiche Enum-Werte wie leads.li_connection_status, damit die Extension
-- identisch zurückschreiben kann.
ALTER TABLE public.linkedin_inbox
  ADD COLUMN IF NOT EXISTS li_connection_status      crm_connection_status DEFAULT 'nicht_verbunden',
  ADD COLUMN IF NOT EXISTS li_connection_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS li_connected_at            timestamptz,
  ADD COLUMN IF NOT EXISTS li_reply_behavior          crm_reply_behavior DEFAULT 'unbekannt',
  ADD COLUMN IF NOT EXISTS li_last_interaction_at     timestamptz;

-- Surface "reagiert": offene Inbox-Einträge, die bereits verbunden sind.
CREATE INDEX IF NOT EXISTS linkedin_inbox_reacted_idx
  ON public.linkedin_inbox (team_id, li_connection_status)
  WHERE review_status = 'new';

-- ── 2) connection_queue: dual-track ─────────────────────────────────
ALTER TABLE public.connection_queue
  ADD COLUMN IF NOT EXISTS inbox_id uuid REFERENCES public.linkedin_inbox(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='connection_queue'
      AND column_name='lead_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.connection_queue ALTER COLUMN lead_id DROP NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS connection_queue_inbox_id_idx
  ON public.connection_queue (inbox_id) WHERE inbox_id IS NOT NULL;

-- Bestandsrows haben lead_id gesetzt + inbox_id NULL → XOR erfüllt → safe.
ALTER TABLE public.connection_queue DROP CONSTRAINT IF EXISTS connection_queue_lead_or_inbox;
ALTER TABLE public.connection_queue ADD CONSTRAINT connection_queue_lead_or_inbox
  CHECK ( (lead_id IS NOT NULL)::int + (inbox_id IS NOT NULL)::int = 1 );

-- ── 3) automation_campaign_leads: dual-track ────────────────────────
ALTER TABLE public.automation_campaign_leads
  ADD COLUMN IF NOT EXISTS inbox_id uuid REFERENCES public.linkedin_inbox(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='automation_campaign_leads'
      AND column_name='lead_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.automation_campaign_leads ALTER COLUMN lead_id DROP NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS acl_inbox_id_idx
  ON public.automation_campaign_leads (inbox_id) WHERE inbox_id IS NOT NULL;

ALTER TABLE public.automation_campaign_leads DROP CONSTRAINT IF EXISTS acl_lead_or_inbox;
ALTER TABLE public.automation_campaign_leads ADD CONSTRAINT acl_lead_or_inbox
  CHECK ( (lead_id IS NOT NULL)::int + (inbox_id IS NOT NULL)::int = 1 );

-- ── 4) automation_jobs: additiv (Schema-Drift → kein XOR-Check) ─────
ALTER TABLE public.automation_jobs
  ADD COLUMN IF NOT EXISTS inbox_id uuid REFERENCES public.linkedin_inbox(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='automation_jobs'
      AND column_name='lead_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.automation_jobs ALTER COLUMN lead_id DROP NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS automation_jobs_inbox_id_idx
  ON public.automation_jobs (inbox_id) WHERE inbox_id IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';

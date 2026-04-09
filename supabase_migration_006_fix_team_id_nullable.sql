-- Migration 006: team_id NOT NULL Constraint entfernen
-- Root Cause: Frontend sendet kein team_id, DB warf NOT NULL Violation
-- Betrifft: activities, contact_notes, deals, pipeline_stages

ALTER TABLE activities      ALTER COLUMN team_id DROP NOT NULL;
ALTER TABLE contact_notes   ALTER COLUMN team_id DROP NOT NULL;
ALTER TABLE deals           ALTER COLUMN team_id DROP NOT NULL;
ALTER TABLE pipeline_stages ALTER COLUMN team_id DROP NOT NULL;

-- RLS: Sicherheitscheck Policies korrekt
-- Bereits deployed in Migration 005:
--   activities:    act_insert, act_select, act_update
--   contact_notes: cn_insert, cn_select, cn_update
--   lead_field_history: lfh_insert (WITH CHECK true), lfh_select

-- Trigger: SECURITY DEFINER (kein RLS-Problem bei Audit-Trigger)
-- Bereits deployed in Migration 005: crm_log_lead_field_changes()

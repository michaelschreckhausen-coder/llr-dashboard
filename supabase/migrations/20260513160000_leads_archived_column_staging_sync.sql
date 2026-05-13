-- =============================================================================
-- Schema-Sync: leads.archived auf Staging nachziehen
-- =============================================================================
-- Bug entdeckt 2026-05-13 nach Demo-Seed auf Staging: staging.leadesk.de/leads
-- zeigte "0 Kontakte" trotz 82 Demo-Leads. Root-Cause: src/hooks/useLeads.js
-- filtert mit .eq('archived', false), aber staging-leads hat KEINE archived-
-- Spalte. supabase-js returnt {data:null, error:...}, Frontend rendert leeren
-- State ohne Error-UI.
--
-- Prod hat archived schon lange (boolean NOT NULL DEFAULT false) — wurde im
-- Cloud-Era direkt via SQL-Editor hinzugefügt, nie als Migration-File. Drift-
-- Pattern wie bei location/lead_score/owner_id (siehe Migration 20260512000000).
--
-- Idempotent via IF NOT EXISTS — Prod-No-Op, Staging-additiv.
-- =============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

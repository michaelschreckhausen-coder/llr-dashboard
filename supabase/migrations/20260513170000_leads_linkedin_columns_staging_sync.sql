-- =============================================================================
-- Schema-Sync: leads.li_* LinkedIn-Spalten auf Staging nachziehen
-- =============================================================================
-- Bug entdeckt 2026-05-13 beim Demo-Seed-LinkedIn-Block: Vernetzungen.jsx liest
-- vier li_*-Spalten aus leads, die auf Staging fehlen, aber auf Prod existieren.
-- Drift-Pattern wie bei archived/location/lead_score/owner_id (Cloud-Era SQL-
-- Editor-Änderungen, nie als Migration-File).
--
-- Frontend-relevante Spalten (aus src/pages/Vernetzungen.jsx):
--   li_connected_at         timestamptz — wann Vernetzung akzeptiert (sortkey!)
--   li_last_interaction_at  timestamptz — letzte Aktivität (für inaktiv-30d-KPI)
--   li_message_summary      text        — Inline-Summary
--   li_reply_behavior       crm_reply_behavior — schnell/langsam/keine_antwort/unbekannt
--
-- crm_reply_behavior ENUM existiert bereits auf Staging (verifiziert 2026-05-13).
-- Idempotent via IF NOT EXISTS — Prod-No-Op, Staging-additiv.
-- =============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS li_connected_at        timestamptz,
  ADD COLUMN IF NOT EXISTS li_last_interaction_at timestamptz,
  ADD COLUMN IF NOT EXISTS li_message_summary     text,
  ADD COLUMN IF NOT EXISTS li_reply_behavior      crm_reply_behavior;

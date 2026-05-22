-- 2026-05-22 — lead_tasks RLS-Policy Drift-Fix
--
-- Symptom: INSERT auf public.lead_tasks aus dem Frontend (Sprint B
-- TasksTab) wird abgelehnt mit "42501 new row violates row-level security
-- policy for table 'lead_tasks'" — auch wenn created_by = auth.uid() und
-- assigned_to = auth.uid() korrekt gesetzt sind.
--
-- Auf Hetzner-Staging gibt's hier einen Drift gegenüber Repo-Migration
-- 20260416000001_staging_schema.sql:1188 — entweder
--   (a) die Policy wurde nie applied
--   (b) oder manuell gedroppt
--   (c) oder mit eingeschränkterem WITH CHECK ersetzt
--
-- contact_notes-Insert mit gleichem User/Lead lief sauber durch (HTTP 201)
-- → Auth-Infrastructure greift, JWT-Claim auth.uid() wird korrekt ausgewertet.
-- Es ist also lead_tasks-spezifisch.
--
-- Fix: DROP IF EXISTS + CREATE mit USING + explizitem WITH CHECK
-- (statt impliziter WITH CHECK = USING, das hier offenbar nicht greift).
--
-- RLS-Semantik:
--   - USING        gilt für SELECT/UPDATE/DELETE auf existierende Rows
--   - WITH CHECK   gilt für INSERT/UPDATE auf neue/geänderte Rows
--   - Beide identisch: Task ist sichtbar/schreibbar für Creator + Assignee
--
-- Idempotent. Auf Staging zuerst, dann auf Prod (HARD RULE: nie Prod ohne
-- separate Confirmation in Session).

BEGIN;

DROP POLICY IF EXISTS "lead_tasks_own" ON public.lead_tasks;

CREATE POLICY "lead_tasks_own" ON public.lead_tasks
  FOR ALL
  USING (created_by = auth.uid() OR assigned_to = auth.uid())
  WITH CHECK (created_by = auth.uid() OR assigned_to = auth.uid());

COMMIT;

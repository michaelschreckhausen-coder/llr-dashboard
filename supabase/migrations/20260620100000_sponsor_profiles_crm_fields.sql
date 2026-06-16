-- ============================================================================
-- Phase 1 / Modul 1+10: sponsor_profiles um CRM- & Scoring-Felder erweitern
-- ----------------------------------------------------------------------------
-- Additive ALTERs (idempotent). fit_score/fit_score_reasoning existieren bereits
-- aus Slice 2 und bleiben KI-autoritativ (UI read-only).
-- psql -v ON_ERROR_STOP=1, Staging zuerst.
-- ============================================================================

begin;

alter table sponsoring.sponsor_profiles add column if not exists employee_count        int;
alter table sponsoring.sponsor_profiles add column if not exists marketing_budget_class text;
alter table sponsoring.sponsor_profiles add column if not exists sport_affinity         text;
alter table sponsoring.sponsor_profiles add column if not exists region                 text;
alter table sponsoring.sponsor_profiles add column if not exists website                text;
alter table sponsoring.sponsor_profiles add column if not exists linkedin_url           text;
alter table sponsoring.sponsor_profiles add column if not exists notes                  text;
alter table sponsoring.sponsor_profiles add column if not exists last_scored_at         timestamptz;

commit;

notify pgrst, 'reload schema';

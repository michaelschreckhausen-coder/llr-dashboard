-- ============================================================================
-- F5 · Invitations-Janitor — per-User Withdraw-Setting.
-- ----------------------------------------------------------------------------
-- Steuert, nach wie vielen Tagen der Janitor veraltete pending-Invites automatisch
-- zurückzieht. NULL = Default (21 im Worker), 0 = aus. Vom Frontend (Vernetzungen)
-- geschrieben, vom Cron-Worker pro User gelesen.
-- Additive Spalte, idempotent. Wird auf "los staging-apply" appliert.
-- ============================================================================

alter table public.user_preferences
  add column if not exists linkedin_withdraw_after_days int;

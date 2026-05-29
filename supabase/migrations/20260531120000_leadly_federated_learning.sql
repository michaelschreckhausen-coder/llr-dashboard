-- ════════════════════════════════════════════════════════════════════════════
-- Leadly Federated Learning Phase 1: Account-Scope-Memory + Lernmodus-Setting
-- 2026-05-31
-- ════════════════════════════════════════════════════════════════════════════
--
-- Phase 1 von "Leadly lernt für alle":
--   - leadly_learning_scope-Setting pro User (privat / account / global)
--   - leadly_account_memory: aggregierte Patterns innerhalb eines Accounts
--   - leadly_account_preferences: aggregierte Lessons innerhalb eines Accounts
--   - k-anonymity ≥3 User: Patterns werden erst geladen wenn ≥3 verschiedene
--     User aus dem Account dasselbe Pattern beigetragen haben
--
-- Privacy-Modell:
--   - User-Setting kontrolliert ob & wohin User-Memory aggregiert wird
--   - Default 'account': User-Patterns fließen ins Account-Memory (sichtbar
--     für alle Team-Mitglieder im selben Account)
--   - 'privat': null Aggregation, nur User-eigene Memory
--   - 'global': Phase 2 (cross-account, anonymisiert)
--   - k-anonymity ≥3: einzelne User können nicht durch Patterns identifiziert
--     werden — erst ab 3 Beiträgern wird ein Pattern zum "Account-Default"
--
-- Apply-Pfad:
--   ssh root@<hetzner> 'docker exec -i supabase-db psql -U supabase_admin -d postgres' \
--     < supabase/migrations/20260531120000_leadly_federated_learning.sql

BEGIN;

-- ─── User-Setting: leadly_learning_scope ────────────────────────────────
-- user_preferences existiert bereits. ADD COLUMN idempotent.
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS leadly_learning_scope text NOT NULL DEFAULT 'account';

-- Check-Constraint nur einmal anlegen (kein IF NOT EXISTS für Constraints —
-- via DO-Block).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_preferences_leadly_learning_scope_check'
  ) THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_leadly_learning_scope_check
      CHECK (leadly_learning_scope IN ('privat', 'account', 'global'));
  END IF;
END $$;

COMMENT ON COLUMN public.user_preferences.leadly_learning_scope IS
  '2026-05-31 · Leadly-Lernmodus pro User. privat=nur User-Memory, account=User+Account-Memory (k-anon ≥3), global=Phase 2 cross-account anonymisiert.';

-- ─── leadly_account_memory ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leadly_account_memory (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  -- kind: 'turn' (Konversations-Summary) | 'fact' (explizite Lesson) | 'tool_pattern' (Tool-Use-Sequenz)
  kind            text NOT NULL DEFAULT 'turn'
                  CHECK (kind IN ('turn', 'fact', 'tool_pattern')),
  -- Aggregierter Summary-Text (PII-frei für Account-Scope; Phase 2 scrubbed für Global)
  summary         text NOT NULL,
  embedding       vector(1536),
  -- contributing_user_count: wie viele DISTINCT user_ids aus dem Account
  -- haben dieses Pattern beigetragen. k-anonymity-Cutoff bei ≥3 für Recall.
  contributing_user_count integer NOT NULL DEFAULT 1,
  -- Importance gemittelt über alle Beiträge
  importance      smallint NOT NULL DEFAULT 50 CHECK (importance BETWEEN 0 AND 100),
  recall_count    integer NOT NULL DEFAULT 0,
  last_recalled_at timestamptz,
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leadly_account_memory_embedding_cos
  ON public.leadly_account_memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

CREATE INDEX IF NOT EXISTS idx_leadly_account_memory_account_kanon
  ON public.leadly_account_memory (account_id, contributing_user_count DESC);

ALTER TABLE public.leadly_account_memory ENABLE ROW LEVEL SECURITY;

-- RLS: nur Account-Member dürfen lesen (Membership via teams.account_id ↔ team_members.user_id)
DROP POLICY IF EXISTS "lam_account_member_select" ON public.leadly_account_memory;
CREATE POLICY "lam_account_member_select" ON public.leadly_account_memory
  FOR SELECT USING (
    account_id IN (
      SELECT t.account_id
      FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
      WHERE tm.user_id = auth.uid() AND t.account_id IS NOT NULL
    )
  );

-- INSERT / UPDATE via service-role (Edge-Function)

COMMENT ON TABLE public.leadly_account_memory IS
  '2026-05-31 · Aggregierte Leadly-Memory pro Account. k-anonymity ≥3 für Recall. Insert/Update via service_role, Read via RLS für Account-Member.';

-- ─── leadly_account_preferences ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leadly_account_preferences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  pref_key        text NOT NULL,
  pref_value      text NOT NULL,
  supporting_user_count integer NOT NULL DEFAULT 1,
  -- Erster + letzter User der das gesetzt hat
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leadly_account_preferences_account_key_value_unique
    UNIQUE (account_id, pref_key, pref_value)
);

CREATE INDEX IF NOT EXISTS idx_leadly_account_preferences_account_key
  ON public.leadly_account_preferences (account_id, pref_key);

ALTER TABLE public.leadly_account_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lap_account_member_select" ON public.leadly_account_preferences;
CREATE POLICY "lap_account_member_select" ON public.leadly_account_preferences
  FOR SELECT USING (
    account_id IN (
      SELECT t.account_id
      FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
      WHERE tm.user_id = auth.uid() AND t.account_id IS NOT NULL
    )
  );

COMMENT ON TABLE public.leadly_account_preferences IS
  '2026-05-31 · Aggregierte explizite Lessons pro Account. UNIQUE(account_id, key, value). supporting_user_count zählt distinct user_ids die diese Preference gesetzt haben.';

-- ─── RPC: increment_account_memory_recall ───────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_account_memory_recall(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.leadly_account_memory
     SET recall_count = recall_count + 1,
         last_recalled_at = now()
   WHERE id = p_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_account_memory_recall(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_account_memory_recall(uuid) TO service_role;

-- ─── Grants ─────────────────────────────────────────────────────────────
GRANT SELECT ON public.leadly_account_memory      TO authenticated;
GRANT SELECT ON public.leadly_account_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leadly_account_memory      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leadly_account_preferences TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- Verifikation:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='user_preferences' AND column_name='leadly_learning_scope';
--   \d leadly_account_memory
--   \d leadly_account_preferences
--   SELECT polname FROM pg_policy
--     WHERE polrelid::regclass::text LIKE 'public.leadly_account%';
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- linkedin_messages: Legacy-Outbound-Archiv → BV-Conversation-Schema
-- 2026-05-29 · Forward-Migration für Prod, no-op auf Staging
-- ════════════════════════════════════════════════════════════════════════════
--
-- Hintergrund (Investigation 2026-05-29, siehe Memory
-- project_leadesk_linkedin_messages_drift):
--
-- Staging-DB hat seit ~2026-05-27 ein refactored linkedin_messages-Schema mit
-- Conversation-Form (lead_id, direction, content, is_ai_generated, brand_voice_id).
-- Refactor wurde von parallel-Claude-Session(s) direkt via raw-DDL auf Staging
-- angewendet, OHNE Migration-File zu committen. Prod hat noch das ursprüngliche
-- Legacy-Outbound-Archiv-Schema (recipient_*, message_text, message_type,
-- rating, notes).
--
-- Diese Migration rekonstruiert den fehlenden Versionierungs-Schritt und macht
-- Prod auf Staging-Stand. Sie ist idempotent durch IF EXISTS / IF NOT EXISTS-
-- Patterns — Apply auf Staging ist no-op (alle DROP/ADD werden skipped).
--
-- Frontend (Messages.jsx) referenziert NOCH die Legacy-Spalten — Refactor folgt
-- in eigenem Sprint. Bis dahin würde Messages.jsx auf beiden Envs nach dieser
-- Migration crashen. Apply-Reihenfolge:
--   1. Staging: Sanity-Apply (no-op) — beweist IF-EXISTS-Pattern funktioniert
--   2. Prod-DB: Apply — Prod stimmt mit Staging überein
--   3. Frontend-Sprint: Messages.jsx auf neue Spalten umschreiben
--   4. Frontend-Deploy: erst nachdem (1)+(2)+(3) durch sind
--
-- Apply-Pfad:
--   ssh root@<host> 'docker exec -i supabase-db psql -U supabase_admin -d postgres' \
--     < supabase/migrations/20260529130000_linkedin_messages_conversation_refactor.sql

BEGIN;

-- ─── Safety: kein Apply wenn Daten existieren ───────────────────────────────
-- Bei 0 Rows ist DROP COLUMN risiko-frei. Wenn jemand zwischen
-- Investigation und Apply Daten geschrieben hat, abbrechen und manuell prüfen.
DO $$
DECLARE
  row_count integer;
BEGIN
  SELECT COUNT(*) INTO row_count FROM public.linkedin_messages;
  IF row_count > 0 THEN
    RAISE EXCEPTION 'linkedin_messages hat % Rows — Auto-Drop unsicher. Manuelle Migration-Strategie nötig.', row_count;
  END IF;
  RAISE NOTICE 'linkedin_messages ist leer (% Rows) — Schema-Refactor safe.', row_count;
END $$;

-- ─── 1) Legacy-Spalten droppen (no-op auf Staging) ──────────────────────────
ALTER TABLE public.linkedin_messages
  DROP COLUMN IF EXISTS recipient_name,
  DROP COLUMN IF EXISTS recipient_title,
  DROP COLUMN IF EXISTS recipient_company,
  DROP COLUMN IF EXISTS recipient_linkedin_url,
  DROP COLUMN IF EXISTS message_text,
  DROP COLUMN IF EXISTS message_type,
  DROP COLUMN IF EXISTS rating,
  DROP COLUMN IF EXISTS notes;

-- ─── 2) user_id NOT NULL relaxen (Staging hat NULLable) ─────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='linkedin_messages'
      AND column_name='user_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.linkedin_messages ALTER COLUMN user_id DROP NOT NULL;
    RAISE NOTICE 'user_id ist jetzt NULL-able (vorher NOT NULL).';
  ELSE
    RAISE NOTICE 'user_id ist bereits NULL-able — no-op.';
  END IF;
END $$;

-- ─── 3) Conversation-Spalten hinzufügen ─────────────────────────────────────
ALTER TABLE public.linkedin_messages
  ADD COLUMN IF NOT EXISTS team_id         uuid,
  ADD COLUMN IF NOT EXISTS lead_id         uuid,
  ADD COLUMN IF NOT EXISTS direction       text DEFAULT 'outbound',
  ADD COLUMN IF NOT EXISTS content         text,
  ADD COLUMN IF NOT EXISTS is_ai_generated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS brand_voice_id  uuid;

-- ─── 4) FKs (idempotent via pg_constraint-Check) ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'linkedin_messages_lead_id_fkey'
      AND conrelid = 'public.linkedin_messages'::regclass
  ) THEN
    ALTER TABLE public.linkedin_messages
      ADD CONSTRAINT linkedin_messages_lead_id_fkey
      FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;
    RAISE NOTICE 'FK lead_id_fkey hinzugefügt.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'linkedin_messages_brand_voice_id_fkey'
      AND conrelid = 'public.linkedin_messages'::regclass
  ) THEN
    ALTER TABLE public.linkedin_messages
      ADD CONSTRAINT linkedin_messages_brand_voice_id_fkey
      FOREIGN KEY (brand_voice_id) REFERENCES public.brand_voices(id) ON DELETE SET NULL;
    RAISE NOTICE 'FK brand_voice_id_fkey hinzugefügt.';
  END IF;
END $$;

-- team_id hat auf Staging KEINEN FK auf teams(id) — bewusst weggelassen
-- (vermutlich Pattern: team_id wird via App-Layer befüllt + RLS auf
-- team_members JOIN gemacht, FK würde Cross-Team-Cleanup blockieren).

-- ─── 5) Index für brand_voice_id (Lookup-Pfad) ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_linkedin_messages_brand_voice
  ON public.linkedin_messages(brand_voice_id);

-- ─── 6) RLS-Policy (Staging-konformer Name + Logik) ─────────────────────────
ALTER TABLE public.linkedin_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "linkedin_messages_own" ON public.linkedin_messages;
CREATE POLICY "linkedin_messages_own" ON public.linkedin_messages
  FOR ALL USING (user_id = auth.uid());

COMMENT ON TABLE public.linkedin_messages IS
  '2026-05-29 · BV-Conversation-Schema (Refactor von Legacy-Outbound-Archiv). lead_id+direction+content+brand_voice_id ersetzen recipient_*/message_text/message_type/rating. Frontend-Refactor folgt separat.';

-- ─── 7) Hetzner-Grant-Hygiene (defensive Re-Grants) ─────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.linkedin_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.linkedin_messages TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- Verifikation (nach Apply):
-- ════════════════════════════════════════════════════════════════════════════
-- \d+ public.linkedin_messages
--   Erwartung: 10 Spalten — id, user_id, team_id, lead_id, direction (default
--   'outbound'), content, sent_at, is_ai_generated (default false),
--   created_at, brand_voice_id.
--
-- SELECT polname, polcmd FROM pg_policy
--   WHERE polrelid='public.linkedin_messages'::regclass;
--   Erwartung: linkedin_messages_own / ALL
--
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='linkedin_messages'
--     AND column_name IN ('recipient_name','message_type','rating');
--   Erwartung: 0 Rows (Legacy weg).
-- ════════════════════════════════════════════════════════════════════════════

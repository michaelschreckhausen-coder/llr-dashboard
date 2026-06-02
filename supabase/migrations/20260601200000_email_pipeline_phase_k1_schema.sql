-- File: 20260601200000_email_pipeline_phase_k1_schema.sql
-- Sprint K.1 A — Email-Pipeline Foundation Schema
--
-- Erweitert das existing email_templates-System (Phase 2.1, Mig 20260504220000)
-- um Mehrsprachigkeit, Opt-Out-Tracking, Unsubscribe-Tokens und Frequency-Caps.
-- Voraussetzung für Render-EF (Sprint K.1.B) + Send-Wrapper-EF (Sprint K.1.C).
--
-- 4 Changes:
--   1. email_templates.locale-Spalte + UNIQUE(template_key, locale)
--   2. user_email_preferences-Tabelle (Opt-Out pro Kategorie + User-locale)
--   3. email_unsubscribe_tokens-Tabelle (random Tokens für One-Click-Unsubscribe)
--   4. email_send_log um template_locale erweitern
--
-- 2 RPCs:
--   - generate_unsubscribe_token(p_user_id, p_category) RETURNS text
--   - consume_unsubscribe_token(p_token) RETURNS uuid (sets opt-out, returns user_id)
--
-- Idempotent: alle Statements mit IF NOT EXISTS / DROP IF EXISTS.

BEGIN;

-- ════════════════════════════════════════════════════════════════
-- 1. email_templates.locale + Composite-Unique
-- ════════════════════════════════════════════════════════════════
ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'de'
    CHECK (locale IN ('de', 'en'));

-- Alte UNIQUE(template_key) durch Composite ersetzen (idempotent)
ALTER TABLE public.email_templates
  DROP CONSTRAINT IF EXISTS email_templates_template_key_key;
ALTER TABLE public.email_templates
  DROP CONSTRAINT IF EXISTS email_templates_template_key_locale_unique;
ALTER TABLE public.email_templates
  ADD CONSTRAINT email_templates_template_key_locale_unique UNIQUE (template_key, locale);

CREATE INDEX IF NOT EXISTS idx_email_templates_locale ON public.email_templates (locale);

COMMENT ON COLUMN public.email_templates.locale IS
  'Sprache der Template-Variante. UNIQUE (template_key, locale) — dasselbe template_key kann mehrere Sprachen haben. Default ''de''.';

-- ════════════════════════════════════════════════════════════════
-- 2. user_email_preferences (Opt-Out + User-locale)
-- ════════════════════════════════════════════════════════════════
-- Opt-Out-Mapping (DSGVO-konform):
--   - transactional / billing / auth: kein Opt-Out möglich (legal required)
--   - lifecycle: opted_out_lifecycle (Trial-Reminders, Activity-Digests, Inactivity-Reminders)
--   - marketing: opted_out_marketing (Newsletter, Feature-Announcements, Case-Studies)
CREATE TABLE IF NOT EXISTS public.user_email_preferences (
  user_id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  opted_out_lifecycle  boolean NOT NULL DEFAULT false,
  opted_out_marketing  boolean NOT NULL DEFAULT false,
  opted_out_at         timestamptz,
  locale               text NOT NULL DEFAULT 'de' CHECK (locale IN ('de', 'en')),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_email_preferences_user ON public.user_email_preferences (user_id);

COMMENT ON TABLE public.user_email_preferences IS
  'Pro-User Email-Opt-Out + Locale-Pref. Transactional/Billing/Auth-Mails immer zugestellt (Legal). Default opt-in für lifecycle + marketing.';

ALTER TABLE public.user_email_preferences ENABLE ROW LEVEL SECURITY;

-- Hetzner-Convention: explizite Grants (Top-Fallstrick #3 + #12)
GRANT SELECT, INSERT, UPDATE ON public.user_email_preferences TO authenticated;
GRANT ALL ON public.user_email_preferences TO service_role;

-- RLS-Policy: User darf eigene Row lesen + updaten
DROP POLICY IF EXISTS uep_own_read   ON public.user_email_preferences;
DROP POLICY IF EXISTS uep_own_write  ON public.user_email_preferences;
DROP POLICY IF EXISTS uep_admin_read ON public.user_email_preferences;

CREATE POLICY uep_own_read ON public.user_email_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY uep_own_write ON public.user_email_preferences
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY uep_admin_read ON public.user_email_preferences
  FOR SELECT USING (
    COALESCE(
      (((auth.jwt() -> 'app_metadata'::text) ->> 'is_leadesk_admin'::text))::boolean,
      false
    ) = true
  );

-- Trigger: updated_at auto-aktualisieren
CREATE OR REPLACE FUNCTION public.touch_user_email_preferences_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS user_email_preferences_touch_updated_at ON public.user_email_preferences;
CREATE TRIGGER user_email_preferences_touch_updated_at
  BEFORE UPDATE ON public.user_email_preferences
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_email_preferences_updated_at();

-- ════════════════════════════════════════════════════════════════
-- 3. email_unsubscribe_tokens (One-Click-Unsubscribe-Tokens)
-- ════════════════════════════════════════════════════════════════
-- Token-Lifecycle: generate beim Render → user klickt Footer-Link →
-- consume_unsubscribe_token (sets opt-out + markiert used_at). Tokens sind
-- single-use OK; abgelaufene/used Tokens können später per pg_cron gepurged.
CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  token       text PRIMARY KEY,                   -- random 32-char hex
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category    text NOT NULL CHECK (category IN ('lifecycle', 'marketing', 'all')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  used_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_email_unsub_tokens_user ON public.email_unsubscribe_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_email_unsub_tokens_created ON public.email_unsubscribe_tokens (created_at);

COMMENT ON TABLE public.email_unsubscribe_tokens IS
  'Random-Tokens für One-Click-Unsubscribe-Links in Footers (DSGVO). category=lifecycle|marketing|all. used_at-Marker für single-use.';

ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

-- Nur service_role darf hier rein (Public-Unsubscribe-Page nutzt consume-RPC, kein REST-Direct-Access)
GRANT SELECT ON public.email_unsubscribe_tokens TO service_role;
GRANT ALL ON public.email_unsubscribe_tokens TO service_role;

-- Keine Policy für authenticated → kein Zugriff (default-deny bei RLS-on + keine permissive Policy)

-- ════════════════════════════════════════════════════════════════
-- 4. email_send_log um template_locale erweitern
-- ════════════════════════════════════════════════════════════════
-- email_send_log existiert seit Mig 20260527130000 mit 16 Cols inkl. template_key.
-- Wir ergänzen template_locale (für Audit + Frequency-Cap-Pro-User-Pro-Day-Lookups).
ALTER TABLE public.email_send_log
  ADD COLUMN IF NOT EXISTS template_locale text DEFAULT 'de' CHECK (template_locale IS NULL OR template_locale IN ('de', 'en'));

-- Index für Frequency-Cap-Lookups (max-5-pro-Tag-pro-Recipient)
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient_created
  ON public.email_send_log (recipient, created_at DESC);

COMMENT ON COLUMN public.email_send_log.template_locale IS
  'Locale des verwendeten Templates (de/en). Default ''de'' für Backward-Compat mit legacy-Rows.';

-- ════════════════════════════════════════════════════════════════
-- 5. RPCs
-- ════════════════════════════════════════════════════════════════

-- 5a. generate_unsubscribe_token: zufälliger 32-char hex token, INSERT, RETURN
CREATE OR REPLACE FUNCTION public.generate_unsubscribe_token(
  p_user_id uuid,
  p_category text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_token text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;
  IF p_category NOT IN ('lifecycle', 'marketing', 'all') THEN
    RAISE EXCEPTION 'category must be lifecycle, marketing, or all (got %)', p_category;
  END IF;

  -- 32 chars hex = 128 bits entropy
  v_token := encode(gen_random_bytes(16), 'hex');

  INSERT INTO public.email_unsubscribe_tokens (token, user_id, category)
  VALUES (v_token, p_user_id, p_category);

  RETURN v_token;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_unsubscribe_token(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_unsubscribe_token(uuid, text) TO service_role;

COMMENT ON FUNCTION public.generate_unsubscribe_token(uuid, text) IS
  'Generiert random 32-char hex Unsubscribe-Token. Nur service_role. Wird von render-email-EF gerufen.';

-- 5b. consume_unsubscribe_token: validiert + markiert used + setzt opt-out
CREATE OR REPLACE FUNCTION public.consume_unsubscribe_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_token_row record;
  v_now timestamptz := now();
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_token');
  END IF;

  SELECT * INTO v_token_row
  FROM public.email_unsubscribe_tokens
  WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'token_not_found');
  END IF;

  -- Erlaubt re-consume (idempotent) — User klickt Link 2× = funktioniert immer noch
  UPDATE public.email_unsubscribe_tokens
    SET used_at = COALESCE(used_at, v_now)
    WHERE token = p_token;

  -- Opt-Out setzen je nach Category (UPSERT user_email_preferences)
  INSERT INTO public.user_email_preferences (
    user_id, opted_out_lifecycle, opted_out_marketing, opted_out_at, updated_at
  )
  VALUES (
    v_token_row.user_id,
    v_token_row.category IN ('lifecycle', 'all'),
    v_token_row.category IN ('marketing', 'all'),
    v_now, v_now
  )
  ON CONFLICT (user_id) DO UPDATE SET
    opted_out_lifecycle = user_email_preferences.opted_out_lifecycle OR (EXCLUDED.opted_out_lifecycle),
    opted_out_marketing = user_email_preferences.opted_out_marketing OR (EXCLUDED.opted_out_marketing),
    opted_out_at = COALESCE(user_email_preferences.opted_out_at, EXCLUDED.opted_out_at),
    updated_at = v_now;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_token_row.user_id,
    'category', v_token_row.category
  );
END;
$$;

-- Public-Pfad: anonyme Unsubscribe-Page ruft das auf (über service-role-EF-Wrapper).
-- Direct-Public-Access via anon NICHT erlauben (Token-Brute-Force-Schutz).
REVOKE EXECUTE ON FUNCTION public.consume_unsubscribe_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_unsubscribe_token(text) TO service_role;

COMMENT ON FUNCTION public.consume_unsubscribe_token(text) IS
  'Konsumiert Unsubscribe-Token + setzt opt-out je nach token.category. Idempotent. Returns JSON {success, user_id, category} oder {success: false, reason}.';

-- ════════════════════════════════════════════════════════════════
-- 6. Verifikation
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_email_templates_has_locale boolean;
  v_uep_exists boolean;
  v_tokens_exists boolean;
  v_email_send_log_has_locale boolean;
  v_rpc_generate_exists boolean;
  v_rpc_consume_exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='email_templates' AND column_name='locale')
    INTO v_email_templates_has_locale;
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='user_email_preferences')
    INTO v_uep_exists;
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='email_unsubscribe_tokens')
    INTO v_tokens_exists;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='email_send_log' AND column_name='template_locale')
    INTO v_email_send_log_has_locale;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname='public' AND p.proname='generate_unsubscribe_token')
    INTO v_rpc_generate_exists;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname='public' AND p.proname='consume_unsubscribe_token')
    INTO v_rpc_consume_exists;

  IF NOT v_email_templates_has_locale     THEN RAISE EXCEPTION 'email_templates.locale missing'; END IF;
  IF NOT v_uep_exists                     THEN RAISE EXCEPTION 'user_email_preferences missing'; END IF;
  IF NOT v_tokens_exists                  THEN RAISE EXCEPTION 'email_unsubscribe_tokens missing'; END IF;
  IF NOT v_email_send_log_has_locale      THEN RAISE EXCEPTION 'email_send_log.template_locale missing'; END IF;
  IF NOT v_rpc_generate_exists            THEN RAISE EXCEPTION 'generate_unsubscribe_token RPC missing'; END IF;
  IF NOT v_rpc_consume_exists             THEN RAISE EXCEPTION 'consume_unsubscribe_token RPC missing'; END IF;

  RAISE NOTICE 'Sprint K.1 A Schema-Migration verification PASSED';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

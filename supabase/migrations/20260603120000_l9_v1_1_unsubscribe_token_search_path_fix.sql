-- File: 20260603120000_l9_v1_1_unsubscribe_token_search_path_fix.sql
-- Sprint L.9 V1.1 — search_path-Fix für generate_unsubscribe_token
--
-- Bug: Die RPC nutzt gen_random_bytes(16) für Token-Erzeugung. gen_random_bytes
-- ist aus der pgcrypto-Extension, die auf Hetzner-Self-Host im Schema 'extensions'
-- lebt (NICHT 'public'). Original-Migration setzte search_path = 'public, pg_temp'
-- → gen_random_bytes nicht auflösbar → Crash bei jedem Token-Versuch.
--
-- Konsequenz vor dem Fix:
--   - render-email-EF ruft generate_unsubscribe_token in try/catch (L.4 V1 Code)
--     → Crash geschluckt, console.warn-Eintrag → unsubscribeUrl bleibt leer
--     → Footer wird trotzdem injected, aber Link href="" (broken Link)
--   - Bisherige Smoke-Mails (welcome, stripe, trial) sind alle "sent" durchgegangen,
--     aber jeder Footer-Klick wäre ins Leere gegangen. DSGVO-Lücke.
--   - L.9 unsubscribe-EF kann ohne funktionsfähige Token-Generation nicht getestet
--     werden (kein gültiger Token erstellbar).
--
-- Fix: search_path um 'extensions' erweitern. consume_unsubscribe_token ist auch
-- SECURITY DEFINER aber nutzt KEINE pgcrypto-Funktionen — search_path bleibt
-- 'public, pg_temp' (kein Fix nötig).
--
-- Idempotent: CREATE OR REPLACE FUNCTION.

BEGIN;

CREATE OR REPLACE FUNCTION public.generate_unsubscribe_token(
  p_user_id uuid,
  p_category text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
$function$;

COMMENT ON FUNCTION public.generate_unsubscribe_token(uuid, text) IS
  'Sprint L.9 V1.1 (2026-06-03): search_path erweitert um extensions (pgcrypto-Schema auf Hetzner-Self-Host). gen_random_bytes ist sonst unauflösbar → Crash → Token-Generation broken.';

-- Verifikation — Catalog-Check ohne Live-Call (kein FK-Risiko)
DO $$
DECLARE
  v_proconfig text[];
  v_joined text;
BEGIN
  SELECT proconfig INTO v_proconfig
    FROM pg_proc
   WHERE proname = 'generate_unsubscribe_token'
     AND pronamespace = 'public'::regnamespace;

  IF v_proconfig IS NULL THEN
    RAISE EXCEPTION 'generate_unsubscribe_token has no proconfig (SET search_path missing)';
  END IF;

  v_joined := array_to_string(v_proconfig, ',');
  IF v_joined NOT LIKE '%extensions%' THEN
    RAISE EXCEPTION 'search_path Fix nicht aktiv — proconfig: %', v_joined;
  END IF;

  RAISE NOTICE 'Sprint L.9 V1.1 search_path-Fix verification PASSED (proconfig OK)';
END $$;

COMMIT;

-- ================================================================
-- Leadesk: Admin-RPCs Post-Cutover Drift-Fix
-- ================================================================
--
-- Fixt 2 RPCs die nach dem Phase 1+2 Cutover (2026-04-30) broken
-- sind, weil sie auf alten Schema-Annahmen sitzen.
--
-- ── Schema-Drift-Quelle ──
--
-- Phase 1+2 Cutover hat:
--   - plans.id von text → uuid migriert
--   - subscriptions.plan_id, accounts.plan_id, stripe_subscriptions.plan_id
--     von text → uuid migriert
--   - Auf Hetzner-Staging zusätzlich: profiles.role von text → user_role
--     enum migriert (auf Hetzner-Prod ist profiles.role noch text Legacy,
--     siehe Top-Fallstrick #9 in CLAUDE.md)
--   - profiles.global_role auf beiden Envs konsistent: user_role enum
--
-- ── Welche RPCs werden gefixt ──
--
-- 1. admin_set_role
--    Vorher: UPDATE profiles SET role = new_role
--    Nachher: UPDATE profiles SET global_role = new_role::user_role
--    Begründung: profiles.role ist Legacy, profiles.global_role ist
--    kanonisch (Top-Fallstrick #9). Cast text → user_role explizit
--    (auto-Cast existiert nicht). Switching auf global_role = forwards-
--    konsistent, funktioniert auf beiden Envs (Staging+Prod).
--
-- 2. admin_create_user
--    Vorher: INSERT INTO profiles (..., role) ... ON CONFLICT DO UPDATE
--            SET ..., role = p_role
--    Nachher: gleiche Logik aber global_role mit ::user_role-Cast
--    Hinweis: admin_create_user macht KEIN Plan-Lookup im Body. Der
--    Plan-Lookup passiert im handle_new_user-Trigger der auf INSERT
--    INTO auth.users feuert. Dieser Trigger ist auf Staging broken
--    (plans-Tabelle leer → kein Free-Plan findbar) — DIESE Migration
--    fixt das NICHT. Plans-Seed auf Staging ist eigene Operation.
--
-- ── pg_proc-Writer-Audit (verifiziert vor dieser Migration) ──
--
-- Suche via prosrc ILIKE auf alle Functions in public/auth nach
-- Writern auf profiles.role:
--   admin_create_user  → INSERT + ON CONFLICT UPDATE  ← gefixt
--   admin_set_role     → UPDATE                       ← gefixt
-- Sonst niemand. handle_new_user-Trigger setzt .role nicht (default
-- 'user'::user_role greift). 100% Writer-Coverage, keine orphane
-- Schreibpfade hängen auf der Legacy-Spalte.
--
-- ── BEWUSST NICHT GEFIXT (eigene Sessions) ──
--
--   admin_list_users
--     → wird in admin.leadesk.de NICHT aufgerufen (Account-Liste
--       ersetzt das). plan_id-Drift-Bug (COALESCE(s.plan_id, 'free')
--       gegen subscriptions.plan_id uuid) bleibt bestehen, RPC ist
--       effektiv tot. CLAUDE.md-Tech-Debt-Eintrag empfohlen.
--
--   admin_grant_license
--     → Spalte profiles.plan_expires_at fehlt komplett auf Staging
--       (Schema-Klärung nötig: war beim Cutover gedroppt? nie migriert?).
--       Eigene Frage. Aktuell broken, RPC selten gerufen.
--
-- ── Idempotenz ──
--
-- CREATE OR REPLACE FUNCTION ist idempotent. Re-Run macht keinen
-- Schaden. Body-Änderungen sind minimal: nur die Profile-INSERT/
-- UPDATE-Statements werden angefasst, Auth-Check + auth.users/
-- identities-Logik bleiben byte-identisch zur Lockdown-Version.
-- ================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. admin_set_role (kleinerer Fix zuerst)
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_set_role(
  target_user_id uuid,
  new_role       text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
  END IF;
  -- Drift-Fix: Schreiben auf global_role (user_role enum, kanonisch)
  -- statt Legacy role-Spalte. Cast text → user_role explizit, weil
  -- Postgres keinen impliziten Cast hat. Bei ungültigem new_role
  -- (z.B. 'foobar') wirft der Cast eine Exception → Caller-Verantwortung.
  UPDATE public.profiles
  SET global_role = new_role::user_role
  WHERE id = target_user_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 2. admin_create_user (größer, plus Trigger-Hinweis)
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email     text,
  p_password  text,
  p_full_name text DEFAULT '',
  p_role      text DEFAULT 'user'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth, pg_temp
AS $$
DECLARE
  v_id  uuid := gen_random_uuid();
  v_enc text;
BEGIN
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RAISE EXCEPTION 'Email already exists: %', p_email;
  END IF;

  v_enc := crypt(p_password, gen_salt('bf'));

  INSERT INTO auth.users (
    instance_id, id, aud, role,
    email, encrypted_password,
    email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin,
    confirmation_token, recovery_token,
    email_change_token_new, email_change,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_id, 'authenticated', 'authenticated',
    p_email, v_enc,
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', p_full_name),
    false,
    '', '', '', '',
    now(), now()
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, provider,
    identity_data,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_id, v_id,
    p_email, 'email',
    jsonb_build_object(
      'sub',            v_id::text,
      'email',          p_email,
      'email_verified', true,
      'phone_verified', false
    ),
    now(), now(), now()
  );

  -- Drift-Fix: Schreiben auf global_role (user_role enum) statt Legacy
  -- role-Spalte. Cast text → user_role explizit.
  -- handle_new_user-Trigger hat bereits eine profiles-Row angelegt
  -- (Trigger feuert auf INSERT INTO auth.users oben), deshalb hier
  -- ON CONFLICT (id) DO UPDATE: globale_role wurde im Trigger nicht
  -- gesetzt, default 'user'::user_role greift, wir überschreiben mit p_role.
  INSERT INTO public.profiles (id, email, full_name, global_role)
  VALUES (v_id, p_email, p_full_name, p_role::user_role)
  ON CONFLICT (id) DO UPDATE
    SET email       = p_email,
        full_name   = p_full_name,
        global_role = p_role::user_role;

  -- Return-Contract: Key-Name 'role' bleibt für Backwards-Kompatibilität
  -- mit existierenden Frontend-Callern. Wert ist die p_role-Eingabe (text),
  -- semantisch identisch zur global_role die wir geschrieben haben.
  RETURN jsonb_build_object('id', v_id, 'email', p_email, 'role', p_role);
END;
$$;

COMMIT;

-- ⚠️ FAILED MIGRATION — DO NOT APPLY ⚠️
-- pg_net + sync-poll in derselben TX ist unmöglich:
-- pg_net Worker liest http_request_queue mit MVCC, sieht uncommitted INSERTs nicht,
-- HTTP wird nie gefired, Function läuft 6s in Timeout-Exception.
-- Phase 1.2 funktioniert nur weil fire-and-forget (RPC committed BEVOR Worker arbeitet).
-- Working Pattern: 20260508110000_admin_create_account_with_owner_id.sql +
--                  Edge-Function admin-create-account-invite (D2 Bridge-Pattern).
-- Behalten als Architektur-Lesson, NICHT applien.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- Phase EmailFix-3 — admin_create_account v2 (Surgical Swap) — FAILED
--
-- Bug: v1 ruft admin_create_user → direkter auth.users-INSERT mit
-- email_confirmed_at=now() → bypassed GoTrue komplett, sendet keine
-- Mail. Owner kennt sein Passwort nicht, kann sich nicht einloggen.
--
-- Fix: Der Owner-Setup-Block wird durch GoTrue-invite via pg_net+Kong
-- ersetzt. GoTrue triggert Postmark-Mail mit confirmation-Link
-- (Phase-2.2 'invite' MJML-Template, gebrandeter Subject "Willkommen").
-- User klickt Link → setzt eigenes Passwort → ist confirmed.
--
-- Rest des Function-Bodies bleibt unverändert (Auth-Gate, Reason-
-- Validation, Plan-Resolution, Trial-Logic, accounts/teams/team_members
-- INSERTs, Audit-Log).
--
-- Signature: IDENTISCH zu v1 (15 params). Nur Body-Refactor:
--   - p_owner_password wird ignored (NOTICE bei Aufruf, sonst no-op)
--   - p_create_owner_if_missing=false: existing-only-Pfad bleibt
--
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_create_account(
  p_account_name              text,
  p_billing_email             text,
  p_plan_slug                 text,
  p_owner_email               text,
  p_create_owner_if_missing   boolean DEFAULT true,
  p_owner_password            text    DEFAULT NULL::text,
  p_owner_full_name           text    DEFAULT ''::text,
  p_team_name                 text    DEFAULT NULL::text,
  p_team_slug                 text    DEFAULT NULL::text,
  p_status                    text    DEFAULT 'active'::text,
  p_granted_via               text    DEFAULT 'manual'::text,
  p_plan_managed_by           text    DEFAULT 'leadesk'::text,
  p_seat_limit                integer DEFAULT NULL::integer,
  p_trial_days                integer DEFAULT NULL::integer,
  p_reason                    text    DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'extensions', 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_admin_user_id        uuid := auth.uid();
  v_is_admin             boolean;
  v_owner_id             uuid;
  v_owner_was_created    boolean := false;
  v_plan_id              uuid;
  v_plan_name            text;
  v_team_id              uuid;
  v_account_id           uuid;
  v_team_name            text;
  v_team_slug_base       text;
  v_team_slug            text;
  v_status               text;
  v_trial_ends_at        timestamptz;
  v_audit_id             uuid;
  v_admin_create_result  jsonb;     -- EF-3: deprecated (no longer used)
  v_collision_count      int := 0;

  -- ══════════════════════════════════════════════════════════════
  -- EF-3 Eingriff A: GoTrue invite via pg_net (sync-poll pattern)
  -- ══════════════════════════════════════════════════════════════
  v_request_id           bigint;
  v_response_status      int;
  v_response_body        jsonb;
  v_invite_attempt       int := 0;
  v_was_invited          boolean := false;
BEGIN
  -- ============================================================
  -- 1. Auth-Gate (matched admin_create_user-Pattern)
  -- ============================================================
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_is_admin := COALESCE(
    ((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin'))::boolean,
    false
  );
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized — is_leadesk_admin claim required'
      USING ERRCODE = '42501';
  END IF;

  -- ============================================================
  -- 2. Reason-Validation (matched admin_audit_log_reason_check)
  -- ============================================================
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason must be at least 10 characters'
      USING ERRCODE = '22023';
  END IF;

  -- ============================================================
  -- 3. Pflichtfelder
  -- ============================================================
  IF p_account_name IS NULL OR length(trim(p_account_name)) = 0 THEN
    RAISE EXCEPTION 'Account name required' USING ERRCODE = '22023';
  END IF;
  IF p_billing_email IS NULL OR length(trim(p_billing_email)) = 0 THEN
    RAISE EXCEPTION 'Billing email required' USING ERRCODE = '22023';
  END IF;
  IF p_plan_slug IS NULL OR length(trim(p_plan_slug)) = 0 THEN
    RAISE EXCEPTION 'Plan slug required' USING ERRCODE = '22023';
  END IF;
  IF p_owner_email IS NULL OR length(trim(p_owner_email)) = 0 THEN
    RAISE EXCEPTION 'Owner email required' USING ERRCODE = '22023';
  END IF;

  -- ============================================================
  -- 4. Enum-Werte (sprechende Errors statt CHECK-Constraint-Kollision)
  -- ============================================================
  IF p_status NOT IN ('trialing','active','past_due','suspended','canceled') THEN
    RAISE EXCEPTION 'Invalid status "%" — must be trialing/active/past_due/suspended/canceled', p_status
      USING ERRCODE = '22023';
  END IF;
  IF p_granted_via NOT IN ('stripe','manual','trial') THEN
    RAISE EXCEPTION 'Invalid granted_via "%" — must be stripe/manual/trial', p_granted_via
      USING ERRCODE = '22023';
  END IF;
  IF p_plan_managed_by NOT IN ('stripe','leadesk') THEN
    RAISE EXCEPTION 'Invalid plan_managed_by "%" — must be stripe/leadesk', p_plan_managed_by
      USING ERRCODE = '22023';
  END IF;
  IF p_trial_days IS NOT NULL AND p_trial_days < 0 THEN
    RAISE EXCEPTION 'Trial days must be >= 0' USING ERRCODE = '22023';
  END IF;
  IF p_seat_limit IS NOT NULL AND p_seat_limit < 1 THEN
    RAISE EXCEPTION 'Seat limit must be >= 1' USING ERRCODE = '22023';
  END IF;

  -- ============================================================
  -- 5. Plan-Resolution (slug → id, must be active + not archived)
  -- ============================================================
  SELECT id, name INTO v_plan_id, v_plan_name
  FROM public.plans
  WHERE slug = lower(trim(p_plan_slug)) AND archived = false AND is_active = true
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Plan slug "%" not found or archived/inactive', p_plan_slug
      USING ERRCODE = 'P0002';
  END IF;

  -- ============================================================
  -- 6. Trial-Logik gekoppelt (Decision D)
  -- ============================================================
  IF p_trial_days IS NOT NULL AND p_trial_days > 0 THEN
    v_status        := 'trialing';
    v_trial_ends_at := now() + (p_trial_days || ' days')::interval;
  ELSE
    v_status        := p_status;
    v_trial_ends_at := NULL;
  END IF;

  -- ============================================================
  -- 7. Owner-Resolution (existing OR invite OR raise)
  --
  -- ══════════════════════════════════════════════════════════════
  -- EF-3 Eingriff B: GoTrue Invite-Flow statt direct-INSERT
  -- ══════════════════════════════════════════════════════════════
  -- v1 rief admin_create_user → INSERT INTO auth.users mit
  -- email_confirmed_at=now() (bypassed GoTrue → keine Mail).
  -- v2 ruft GoTrue's /auth/v1/invite via pg_net + Kong → GoTrue
  -- generiert confirmation_token, sendet Postmark-Mail mit Phase-
  -- 2.2-MJML-invite-Template, setzt invited_at + confirmation_sent_at.
  -- ============================================================
  SELECT id INTO v_owner_id FROM auth.users WHERE email = p_owner_email;

  -- Defensive guard: wenn kein owner UND kein create-mode → fail-fast
  -- (sonst würde später team_members-INSERT mit user_id=NULL crashen)
  IF v_owner_id IS NULL AND NOT p_create_owner_if_missing THEN
    RAISE EXCEPTION 'Owner email "%" not found and create_owner_if_missing=false', p_owner_email
      USING ERRCODE = 'P0002';
  END IF;

  -- p_owner_password ist deprecated seit EF-3 (Invite-Flow generiert
  -- eigenen Token; User setzt Passwort selbst beim ersten Login).
  -- Frontend wird in EF-4 das Field ausbauen — bis dahin tolerieren wir
  -- es mit einem NOTICE.
  IF p_owner_password IS NOT NULL AND length(p_owner_password) > 0 THEN
    RAISE NOTICE 'p_owner_password is deprecated since EF-3 (invite-flow). Ignored.';
  END IF;

  IF p_create_owner_if_missing AND v_owner_id IS NULL THEN
    -- Trigger GoTrue invite via pg_net + Kong (port 8000, internal docker-net).
    -- service_role_jwt ist via ALTER DATABASE SET app.service_role_jwt persistiert
    -- (Phase 1.2 Setup; supabase_admin-Privilege).
    SELECT net.http_post(
      url     := 'http://kong:8000/auth/v1/invite',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_jwt'),
        'apikey',        current_setting('app.service_role_jwt'),
        'Content-Type',  'application/json'
      ),
      body    := jsonb_build_object(
        'email', p_owner_email,
        'data',  jsonb_build_object(
          'full_name',        p_owner_full_name,
          'role',             'user',
          'invited_by_admin', true
        )
      ),
      timeout_milliseconds := 5000
    ) INTO v_request_id;

    -- Sync-Poll für Response (max 30 × 200ms = 6s).
    -- pg_net schreibt Response asynchron in net._http_response;
    -- READ COMMITTED snapshot pro SELECT-Iteration sieht den Insert.
    LOOP
      v_invite_attempt := v_invite_attempt + 1;
      SELECT status_code, content::jsonb
        INTO v_response_status, v_response_body
        FROM net._http_response
        WHERE id = v_request_id;
      EXIT WHEN v_response_status IS NOT NULL;
      IF v_invite_attempt > 30 THEN
        RAISE EXCEPTION 'GoTrue invite timeout after % polling attempts (% ms)',
          v_invite_attempt, v_invite_attempt * 200
          USING ERRCODE = '57014';   -- query_canceled
      END IF;
      PERFORM pg_sleep(0.2);
    END LOOP;

    IF v_response_status NOT IN (200, 201) THEN
      RAISE EXCEPTION 'GoTrue invite failed (HTTP %): %',
        v_response_status, coalesce(v_response_body::text, '<empty>')
        USING ERRCODE = '08006';   -- connection_failure
    END IF;

    v_owner_id := (v_response_body ->> 'id')::uuid;

    IF v_owner_id IS NULL THEN
      RAISE EXCEPTION 'GoTrue invite response missing user id: %',
        coalesce(v_response_body::text, '<null>')
        USING ERRCODE = '22000';
    END IF;

    v_owner_was_created := true;
    v_was_invited       := true;
  END IF;

  -- ============================================================
  -- 8. Team-Name + Slug (collision-resilient)
  -- ============================================================
  v_team_name := COALESCE(NULLIF(trim(p_team_name), ''), p_account_name);

  -- Slug-Base: explicit oder auto-generated aus account_name
  v_team_slug_base := lower(trim(COALESCE(NULLIF(trim(p_team_slug), ''), p_account_name)));
  -- Replace non-[a-z0-9_-] mit '-', strip leading/trailing dashes, collapse runs
  v_team_slug_base := regexp_replace(v_team_slug_base, '[^a-z0-9_-]+', '-', 'g');
  v_team_slug_base := regexp_replace(v_team_slug_base, '-+', '-', 'g');
  v_team_slug_base := trim(both '-' from v_team_slug_base);
  IF length(v_team_slug_base) = 0 THEN
    v_team_slug_base := 'team';    -- defensive fallback
  END IF;

  -- Collision-Resolution: append -{4-stellig-random} solange Konflikt
  v_team_slug := v_team_slug_base;
  WHILE EXISTS (SELECT 1 FROM public.teams WHERE slug = v_team_slug) LOOP
    v_collision_count := v_collision_count + 1;
    IF v_collision_count > 100 THEN
      RAISE EXCEPTION 'Team slug collision-resolution exceeded 100 attempts'
        USING ERRCODE = 'P0001';
    END IF;
    v_team_slug := v_team_slug_base || '-' || lpad(floor(random() * 10000)::text, 4, '0');
  END LOOP;

  -- ============================================================
  -- 9. INSERT accounts
  -- ============================================================
  INSERT INTO public.accounts (
    name, billing_email, owner_user_id, plan_id,
    seat_limit, plan_managed_by, status,
    trial_ends_at, granted_via
  ) VALUES (
    trim(p_account_name),
    lower(trim(p_billing_email)),
    v_owner_id,
    v_plan_id,
    COALESCE(p_seat_limit, 1),    -- accounts.seat_limit ist NOT NULL DEFAULT 1
    p_plan_managed_by,
    v_status,
    v_trial_ends_at,
    p_granted_via
  )
  RETURNING id INTO v_account_id;

  -- ============================================================
  -- 10. INSERT teams (mit account_id-FK, owner_id=owner_user_id)
  -- ============================================================
  INSERT INTO public.teams (
    name, slug, owner_id, account_id, plan_id, is_active
  ) VALUES (
    v_team_name, v_team_slug, v_owner_id, v_account_id, v_plan_id, true
  )
  RETURNING id INTO v_team_id;

  -- ============================================================
  -- 11. INSERT team_members (role='owner'::user_role)
  -- ============================================================
  INSERT INTO public.team_members (
    user_id, team_id, role, invited_by
  ) VALUES (
    v_owner_id, v_team_id, 'owner'::user_role, v_admin_user_id
  );

  -- ============================================================
  -- 12. Audit-Eintrag (Single, mit allen IDs im after_value)
  -- ══════════════════════════════════════════════════════════════
  -- EF-3 Eingriff C: was_invited-Key in metadata
  -- ══════════════════════════════════════════════════════════════
  -- ============================================================
  INSERT INTO public.admin_audit_log (
    admin_user_id, action, target_table, target_id,
    before_value, after_value, reason
  ) VALUES (
    v_admin_user_id,
    'account_create',
    'accounts',
    v_account_id,
    NULL,
    jsonb_build_object(
      'account_id',        v_account_id,
      'account_name',      trim(p_account_name),
      'billing_email',     lower(trim(p_billing_email)),
      'team_id',           v_team_id,
      'team_name',         v_team_name,
      'team_slug',         v_team_slug,
      'owner_user_id',     v_owner_id,
      'owner_email',       p_owner_email,
      'owner_was_created', v_owner_was_created,
      'was_invited',       v_was_invited,
      'plan_id',           v_plan_id,
      'plan_slug',         lower(trim(p_plan_slug)),
      'plan_name',         v_plan_name,
      'status',            v_status,
      'granted_via',       p_granted_via,
      'plan_managed_by',   p_plan_managed_by,
      'seat_limit',        COALESCE(p_seat_limit, 1),
      'trial_days',        p_trial_days,
      'trial_ends_at',     v_trial_ends_at
    ),
    p_reason
  )
  RETURNING id INTO v_audit_id;

  -- ============================================================
  -- 13. Return
  -- ============================================================
  RETURN jsonb_build_object(
    'success',           true,
    'account_id',        v_account_id,
    'team_id',           v_team_id,
    'team_slug',         v_team_slug,
    'owner_user_id',     v_owner_id,
    'owner_was_created', v_owner_was_created,
    'was_invited',       v_was_invited,
    'plan_id',           v_plan_id,
    'plan_name',         v_plan_name,
    'status',            v_status,
    'trial_ends_at',     v_trial_ends_at,
    'audit_id',          v_audit_id
  );
END;
$function$;

COMMENT ON FUNCTION public.admin_create_account(
  text, text, text, text, boolean, text, text, text, text,
  text, text, text, integer, integer, text
) IS 'Phase EmailFix-3 v2 (Surgical Swap): Creates account + invites owner via GoTrue '
     '(pg_net → http://kong:8000/auth/v1/invite). Replaces direct-auth.users-INSERT '
     'pattern (admin_create_user) from v1. Owner receives invite-mail with '
     'confirmation-link → sets own password on first click. p_owner_password '
     'is deprecated and ignored (NOTICE issued).';

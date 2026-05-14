-- ================================================================
-- Leadesk: admin_account_delete-RPC (Cascade-Delete) — v3
-- ================================================================
--
-- Löscht einen Account vollständig. Strategie:
--   1. user_preferences.active_team_id auf NULL setzen (Pointer-Cleanup,
--      kein Row-Delete — sonst verlöre ein Multi-Account-User seine Prefs)
--   2. team-scoped Tabellen via Hybrid-Loop:
--      Pfad A: FK-Discovery (alle Spalten mit FK auf teams(id)) — robust
--              gegen Spaltennamen-Drift wie team_uuid o.ä.
--      Pfad B: Column-Name 'team_id' ohne FK (Fallback für denormalisierte
--              Tabellen wie knowledge_base, target_audiences). Stat-Key
--              bekommt '_no_fk'-Suffix für Audit-Transparenz.
--   3. user_id-scoped Tabellen für Solo-User via Spaltenname 'user_id'
--      (auth.users hat kaum public.* FKs auf Hetzner-Self-Host, Discovery
--      via Constraints unzuverlässig → Fallback auf Konvention)
--   4. team_members → teams → accounts in FK-Reihenfolge
--   5. Auth-Identity-Opt-In (gated by p_delete_auth_user, DEFAULT false):
--      profiles + auth.users + Storage-Files. Default behält alles, damit
--      Re-Onboarding nicht mit leerer Identity startet.
--   6. Audit-Eintrag mit pro-Tabelle Counts + storage-target-vs-deleted
--      + auth_user_handling + multi_account_users_kept
--
-- Solo-User-Detection: User die NUR in Teams dieses Accounts sind.
-- Multi-Account-User behalten Login + profile + alle Daten in anderen
-- Accounts; nur ihre team_members-Einträge in diesem Account werden
-- entfernt. Counter `multi_account_users_kept` macht das transparent.
--
-- Storage-Cleanup-Strategie (path-basiert):
--   Pattern auf Hetzner-Staging verifiziert 2026-05-02:
--     bucket: knowledge-files
--     path:   audience/<user_id>/<filename>
--     owner:  user_id (= auth.uid() des Uploaders)
--   path_tokens[2] = user_id → Filter via path_tokens[2]::uuid = solo-user.
--   UUID-Regex-Guard verhindert Cast-Crash bei fehlerhaften Path-Tokens.
--
--   Aktuell nur 'knowledge-files'-Bucket aktiv (1 File auf Staging,
--   0 auf Prod). Künftige Buckets: separate Schleife über storage.buckets
--   ergänzen — das ist v4-Arbeit, nicht jetzt.
--
--   Sicherheitsventil: SELECT count(*) vor DELETE als 'storage_files_
--   target_count', dann DELETE-ROW_COUNT als 'storage_files_deleted'.
--   Diskrepanz im Audit-Log diagnostizierbar.
--
-- Idempotent: Re-Run mit gelöschter account_id → 'already_deleted'-Return.
-- Auth: is_leadesk_admin-JWT-Claim (Phase 1.3-Pattern).
-- Body läuft in impliziter Transaction (FUNCTION) — bei Mid-Crash wird
-- alles ge-rollback-t, Re-Run safe wegen idempotenter Lösch-Pattern.
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_account_delete(
  p_account_id        uuid,
  p_reason            text,
  p_delete_auth_user  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, storage, pg_temp
AS $$
DECLARE
  v_admin_id              uuid := auth.uid();
  v_account_name          text;
  v_owner_id              uuid;
  v_team_ids              uuid[];
  v_member_ids            uuid[];
  v_solo_user_ids         uuid[];
  v_deleted_count         bigint;
  v_storage_target_count  bigint;
  v_stats                 jsonb := '{}'::jsonb;
  v_auth_handling         text;
  rec                     RECORD;
BEGIN
  -- ── 0. Auth + Reason ──
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason required (mindestens 10 Zeichen)';
  END IF;

  -- ── Idempotenz-Check ──
  SELECT name, owner_user_id INTO v_account_name, v_owner_id
  FROM public.accounts WHERE id = p_account_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'account_id', p_account_id,
      'status',     'already_deleted',
      'stats',      '{}'::jsonb
    );
  END IF;

  -- ── 1. Daten sammeln: team_ids + member_ids + solo_user_ids ──

  SELECT array_agg(id) INTO v_team_ids
  FROM public.teams WHERE account_id = p_account_id;
  v_team_ids := COALESCE(v_team_ids, ARRAY[]::uuid[]);

  SELECT array_agg(DISTINCT uid) INTO v_member_ids
  FROM (
    SELECT user_id AS uid FROM public.team_members WHERE team_id = ANY(v_team_ids)
    UNION
    SELECT v_owner_id WHERE v_owner_id IS NOT NULL
  ) sub
  WHERE uid IS NOT NULL;
  v_member_ids := COALESCE(v_member_ids, ARRAY[]::uuid[]);

  SELECT array_agg(uid) INTO v_solo_user_ids
  FROM unnest(v_member_ids) uid
  WHERE NOT EXISTS (
    SELECT 1 FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = uid
      AND t.account_id IS NOT NULL
      AND t.account_id <> p_account_id
  );
  v_solo_user_ids := COALESCE(v_solo_user_ids, ARRAY[]::uuid[]);

  -- ── 2. user_preferences.active_team_id auf NULL setzen ──
  -- user_preferences ist user-scoped. Wir wollen die Row NICHT löschen
  -- (verlöre andere Prefs eines Multi-Account-Users), nur den Pointer
  -- auf den verschwindenden Team aufheben.
  IF array_length(v_team_ids, 1) > 0 THEN
    UPDATE public.user_preferences
    SET active_team_id = NULL, updated_at = now()
    WHERE active_team_id = ANY(v_team_ids);
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    IF v_deleted_count > 0 THEN
      v_stats := v_stats || jsonb_build_object('user_preferences_active_team_cleared', v_deleted_count);
    END IF;
  END IF;

  -- ── 3a. team-scoped Tabellen via FK-Discovery-Loop ──
  -- Findet alle public.*-Tabellen mit FK auf teams(id). Robust gegen
  -- Spaltennamen-Drift. Exklusionen:
  --   - team_members (Schritt 4: in FK-Reihenfolge nach allen Customer-Daten)
  --   - user_preferences (Schritt 2 oben: UPDATE statt DELETE)
  IF array_length(v_team_ids, 1) > 0 THEN
    FOR rec IN
      SELECT tc.table_name AS source_table, kcu.column_name AS source_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_schema = 'public'
        AND ccu.table_name = 'teams'
        AND ccu.column_name = 'id'
        AND tc.table_schema = 'public'
        AND tc.table_name NOT IN ('team_members', 'user_preferences')
      ORDER BY tc.table_name
    LOOP
      EXECUTE format('DELETE FROM public.%I WHERE %I = ANY($1)', rec.source_table, rec.source_column)
        USING v_team_ids;
      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
      IF v_deleted_count > 0 THEN
        v_stats := v_stats || jsonb_build_object(rec.source_table, v_deleted_count);
      END IF;
    END LOOP;
  END IF;

  -- ── 3b. team-scoped Fallback-Loop für team_id-Spalten OHNE FK ──
  -- Fängt Tabellen wie knowledge_base, target_audiences (verifiziert auf
  -- Hetzner-Prod 2026-05-02: 19 team_id-Spalten total, 17 mit FK, 2 ohne).
  -- Stat-Key bekommt '_no_fk'-Suffix für Audit-Transparenz.
  -- Doppel-Delete auf bereits in 3a erfasste Tabellen wäre filter-out durch
  -- NOT EXISTS-Subquery — keine Tabelle wird zweimal angefasst.
  IF array_length(v_team_ids, 1) > 0 THEN
    FOR rec IN
      SELECT c.table_name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.column_name  = 'team_id'
        AND c.table_name NOT IN ('team_members', 'user_preferences')
        AND NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = c.table_schema
            AND tc.table_name = c.table_name
            AND kcu.column_name = 'team_id'
        )
      ORDER BY c.table_name
    LOOP
      EXECUTE format('DELETE FROM public.%I WHERE team_id = ANY($1)', rec.table_name)
        USING v_team_ids;
      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
      IF v_deleted_count > 0 THEN
        v_stats := v_stats || jsonb_build_object(rec.table_name || '_no_fk', v_deleted_count);
      END IF;
    END LOOP;
  END IF;

  -- ── 4. user_id-scoped Tabellen für Solo-User löschen ──
  -- auth.users hat kaum FK-Constraints aus public.* auf Hetzner-Self-Host
  -- (Discovery via constraint_column_usage liefert 0 in unseren Tests).
  -- Daher Discovery via Spaltenname 'user_id'. Filter: nur Tabellen ohne
  -- team_id (sonst schon in Schritt 3 erfasst — wäre no-op, aber sauberer).
  -- Skip:
  --   - team_members (Schritt 5)
  --   - admin_audit_log (= unsere Audit-Quelle)
  IF array_length(v_solo_user_ids, 1) > 0 THEN
    FOR rec IN
      SELECT c.table_name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.column_name  = 'user_id'
        AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns c2
          WHERE c2.table_schema = c.table_schema
            AND c2.table_name   = c.table_name
            AND c2.column_name  = 'team_id'
        )
        AND c.table_name NOT IN ('team_members', 'admin_audit_log')
      ORDER BY c.table_name
    LOOP
      EXECUTE format('DELETE FROM public.%I WHERE user_id = ANY($1)', rec.table_name)
        USING v_solo_user_ids;
      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
      IF v_deleted_count > 0 THEN
        v_stats := v_stats || jsonb_build_object(rec.table_name, v_deleted_count);
      END IF;
    END LOOP;
  END IF;

  -- ── 5. team_members → teams → accounts in FK-Reihenfolge ──
  IF array_length(v_team_ids, 1) > 0 THEN
    DELETE FROM public.team_members WHERE team_id = ANY(v_team_ids);
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    v_stats := v_stats || jsonb_build_object('team_members', v_deleted_count);

    DELETE FROM public.teams WHERE id = ANY(v_team_ids);
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    v_stats := v_stats || jsonb_build_object('teams', v_deleted_count);
  END IF;

  DELETE FROM public.accounts WHERE id = p_account_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_stats := v_stats || jsonb_build_object('accounts', v_deleted_count);

  -- ── 6. Auth-Identity-Opt-In (profiles + auth.users + Storage) ──
  -- Default: 'kept' — User behält Login-Möglichkeit für künftige
  -- Re-Onboardings. Account-Daten sind komplett weg, aber Identity bleibt.
  -- Storage-Files bleiben ebenfalls (sonst startet Re-Onboarding mit
  -- leerer Knowledge-Base).
  --
  -- Bei p_delete_auth_user=true: Hard-Delete (DSGVO-Right-to-be-Forgotten).
  -- ⚠ Nur Solo-User werden gelöscht — Multi-Account-User behalten Identity
  -- in jedem Fall, weil sie noch in anderen Accounts aktiv sind.
  IF p_delete_auth_user AND array_length(v_solo_user_ids, 1) > 0 THEN
    -- Storage-Cleanup (path-basiert, Sicherheitsventil mit target+deleted)
    -- Path-Pattern: <bucket>/<user_id>/<filename> (verifiziert für
    -- 'knowledge-files' auf Staging 2026-05-02). UUID-Regex-Guard
    -- verhindert Cast-Crash bei nicht-UUID-Path-Tokens.
    SELECT count(*) INTO v_storage_target_count
    FROM storage.objects
    WHERE bucket_id = 'knowledge-files'
      AND array_length(path_tokens, 1) >= 2
      AND path_tokens[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND path_tokens[2]::uuid = ANY(v_solo_user_ids);
    v_stats := v_stats || jsonb_build_object('storage_files_target_count', v_storage_target_count);

    DELETE FROM storage.objects
    WHERE bucket_id = 'knowledge-files'
      AND array_length(path_tokens, 1) >= 2
      AND path_tokens[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND path_tokens[2]::uuid = ANY(v_solo_user_ids);
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    v_stats := v_stats || jsonb_build_object('storage_files_deleted', v_deleted_count);

    -- profiles + auth.users
    DELETE FROM public.profiles WHERE id = ANY(v_solo_user_ids);
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    v_stats := v_stats || jsonb_build_object('profiles', v_deleted_count);

    DELETE FROM auth.users WHERE id = ANY(v_solo_user_ids);
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    v_stats := v_stats || jsonb_build_object('auth_users', v_deleted_count);

    v_auth_handling := 'deleted';
  ELSE
    v_auth_handling := 'kept';
  END IF;

  -- Multi-Account-Stats für Transparenz
  v_stats := v_stats || jsonb_build_object(
    'multi_account_users_kept',
    COALESCE(array_length(v_member_ids, 1), 0)
      - COALESCE(array_length(v_solo_user_ids, 1), 0)
  );
  v_stats := v_stats || jsonb_build_object('auth_user_handling', v_auth_handling);

  -- ── 7. Audit-Eintrag mit vollen Stats ──
  -- target_id verweist auf die soeben gelöschte Account-Row (kein FK
  -- auf accounts, daher kein Constraint-Problem).
  -- before_value = Account-Name (zur Identifizierung im Audit-Log)
  -- after_value  = vollständige Lösch-Statistik (jsonb mit pro-Tabelle
  --                Counts + auth_user_handling + multi_account_users_kept
  --                + storage_files_target_count + storage_files_deleted)
  INSERT INTO public.admin_audit_log (
    admin_user_id, action, target_table, target_id,
    field_name, before_value, after_value, reason
  ) VALUES (
    v_admin_id, 'delete', 'accounts', p_account_id,
    NULL, to_jsonb(v_account_name), v_stats, trim(p_reason)
  );

  RETURN jsonb_build_object(
    'account_id',         p_account_id,
    'account_name',       v_account_name,
    'team_ids',           v_team_ids,
    'solo_user_ids',      v_solo_user_ids,
    'auth_user_handling', v_auth_handling,
    'stats',              v_stats
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_account_delete(uuid, text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_account_delete(uuid, text, boolean) TO authenticated;

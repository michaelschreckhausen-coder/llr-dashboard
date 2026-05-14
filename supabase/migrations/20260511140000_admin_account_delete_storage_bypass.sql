-- =====================================================================
-- admin_account_delete: Storage-Delete Bypass via set_config
-- =====================================================================
-- Bug-Kontext:
--   Direct DELETE FROM storage.objects wird durch storage.protect_delete
--   Trigger ge-RAISE-d ("Direct deletion from storage tables is not
--   allowed. Use the Storage API instead.").
--
--   Strategy A (storage.delete_object SECURITY-DEFINER-Helper): NICHT
--   verfügbar — auf Hetzner-Prod existiert kein solcher Helper.
--   Strategy B (Edge-Function-Bridge): viel Aufwand.
--   Strategy C (DIESE Migration): nutzt den Bypass-Mechanism der im
--   Trigger explizit eingebaut ist — `current_setting('storage.allow_
--   delete_query')`. Wenn auf 'true' gesetzt, lässt der Trigger den
--   DELETE durch. Storage-API setzt diese Setting selbst für ihre
--   internen DELETEs.
--
--   set_config(..., true) = transaction-local — keine Persistence,
--   wird beim Transaktions-Ende automatisch verworfen. Verify auf
--   Hetzner-Prod: postgres-non-superuser darf set_config setzen ✓
--
-- Verändert nur den storage-DELETE-Block (Z. 217 im prior Body). Rest
-- der Function unverändert. Alle anderen Stats/Audit-Logik bleibt.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_account_delete(
  p_account_id        uuid,
  p_reason            text,
  p_delete_auth_user  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'storage', 'pg_temp'
AS $function$
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
  IF p_delete_auth_user AND array_length(v_solo_user_ids, 1) > 0 THEN
    -- Storage-Cleanup (path-basiert, Sicherheitsventil mit target+deleted)
    SELECT count(*) INTO v_storage_target_count
    FROM storage.objects
    WHERE bucket_id = 'knowledge-files'
      AND array_length(path_tokens, 1) >= 2
      AND path_tokens[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND path_tokens[2]::uuid = ANY(v_solo_user_ids);
    v_stats := v_stats || jsonb_build_object('storage_files_target_count', v_storage_target_count);

    -- ★ STRATEGY C: Trigger-Bypass via set_config (transaction-local).
    --   storage.protect_delete prüft current_setting('storage.allow_
    --   delete_query'). Wenn 'true' → DELETE darf durch. Setting
    --   wird mit dem dritten Arg = true an die Transaktion gebunden,
    --   keine Persistence nach Function-Ende.
    PERFORM set_config('storage.allow_delete_query', 'true', true);

    DELETE FROM storage.objects
    WHERE bucket_id = 'knowledge-files'
      AND array_length(path_tokens, 1) >= 2
      AND path_tokens[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND path_tokens[2]::uuid = ANY(v_solo_user_ids);
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    v_stats := v_stats || jsonb_build_object('storage_files_deleted', v_deleted_count);

    -- Warning bei target>0 && deleted=0 (Bypass hat versagt — z.B.
    -- wenn Supabase die Setting-Bypass-Mechanik künftig deaktiviert).
    IF v_storage_target_count > 0 AND v_deleted_count = 0 THEN
      v_stats := v_stats || jsonb_build_object('storage_files_warning', 'bypass_failed');
    END IF;

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
$function$;

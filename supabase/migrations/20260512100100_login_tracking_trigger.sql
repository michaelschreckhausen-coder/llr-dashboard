-- =============================================================================
-- User Activity Tracking — Login-Trigger (Phase A)
-- =============================================================================
-- Trigger auf auth.users.last_sign_in_at: bei Login → user_login_log Eintrag
-- mit Snapshot der active_team/account aus user_preferences (Frontend-context).
--
-- profiles.account_id/team_id existieren in dieser Codebase NICHT — Multi-Tenant
-- läuft über team_members + user_preferences.active_team_id (siehe CLAUDE.md
-- Accounts/Teams-Refactor Phase 1+2+3). Snapshot-Pfad:
--   user_preferences.active_team_id → teams.account_id
--
-- Failure-Mode: EXCEPTION WHEN OTHERS mit RAISE WARNING (sichtbar in Postgres-
-- Logs) plus NULL-Fallback — Trigger MUSS unter allen Umständen durchgehen,
-- Login darf nicht failen.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.log_user_login()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_team_id    uuid;
  v_account_id uuid;
BEGIN
  -- Nur bei echtem Login-Event (last_sign_in_at hat sich geändert UND ist nicht NULL).
  -- IS DISTINCT FROM behandelt NULL korrekt: erster Login (OLD=NULL → NEW=value)
  -- löst korrekt aus.
  IF NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at
     AND NEW.last_sign_in_at IS NOT NULL THEN

    -- Snapshot via user_preferences.active_team_id + transitiver teams-JOIN.
    -- LEFT JOIN damit team_id ohne matching teams-row trotzdem ankommt.
    -- INTO (nicht INTO STRICT) → falls 0 rows, vars bleiben NULL ohne Fehler.
    BEGIN
      SELECT up.active_team_id, t.account_id
        INTO v_team_id, v_account_id
        FROM public.user_preferences up
        LEFT JOIN public.teams t ON t.id = up.active_team_id
       WHERE up.user_id = NEW.id
       LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      -- Generischer catch-all (z.B. user_preferences/teams Tabelle fehlt etc.).
      -- RAISE WARNING → in Postgres-Logs sichtbar, aber Trigger swallows.
      RAISE WARNING 'log_user_login: context-lookup failed for user %: % (SQLSTATE: %)',
                    NEW.id, SQLERRM, SQLSTATE;
      v_team_id    := NULL;
      v_account_id := NULL;
    END;

    -- INSERT ist outerhalb der inner-BEGIN — soll auch bei NULL-Snapshot ausgeführt
    -- werden. Eigene Failure-Resistance falls user_login_log selbst kaputt ist.
    BEGIN
      INSERT INTO public.user_login_log (user_id, account_id, team_id, logged_in_at)
      VALUES (NEW.id, v_account_id, v_team_id, NEW.last_sign_in_at);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'log_user_login: insert failed for user %: % (SQLSTATE: %)',
                    NEW.id, SQLERRM, SQLSTATE;
      -- swallow: Login darf nicht failen
    END;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.log_user_login() IS
  'Trigger-Fn: Schreibt bei jedem Login einen Eintrag in user_login_log. '
  'Failure-Resistant — wirft niemals nach oben, RAISE WARNING bei Fehler.';

DROP TRIGGER IF EXISTS log_user_login_trigger ON auth.users;
CREATE TRIGGER log_user_login_trigger
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.log_user_login();

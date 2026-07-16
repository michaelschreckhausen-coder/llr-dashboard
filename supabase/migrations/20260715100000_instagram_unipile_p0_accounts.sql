-- ════════════════════════════════════════════════════════════════════════════
-- 20260715100000_instagram_unipile_p0_accounts.sql
-- Instagram-Modul Rebuild — P0: Unipile-Account-Store für Instagram.
-- ----------------------------------------------------------------------------
-- KONTEXT (Hybrid-Architektur, Konzept docs/instagram-unipile-rebuild-konzept.md):
--   * public.instagram_connections (Growth Suite / Meta Graph) bleibt UNANGETASTET
--     und liefert weiterhin Insights/Demografie + Publishing.
--   * DIESE Tabelle ist der additive zweite Strang: die Unipile-Session für
--     DM-Inbox + Outreach. Zwei Verbindungen pro Team, im UI zusammengeführt.
--
-- WARUM EIGENE TABELLE statt public.unipile_accounts:
--   unipile_accounts hat KEINE provider-Spalte, und _shared/unipile.ts
--   getUnipileConnection() greift die neueste OK-Zeile eines Users OHNE
--   Provider-Filter. Läge ein Instagram-Account dort, würden LinkedIn-Worker
--   (la-runner, unipile-search, unipile-enrich …) eine IG-account_id ziehen
--   → "Account not found"/Fehlverhalten in der gesamten LinkedIn-Automation.
--   Eigener Store = strukturell unmöglich. Kein Eingriff in den LinkedIn-Hotpath.
--
-- Status-Werte spiegeln Unipile (accounts.sources[].status) + IG-Auth-Spezifika:
--   PENDING     — Hosted-Auth-Link erzeugt, noch nicht abgeschlossen
--   CHECKPOINT  — 2FA-Checkpoint offen (Custom-Auth-Pfad, 5-Min-Intent)
--   OK          — Session gültig
--   CREDENTIALS — Session abgelaufen/Passwort geändert → Reconnect nötig
--   ERROR       — sonstiger Fehler
--   DISCONNECTED— getrennt oder von neuerer Session derselben Identität abgelöst
--
-- Self-Host (Hetzner): RLS allein reicht NICHT → explizite GRANTs
-- (Top-Fallstrick #3 + #12: auch service_role braucht explizite Grants).
-- RLS via bestehende public.user_in_team(uuid) (Phase G).
--
-- Vor Apply:
--   * Timestamp-Reihenfolge gegen ~/dev/llr-dashboard prüfen (Julian pusht parallel).
--   * Pre-Flight: select proname from pg_proc where proname='user_in_team';
--                 select 1 from information_schema.tables where table_name='instagram_connections';
--   * psql -v ON_ERROR_STOP=1, User supabase_admin, ZUERST Staging.
-- Idempotent (create table if not exists / drop policy if exists).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ---------------------------------------------------------------------------
-- Unipile-Session pro Team/User (Instagram)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.instagram_unipile_accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id             uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL,          -- Leadesk-User, dem die IG-Session gehört

  unipile_account_id  text NOT NULL,          -- von Unipile vergeben
  provider_id         text,                   -- IG-interne User-ID (für /chats attendees_ids)
  username            text,                   -- @handle
  full_name           text,
  avatar_url          text,

  status              text NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','CHECKPOINT','OK','CREDENTIALS','ERROR','DISCONNECTED')),
  checkpoint_type     text,                   -- z.B. '2FA' (nur im Custom-Auth-Pfad)
  checkpoint_expires_at timestamptz,          -- Unipile-Intent: 5 Minuten

  connected_at        timestamptz DEFAULT now(),
  last_status_update  timestamptz DEFAULT now(),
  last_sync_at        timestamptz,            -- letzter erfolgreicher Chat-Sync (P1)

  raw                 jsonb,                  -- vollständige Unipile-Account-Response
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT instagram_unipile_accounts_account_id_key UNIQUE (unipile_account_id)
);

CREATE INDEX IF NOT EXISTS idx_ig_unipile_accounts_user ON public.instagram_unipile_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_ig_unipile_accounts_team ON public.instagram_unipile_accounts(team_id);

-- Hotpath-Lookup: aktive Session eines Teams (Sync/Inbox/Runner).
CREATE INDEX IF NOT EXISTS idx_ig_unipile_accounts_team_ok
  ON public.instagram_unipile_accounts(team_id, last_status_update DESC)
  WHERE status = 'OK';

-- ---------------------------------------------------------------------------
-- updated_at-Trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_instagram_unipile_accounts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS instagram_unipile_accounts_touch ON public.instagram_unipile_accounts;
CREATE TRIGGER instagram_unipile_accounts_touch
  BEFORE UPDATE ON public.instagram_unipile_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_instagram_unipile_accounts_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — Team-Mandant. Writes ausschließlich über service_role (Edge Functions),
-- daher bewusst NUR eine SELECT-Policy für authenticated (wie unipile_accounts).
-- ---------------------------------------------------------------------------
ALTER TABLE public.instagram_unipile_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ig_unipile_accounts_team_select ON public.instagram_unipile_accounts;
CREATE POLICY ig_unipile_accounts_team_select ON public.instagram_unipile_accounts
  FOR SELECT TO authenticated USING (public.user_in_team(team_id));

-- Self-Host: explizite Grants (RLS gewährt keine Tabellen-Privilegien).
-- authenticated: nur SELECT — kein Client-Write-Pfad auf Session-Daten.
GRANT SELECT ON public.instagram_unipile_accounts TO authenticated;
GRANT ALL    ON public.instagram_unipile_accounts TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

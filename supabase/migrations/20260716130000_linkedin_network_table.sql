-- ════════════════════════════════════════════════════════════════
-- 20260716130000_linkedin_network_table.sql
-- public.linkedin_network — das importierte LinkedIn-Netzwerk (1st-degree)
-- als EIGENE Schicht, getrennt von der Triage-Inbox.
-- ----------------------------------------------------------------------------
-- Problem: import-unipile-relations schrieb das komplette Netzwerk jedes
-- verbundenen Unipile-Accounts nach linkedin_inbox (review_status='new').
-- Die Inbox ist aber eine TRIAGE-Schicht — Dinge, die der User bewerten soll.
-- Das eigene Netzwerk ist kein Triage-Material, es ist ein Nachschlagewerk.
-- Folge: Inboxen aller Unipile-Teams mit hunderten ungefragten Rows geflutet.
--
-- Lösung: eigene Tabelle + eigener Menüpunkt „Netzwerk". Kein review_status,
-- kein promote-Pfad, kein Outreach-FK — bewusst schlank. Wer aus dem Netzwerk
-- ins CRM will, geht über den bestehenden Inbox-/Lead-Pfad.
--
-- Kein FK auf teams(id): linkedin_inbox macht es genauso (team_id uuid NOT NULL,
-- ohne REFERENCES) — Konvention beibehalten statt hier abzuweichen.
--
-- Self-Host (Hetzner): RLS allein reicht nicht → explizite GRANTs
-- (Top-Fallstrick #3). RLS via bestehende public.user_in_team(uuid) (Phase G).
--
-- Vor Apply:
--   * Pre-Flight: SELECT proname FROM pg_proc WHERE proname='user_in_team';
--   * psql -v ON_ERROR_STOP=1, User supabase_admin, zuerst Staging.
-- Idempotent.
-- ════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.linkedin_network (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id            uuid NOT NULL,
  user_id            uuid,

  -- Welcher verbundene LinkedIn-Account dieses Netzwerk gehört.
  -- Ein Team kann mehrere Accounts haben → Netzwerke bleiben unterscheidbar.
  unipile_account_id text,

  -- Identität / Dedup
  provider_id        text,   -- ACoAA… — der stabile Arbiter bei Relations
  linkedin_url       text,   -- Fallback-Arbiter ohne provider_id
  public_id          text,   -- /in/<public_id>

  -- Profildaten (Relations liefern nur einen Teil; Rest kann später anreichern)
  name               text,
  first_name         text,
  last_name          text,
  headline           text,
  job_title          text,
  company            text,
  location           text,
  avatar_url         text,
  li_about_summary   text,

  source             text NOT NULL DEFAULT 'unipile_relations',

  raw                jsonb,
  imported_at        timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- Jeder Sync-Lauf berührt last_seen_at. Wer nicht mehr auftaucht, ist raus
  -- aus dem Netzwerk (entfernt/entfolgt) → später als Signal auswertbar.
  last_seen_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Dedup-Indizes (Arbiter-Präzedenz wie in linkedin_inbox: provider_id first)
CREATE UNIQUE INDEX IF NOT EXISTS linkedin_network_team_provider_uniq
  ON public.linkedin_network (team_id, provider_id)
  WHERE provider_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS linkedin_network_team_url_uniq
  ON public.linkedin_network (team_id, linkedin_url)
  WHERE linkedin_url IS NOT NULL AND provider_id IS NULL;

-- Listing pro Team (Default-Sort: zuletzt importiert)
CREATE INDEX IF NOT EXISTS linkedin_network_team_idx
  ON public.linkedin_network (team_id, imported_at DESC);

-- Freitext-Suche über Name/Company/Headline
CREATE INDEX IF NOT EXISTS linkedin_network_team_name_idx
  ON public.linkedin_network (team_id, lower(name));

-- ── updated_at-Trigger
CREATE OR REPLACE FUNCTION public.touch_linkedin_network_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS linkedin_network_touch ON public.linkedin_network;
CREATE TRIGGER linkedin_network_touch
  BEFORE UPDATE ON public.linkedin_network
  FOR EACH ROW EXECUTE FUNCTION public.touch_linkedin_network_updated_at();

-- ── RLS — Team-Mandant
ALTER TABLE public.linkedin_network ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS linkedin_network_select ON public.linkedin_network;
CREATE POLICY linkedin_network_select ON public.linkedin_network
  FOR SELECT USING (public.user_in_team(team_id));

DROP POLICY IF EXISTS linkedin_network_modify ON public.linkedin_network;
CREATE POLICY linkedin_network_modify ON public.linkedin_network
  FOR ALL USING (public.user_in_team(team_id))
          WITH CHECK (public.user_in_team(team_id));

-- Self-Host: explizite Grants (RLS gewährt keine Tabellen-Privilegien).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.linkedin_network TO authenticated;
GRANT ALL ON public.linkedin_network TO service_role;
-- Top-Fallstrick #3: Cross-Table-Subquery in user_in_team braucht Grants.
GRANT SELECT ON public.team_members TO authenticated;
GRANT SELECT ON public.teams        TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

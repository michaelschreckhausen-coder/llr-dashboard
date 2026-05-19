-- 20260518140000_marketplace_phase_0.sql
--
-- Marketplace Phase 0 — Katalog-Schema + Waitlist (ohne Stripe-Touch).
--
-- Drei Tabellen:
--   addons              — Katalog (Leadesk-intern, alle authenticated lesen)
--   account_addons      — aktive Subscriptions pro Account (Webhook-Schreibpfad
--                         in Phase 2, hier nur Schema + RLS)
--   marketplace_waitlist — User-Signal-Sammlung vor Stripe-Launch
--
-- Vier RPCs:
--   i_have_addon(slug)         — boolean, analog i_have_module
--   get_my_addons()            — alle aktiven Add-ons des aktuellen Accounts
--   join_addon_waitlist(slug)  — idempotent: enrolled | already_listed | already_active
--   get_my_waitlist()          — Waitlist-Einträge des Users
--
-- Drei Seed-Stubs:
--   ai-boost              ai_quota         19 €
--   slack-integration     integration       9 €
--   sales-nav-sync        feature_unlock   29 €
-- Alle mit stripe_price_id=NULL → Frontend rendert Waitlist-Button.
--
-- Top-Fallstrick #12 berücksichtigt: explizite Grants für service_role
-- (Webhook-Schreibpfad in Phase 2 wird sonst stille permission-deny bekommen).
--
-- Workflow:
--   1. Auf Hetzner-Staging applien:
--        ssh root@178.104.210.216 'docker exec -i supabase-db psql -U postgres -d postgres' \
--          < supabase/migrations/20260518140000_marketplace_phase_0.sql
--   2. NOTIFY pgrst, 'reload schema'
--   3. Smoke: SELECT slug, name, price_monthly_cents FROM addons;  -- 3 Rows
--   4. Erst nach Bestätigung: gleicher Apply auf Prod (128.140.123.163).

BEGIN;

-- ─── Tabelle 1: addons (Katalog) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.addons (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                 text NOT NULL UNIQUE,
  name                 text NOT NULL,
  short_description    text,
  long_description     text,
  category             text NOT NULL,
  type                 text NOT NULL CHECK (type IN ('feature_unlock', 'integration', 'ai_quota')),

  -- Pricing
  price_monthly_cents  integer NOT NULL CHECK (price_monthly_cents >= 0),
  currency             text NOT NULL DEFAULT 'EUR',
  stripe_product_id    text,
  stripe_price_id      text,

  -- Metadata
  icon                 text,
  highlight_color      text,
  features             jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Type-spezifische Konfig
  activates_modules    text[],
  ai_quota_increment   integer,
  integration_config   jsonb,

  -- Visibility
  is_active            boolean NOT NULL DEFAULT true,
  is_featured          boolean NOT NULL DEFAULT false,
  sort_order           integer NOT NULL DEFAULT 0,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_addons_active_sort
  ON public.addons (is_active, sort_order)
  WHERE is_active = true;

-- ─── Tabelle 2: account_addons (aktive Subs) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.account_addons (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                  uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  addon_id                    uuid NOT NULL REFERENCES public.addons(id)   ON DELETE RESTRICT,
  status                      text NOT NULL CHECK (status IN ('active','past_due','canceled','paused','pending')),

  stripe_subscription_id      text,
  stripe_subscription_item_id text,

  activated_at                timestamptz NOT NULL DEFAULT now(),
  canceled_at                 timestamptz,
  current_period_end          timestamptz,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (account_id, addon_id)
);

CREATE INDEX IF NOT EXISTS idx_account_addons_status
  ON public.account_addons (account_id, status)
  WHERE status = 'active';

-- ─── Tabelle 3: marketplace_waitlist ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketplace_waitlist (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  addon_id    uuid NOT NULL REFERENCES public.addons(id)   ON DELETE CASCADE,
  notified_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, addon_id)
);

CREATE INDEX IF NOT EXISTS idx_waitlist_addon_unnotified
  ON public.marketplace_waitlist (addon_id)
  WHERE notified_at IS NULL;

-- ─── RLS aktivieren ───────────────────────────────────────────────────────
ALTER TABLE public.addons               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_addons       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_waitlist ENABLE ROW LEVEL SECURITY;

-- addons: alle authenticated lesen (öffentlicher Katalog), nur is_leadesk_admin schreiben
DROP POLICY IF EXISTS "addons_read_authenticated"   ON public.addons;
DROP POLICY IF EXISTS "addons_write_leadesk_admin"  ON public.addons;
CREATE POLICY "addons_read_authenticated" ON public.addons
  FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "addons_write_leadesk_admin" ON public.addons
  FOR ALL TO authenticated
  USING (COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false))
  WITH CHECK (COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false));

-- account_addons: read/write nur für eigene Accounts (account_id ∈ user's teams)
DROP POLICY IF EXISTS "account_addons_own" ON public.account_addons;
CREATE POLICY "account_addons_own" ON public.account_addons
  FOR ALL TO authenticated
  USING (
    account_id IN (
      SELECT t.account_id FROM public.teams t
      JOIN public.team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    account_id IN (
      SELECT t.account_id FROM public.teams t
      JOIN public.team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = auth.uid()
    )
  );

-- marketplace_waitlist: gleiches Pattern
DROP POLICY IF EXISTS "waitlist_own" ON public.marketplace_waitlist;
CREATE POLICY "waitlist_own" ON public.marketplace_waitlist
  FOR ALL TO authenticated
  USING (
    account_id IN (
      SELECT t.account_id FROM public.teams t
      JOIN public.team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    account_id IN (
      SELECT t.account_id FROM public.teams t
      JOIN public.team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = auth.uid()
    )
  );

-- ─── Grants (Top-Fallstrick #12 berücksichtigt) ───────────────────────────
GRANT SELECT ON public.addons TO authenticated;
GRANT ALL    ON public.account_addons       TO authenticated;
GRANT ALL    ON public.marketplace_waitlist TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.addons               TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_addons       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_waitlist TO service_role;

-- Cross-Table-RLS-Subquery braucht GRANT auf teams + team_members
-- (sind via vorherigen Hotfix-Migrationen vermutlich schon gegeben, idempotent
-- nochmal sicherstellen):
GRANT SELECT ON public.teams        TO authenticated;
GRANT SELECT ON public.team_members TO authenticated;

-- ─── RPC: i_have_addon ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.i_have_addon(p_slug text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
  v_count integer;
BEGIN
  SELECT t.account_id INTO v_account_id
  FROM public.teams t
  JOIN public.team_members tm ON tm.team_id = t.id
  WHERE tm.user_id = auth.uid()
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.account_addons aa
  JOIN public.addons a ON a.id = aa.addon_id
  WHERE aa.account_id = v_account_id
    AND a.slug = p_slug
    AND aa.status = 'active';

  RETURN v_count > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.i_have_addon(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.i_have_addon(text) TO authenticated;

-- ─── RPC: get_my_addons ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_addons()
RETURNS TABLE (
  addon_id      uuid,
  slug          text,
  name          text,
  category      text,
  type          text,
  status        text,
  activated_at  timestamptz,
  current_period_end timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
BEGIN
  SELECT t.account_id INTO v_account_id
  FROM public.teams t
  JOIN public.team_members tm ON tm.team_id = t.id
  WHERE tm.user_id = auth.uid()
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT a.id, a.slug, a.name, a.category, a.type,
         aa.status, aa.activated_at, aa.current_period_end
  FROM public.account_addons aa
  JOIN public.addons a ON a.id = aa.addon_id
  WHERE aa.account_id = v_account_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_addons() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_addons() TO authenticated;

-- ─── RPC: join_addon_waitlist ─────────────────────────────────────────────
-- Returns: 'enrolled' | 'already_listed' | 'already_active' | 'addon_not_found'
CREATE OR REPLACE FUNCTION public.join_addon_waitlist(p_addon_slug text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
  v_addon_id   uuid;
  v_existing   integer;
BEGIN
  SELECT t.account_id INTO v_account_id
  FROM public.teams t
  JOIN public.team_members tm ON tm.team_id = t.id
  WHERE tm.user_id = auth.uid()
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'No account context for user';
  END IF;

  SELECT id INTO v_addon_id FROM public.addons WHERE slug = p_addon_slug AND is_active = true;
  IF v_addon_id IS NULL THEN
    RETURN 'addon_not_found';
  END IF;

  -- Bereits aktive Subscription? (Phase-2-Idempotenz)
  SELECT count(*) INTO v_existing
  FROM public.account_addons
  WHERE account_id = v_account_id AND addon_id = v_addon_id AND status = 'active';
  IF v_existing > 0 THEN
    RETURN 'already_active';
  END IF;

  -- Bereits auf Warteliste?
  SELECT count(*) INTO v_existing
  FROM public.marketplace_waitlist
  WHERE account_id = v_account_id AND addon_id = v_addon_id;
  IF v_existing > 0 THEN
    RETURN 'already_listed';
  END IF;

  INSERT INTO public.marketplace_waitlist (account_id, addon_id)
  VALUES (v_account_id, v_addon_id);

  RETURN 'enrolled';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_addon_waitlist(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_addon_waitlist(text) TO authenticated;

-- ─── RPC: get_my_waitlist ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_waitlist()
RETURNS TABLE (
  addon_id     uuid,
  slug         text,
  name         text,
  created_at   timestamptz,
  notified_at  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
BEGIN
  SELECT t.account_id INTO v_account_id
  FROM public.teams t
  JOIN public.team_members tm ON tm.team_id = t.id
  WHERE tm.user_id = auth.uid()
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT a.id, a.slug, a.name, w.created_at, w.notified_at
  FROM public.marketplace_waitlist w
  JOIN public.addons a ON a.id = w.addon_id
  WHERE w.account_id = v_account_id
  ORDER BY w.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_waitlist() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_waitlist() TO authenticated;

-- ─── Seed: 3 Stub-Add-ons ─────────────────────────────────────────────────
-- Alle ohne stripe_price_id → Frontend rendert Waitlist-Button.
-- is_featured=true für die "NEU"-Pill in den ersten Launch-Wochen.
INSERT INTO public.addons (
  slug, name, short_description, long_description, category, type,
  price_monthly_cents, currency, icon, highlight_color,
  features, ai_quota_increment, activates_modules, integration_config,
  is_active, is_featured, sort_order
) VALUES
  (
    'ai-boost',
    'AI Boost',
    '+500 KI-Generationen pro Monat',
    'Erweitert dein monatliches Generations-Budget um 500 KI-Antworten — ideal für Teams, die viel mit Multi-Provider-AI arbeiten (LinkedIn-Outreach, Content-Studio, Lead-Anschreiben).',
    'ai',
    'ai_quota',
    1900, 'EUR', 'Sparkles', '#8B5CF6',
    '["+500 KI-Generationen/Monat","Provider-agnostisch (Anthropic/OpenAI/Google/Mistral)","Restmenge sichtbar in der Konto-Übersicht"]'::jsonb,
    500, NULL, NULL,
    true, true, 10
  ),
  (
    'slack-integration',
    'Slack-Integration',
    'Lead- und Deal-Benachrichtigungen in Slack',
    'Verbindet deinen Slack-Workspace mit Leadesk. Neue Leads, Status-Wechsel und Deal-Updates landen automatisch im konfigurierten Slack-Kanal — kein Tab-Wechsel mehr für dein Team.',
    'integration',
    'integration',
    900, 'EUR', 'MessageSquare', '#4A154B',
    '["Neue Leads in Slack-Kanal","Status-Updates auf Deals","Konfigurierbare Filter (z.B. nur SQL-Leads)","OAuth-Login mit deinem Workspace"]'::jsonb,
    NULL, NULL,
    '{"provider":"slack","oauth_scopes":["chat:write","channels:read"]}'::jsonb,
    true, true, 20
  ),
  (
    'sales-nav-sync',
    'Sales-Navigator-Sync',
    'LinkedIn Sales Navigator Listen synchronisieren',
    'Importiert deine Sales-Navigator-Lead-Listen automatisch nach Leadesk — inklusive Daily-Sync, sodass Änderungen in SalesNav direkt im CRM landen. Setzt einen aktiven Sales-Navigator-Account voraus.',
    'feature',
    'feature_unlock',
    2900, 'EUR', 'Workflow', '#0A66C2',
    '["Lead-Listen-Import aus SalesNav","Daily-Auto-Sync","Saved-Search-Trigger","Bulk-Lead-Enrichment"]'::jsonb,
    NULL,
    ARRAY['linkedin','crm']::text[],
    NULL,
    true, true, 30
  )
ON CONFLICT (slug) DO NOTHING;

COMMIT;

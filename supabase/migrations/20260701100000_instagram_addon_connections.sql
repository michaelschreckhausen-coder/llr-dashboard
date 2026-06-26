-- ============================================================================
-- Instagram-Funktionsblock — Inkrement 1 (Connect + Analytics)
-- ----------------------------------------------------------------------------
-- 1) Marktplatz-Addon 'instagram' (Free-Preview: stripe_price_id NULL ->
--    activate_addon erlaubt kostenlose Aktivierung). activates_modules =
--    {instagram} -> get_my_entitlements merged das Modul automatisch in
--    modules[] (kein RPC-Eingriff noetig, siehe 20260616140100).
-- 2) Tabelle public.instagram_connections — Mapping team_id <-> ig_account_id
--    des zentralen Growth-Suite-Tenants (Master-Key-Modell). UNIQUE(ig_account_id)
--    verhindert Doppel-Claim ueber Teams hinweg.
--
-- Self-Host (Hetzner): RLS allein reicht nicht -> explizite GRANTs (Top-
-- Fallstrick #3 / Memory feedback_new_table_needs_grant_selfhost).
-- RLS via bestehende public.user_in_team(uuid) (Phase G).
--
-- Vor Apply:
--   * Timestamp-Reihenfolge gegen ~/dev/llr-dashboard pruefen (Julian pusht parallel).
--   * Pre-Flight: select proname from pg_proc where proname='user_in_team';
--                 select slug from public.addons where slug='instagram';
--   * psql -v ON_ERROR_STOP=1, User supabase_admin, zuerst Staging.
-- Idempotent (create table if not exists / drop policy if exists / on conflict).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) Mapping-Tabelle: verbundenes IG-Konto pro Team
-- ---------------------------------------------------------------------------
create table if not exists public.instagram_connections (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null,
  ig_account_id text not null,
  username      text,
  account_type  text,
  status        text not null default 'connected'
                check (status in ('pending','connected','expired','disconnected')),
  connected_at  timestamptz,
  raw           jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Ein IG-Konto kann nur einem Team gehoeren (Cross-Tenant-Claim-Schutz).
create unique index if not exists uq_instagram_connections_ig_account
  on public.instagram_connections(ig_account_id);

create index if not exists idx_instagram_connections_team
  on public.instagram_connections(team_id);

-- ---------------------------------------------------------------------------
-- RLS — Team-Mandant (bestehende public.user_in_team)
-- ---------------------------------------------------------------------------
alter table public.instagram_connections enable row level security;

drop policy if exists ic_select on public.instagram_connections;
create policy ic_select on public.instagram_connections
  for select using (public.user_in_team(team_id));

drop policy if exists ic_modify on public.instagram_connections;
create policy ic_modify on public.instagram_connections
  for all using (public.user_in_team(team_id))
            with check (public.user_in_team(team_id));

-- Self-Host: explizite Grants (RLS allein gewaehrt keine Tabellen-Privilegien).
grant select, insert, update, delete on public.instagram_connections to authenticated;
grant all on public.instagram_connections to service_role;

-- ---------------------------------------------------------------------------
-- 2) Marktplatz-Addon-Seed (Free-Preview: kein stripe_price_id)
-- ---------------------------------------------------------------------------
insert into public.addons (
  slug, name, short_description, long_description,
  category, type, price_monthly_cents, currency,
  activates_modules, is_active, is_featured, sort_order
)
values (
  'instagram',
  'Instagram',
  'Instagram-Analysen (Follower, Reichweite, Posts, Demografie) und Veroeffentlichung direkt aus dem Redaktionsplan.',
  'Instagram-Funktionsblock fuer Leadesk: verbinde dein Instagram-Konto, sieh Insights (Follower-/Reichweiten-Entwicklung, Post-Performance, Zielgruppen-Demografie) und veroeffentliche Beitraege direkt aus dem Redaktionsplan. Waehrend der Preview kostenlos aktivierbar.',
  'integration',
  'integration',
  2900,
  'EUR',
  array['instagram'],
  true,
  true,
  60
)
on conflict (slug) do update
  set activates_modules = excluded.activates_modules,
      is_active         = true,
      type              = excluded.type,
      name              = excluded.name,
      short_description = excluded.short_description,
      long_description  = excluded.long_description;

commit;

notify pgrst, 'reload schema';

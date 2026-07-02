-- =====================================================================
-- Asana-Integration — Phase 0: Schema, RLS, Vault-Helper
-- Repo-Ziel: llr-dashboard/supabase/migrations/
-- Stand: 2026-07-02
--
-- HINWEIS ZUR RLS-KONVENTION:
--   Die Policies unten nutzen als Team-Zugehörigkeits-Prädikat
--   `asana_is_team_member(team_id)`. Diese Funktion kappselt die im
--   Repo bereits etablierte Logik (z. B. Lookup in `team_members`
--   oder `profiles.team_id`). BITTE den Funktionsrumpf an die
--   bestehende Konvention anpassen (siehe Kommentar an der Funktion).
-- =====================================================================

-- Vault ist auf dem self-hosted Stack als Extension verfügbar.
create extension if not exists supabase_vault cascade;

-- ---------------------------------------------------------------------
-- 0. Team-Zugehörigkeit — zentrale Helper-Funktion
--    >>> AN BESTEHENDE RLS-KONVENTION ANPASSEN <<<
-- ---------------------------------------------------------------------
create or replace function public.asana_is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- TODO: An die im Projekt vorhandene Team-Mitgliedschafts-Logik anpassen.
  -- Beispiel-Varianten (eine aktivieren):
  --   (a) dediziertes team_members-Table:
  select exists (
    select 1
    from team_members tm
    where tm.team_id = p_team_id
      and tm.user_id = auth.uid()
  );
  --   (b) profiles.team_id:
  -- select exists (
  --   select 1 from profiles p
  --   where p.id = auth.uid() and p.team_id = p_team_id
  -- );
$$;

-- =====================================================================
-- 1. Verbindung pro Team (Tokens verschlüsselt via Vault)
-- =====================================================================
create table if not exists public.asana_connections (
  id                  uuid primary key default gen_random_uuid(),
  team_id             uuid not null references public.teams(id) on delete cascade,
  asana_workspace_gid text not null,
  asana_user_gid      text not null,             -- verbindender Asana-User
  access_token_id     uuid not null,             -- FK -> vault.secrets.id
  refresh_token_id    uuid not null,             -- FK -> vault.secrets.id
  access_expires_at   timestamptz not null,
  scopes              text[] not null default '{}',
  connected_by        uuid not null references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (team_id)                               -- eine Verbindung pro Team (v1)
);

-- =====================================================================
-- 2. User-Mapping (Leadesk-User <-> Asana-User)
-- =====================================================================
create table if not exists public.asana_user_links (
  team_id         uuid not null references public.teams(id) on delete cascade,
  leadesk_user_id uuid not null references public.profiles(id),
  asana_user_gid  text not null,
  asana_email     text,
  created_at      timestamptz not null default now(),
  primary key (team_id, leadesk_user_id)
);

-- =====================================================================
-- 3. Projekt-Verknüpfung
-- =====================================================================
create table if not exists public.asana_project_links (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid not null references public.teams(id) on delete cascade,
  leadesk_project_id uuid not null,
  asana_project_gid  text not null,
  sync_direction     text not null default 'bidirectional'
                       check (sync_direction in ('push','pull','bidirectional')),
  sync_enabled       boolean not null default true,
  last_full_sync_at  timestamptz,
  events_sync_token  text,                        -- Fallback-Polling via /events
  created_at         timestamptz not null default now(),
  unique (team_id, leadesk_project_id)
);

-- =====================================================================
-- 4. Section/Status-Mapping
-- =====================================================================
create table if not exists public.asana_section_links (
  team_id           uuid not null references public.teams(id) on delete cascade,
  project_link_id   uuid not null references public.asana_project_links(id) on delete cascade,
  leadesk_status    text not null,               -- Spaltenname/Status-Key
  asana_section_gid text not null,
  primary key (project_link_id, leadesk_status)
);

-- =====================================================================
-- 5. Task-/Entity-Verknüpfung (Task, Deal, Kontakt)
-- =====================================================================
create table if not exists public.asana_task_links (
  id               uuid primary key default gen_random_uuid(),
  team_id          uuid not null references public.teams(id) on delete cascade,
  entity_type      text not null check (entity_type in ('task','deal','contact')),
  entity_id        uuid not null,
  asana_task_gid   text not null,
  last_pushed_hash text,                          -- Loop-/Echo-Vermeidung
  last_pulled_at   timestamptz,
  updated_at       timestamptz not null default now(),
  unique (team_id, entity_type, entity_id),
  unique (team_id, asana_task_gid)
);

-- =====================================================================
-- 6. Webhook-Registrierung
-- =====================================================================
create table if not exists public.asana_webhooks (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references public.teams(id) on delete cascade,
  resource_gid      text not null,               -- bewachtes Asana-Projekt
  asana_webhook_gid text,                          -- nach Handshake
  hook_secret_id    uuid not null,               -- FK -> vault.secrets.id
  active            boolean not null default false,
  last_success_at   timestamptz,
  created_at        timestamptz not null default now(),
  unique (team_id, resource_gid)
);

-- =====================================================================
-- 7. Change-Queue (beide Richtungen)
-- =====================================================================
create table if not exists public.asana_sync_outbox (
  id              bigserial primary key,
  team_id         uuid not null references public.teams(id) on delete cascade,
  direction       text not null check (direction in ('push','pull')),
  entity_type     text not null,
  entity_id       uuid,
  asana_gid       text,
  operation       text not null
                    check (operation in ('create','update','delete','move','comment')),
  payload         jsonb not null default '{}',
  status          text not null default 'pending'
                    check (status in ('pending','processing','done','error')),
  attempts        int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_asana_outbox_ready
  on public.asana_sync_outbox (status, next_attempt_at);

-- =====================================================================
-- 8. Kurzlebige OAuth-States (PKCE) — Implementierungsdetail
--    Einträge werden nach Callback gelöscht bzw. laufen nach 15 min ab.
-- =====================================================================
create table if not exists public.asana_oauth_states (
  state         text primary key,
  team_id       uuid not null references public.teams(id) on delete cascade,
  code_verifier text not null,
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '15 minutes')
);
create index if not exists idx_asana_oauth_states_expiry
  on public.asana_oauth_states (expires_at);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.asana_connections    enable row level security;
alter table public.asana_user_links      enable row level security;
alter table public.asana_project_links   enable row level security;
alter table public.asana_section_links   enable row level security;
alter table public.asana_task_links      enable row level security;
alter table public.asana_webhooks        enable row level security;
alter table public.asana_sync_outbox     enable row level security;
alter table public.asana_oauth_states    enable row level security;

-- Lesezugriff für Team-Mitglieder auf die für das Frontend relevanten Tabellen.
-- Schreibzugriff bleibt der Service-Role / SECURITY-DEFINER-Funktionen vorbehalten
-- (kein INSERT/UPDATE/DELETE-Policy für authenticated => nur service_role schreibt).

create policy asana_connections_select on public.asana_connections
  for select to authenticated
  using (public.asana_is_team_member(team_id));

create policy asana_user_links_select on public.asana_user_links
  for select to authenticated
  using (public.asana_is_team_member(team_id));

create policy asana_project_links_select on public.asana_project_links
  for select to authenticated
  using (public.asana_is_team_member(team_id));

create policy asana_section_links_select on public.asana_section_links
  for select to authenticated
  using (public.asana_is_team_member(team_id));

create policy asana_task_links_select on public.asana_task_links
  for select to authenticated
  using (public.asana_is_team_member(team_id));

create policy asana_webhooks_select on public.asana_webhooks
  for select to authenticated
  using (public.asana_is_team_member(team_id));

-- asana_sync_outbox und asana_oauth_states: bewusst KEINE authenticated-Policy
-- (nur service_role hat Zugriff, das umgeht RLS ohnehin).

-- =====================================================================
-- Vault-Helper — von den Edge Functions per RPC (service_role) genutzt.
-- Klartext-Tokens werden ausschließlich in vault.secrets gespeichert,
-- die Tabellen halten nur die Secret-IDs.
-- =====================================================================

-- Secret anlegen -> gibt die Vault-Secret-ID zurück.
create or replace function public.asana_vault_store(p_secret text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  select vault.create_secret(p_secret, p_name) into v_id;
  return v_id;
end;
$$;

-- Secret aktualisieren (z. B. Token-Refresh).
create or replace function public.asana_vault_update(p_id uuid, p_secret text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  perform vault.update_secret(p_id, p_secret);
end;
$$;

-- Secret entschlüsselt lesen.
create or replace function public.asana_vault_read(p_id uuid)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where id = p_id;
$$;

-- Aufräum-Funktion für abgelaufene OAuth-States (per pg_cron aufrufbar).
create or replace function public.asana_cleanup_oauth_states()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.asana_oauth_states where expires_at < now();
$$;

-- Nur service_role darf die Vault-Helper ausführen.
revoke all on function public.asana_vault_store(text, text)  from public, anon, authenticated;
revoke all on function public.asana_vault_update(uuid, text)  from public, anon, authenticated;
revoke all on function public.asana_vault_read(uuid)          from public, anon, authenticated;
grant execute on function public.asana_vault_store(text, text) to service_role;
grant execute on function public.asana_vault_update(uuid, text) to service_role;
grant execute on function public.asana_vault_read(uuid)         to service_role;

-- =====================================================================
-- Optional (auskommentiert): pg_cron-Jobs
--   Erst aktivieren, wenn die zugehörigen Functions deployed sind.
-- =====================================================================
-- select cron.schedule('asana-token-refresh', '*/15 * * * *',
--   $$ select net.http_post(
--        url := 'https://supabase.leadesk.de/functions/v1/asana-token-refresh',
--        headers := jsonb_build_object('Authorization','Bearer '||current_setting('app.settings.service_role_key'))
--      ) $$);
-- select cron.schedule('asana-oauth-state-cleanup', '*/30 * * * *',
--   $$ select public.asana_cleanup_oauth_states() $$);

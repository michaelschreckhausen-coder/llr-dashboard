-- =====================================================================
-- Public API Foundation
-- Extends api_keys for inbound API-Key auth, adds OAuth2 client-credentials
-- flow, rate limiting and a request log. Team-scoped (team_id) throughout.
--
-- Idempotent. Self-host safe: every new table carries explicit GRANTs.
-- Apply on Staging first, verify, then Prod.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Extend existing api_keys table (do NOT recreate — it already exists)
-- ---------------------------------------------------------------------
alter table public.api_keys
  add column if not exists key_prefix   text,                       -- e.g. "lk_live_ab12" for display
  add column if not exists scopes       jsonb  not null default '[]'::jsonb,
  add column if not exists rate_limit   integer not null default 120, -- requests / minute
  add column if not exists revoked_at   timestamptz,
  add column if not exists created_by   uuid references auth.users(id) on delete set null;

create index if not exists api_keys_key_hash_idx on public.api_keys (key_hash);
create index if not exists api_keys_team_id_idx  on public.api_keys (team_id);

-- ---------------------------------------------------------------------
-- 2. OAuth2 client-credentials support
-- ---------------------------------------------------------------------
create table if not exists public.oauth_clients (
  id                  uuid primary key default gen_random_uuid(),
  team_id             uuid not null references public.teams(id) on delete cascade,
  name                text not null,
  client_id           text not null unique,          -- public: "lk_client_..."
  client_secret_hash  text not null,                 -- sha256(secret)
  scopes              jsonb not null default '[]'::jsonb,
  rate_limit          integer not null default 120,
  revoked_at          timestamptz,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  last_used_at        timestamptz
);
create index if not exists oauth_clients_team_id_idx   on public.oauth_clients (team_id);
create index if not exists oauth_clients_client_id_idx on public.oauth_clients (client_id);

create table if not exists public.oauth_access_tokens (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.oauth_clients(id) on delete cascade,
  team_id      uuid not null references public.teams(id) on delete cascade,
  token_hash   text not null unique,                 -- sha256(access_token)
  scopes       jsonb not null default '[]'::jsonb,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);
create index if not exists oauth_tokens_token_hash_idx on public.oauth_access_tokens (token_hash);
create index if not exists oauth_tokens_expires_idx    on public.oauth_access_tokens (expires_at);

-- ---------------------------------------------------------------------
-- 3. Rate limiting (fixed 60s window) + request log
-- ---------------------------------------------------------------------
create table if not exists public.api_rate_counters (
  credential_id  uuid not null,                      -- api_key.id or oauth_client.id
  window_start   timestamptz not null,               -- truncated to the minute
  count          integer not null default 0,
  primary key (credential_id, window_start)
);

create table if not exists public.api_request_log (
  id             bigint generated always as identity primary key,
  credential_id  uuid,
  credential_kind text,                              -- 'api_key' | 'oauth'
  team_id        uuid,
  method         text,
  path           text,
  status         integer,
  ip             text,
  created_at     timestamptz not null default now()
);
create index if not exists api_request_log_team_idx on public.api_request_log (team_id, created_at desc);
create index if not exists api_request_log_cred_idx on public.api_request_log (credential_id, created_at desc);

-- ---------------------------------------------------------------------
-- 4. Helpers: minting & verification (SECURITY DEFINER)
--    Secrets are only ever returned once, at creation time.
-- ---------------------------------------------------------------------

-- Create an API key for a team the caller belongs to. Returns the plaintext
-- key ONCE. Store only the hash.
create or replace function public.create_api_key(
  p_team_id uuid,
  p_name    text,
  p_scopes  jsonb default '["contacts:read","contacts:write","deals:read","deals:write","companies:read","companies:write","content:read","reports:read"]'::jsonb,
  p_rate_limit integer default 120,
  p_expires_at timestamptz default null
) returns table (id uuid, api_key text, key_prefix text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_full   text;
  v_prefix text;
  v_id     uuid;
begin
  if not exists (
    select 1 from public.team_members tm
    where tm.team_id = p_team_id and tm.user_id = auth.uid()
  ) then
    raise exception 'not a member of team %', p_team_id using errcode = '42501';
  end if;

  v_secret := encode(gen_random_bytes(24), 'hex');       -- 48 hex chars
  v_full   := 'lk_live_' || v_secret;
  v_prefix := left(v_full, 12);                          -- "lk_live_xxxx"

  insert into public.api_keys (team_id, created_by, name, key_hash, key_prefix, scopes, rate_limit, expires_at)
  values (p_team_id, auth.uid(), p_name,
          encode(digest(v_full, 'sha256'), 'hex'),
          v_prefix, p_scopes, p_rate_limit, p_expires_at)
  returning api_keys.id into v_id;

  return query select v_id, v_full, v_prefix;
end;
$$;

-- Revoke a key (soft).
create or replace function public.revoke_api_key(p_key_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.api_keys k
  set revoked_at = now()
  where k.id = p_key_id
    and exists (
      select 1 from public.team_members tm
      where tm.team_id = k.team_id and tm.user_id = auth.uid()
    );
end;
$$;

-- Create an OAuth2 client. Returns client_id + client_secret ONCE.
create or replace function public.create_oauth_client(
  p_team_id uuid,
  p_name    text,
  p_scopes  jsonb default '["contacts:read","deals:read","companies:read","content:read","reports:read"]'::jsonb,
  p_rate_limit integer default 120
) returns table (id uuid, client_id text, client_secret text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id text;
  v_secret    text;
  v_id        uuid;
begin
  if not exists (
    select 1 from public.team_members tm
    where tm.team_id = p_team_id and tm.user_id = auth.uid()
  ) then
    raise exception 'not a member of team %', p_team_id using errcode = '42501';
  end if;

  v_client_id := 'lk_client_' || encode(gen_random_bytes(12), 'hex');
  v_secret    := 'lk_secret_' || encode(gen_random_bytes(24), 'hex');

  insert into public.oauth_clients (team_id, created_by, name, client_id, client_secret_hash, scopes, rate_limit)
  values (p_team_id, auth.uid(), p_name, v_client_id,
          encode(digest(v_secret, 'sha256'), 'hex'), p_scopes, p_rate_limit)
  returning oauth_clients.id into v_id;

  return query select v_id, v_client_id, v_secret;
end;
$$;

-- Atomic fixed-window rate check. Called by the Edge Function (service_role).
-- Returns allowed + remaining for the current minute window.
create or replace function public.api_rate_check(p_credential_id uuid, p_limit integer)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := date_trunc('minute', now());
  v_count  integer;
begin
  insert into public.api_rate_counters (credential_id, window_start, count)
  values (p_credential_id, v_window, 1)
  on conflict (credential_id, window_start)
  do update set count = public.api_rate_counters.count + 1
  returning count into v_count;

  return query select (v_count <= p_limit),
                      greatest(p_limit - v_count, 0),
                      v_window + interval '1 minute';
end;
$$;

-- ---------------------------------------------------------------------
-- 5. RLS  (users manage only their own team's credentials via the app)
-- ---------------------------------------------------------------------
alter table public.api_keys            enable row level security;
alter table public.oauth_clients       enable row level security;
alter table public.oauth_access_tokens enable row level security;

drop policy if exists api_keys_team_select on public.api_keys;
create policy api_keys_team_select on public.api_keys
  for select using (
    team_id in (select tm.team_id from public.team_members tm where tm.user_id = auth.uid())
  );

drop policy if exists oauth_clients_team_select on public.oauth_clients;
create policy oauth_clients_team_select on public.oauth_clients
  for select using (
    team_id in (select tm.team_id from public.team_members tm where tm.user_id = auth.uid())
  );

-- oauth_access_tokens + counters + log: no anon/authenticated access; the
-- Edge Function operates with service_role which bypasses RLS.

-- ---------------------------------------------------------------------
-- 6. GRANTs  (self-host: new tables get no auto-grant)
-- ---------------------------------------------------------------------
grant select on public.api_keys, public.oauth_clients to authenticated;
grant all on
  public.oauth_clients, public.oauth_access_tokens,
  public.api_rate_counters, public.api_request_log, public.api_keys
  to service_role;
grant usage, select on sequence public.api_request_log_id_seq to service_role;

grant execute on function public.create_api_key(uuid, text, jsonb, integer, timestamptz) to authenticated;
grant execute on function public.revoke_api_key(uuid)                                     to authenticated;
grant execute on function public.create_oauth_client(uuid, text, jsonb, integer)          to authenticated;
grant execute on function public.api_rate_check(uuid, integer)                            to service_role;

-- pgcrypto provides gen_random_bytes / digest
create extension if not exists pgcrypto;

-- =====================================================================
-- LinkedIn-Unipile-Erweiterung — Schema (alle 6 Features)
-- Repo-Ziel: llr-dashboard/supabase/migrations/
-- Stand: 2026-07-08
--
-- Deckt ab:
--   1. Suche/Prospecting (linkedin_searches -> leads)
--   2. Post-Publishing (nutzt bestehende post_publish_queue + content_posts)
--   3. Engagement (linkedin_engagement_jobs)
--   4. Monitoring + Lead-Harvest (content_post_metrics + linkedin_post_engagers)
--   5. Invitation-Housekeeping (linkedin_invitations)
--   6. Firmen-/Profil-Enrichment (linkedin_company_cache + leads-Rückschreiben)
--
-- KONVENTIONEN (aus CLAUDE.md):
--   * Idempotent: CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS /
--     DROP POLICY IF EXISTS.
--   * RLS Pflicht. LinkedIn-Domäne ist im Bestand user_id-gescoped
--     (linkedin_connections, automation_*, connection_queue, vernetzungen),
--     daher ankern die neuen Tabellen ebenfalls auf user_id = auth.uid().
--     team_id ist als nullable Spalte für den späteren Multi-Tenant-Lockdown
--     vorbereitet (RLS_LOCKDOWN_TEMPLATE), aber noch nicht Authority.
--   * Self-Host braucht explizite GRANTs für authenticated UND service_role
--     (Fallstricke #3 und #12) — am Ende der Migration.
--   * Schreiben in die Job-/Sync-Tabellen macht die Service-Role (Worker-
--     Edge-Functions). User bekommt SELECT auf eigene Zeilen; für die von
--     Usern direkt erzeugten Tabellen (linkedin_searches,
--     linkedin_engagement_jobs) zusätzlich INSERT/UPDATE/DELETE auf eigene.
--
-- >>> ANSCHLUSS AN DAS REALE UNIPILE-SETUP (2026-07, erledigt):
--     Der Account-/Verbindungs-Store ist public.unipile_accounts
--     (20260706150000_unipile_integration.sql). Die ursprünglichen
--     linkedin_connections-ALTERs sind daher entfernt (siehe Abschnitt 0).
--     Diese Migration legt NUR die 5 neuen Feature-Tabellen +
--     content_posts-/leads-Spalten an und grantet Lesezugriff auf unipile_accounts.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Bestehende Tabellen erweitern (Anschluss an Unipile)
-- ---------------------------------------------------------------------

-- ANSCHLUSS AN DAS REALE REPO-SETUP (2026-07):
-- Der Unipile-Account-/Verbindungs-Store ist public.unipile_accounts
-- (angelegt in 20260706150000_unipile_integration.sql, befüllt von
-- unipile-webhook / unipile-connect-link). Die ursprünglich hier geplanten
-- ALTERs auf linkedin_connections (provider/unipile_account_id/unipile_dsn/team_id)
-- sind ENTFERNT: linkedin_connections ist der alte Chrome-Extension-Store und hält
-- KEINE Unipile-Referenz. Die Worker/Functions lesen die aktive Verbindung über
-- _shared/unipile.ts -> getUnipileConnection (unipile_accounts, status='OK').

-- content_posts: LinkedIn-social_id (urn:li:activity:...) nach dem Publish +
-- welcher Unipile-Account gepostet hat. Basis für Monitoring (Feature 4).
alter table public.content_posts
  add column if not exists linkedin_social_id text;
alter table public.content_posts
  add column if not exists linkedin_account_id text;
alter table public.content_posts
  add column if not exists last_metrics_sync_at timestamptz;

-- leads: Zeitstempel der letzten Unipile-Anreicherung (Feature 6).
alter table public.leads
  add column if not exists enriched_at timestamptz;
alter table public.leads
  add column if not exists enrichment_source text;     -- z.B. 'unipile_profile'


-- =====================================================================
-- 1. Suche / Prospecting  (Feature 1)
--    Gespeicherte Suchen; Ausführung schreibt Treffer als leads (source
--    = 'linkedin_search'), dedupe über den bestehenden Partial-Unique-Index
--    auf leads.linkedin_url (Migration 20260424160000).
-- =====================================================================
create table if not exists public.linkedin_searches (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  team_id           uuid,
  name              text not null,
  api               text not null default 'classic'
                      check (api in ('classic','sales_navigator','recruiter')),
  category          text not null default 'people'
                      check (category in ('people','company','posts','jobs')),
  -- Rohe Unipile-Search-Parameter (keywords, filters, tenure, location, ...)
  -- ODER eine gespeicherte LinkedIn-/Sales-Navigator-Such-URL.
  params            jsonb not null default '{}',
  search_url        text,
  target_list_id    uuid,                               -- optional: lead_lists.id
  status            text not null default 'idle'
                      check (status in ('idle','running','done','error')),
  last_cursor       text,                               -- Pagination-Cursor
  results_imported  integer not null default 0,
  auto_import_leads boolean not null default true,
  last_run_at       timestamptz,
  last_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_linkedin_searches_user on public.linkedin_searches (user_id);


-- =====================================================================
-- 2. Post-Publishing  (Feature 2)
--    KEINE neue Tabelle nötig — post_publish_queue + content_posts existieren.
--    Der Worker (unipile-post-publish) füllt content_posts.linkedin_social_id
--    und post_publish_queue.published_url. Hier nur ein Index für den Picker.
-- =====================================================================
create index if not exists idx_post_publish_queue_due
  on public.post_publish_queue (status, scheduled_for);


-- =====================================================================
-- 3. Engagement (Auto-Kommentar / Reaktion)  (Feature 3)
-- =====================================================================
create table if not exists public.linkedin_engagement_jobs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  team_id          uuid,
  kind             text not null check (kind in ('comment','reaction')),
  -- Ziel-Post: social_id (urn:li:activity:...) bevorzugt, sonst post_url.
  post_social_id   text,
  post_url         text,
  -- Für kind='comment':
  comment_text     text,
  saved_comment_id uuid references public.saved_comments(id) on delete set null,
  -- Für kind='reaction': like|celebrate|support|love|insightful|funny
  reaction_type    text default 'like',
  lead_id          uuid references public.leads(id) on delete set null,
  status           text not null default 'pending'
                      check (status in ('pending','processing','done','error','skipped')),
  scheduled_at     timestamptz not null default now(),
  executed_at      timestamptz,
  attempts         integer not null default 0,
  result           jsonb,
  error            text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_linkedin_engagement_due
  on public.linkedin_engagement_jobs (status, scheduled_at);
create index if not exists idx_linkedin_engagement_user
  on public.linkedin_engagement_jobs (user_id);


-- =====================================================================
-- 4. Monitoring + Lead-Harvest  (Feature 4)
--    content_post_metrics existiert (wird vom Worker gefüllt).
--    Neu: externe Post-Engager (Kommentierende/Reagierende) -> optional Lead.
-- =====================================================================
create table if not exists public.linkedin_post_engagers (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  team_id           uuid,
  post_id           uuid references public.content_posts(id) on delete cascade,
  post_social_id    text,
  engagement_type   text not null default 'comment'
                      check (engagement_type in ('comment','reaction')),
  actor_name        text,
  actor_headline    text,
  actor_profile_url text,
  actor_provider_id text,                               -- Unipile provider_id
  comment_text      text,
  reaction_type     text,
  converted_lead_id uuid references public.leads(id) on delete set null,
  harvested_at      timestamptz not null default now(),
  -- Ein Engager pro Post nur einmal.
  unique (post_id, actor_profile_url, engagement_type)
);
create index if not exists idx_linkedin_engagers_user on public.linkedin_post_engagers (user_id);
create index if not exists idx_linkedin_engagers_post on public.linkedin_post_engagers (post_id);


-- =====================================================================
-- 5. Invitation-Housekeeping  (Feature 5)
--    Spiegelt Unipile "invitations sent" für Reconcile (accepted/withdrawn)
--    und Auto-Withdraw veralteter Invites. Reconcile setzt bei 'accepted'
--    leads.connection_status = 'connected'.
-- =====================================================================
create table if not exists public.linkedin_invitations (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  team_id            uuid,
  unipile_account_id text,
  invitation_id      text,                              -- Unipile-Invitation-ID
  provider_id        text,                              -- eingeladene Person (LinkedIn provider_id)
  lead_id            uuid references public.leads(id) on delete set null,
  invitee_name       text,
  invitee_url        text,
  status             text not null default 'pending'
                       check (status in ('pending','accepted','withdrawn','expired','error')),
  message            text,
  sent_at            timestamptz,
  responded_at       timestamptz,
  withdrawn_at       timestamptz,
  last_checked_at    timestamptz,
  created_at         timestamptz not null default now(),
  unique (user_id, invitation_id)
);
create index if not exists idx_linkedin_invitations_user on public.linkedin_invitations (user_id);
create index if not exists idx_linkedin_invitations_status on public.linkedin_invitations (status);


-- =====================================================================
-- 6. Firmen-/Profil-Enrichment  (Feature 6)
--    Cache für Firmenprofile (vermeidet Rate-Limit-Verbrauch bei
--    Mehrfach-Anreicherung). Personendaten werden direkt in leads
--    zurückgeschrieben (kein companies-Table im Schema vorhanden).
-- =====================================================================
create table if not exists public.linkedin_company_cache (
  id             uuid primary key default gen_random_uuid(),
  identifier     text not null,                         -- company-URL-Slug oder provider_id
  name           text,
  industry       text,
  employee_count integer,
  website        text,
  hq_location    text,
  description    text,
  raw            jsonb,
  fetched_at     timestamptz not null default now(),
  unique (identifier)
);
create index if not exists idx_linkedin_company_cache_ident
  on public.linkedin_company_cache (identifier);


-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.linkedin_searches         enable row level security;
alter table public.linkedin_engagement_jobs  enable row level security;
alter table public.linkedin_post_engagers    enable row level security;
alter table public.linkedin_invitations      enable row level security;
alter table public.linkedin_company_cache    enable row level security;

-- --- linkedin_searches: Owner darf CRUD (User erstellt Suchen selbst) ---
drop policy if exists linkedin_searches_select on public.linkedin_searches;
create policy linkedin_searches_select on public.linkedin_searches
  for select to authenticated using (user_id = auth.uid());
drop policy if exists linkedin_searches_insert on public.linkedin_searches;
create policy linkedin_searches_insert on public.linkedin_searches
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists linkedin_searches_update on public.linkedin_searches;
create policy linkedin_searches_update on public.linkedin_searches
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists linkedin_searches_delete on public.linkedin_searches;
create policy linkedin_searches_delete on public.linkedin_searches
  for delete to authenticated using (user_id = auth.uid());

-- --- linkedin_engagement_jobs: Owner darf CRUD (User plant Engagement) ---
drop policy if exists linkedin_engagement_select on public.linkedin_engagement_jobs;
create policy linkedin_engagement_select on public.linkedin_engagement_jobs
  for select to authenticated using (user_id = auth.uid());
drop policy if exists linkedin_engagement_insert on public.linkedin_engagement_jobs;
create policy linkedin_engagement_insert on public.linkedin_engagement_jobs
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists linkedin_engagement_update on public.linkedin_engagement_jobs;
create policy linkedin_engagement_update on public.linkedin_engagement_jobs
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists linkedin_engagement_delete on public.linkedin_engagement_jobs;
create policy linkedin_engagement_delete on public.linkedin_engagement_jobs
  for delete to authenticated using (user_id = auth.uid());

-- --- linkedin_post_engagers: nur SELECT für Owner (Worker schreibt via service_role) ---
drop policy if exists linkedin_engagers_select on public.linkedin_post_engagers;
create policy linkedin_engagers_select on public.linkedin_post_engagers
  for select to authenticated using (user_id = auth.uid());

-- --- linkedin_invitations: nur SELECT für Owner (Worker schreibt via service_role) ---
drop policy if exists linkedin_invitations_select on public.linkedin_invitations;
create policy linkedin_invitations_select on public.linkedin_invitations
  for select to authenticated using (user_id = auth.uid());

-- --- linkedin_company_cache: SERVICE-ROLE-ONLY (globaler Cache öffentlicher Firmendaten) ---
--     Bewusst KEINE authenticated-SELECT-Policy: nur Worker/Enrichment-Function (service_role)
--     lesen/schreiben den Cache. Das Frontend zieht Firmendaten aus der Function-Antwort bzw.
--     vom (team-gescopten) Lead (company/industry/company_website), nicht direkt aus dem Cache.
--     RLS bleibt aktiv → deny-by-default für authenticated (kein Cross-Tenant-Lesen des Caches).
drop policy if exists linkedin_company_cache_select on public.linkedin_company_cache;


-- =====================================================================
-- GRANTs (Self-Host: authenticated UND service_role explizit — Fallstrick #3/#12)
-- =====================================================================
grant select, insert, update, delete on public.linkedin_searches         to authenticated;
grant select, insert, update, delete on public.linkedin_engagement_jobs   to authenticated;
grant select                          on public.linkedin_post_engagers      to authenticated;
grant select                          on public.linkedin_invitations        to authenticated;
-- linkedin_company_cache: KEIN authenticated-Grant (service-role-only, siehe RLS-Abschnitt).

grant select, insert, update, delete on public.linkedin_searches          to service_role;
grant select, insert, update, delete on public.linkedin_engagement_jobs    to service_role;
grant select, insert, update, delete on public.linkedin_post_engagers      to service_role;
grant select, insert, update, delete on public.linkedin_invitations        to service_role;
grant select, insert, update, delete on public.linkedin_company_cache      to service_role;

-- Worker lesen/schreiben zusätzlich diese Bestandstabellen via service_role:
-- unipile_accounts = Verbindungs-Store (getUnipileConnection liest hier, read-only).
-- (Basis-Migration grantet bereits ALL an service_role; hier idempotent/explizit.)
grant select on public.unipile_accounts             to service_role;
grant select, update on public.content_posts        to service_role;
grant select, update on public.post_publish_queue    to service_role;
grant insert         on public.content_post_metrics  to service_role;
grant select, insert, update on public.leads         to service_role;
grant select on public.saved_comments                to service_role;


-- =====================================================================
-- Optional (auskommentiert): pg_cron-Jobs für die Worker.
--   Erst aktivieren, wenn die zugehörigen Edge Functions deployed sind.
--   GUC-Muster = Repo-Standard (wie trigger_process_automation_jobs /
--   trigger_import_unipile_relations): app.supabase_functions_url enthält bereits
--   .../functions/v1, daher nur '/<function-name>' anhängen; Service-Key aus
--   app.supabase_service_role_key. cron.schedule upsertet per jobname (idempotent).
-- =====================================================================
-- select cron.schedule('unipile-post-publish', '*/5 * * * *', $$
--   select net.http_post(
--     url     := current_setting('app.supabase_functions_url', true) || '/unipile-post-publish',
--     headers := jsonb_build_object('Content-Type','application/json',
--                  'Authorization','Bearer ' || current_setting('app.supabase_service_role_key', true)),
--     body    := '{}'::jsonb
--   ) $$);
-- select cron.schedule('unipile-engagement', '*/10 * * * *', $$
--   select net.http_post(
--     url     := current_setting('app.supabase_functions_url', true) || '/unipile-engagement',
--     headers := jsonb_build_object('Content-Type','application/json',
--                  'Authorization','Bearer ' || current_setting('app.supabase_service_role_key', true)),
--     body    := '{}'::jsonb
--   ) $$);
-- select cron.schedule('unipile-invitations-sync', '0 */6 * * *', $$
--   select net.http_post(
--     url     := current_setting('app.supabase_functions_url', true) || '/unipile-invitations-sync',
--     headers := jsonb_build_object('Content-Type','application/json',
--                  'Authorization','Bearer ' || current_setting('app.supabase_service_role_key', true)),
--     body    := '{}'::jsonb
--   ) $$);
-- select cron.schedule('unipile-monitor', '0 */4 * * *', $$
--   select net.http_post(
--     url     := current_setting('app.supabase_functions_url', true) || '/unipile-monitor',
--     headers := jsonb_build_object('Content-Type','application/json',
--                  'Authorization','Bearer ' || current_setting('app.supabase_service_role_key', true)),
--     body    := '{}'::jsonb
--   ) $$);

-- 2FA-Backup-Codes: gehashte Einmalcodes für die Wiederherstellung,
-- falls der Authenticator verloren geht.
--
-- Sicherheit: Es werden NUR SHA-256-Hashes gespeichert, nie die Klartext-Codes.
-- Der Client zeigt die Klartext-Codes genau einmal beim Aktivieren an.
-- RLS: jeder User verwaltet ausschließlich seine eigenen Codes.

create table if not exists public.mfa_backup_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  code_hash  text not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_mfa_backup_codes_user on public.mfa_backup_codes(user_id);

alter table public.mfa_backup_codes enable row level security;

-- Idempotente Policies
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mfa_backup_codes' and policyname='mfa_backup_codes_select_own') then
    create policy mfa_backup_codes_select_own on public.mfa_backup_codes
      for select using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mfa_backup_codes' and policyname='mfa_backup_codes_insert_own') then
    create policy mfa_backup_codes_insert_own on public.mfa_backup_codes
      for insert with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mfa_backup_codes' and policyname='mfa_backup_codes_delete_own') then
    create policy mfa_backup_codes_delete_own on public.mfa_backup_codes
      for delete using (user_id = auth.uid());
  end if;
end $$;

-- Hetzner/self-hosted: explizite Grants für die authenticated-Rolle nötig
grant select, insert, delete on public.mfa_backup_codes to authenticated;

notify pgrst, 'reload schema';

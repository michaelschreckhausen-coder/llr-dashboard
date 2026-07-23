-- P3: Kontakte/Netzwerk/Suche brand-scopen (linkedin_inbox/_connections/_invitations/_searches).
-- SICHERES Muster gegen Datenlücken: brand_voice_id nullable + Fallback-RLS
--   has_brand_access(brand_voice_id) OR (brand_voice_id IS NULL AND <alte Regel>)
-- → nicht zugeordnete Alt-Zeilen bleiben über die alte Ebene sichtbar, nichts verschwindet.

-- 1) Spalten (idempotent)
alter table linkedin_inbox       add column if not exists brand_voice_id uuid references brand_voices(id);
alter table linkedin_connections add column if not exists brand_voice_id uuid references brand_voices(id);
alter table linkedin_invitations add column if not exists brand_voice_id uuid references brand_voices(id);
alter table linkedin_searches    add column if not exists brand_voice_id uuid references brand_voices(id);

create index if not exists idx_linkedin_inbox_bv       on linkedin_inbox(brand_voice_id);
create index if not exists idx_linkedin_invitations_bv on linkedin_invitations(brand_voice_id);
create index if not exists idx_linkedin_searches_bv    on linkedin_searches(brand_voice_id);

-- 2) Backfill
-- 2a) invitations: eindeutig über den verbundenen Unipile-Account
update linkedin_invitations i
   set brand_voice_id = ua.brand_voice_id
  from unipile_accounts ua
 where i.unipile_account_id = ua.unipile_account_id
   and ua.brand_voice_id is not null
   and i.brand_voice_id is null;

-- 2b) inbox + searches: nur wenn der User in dem Team GENAU EINE verbundene Marke hat (eindeutig)
with solo as (
  select ua.user_id, ua.team_id, min(ua.brand_voice_id) as bv
    from unipile_accounts ua
   where ua.brand_voice_id is not null
   group by ua.user_id, ua.team_id
  having count(distinct ua.brand_voice_id) = 1
)
update linkedin_inbox x set brand_voice_id = solo.bv
  from solo
 where x.user_id = solo.user_id and x.team_id = solo.team_id and x.brand_voice_id is null;

with solo as (
  select ua.user_id, ua.team_id, min(ua.brand_voice_id) as bv
    from unipile_accounts ua
   where ua.brand_voice_id is not null
   group by ua.user_id, ua.team_id
  having count(distinct ua.brand_voice_id) = 1
)
update linkedin_searches x set brand_voice_id = solo.bv
  from solo
 where x.user_id = solo.user_id and x.team_id = solo.team_id and x.brand_voice_id is null;

-- 3) RLS: brand-Zugriff ODER (noch nicht zugeordnet → alte Ebene)
drop policy if exists linkedin_inbox_select on linkedin_inbox;
drop policy if exists linkedin_inbox_modify on linkedin_inbox;
drop policy if exists linkedin_inbox_brand on linkedin_inbox;
create policy linkedin_inbox_brand on linkedin_inbox for all
  using      (has_brand_access(brand_voice_id) or (brand_voice_id is null and user_in_team(team_id)))
  with check (has_brand_access(brand_voice_id) or (brand_voice_id is null and user_in_team(team_id)));

drop policy if exists linkedin_connections_own on linkedin_connections;
drop policy if exists linkedin_connections_brand on linkedin_connections;
create policy linkedin_connections_brand on linkedin_connections for all
  using      (has_brand_access(brand_voice_id) or (brand_voice_id is null and user_id = auth.uid()))
  with check (has_brand_access(brand_voice_id) or (brand_voice_id is null and user_id = auth.uid()));

drop policy if exists linkedin_invitations_select on linkedin_invitations;
drop policy if exists linkedin_invitations_brand on linkedin_invitations;
create policy linkedin_invitations_brand on linkedin_invitations for all
  using      (has_brand_access(brand_voice_id) or (brand_voice_id is null and user_id = auth.uid()))
  with check (has_brand_access(brand_voice_id) or (brand_voice_id is null and user_id = auth.uid()));

drop policy if exists linkedin_searches_select on linkedin_searches;
drop policy if exists linkedin_searches_insert on linkedin_searches;
drop policy if exists linkedin_searches_update on linkedin_searches;
drop policy if exists linkedin_searches_delete on linkedin_searches;
drop policy if exists linkedin_searches_brand on linkedin_searches;
create policy linkedin_searches_brand on linkedin_searches for all
  using      (has_brand_access(brand_voice_id) or (brand_voice_id is null and user_id = auth.uid()))
  with check (has_brand_access(brand_voice_id) or (brand_voice_id is null and user_id = auth.uid()));

grant all on linkedin_inbox, linkedin_connections, linkedin_invitations, linkedin_searches to authenticated;
notify pgrst, 'reload schema';

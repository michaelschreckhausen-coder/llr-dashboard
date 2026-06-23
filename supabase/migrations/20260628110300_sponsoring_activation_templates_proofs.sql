-- ============================================================================
-- Phase 5 / Aktivierung: Standardaufgaben-Templates je Recht + Bild-Upload
-- ----------------------------------------------------------------------------
-- Feedback Kap. 13.6: Standardaufgaben je Recht (z.B. Trikotbrust: Logo-
-- Abstimmung + Liga-Freigabe), Verantwortlicher (existiert), Bild-Upload je
-- Aufgabe fuer Doku. Idempotent. RLS via public.user_in_team.
-- ============================================================================

begin;

-- Aufgabe <-> konkretes Recht verknuepfen (bisher nur contract_id)
alter table sponsoring.activations
  add column if not exists right_id uuid references sponsoring.rights(id) on delete set null;
create index if not exists idx_sp_act_right on sponsoring.activations(right_id);

-- ---------------------------------------------------------------------------
-- Aufgaben-Templates je Rechte-Kategorie (wiederverwendbar). Optional an ein
-- konkretes Recht gebunden. Werden beim Vertragsabschluss zu activations
-- materialisiert (RPC unten).
-- ---------------------------------------------------------------------------
create table if not exists sponsoring.activation_templates (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null,
  category_id uuid references sponsoring.rights_categories(id) on delete cascade,
  right_id    uuid references sponsoring.rights(id) on delete cascade,
  title       text not null,                 -- z.B. "Logo mit Sponsor abstimmen"
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_sp_acttpl_team on sponsoring.activation_templates(team_id);

alter table sponsoring.activation_templates enable row level security;
drop policy if exists acttpl_all on sponsoring.activation_templates;
create policy acttpl_all on sponsoring.activation_templates
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));
grant select, insert, update, delete on sponsoring.activation_templates to authenticated;
grant all on sponsoring.activation_templates to service_role;

-- ---------------------------------------------------------------------------
-- Bild-Anhaenge je Aufgabe (mehrere moeglich). Datei liegt im Storage-Bucket
-- 'sponsoring-activation' (Bucket-Migration separat).
-- ---------------------------------------------------------------------------
create table if not exists sponsoring.activation_attachments (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null,
  activation_id uuid not null references sponsoring.activations(id) on delete cascade,
  storage_path  text not null,
  caption       text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_sp_actatt_act on sponsoring.activation_attachments(activation_id);

alter table sponsoring.activation_attachments enable row level security;
drop policy if exists actatt_all on sponsoring.activation_attachments;
create policy actatt_all on sponsoring.activation_attachments
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));
grant select, insert, update, delete on sponsoring.activation_attachments to authenticated;
grant all on sponsoring.activation_attachments to service_role;

-- ---------------------------------------------------------------------------
-- RPC: Templates fuer einen Vertrag zu Aufgaben materialisieren. Pro Recht des
-- Pakets werden die passenden Templates (right_id ODER dessen category_id) als
-- 'planned' activations angelegt (idempotent ueber title+right_id+contract).
-- ---------------------------------------------------------------------------
create or replace function public.apply_activation_templates(p_contract_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, sponsoring, pg_temp
as $$
declare
  v_team    uuid;
  v_pkg     uuid;
  v_count   int := 0;
  v_r       record;
begin
  select team_id, package_id into v_team, v_pkg
  from sponsoring.contracts where id = p_contract_id;
  if v_team is null then raise exception 'contract not found'; end if;
  if not public.user_in_team(v_team) then raise exception 'not authorized'; end if;

  for v_r in
    select t.title, r.id as right_id
    from sponsoring.package_rights pr
    join sponsoring.rights r on r.id = pr.right_id
    join sponsoring.activation_templates t
      on t.team_id = v_team
     and (t.right_id = r.id or (t.right_id is null and t.category_id = r.category_id))
    where pr.package_id = v_pkg
  loop
    if not exists (
      select 1 from sponsoring.activations a
      where a.contract_id = p_contract_id and a.right_id = v_r.right_id and a.title = v_r.title
    ) then
      insert into sponsoring.activations (team_id, contract_id, right_id, title, status)
      values (v_team, p_contract_id, v_r.right_id, v_r.title, 'planned');
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.apply_activation_templates(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';

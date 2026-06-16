-- ============================================================================
-- Phase 1 / Slice 3: Vertragsmanagement (Modul 5)
-- ----------------------------------------------------------------------------
-- contracts + RPC accept_offer (Angebot -> Vertrag, Inventar buchen).
-- Voraussetzung: Slices 1+2 (rights/right_items/offers/packages/package_rights).
-- RLS via public.user_in_team. psql -v ON_ERROR_STOP=1, Staging zuerst.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Vertraege
-- ---------------------------------------------------------------------------
create table if not exists sponsoring.contracts (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid not null,
  offer_id           uuid references sponsoring.offers(id) on delete set null,
  sponsor_profile_id uuid references sponsoring.sponsor_profiles(id) on delete set null,
  package_id         uuid references sponsoring.packages(id) on delete set null,
  total_price        numeric(12,2),
  starts_on          date,
  ends_on            date,
  notice_period_days int,
  payment_plan       jsonb,
  status             text not null default 'active'
                     check (status in ('active','expiring','renewed','churned','expired')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_sp_contracts_team    on sponsoring.contracts(team_id);
create index if not exists idx_sp_contracts_sponsor on sponsoring.contracts(sponsor_profile_id);

-- right_items.contract_id nachtraeglich als FK verknuepfen (war in Slice 1 nur uuid)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'sponsoring' and constraint_name = 'right_items_contract_fk'
  ) then
    alter table sponsoring.right_items
      add constraint right_items_contract_fk
      foreign key (contract_id) references sponsoring.contracts(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS + GRANTs
-- ---------------------------------------------------------------------------
alter table sponsoring.contracts enable row level security;

drop policy if exists ctr_all on sponsoring.contracts;
create policy ctr_all on sponsoring.contracts
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));

grant select, insert, update, delete on sponsoring.contracts to authenticated;
grant all on sponsoring.contracts to service_role;

-- ---------------------------------------------------------------------------
-- RPC: Angebot annehmen -> Vertrag erzeugen + Inventar buchen
--   * verifiziert Team-Zugehoerigkeit manuell (SECURITY DEFINER umgeht RLS)
--   * setzt offer.status='accepted'
--   * bucht je Recht im Paket einen right_items-Slot als 'sold'
-- ---------------------------------------------------------------------------
create or replace function public.accept_offer(
  p_offer_id           uuid,
  p_starts_on          date default null,
  p_ends_on            date default null,
  p_notice_period_days int  default 90
)
returns uuid
language plpgsql
security definer
set search_path = public, sponsoring, pg_temp
as $$
declare
  v_offer       sponsoring.offers;
  v_contract_id uuid;
begin
  select * into v_offer from sponsoring.offers where id = p_offer_id;
  if v_offer.id is null then
    raise exception 'offer not found: %', p_offer_id;
  end if;

  -- Authorisierung: Caller muss Mitglied des Offer-Teams sein.
  if not public.user_in_team(v_offer.team_id) then
    raise exception 'not authorized for team %', v_offer.team_id;
  end if;

  insert into sponsoring.contracts (
    team_id, offer_id, sponsor_profile_id, package_id,
    total_price, starts_on, ends_on, notice_period_days, status
  )
  values (
    v_offer.team_id, v_offer.id, v_offer.sponsor_profile_id, v_offer.package_id,
    v_offer.total_price, p_starts_on, p_ends_on, p_notice_period_days, 'active'
  )
  returning id into v_contract_id;

  update sponsoring.offers
     set status = 'accepted', updated_at = now()
   where id = v_offer.id;

  -- Inventar buchen: je Recht im Paket ein verkaufter Slot.
  if v_offer.package_id is not null then
    insert into sponsoring.right_items (team_id, right_id, status, contract_id, label)
    select v_offer.team_id, pr.right_id, 'sold', v_contract_id, 'Vertrag'
    from sponsoring.package_rights pr
    where pr.package_id = v_offer.package_id;
  end if;

  -- Sponsor-Status auf 'won' heben (best effort).
  if v_offer.sponsor_profile_id is not null then
    update sponsoring.sponsor_profiles
       set status = 'won', updated_at = now()
     where id = v_offer.sponsor_profile_id;
  end if;

  return v_contract_id;
end;
$$;

grant execute on function public.accept_offer(uuid, date, date, int) to authenticated;

commit;

notify pgrst, 'reload schema';

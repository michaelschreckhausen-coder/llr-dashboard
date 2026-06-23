-- ============================================================================
-- Phase 5 / Vertraege: Rechnungsdatum + autom. Verlaengerung + Word-Vorlagen
-- ----------------------------------------------------------------------------
-- Feedback Kap. 13.5: Spalten Rechnungsdatum, autom. Verlaengerung (Datum);
-- Funktion "Vertrag -> Word-Version (Vorlage durch Club einpflegbar)".
-- Idempotent. RLS via public.user_in_team. psql -v ON_ERROR_STOP=1, Staging first.
-- ============================================================================

begin;

-- Vertrags-Zusatzfelder
alter table sponsoring.contracts add column if not exists invoice_date    date;
alter table sponsoring.contracts add column if not exists auto_renew      boolean not null default false;
alter table sponsoring.contracts add column if not exists auto_renew_date date;     -- naechster Verlaengerungs-/Stichtag
alter table sponsoring.contracts add column if not exists industry        text;     -- denormalisiert fuer Filter (sonst via sponsor_profile)

-- ---------------------------------------------------------------------------
-- Club-pflegbare Vertrags-Vorlagen (Word/Text). Platzhalter werden beim Export
-- ersetzt: {{sponsor}}, {{paket}}, {{summe}}, {{laufzeit_von}}, {{laufzeit_bis}},
-- {{liga}}, {{rechnungsdatum}} ... (Ersetzung im Frontend/Delivery-Export).
-- ---------------------------------------------------------------------------
create table if not exists sponsoring.contract_templates (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null,
  name       text not null,
  body_text  text not null default '',     -- Vorlagentext mit {{platzhaltern}}
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sp_ctr_templates_team on sponsoring.contract_templates(team_id);

alter table sponsoring.contract_templates enable row level security;
drop policy if exists ctpl_all on sponsoring.contract_templates;
create policy ctpl_all on sponsoring.contract_templates
  for all using (public.user_in_team(team_id)) with check (public.user_in_team(team_id));

grant select, insert, update, delete on sponsoring.contract_templates to authenticated;
grant all on sponsoring.contract_templates to service_role;

commit;

notify pgrst, 'reload schema';

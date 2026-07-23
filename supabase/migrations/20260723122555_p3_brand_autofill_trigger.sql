-- P3: Auto-Fill-Trigger — setzt brand_voice_id beim Insert automatisch, wenn NULL,
-- aus der EINDEUTIGEN verbundenen Marke des einfügenden Users im Team.
-- Deckt ALLE Schreibpfade uniform ab (EFs, Chrome-Extension, Frontend) → keine
-- markenlosen Neu-Zeilen bei Single-Brand-Usern. Multi-Brand-Fälle ohne explizite
-- Marke bleiben NULL und über die Fallback-RLS (team/user) sichtbar → keine Lücke.
create or replace function set_linkedin_brand_voice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_bv uuid;
begin
  if NEW.brand_voice_id is not null or NEW.user_id is null then
    return NEW;
  end if;
  select (array_agg(distinct ua.brand_voice_id))[1]
    into v_bv
    from unipile_accounts ua
   where ua.user_id = NEW.user_id
     and (NEW.team_id is null or ua.team_id = NEW.team_id)
     and ua.brand_voice_id is not null
  having count(distinct ua.brand_voice_id) = 1;
  NEW.brand_voice_id := v_bv;
  return NEW;
end $$;

drop trigger if exists trg_bv_autofill on linkedin_inbox;
create trigger trg_bv_autofill before insert on linkedin_inbox
  for each row execute function set_linkedin_brand_voice();

drop trigger if exists trg_bv_autofill on linkedin_connections;
create trigger trg_bv_autofill before insert on linkedin_connections
  for each row execute function set_linkedin_brand_voice();

drop trigger if exists trg_bv_autofill on linkedin_invitations;
create trigger trg_bv_autofill before insert on linkedin_invitations
  for each row execute function set_linkedin_brand_voice();

drop trigger if exists trg_bv_autofill on linkedin_searches;
create trigger trg_bv_autofill before insert on linkedin_searches
  for each row execute function set_linkedin_brand_voice();

-- P0: zentraler Brand-Access-Helper für das LinkedIn-Brand-Scoping.
-- Spiegelt exakt die brand_voices_visibility-Logik (Team-Mitglied + (Owner ODER geteilt),
-- Einzel-Share, team-übergreifendes Share). SECURITY DEFINER → liest brand_voices/shares
-- ohne Caller-RLS, keine Rekursion. Für alle brand-scoped LinkedIn-Tabellen wiederverwendbar.
create or replace function has_brand_access(bv_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select bv_id is not null and exists (
    select 1 from brand_voices bv
    where bv.id = bv_id
      and (
        (bv.team_id in (select team_id from team_members where user_id = auth.uid())
          and (bv.user_id = auth.uid() or bv.is_shared = true))
        or bv.id in (select brand_voice_id from brand_voice_shares where user_id = auth.uid())
        or bv_team_shared(bv.id)
      )
  );
$$;

grant execute on function has_brand_access(uuid) to authenticated, anon, service_role;

-- ============================================================================
-- Phase 5 / Storage-Buckets fuer Aktivierungs-Bilder, Hospitality, Stadion, Mockups
-- ----------------------------------------------------------------------------
-- Self-Host: Buckets via SQL anlegen. RLS auf storage.objects erzwingt
-- team-scoped Pfad-Konvention: erster Ordner im Objektnamen = team_id (uuid).
-- -> Upload-Pfad MUSS '<team_id>/...' sein (Frontend-Konvention, Block B).
-- Idempotent. psql -v ON_ERROR_STOP=1.
-- ============================================================================

begin;

insert into storage.buckets (id, name, public)
values
  ('sponsoring-activation',  'sponsoring-activation',  false),
  ('sponsoring-hospitality', 'sponsoring-hospitality', false),
  ('sponsoring-stadium',     'sponsoring-stadium',     false),
  ('sponsoring-mockups',     'sponsoring-mockups',     false)
on conflict (id) do nothing;

-- Eine generische Policy je Operation ueber alle vier Buckets. Team-Check ueber
-- den ersten Pfad-Ordner. public.user_in_team existiert auf Prod (Memory).
do $$
declare
  v_op text;
begin
  -- vorhandene gleichnamige Policies entfernen (idempotenter Re-Run)
  for v_op in select unnest(array['sel','ins','upd','del']) loop
    execute format('drop policy if exists sp_storage_%s on storage.objects', v_op);
  end loop;
end $$;

create policy sp_storage_sel on storage.objects
  for select to authenticated
  using (
    bucket_id in ('sponsoring-activation','sponsoring-hospitality','sponsoring-stadium','sponsoring-mockups')
    and public.user_in_team(((storage.foldername(name))[1])::uuid)
  );

create policy sp_storage_ins on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('sponsoring-activation','sponsoring-hospitality','sponsoring-stadium','sponsoring-mockups')
    and public.user_in_team(((storage.foldername(name))[1])::uuid)
  );

create policy sp_storage_upd on storage.objects
  for update to authenticated
  using (
    bucket_id in ('sponsoring-activation','sponsoring-hospitality','sponsoring-stadium','sponsoring-mockups')
    and public.user_in_team(((storage.foldername(name))[1])::uuid)
  );

create policy sp_storage_del on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('sponsoring-activation','sponsoring-hospitality','sponsoring-stadium','sponsoring-mockups')
    and public.user_in_team(((storage.foldername(name))[1])::uuid)
  );

commit;

-- Realtime für die benachrichtigungsrelevanten Tabellen aktivieren.
-- Fügt sie idempotent zur supabase_realtime-Publication hinzu, damit die
-- Glocke im Frontend per WebSocket sofort auf neue Events reagiert.
--
-- RLS bleibt maßgeblich: Realtime liefert nur Rows, die der authenticated-User
-- ohnehin lesen darf (team-scoped). Kein GRANT nötig, nur Publication-Membership.

do $$
declare
  t text;
  tbls text[] := array['leads','deals','lead_tasks','pm_tasks','linkedin_inbox','content_posts'];
begin
  -- Publication anlegen, falls sie fehlt (self-hosted Default hat sie i.d.R. schon)
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array tbls loop
    -- nur hinzufügen, wenn Tabelle existiert und noch nicht Teil der Publication
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name=t)
       and not exists (
         select 1 from pg_publication_tables
         where pubname='supabase_realtime' and schemaname='public' and tablename=t
       )
    then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- PostgREST-Schema-Reload anstoßen (Konvention in diesem Projekt)
notify pgrst, 'reload schema';

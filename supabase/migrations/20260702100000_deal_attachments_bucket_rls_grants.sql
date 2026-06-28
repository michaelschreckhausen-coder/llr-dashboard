-- ============================================================================
-- Deal-Anhänge: Bucket + Storage-Policies + Tabellen-RLS/Grants sicherstellen
-- ----------------------------------------------------------------------------
-- Hintergrund: Der Datei-Upload an Deals hängt/schlägt fehl. Bucket +
-- Storage-Policies + deal_attachments-RLS stammen nur aus dem großen
-- Staging-Baseline-File (20260416000001) — auf Self-Host-Prod (Hetzner) kann
-- (a) der Bucket fehlen, (b) die storage.objects-INSERT-Policy ohne WITH CHECK
-- den Upload blocken, (c) der authenticated-Grant auf deal_attachments fehlen
-- (Self-Host-Grant-Falle, Top-Fallstrick #3/#12).
--
-- Diese Migration ist idempotent und additiv. Zuerst Staging, dann Prod.
-- Pre-Flight (read-only) vorher empfohlen:
--   select id from storage.buckets where id = 'deal-attachments';
--   select policyname, cmd from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'deal_attachments%';
--   select policyname, cmd from pg_policies where tablename='deal_attachments';
--   select grantee, privilege_type from information_schema.role_table_grants where table_name='deal_attachments';
-- ============================================================================

begin;

-- 1) Bucket sicherstellen (privat)
insert into storage.buckets (id, name, public)
values ('deal-attachments', 'deal-attachments', false)
on conflict (id) do nothing;

-- 2) Storage-Policies: getrennt nach Operation, INSERT MIT WITH CHECK.
--    (Die alte FOR-ALL-Policy ohne WITH CHECK ist der wahrscheinliche Upload-Blocker.)
drop policy if exists "deal_attachments_own"    on storage.objects;
drop policy if exists "deal_attachments_select" on storage.objects;
drop policy if exists "deal_attachments_insert" on storage.objects;
drop policy if exists "deal_attachments_update" on storage.objects;
drop policy if exists "deal_attachments_delete" on storage.objects;

create policy "deal_attachments_select" on storage.objects
  for select using (bucket_id = 'deal-attachments' and auth.uid() is not null);

create policy "deal_attachments_insert" on storage.objects
  for insert with check (bucket_id = 'deal-attachments' and auth.uid() is not null);

create policy "deal_attachments_update" on storage.objects
  for update using (bucket_id = 'deal-attachments' and auth.uid() is not null)
            with check (bucket_id = 'deal-attachments' and auth.uid() is not null);

create policy "deal_attachments_delete" on storage.objects
  for delete using (bucket_id = 'deal-attachments' and auth.uid() is not null);

-- 3) deal_attachments-Tabelle: RLS + Policy + Grants (Self-Host)
alter table public.deal_attachments enable row level security;

drop policy if exists "deal_attachments_own" on public.deal_attachments;
create policy "deal_attachments_own" on public.deal_attachments
  for all using (uploaded_by = auth.uid())
          with check (uploaded_by = auth.uid());

grant select, insert, update, delete on public.deal_attachments to authenticated;

commit;

notify pgrst, 'reload schema';

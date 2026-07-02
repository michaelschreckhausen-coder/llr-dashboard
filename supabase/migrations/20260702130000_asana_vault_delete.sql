-- =====================================================================
-- Asana-Integration — Vault-Delete-Helper (für Disconnect/Trennen)
-- Repo-Ziel: llr-dashboard/supabase/migrations/
-- Stand: 2026-07-02
--
-- Ergänzt die in 20260702120000_asana_integration.sql angelegten
-- Vault-Helper (store/update/read) um einen Delete-Helper. Wird von der
-- Edge Function `asana-oauth-disconnect` genutzt, um die verschlüsselten
-- Access-/Refresh-Token beim Trennen restlos aus vault.secrets zu löschen.
-- Idempotent: create or replace + revoke/grant sind wiederholbar.
-- =====================================================================

create or replace function public.asana_vault_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  delete from vault.secrets where id = p_id;
end;
$$;

-- Nur service_role darf den Vault-Delete-Helper ausführen (analog store/update/read).
revoke all on function public.asana_vault_delete(uuid) from public, anon, authenticated;
grant execute on function public.asana_vault_delete(uuid) to service_role;

-- ---------------------------------------------------------------------
-- service_role-Grant auf team_members (Top-Fallstrick #12):
-- Die Edge Function asana-oauth-disconnect prüft die Team-Mitgliedschaft
-- per Service-Role gegen team_members. Auf Hetzner fehlt der
-- service_role-Grant für ältere Tabellen → sonst Silent-Permission-Deny
-- (Membership-Lookup liefert null → jeder Trennen-Versuch würde als
-- „forbidden" abgewiesen). Idempotent.
-- ---------------------------------------------------------------------
grant select on public.team_members to service_role;

-- ---------------------------------------------------------------------
-- Workspace-Name persistieren, damit die Settings-Seite den Status
-- „verbunden mit <Workspace>" auch nach einem Reload anzeigen kann
-- (die Basis-Tabelle hält nur die asana_workspace_gid). Der Callback
-- schreibt den Namen beim Verbinden mit.
-- ---------------------------------------------------------------------
alter table public.asana_connections
  add column if not exists asana_workspace_name text;


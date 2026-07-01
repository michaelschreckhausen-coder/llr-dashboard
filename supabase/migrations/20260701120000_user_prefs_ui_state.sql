-- Generischer UI-State pro User (Phase 3.5: localStorage → user_preferences).
-- jsonb-Spalte für Client-Präferenzen, die bisher nur pro Browser galten
-- (z.B. gesehene/gelöschte Benachrichtigungen). Damit gelten sie geräteübergreifend.

alter table public.user_preferences
  add column if not exists ui_state jsonb not null default '{}'::jsonb;

-- authenticated darf eigene Row lesen/schreiben (RLS regelt user_id = auth.uid()).
-- Grants sind auf self-hosted Hetzner explizit nötig; select/insert/update meist
-- schon vorhanden — hier idempotent absichern.
grant select, insert, update on public.user_preferences to authenticated;

notify pgrst, 'reload schema';

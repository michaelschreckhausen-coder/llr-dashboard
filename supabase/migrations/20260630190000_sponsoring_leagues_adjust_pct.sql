-- Sponsoring OS — V1: %-Auf-/Abschlag je Spielklasse (Liga).
-- adjust_pct = typischer prozentualer Auf-/Abschlag der Liga auf das Vertragsvolumen
-- (z.B. +15 für 1. BL, -20 für Regionalliga). Im Vertrag als Vorschlag angeboten +
-- per Klick aufs Volumen anwendbar (manuell editierbar). Additiv + idempotent.

ALTER TABLE sponsoring.leagues
  ADD COLUMN IF NOT EXISTS adjust_pct numeric(5,2);

NOTIFY pgrst, 'reload schema';

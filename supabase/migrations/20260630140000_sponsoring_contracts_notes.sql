-- Sponsoring OS — Notizfunktion im Vertrag (Partner-Feedback 2026-06-27, V5).
-- Additiv + idempotent. Bestehende Grants/RLS der contracts-Tabelle gelten weiter
-- (kein neuer Grant nötig — Spalte erbt die Tabellen-Policies).

ALTER TABLE sponsoring.contracts
  ADD COLUMN IF NOT EXISTS notes text;

NOTIFY pgrst, 'reload schema';

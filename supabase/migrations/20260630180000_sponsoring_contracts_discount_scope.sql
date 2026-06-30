-- Sponsoring OS — V4: Rabatt mit Scope (Gesamt / Hospitality / Werbeleistungen).
-- discount_pct = Rabatt in %, discount_scope = 'all' | 'hospitality' | 'advertising',
-- hospitality_value = manueller Hospitality-Anteil (€). Werbeleistungen = Gesamt − Hospitality.
-- Frontend rechnet die Endsumme; hier nur Persistenz. Additiv + idempotent, kein CHECK
-- (Frontend schränkt scope ein → keine Silent-Fail-Falle bei kombiniertem Update).

ALTER TABLE sponsoring.contracts
  ADD COLUMN IF NOT EXISTS discount_pct      numeric(5,2),
  ADD COLUMN IF NOT EXISTS discount_scope    text,
  ADD COLUMN IF NOT EXISTS hospitality_value numeric(12,2);

NOTIFY pgrst, 'reload schema';

-- Sponsoring OS — V3: Vertrags-Verlängerung „einmalig vs. jährlich".
-- Ergänzt die bestehende auto_renew/auto_renew_date-Logik um das Intervall.
-- Werte: 'once' | 'yearly' (Frontend schränkt ein — bewusst kein CHECK, vermeidet
-- Silent-Fail-Fallen bei kombiniertem Update). Additiv + idempotent.

ALTER TABLE sponsoring.contracts
  ADD COLUMN IF NOT EXISTS renewal_interval text;

NOTIFY pgrst, 'reload schema';

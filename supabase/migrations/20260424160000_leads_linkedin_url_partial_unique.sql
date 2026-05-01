-- Strukturelle Absicherung gegen LinkedIn-URL Empty-String Unique-Conflict
-- Siehe PR #23 (Commit 16aa7e9) und Changelog v3.2.4
--
-- Der bestehende Unique-Constraint leads_user_linkedin_url_unique behandelt ''
-- als eigenständigen Wert — mehrere Leads ohne LinkedIn-URL (leere Strings)
-- lösen 409. Code sendet seit PR #23 bereits NULL statt '', aber hier schalten
-- wir den Constraint auf einen Partial-Unique-Index um, der NULL und '' ignoriert.
--
-- Partial-Index -> beliebig viele Leads ohne LinkedIn-URL pro User möglich,
-- echte Duplikate bleiben weiterhin verboten. Regressions-Schutz falls der
-- Code eines Tages wieder '' senden sollte.
--
-- Auf Prod-DB bereits angewendet via Supabase MCP am 2026-04-24.
-- Für Staging-Hetzner beim nächsten Deploy mitlaufen lassen.

BEGIN;

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_user_linkedin_url_unique;

CREATE UNIQUE INDEX IF NOT EXISTS leads_user_linkedin_url_unique
  ON public.leads (user_id, linkedin_url)
  WHERE linkedin_url IS NOT NULL AND linkedin_url != '';

COMMIT;

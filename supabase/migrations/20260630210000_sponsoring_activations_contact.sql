-- Sponsoring OS — A3: Aktivierung einem Ansprechpartner (Org-Kontakt) zuordnen.
-- contact_id = bestehender CRM-Kontakt (public.leads), i.d.R. ein Kontakt des
-- Vertrags-Sponsors. Plain uuid (konsistent mit activations.responsible, das
-- ebenfalls kein FK ist) — Integrität wird im Frontend über die gefilterte
-- Auswahl (nur Kontakte der Sponsor-Org) gewahrt. Additiv + idempotent.

ALTER TABLE sponsoring.activations
  ADD COLUMN IF NOT EXISTS contact_id uuid;

CREATE INDEX IF NOT EXISTS idx_sp_act_contact ON sponsoring.activations(contact_id);

NOTIFY pgrst, 'reload schema';

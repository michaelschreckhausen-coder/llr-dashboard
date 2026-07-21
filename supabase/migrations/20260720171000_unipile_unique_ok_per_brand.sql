-- B1: max. 1 aktiver (OK) Unipile-Account je Brand (analog idx_linkedin_oauth_tokens_active_per_bv).
-- Voraussetzung: Webhook macht Collapse-FIRST (bestehende OK je Brand → DISCONNECTED vor Upsert).
CREATE UNIQUE INDEX IF NOT EXISTS idx_unipile_accounts_active_per_bv
  ON public.unipile_accounts (brand_voice_id)
  WHERE status = 'OK' AND brand_voice_id IS NOT NULL;

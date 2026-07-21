-- Company-Page-LinkedIn-Verbindung an brand_voices.
-- Nur account_type='company_page'-Brands nutzen diese Felder. Ein Company Brand
-- postet als LinkedIn-Organisation über einen bereits verbundenen Admin-Login
-- (linkedin_acting_account_id = unipile_accounts.unipile_account_id des Logins)
-- + die Organisation (linkedin_org_id / _urn). Es wird KEINE eigene
-- unipile_accounts-Zeile für die Page angelegt (1 Zeile pro Login-Constraint).
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS linkedin_org_id            text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS linkedin_org_urn           text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS linkedin_org_name          text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS linkedin_org_logo_url      text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS linkedin_acting_account_id text;
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS linkedin_org_verified_at   timestamptz;

COMMENT ON COLUMN public.brand_voices.linkedin_org_id            IS 'LinkedIn Company Page: numerische Org-ID (aus urn:li:fsd_company:<id>). Ziel von as_organization beim Posten.';
COMMENT ON COLUMN public.brand_voices.linkedin_org_urn           IS 'LinkedIn Company Page: vollständige organization_urn.';
COMMENT ON COLUMN public.brand_voices.linkedin_acting_account_id IS 'unipile_account_id des Admin-Logins, über den als diese Page gepostet/gelesen wird.';

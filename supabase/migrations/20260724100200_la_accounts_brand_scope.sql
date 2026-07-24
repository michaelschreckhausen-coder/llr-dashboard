-- la_accounts.brand_voice_id (un-committete Staging-Drift) — vor p5 nötig.
BEGIN;
ALTER TABLE public.la_accounts ADD COLUMN IF NOT EXISTS brand_voice_id uuid REFERENCES public.brand_voices(id);
CREATE INDEX IF NOT EXISTS idx_la_accounts_bv ON public.la_accounts(brand_voice_id);
UPDATE public.la_accounts la SET brand_voice_id = ua.brand_voice_id FROM public.unipile_accounts ua
 WHERE la.unipile_account_id=ua.unipile_account_id AND ua.brand_voice_id IS NOT NULL AND la.brand_voice_id IS NULL;
DROP POLICY IF EXISTS la_accounts_team_all ON public.la_accounts;
DROP POLICY IF EXISTS la_accounts_brand_select ON public.la_accounts;
CREATE POLICY la_accounts_team_all ON public.la_accounts FOR ALL USING (public.user_in_team(team_id));
CREATE POLICY la_accounts_brand_select ON public.la_accounts FOR SELECT USING (brand_voice_id IS NOT NULL AND brand_voice_id IN (SELECT id FROM public.brand_voices));
COMMIT;

-- ROLLBACK SECFIX #4-2 — stellt die (unsicheren) PUBLIC-Grants wieder her. NICHT empfohlen.
BEGIN;
GRANT EXECUTE ON FUNCTION public.set_linkedin_brand_voice()  TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_la_campaign_brand()     TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_affiliate_click(text, text, text, text, text, text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_conversion_to_signup(uuid, text, uuid) TO PUBLIC;
COMMIT;

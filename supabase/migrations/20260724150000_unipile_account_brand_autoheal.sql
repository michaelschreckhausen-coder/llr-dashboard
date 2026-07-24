-- Auto-Heal: bei Reconnect brand_voice_id setzen + reconnect_required löschen (nur während Cutover aktiv).
CREATE OR REPLACE FUNCTION public.unipile_account_brand_autoheal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_bv uuid; BEGIN
  IF NEW.status='OK' AND NEW.brand_voice_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT id INTO v_bv FROM public.brand_voices WHERE user_id=NEW.user_id AND account_type='personal' AND linkedin_reconnect_required=true ORDER BY created_at LIMIT 1;
    IF v_bv IS NOT NULL THEN NEW.brand_voice_id:=v_bv; UPDATE public.brand_voices SET linkedin_reconnect_required=false WHERE id=v_bv; END IF;
  END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_unipile_account_brand_autoheal ON public.unipile_accounts;
CREATE TRIGGER trg_unipile_account_brand_autoheal BEFORE INSERT OR UPDATE OF status ON public.unipile_accounts FOR EACH ROW EXECUTE FUNCTION public.unipile_account_brand_autoheal();

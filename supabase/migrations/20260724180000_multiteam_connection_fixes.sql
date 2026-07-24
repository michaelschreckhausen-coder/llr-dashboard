-- Multi-Team-Verbindungs-Fixes (24.07.): Auto-Heal setzt team_id=Marken-Team + löscht alle
-- Personal-Flags des Users; la_accounts erbt brand_voice_id vom unipile_account.
CREATE OR REPLACE FUNCTION public.unipile_account_brand_autoheal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_bv uuid; v_team uuid;
BEGIN
  IF NEW.status='OK' AND NEW.user_id IS NOT NULL THEN
    IF NEW.brand_voice_id IS NULL THEN
      SELECT id INTO v_bv FROM public.brand_voices WHERE user_id=NEW.user_id AND account_type='personal' AND linkedin_reconnect_required=true ORDER BY created_at LIMIT 1;
      IF v_bv IS NOT NULL THEN NEW.brand_voice_id := v_bv; END IF;
    END IF;
    IF NEW.brand_voice_id IS NOT NULL THEN
      SELECT team_id INTO v_team FROM public.brand_voices WHERE id=NEW.brand_voice_id;
      IF v_team IS NOT NULL THEN NEW.team_id := v_team; END IF;
    END IF;
    UPDATE public.brand_voices SET linkedin_reconnect_required=false WHERE user_id=NEW.user_id AND account_type='personal' AND linkedin_reconnect_required=true;
  END IF; RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.la_account_brand_autofill() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.brand_voice_id IS NULL AND NEW.unipile_account_id IS NOT NULL THEN
    SELECT brand_voice_id INTO NEW.brand_voice_id FROM public.unipile_accounts WHERE unipile_account_id=NEW.unipile_account_id AND brand_voice_id IS NOT NULL LIMIT 1;
  END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_la_account_brand_autofill ON public.la_accounts;
CREATE TRIGGER trg_la_account_brand_autofill BEFORE INSERT OR UPDATE OF status, unipile_account_id ON public.la_accounts FOR EACH ROW EXECUTE FUNCTION public.la_account_brand_autofill();

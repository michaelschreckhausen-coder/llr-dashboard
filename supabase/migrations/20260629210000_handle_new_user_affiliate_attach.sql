-- 20260629210000_handle_new_user_affiliate_attach.sql
-- Affiliate-System Phase 2 — Signup → Conversion-Attach.
--
-- DESIGN-ENTSCHEIDUNG: separater AFTER-INSERT-Trigger statt Modifikation von
-- handle_new_user. Grund: handle_new_user ist fragil (Memory: mehrfach gecrasht —
-- fehlender Free-Plan, NULL-Tokens, SECURITY-DEFINER-Guards) und ein Verbatim-
-- Rewrite würde Transkriptionsfehler riskieren, die ALLE Signups brechen. Der
-- separate Trigger ist additiv, voll EXCEPTION-gekapselt und reversibel (DROP).
--
-- Trigger-Name sortiert nach 'on_auth_user_created' → feuert NACH handle_new_user,
-- d.h. Team/Account existieren bereits, wenn attach_conversion_to_signup den
-- account_id auflöst (best-effort, account_id ist ohnehin nullable).
--
-- attach_conversion_to_signup (Phase 1) macht: Self-Referral-Reject,
-- UNIQUE(user_id)-Skip (First-Touch gewinnt), sonst INSERT pending_payment.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_affiliate_attach_on_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_code text;
BEGIN
  -- Vollständig defensiv: ein Affiliate-Fehler darf den Signup NIE brechen.
  BEGIN
    v_code := trim(COALESCE(NEW.raw_user_meta_data->>'affiliate_code', ''));
    IF v_code <> '' THEN
      PERFORM public.attach_conversion_to_signup(
        NEW.id,
        v_code,
        NULLIF(NEW.raw_user_meta_data->>'affiliate_click_id', '')::uuid
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'affiliate attach für % fehlgeschlagen: %', NEW.email, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created_affiliate_attach ON auth.users;
CREATE TRIGGER on_auth_user_created_affiliate_attach
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_affiliate_attach_on_signup();

-- Nachzug: register_affiliate_click wird von der EF register-affiliate-click via
-- service_role gerufen → EXECUTE-Grant fehlte in Phase 1 (dort nur anon/authenticated),
-- die EF lief in "permission denied". Append-only-Fix (Phase-1-File ist schon Prod-applied).
GRANT EXECUTE ON FUNCTION public.register_affiliate_click(text,text,text,text,text,text,text) TO service_role;

COMMIT;

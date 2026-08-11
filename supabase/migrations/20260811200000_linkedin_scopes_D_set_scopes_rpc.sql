-- ============================================================================
-- Slice D — set_brand_linkedin_scopes RPC (UI-Schreibpfad für die Scope-Toggles)
-- ----------------------------------------------------------------------------
-- Der SharingPicker setzt pro Team (Home + Cross) die freigegebenen LinkedIn-
-- Bereiche. brand_voice_team_shares hat KEINE UPDATE-Policy (nur INSERT/DELETE/
-- SELECT) -> die UI kann linkedin_scopes nicht direkt ändern. Dieser owner-
-- gegatete SECURITY-DEFINER-RPC upsertet die Row (auch die HOME-Row -> ohne sie
-- fällt has_brand_linkedin_scope via COALESCE(...,true) still auf "alles an"
-- zurück und die Marke wäre nicht einschränkbar).
--
-- Owner-only (wie set_inbox_list_team_shares): nur der Marken-Eigentümer ODER
-- ein Leadesk-Admin darf die Freigabe-Bereiche ändern. Ziel-Team muss ein Team
-- des Aufrufers sein (Home ist darin enthalten) — kein Teilen an fremde Teams.
-- Leeres/ungültiges Array -> {} (alles privat) ist erlaubt.
--
-- C1-Lehre: REVOKE FROM PUBLIC/anon (Default-Grant), GRANT authenticated+service.
-- Reversibel: .rollback.sql droppt die Funktion.
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.set_brand_linkedin_scopes(
  p_brand_voice_id uuid, p_team_id uuid, p_scopes text[]
) RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_owner  uuid;
  v_scopes text[];
  v_valid CONSTANT text[] := ARRAY['inbox','network','search','automation','engagement','analytics'];
BEGIN
  SELECT user_id INTO v_owner FROM public.brand_voices WHERE id = p_brand_voice_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Marke % nicht gefunden', p_brand_voice_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_owner <> auth.uid() AND NOT public.is_leadesk_admin() THEN
    RAISE EXCEPTION 'Nicht berechtigt: nur der Marken-Eigentümer darf die Freigabe-Bereiche ändern'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_team_id IS NULL THEN
    RAISE EXCEPTION 'team_id fehlt' USING ERRCODE = 'null_value_not_allowed';
  END IF;
  -- Ziel-Team muss ein eigenes Team sein (Home ist enthalten) — Admin darf beliebig.
  IF NOT (p_team_id = ANY (public.get_my_team_ids())) AND NOT public.is_leadesk_admin() THEN
    RAISE EXCEPTION 'Team % nicht zulässig (kein eigenes Team)', p_team_id USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Nur gültige Bereiche; Rest verwerfen. NULL/leer -> {} (nichts geteilt).
  SELECT COALESCE(array_agg(DISTINCT s ORDER BY s), '{}'::text[]) INTO v_scopes
    FROM unnest(COALESCE(p_scopes, '{}'::text[])) AS s
   WHERE s = ANY (v_valid);

  INSERT INTO public.brand_voice_team_shares (brand_voice_id, team_id, shared_by, linkedin_scopes)
  VALUES (p_brand_voice_id, p_team_id, v_owner, v_scopes)
  ON CONFLICT (brand_voice_id, team_id) DO UPDATE SET linkedin_scopes = EXCLUDED.linkedin_scopes;

  RETURN v_scopes;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.set_brand_linkedin_scopes(uuid, uuid, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_brand_linkedin_scopes(uuid, uuid, text[]) TO authenticated, service_role;

COMMIT;

-- Verify: owner-gate + grants
\echo '--- D Verify: Grants (anon=f, authenticated=t, service=t) ---'
SELECT has_function_privilege('anon','public.set_brand_linkedin_scopes(uuid,uuid,text[])','EXECUTE') AS anon,
       has_function_privilege('authenticated','public.set_brand_linkedin_scopes(uuid,uuid,text[])','EXECUTE') AS auth,
       has_function_privilege('service_role','public.set_brand_linkedin_scopes(uuid,uuid,text[])','EXECUTE') AS svc;

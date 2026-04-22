-- ═══════════════════════════════════════════════════════════════
-- Erweitere handle_new_user(): übernehme zusätzlich first_name,
-- last_name, company, headline aus raw_user_meta_data.
--
-- Hintergrund: Die bisherige Version schreibt nur id, email, full_name.
-- Register.jsx sendet aber full_name + first_name + last_name + company
-- in user_metadata und musste bisher per setTimeout ein UPDATE nachschieben,
-- was race-anfällig war. Mit dieser Migration landen alle Felder direkt
-- beim INSERT — kein Race, kein zweiter Roundtrip.
--
-- ON CONFLICT DO NOTHING bleibt: Wenn aus irgendeinem Grund (z.B. manueller
-- Seed) schon eine profiles-Row existiert, überschreiben wir nichts.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_full_name  text;
  v_first_name text := COALESCE(meta->>'first_name', '');
  v_last_name  text := COALESCE(meta->>'last_name',  '');
  v_company    text := COALESCE(meta->>'company',    '');
  v_headline   text := COALESCE(meta->>'headline',   '');
BEGIN
  -- full_name: explizit mitgegeben oder aus first+last zusammengesetzt
  v_full_name := NULLIF(TRIM(COALESCE(meta->>'full_name', '')), '');
  IF v_full_name IS NULL THEN
    v_full_name := TRIM(v_first_name || ' ' || v_last_name);
  END IF;

  INSERT INTO public.profiles (
    id, email, full_name, company, headline, created_at, updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(v_full_name, ''),
    v_company,
    v_headline,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Trigger existiert bereits aus dem Basis-Schema (on_auth_user_created
-- auf auth.users AFTER INSERT FOR EACH ROW). Nichts zu ändern.

COMMENT ON FUNCTION public.handle_new_user() IS
  'Auto-create profile on signup. Reads first_name, last_name, company, headline, full_name from raw_user_meta_data. SECURITY DEFINER — schreibt in RLS-geschützte public.profiles.';

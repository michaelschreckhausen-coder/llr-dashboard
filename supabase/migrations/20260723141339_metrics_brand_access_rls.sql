-- Metrik-Tabellen brand-access-scharf: bisher nur team_id-RLS → ein Team-Mitglied
-- hätte auch Kennzahlen NICHT geteilter Marken (aggregiert) gesehen. Jetzt: nur Marken,
-- auf die der Nutzer Zugriff hat (has_brand_access), NULL-Brand-Zeilen bleiben team-sichtbar
-- (Legacy-Fallback, aktuell keine). Writer nutzen service_role (bypasst RLS) → kein Bruch.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'linkedin_network_metrics','linkedin_messaging_metrics',
    'linkedin_profile_metrics','linkedin_page_metrics'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- alte team-only Read-Policies entfernen (verschiedene Namen)
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'lnm_team_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'lmm_team_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'lpm_team_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'lpfm_team_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_team', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_team_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_brand_read', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR SELECT USING (
        has_brand_access(brand_voice_id)
        OR (brand_voice_id IS NULL AND team_id IN (
              SELECT team_id FROM team_members WHERE user_id = auth.uid()))
      )$f$, t||'_brand_read', t);
  END LOOP;
END $$;

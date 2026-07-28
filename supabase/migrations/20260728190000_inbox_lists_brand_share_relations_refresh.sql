-- Michael-Architektur 28.07.: (A) LinkedIn-Kontakte-Listen brand-scoped + teilbar an
-- andere Brands im Team (Sharing via is_shared, Sichtbarkeit via has_brand_access).
-- (B) Netzwerk-Tab: taegliches Auto-Refresh der 1.-Grad-Relations JE verbundenem
-- Account (hash-gestaffelt ueber 24 Stunden, stuendlicher Cron).
BEGIN;

-- ── A) Listen: Marken-Zugehoerigkeit + Sharing-RLS ─────────────────────────────
ALTER TABLE public.inbox_lists
  ADD COLUMN IF NOT EXISTS brand_voice_id uuid REFERENCES public.brand_voices(id) ON DELETE SET NULL;

-- Lesen: eigene ODER Marke zugreifbar (inkl. geteilte Marken) ODER team-weit geteilt
-- ODER Legacy (ohne Marke, team-sichtbar). Schreiben bleibt beim Besitzer (inbox_lists_own ALL).
DROP POLICY IF EXISTS inbox_lists_team_shared_read ON public.inbox_lists;
DROP POLICY IF EXISTS inbox_lists_brand_read ON public.inbox_lists;
CREATE POLICY inbox_lists_brand_read ON public.inbox_lists FOR SELECT USING (
  user_id = auth.uid()
  OR public.has_brand_access(brand_voice_id)
  OR (is_shared = true AND team_id IS NOT NULL AND team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()))
  OR (brand_voice_id IS NULL AND team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()))
);

-- Members-Sichtbarkeit spiegelt die Listen-Sichtbarkeit (Zaehler + Filter + Automatisierungs-Zuordnung).
DROP POLICY IF EXISTS inbox_list_members_via_list ON public.inbox_list_members;
CREATE POLICY inbox_list_members_via_list ON public.inbox_list_members FOR ALL USING (
  list_id IN (
    SELECT il.id FROM public.inbox_lists il
    WHERE il.user_id = auth.uid()
       OR public.has_brand_access(il.brand_voice_id)
       OR (il.is_shared = true AND il.team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()))
       OR (il.brand_voice_id IS NULL AND il.team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()))
  )
) WITH CHECK (
  list_id IN (
    SELECT il.id FROM public.inbox_lists il
    WHERE il.user_id = auth.uid()
       OR public.has_brand_access(il.brand_voice_id)
       OR (il.is_shared = true AND il.team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()))
       OR (il.brand_voice_id IS NULL AND il.team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()))
  )
);

-- ── B) Netzwerk-Refresh: jeder OK-Account 1x/24h (hash-gestaffelt, stuendlich gefeuert) ──
CREATE OR REPLACE FUNCTION public.trigger_relations_refresh()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  base_url    text := current_setting('app.supabase_functions_url', true);
  service_key text := current_setting('app.service_role_key', true);
  r record; n int := 0;
BEGIN
  IF base_url IS NULL OR service_key IS NULL THEN
    RAISE WARNING '[relations-refresh] GUCs fehlen'; RETURN;
  END IF;
  FOR r IN
    SELECT unipile_account_id FROM public.unipile_accounts
    WHERE status = 'OK' AND unipile_account_id IS NOT NULL
      AND (abs(hashtext(unipile_account_id)) % 24) = extract(hour FROM (now() AT TIME ZONE 'utc'))::int
  LOOP
    PERFORM net.http_post(
      url     := base_url || '/import-unipile-relations',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || service_key),
      body    := jsonb_build_object('unipile_account_id', r.unipile_account_id)
    );
    n := n + 1;
  END LOOP;
  RAISE NOTICE '[relations-refresh] % Accounts gefeuert', n;
END $function$;

COMMIT;
-- Cron (als supabase_admin anlegen!): SELECT cron.schedule('relations-refresh-hourly','20 * * * *','SELECT public.trigger_relations_refresh()');

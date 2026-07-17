-- Brand Memory ist brand-scoped: Zugriff muss dem Marken-Zugriff folgen (inkl. Sharing).
-- Alte brand_memory_access-Policy prüfte nur Owner/Heimat-Team → geteilte Marken
-- (brand_voice_shares / bv_team_shared) waren blockiert, obwohl die Marke sichtbar ist.
-- Neu: USING spiegelt brand_voices_visibility, WITH CHECK spiegelt brand_voices_update.

DROP POLICY IF EXISTS brand_memory_access ON public.brand_memory;

CREATE POLICY brand_memory_access ON public.brand_memory
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.brand_voices b
      WHERE b.id = brand_memory.brand_voice_id
        AND (
          (b.team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
            AND (b.user_id = auth.uid() OR b.is_shared = true))
          OR b.id IN (SELECT brand_voice_id FROM public.brand_voice_shares WHERE user_id = auth.uid())
          OR public.bv_team_shared(b.id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.brand_voices b
      WHERE b.id = brand_memory.brand_voice_id
        AND (
          b.user_id = auth.uid()
          OR (b.is_shared = true AND b.team_id = ANY (public.get_my_team_ids()))
          OR b.id IN (SELECT brand_voice_id FROM public.brand_voice_shares WHERE user_id = auth.uid())
          OR public.bv_team_shared(b.id)
        )
    )
  );

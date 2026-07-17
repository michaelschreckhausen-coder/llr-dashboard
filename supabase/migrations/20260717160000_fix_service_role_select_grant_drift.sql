-- ============================================================================
-- Fix: service_role SELECT-GRANT-Drift (Self-Host Top-Fallstrick #12)
-- ============================================================================
-- 13 public-Tabellen ohne service_role-SELECT → EF-Service-Clients bekommen 42501
-- (permission denied), von den EFs fail-closed als "kein Zugriff" verschluckt.
-- Belegter aktiver Lockout: brand_voice_team_shares + brand_voice_shares (via
-- _shared/tenant.ts loadBrandVoiceIfAllowed in generate/text-werkstatt-chat) und
-- content_documents (via brandPrompt.ts buildBrandCorpus). Rest = selbe Klasse,
-- latent (noch keine EF-.from(), aber Grant-Lücke real).
--
-- SELECT-only: kein Service-seitiges Schreiben auf diese Tabellen belegt → SELECT
-- deckt 100% der realen Lockouts. Kein GRANT ALL (keine belegte Write-Nutzung).
-- ADDITIV: NUR GRANT — kein REVOKE, keine Policy-Berührung. authenticated/anon
-- bleiben exakt wie sie sind. Idempotent (GRANT wiederholbar).
-- tenant.ts-Härtung (error prüfen statt data-only) = SEPARATER EF-Deploy, NICHT hier.
-- ============================================================================
BEGIN;
GRANT SELECT ON public.assistant_conversations     TO service_role;
GRANT SELECT ON public.brand_voice_shares          TO service_role;
GRANT SELECT ON public.brand_voice_team_shares     TO service_role;
GRANT SELECT ON public.content_documents           TO service_role;
GRANT SELECT ON public.knowledge_base_shares       TO service_role;
GRANT SELECT ON public.knowledge_base_team_shares  TO service_role;
GRANT SELECT ON public.lead_tag_registry           TO service_role;
GRANT SELECT ON public.monitoring_checks           TO service_role;
GRANT SELECT ON public.profile_checks              TO service_role;
GRANT SELECT ON public.system_banners              TO service_role;
GRANT SELECT ON public.target_audience_shares      TO service_role;
GRANT SELECT ON public.target_audience_team_shares TO service_role;
GRANT SELECT ON public.visual_chats                TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';

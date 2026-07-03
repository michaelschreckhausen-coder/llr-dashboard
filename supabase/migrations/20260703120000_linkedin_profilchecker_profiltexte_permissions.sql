-- LinkedIn-Permissions: Profiltexte-Key-Alignment + Profil-Checker (2026-07-03).
-- =============================================================================
-- Customer-App-Enforcement prueft linkedin.profile_texts (bereits heute) und ab
-- diesem Deploy zusaetzlich linkedin.profil_checker. Der Admin-Katalog wurde auf
-- dieselben kanonischen Keys umgestellt (branding.linkedin_texts entfernt).
-- Diese Migration bringt die plans.permissions-DATEN auf denselben Stand.
--
-- plans.permissions = jsonb-ARRAY von Key-Strings (Pre-Flight verifiziert),
-- plans.modules = text[].
--
-- Idempotent + additiv, dedup-sicher:
--   (1) branding.linkedin_texts -> linkedin.profile_texts, nur wo der Legacy-Key
--       existiert. Auf Prod betrifft das genau EINEN Plan: "Health Angels"
--       (slug=sales_team_automation). Auf Staging No-op (kein Plan hat den Key).
--   (2) linkedin.profil_checker an alle Plaene MIT linkedin.profile_texts UND
--       aktivem linkedin-Modul. Schliesst bewusst aus:
--         - free            (hat kein profile_texts)
--         - salesplay_webinar (hat kein linkedin-Modul -> ModuleGuard blockt eh)
--       Health Angels matcht nach (1) im selben TX (hat dann profile_texts +
--       linkedin-Modul) und erhaelt beide Keys automatisch.
--
-- Re-Run-safe: (1) WHERE ? scheitert nach erstem Lauf; (2) NOT ? verhindert Dups.
-- =============================================================================

begin;

-- (1) Legacy-Key -> kanonisch (append profile_texts nur wenn noch nicht da -> kein Dup).
update public.plans
set permissions = (permissions - 'branding.linkedin_texts')
                  || (case when permissions ? 'linkedin.profile_texts'
                           then '[]'::jsonb
                           else '["linkedin.profile_texts"]'::jsonb end)
where permissions ? 'branding.linkedin_texts';

-- (2) Profil-Checker an Plaene mit profile_texts + linkedin-Modul.
update public.plans
set permissions = permissions || '["linkedin.profil_checker"]'::jsonb
where permissions ? 'linkedin.profile_texts'
  and 'linkedin' = any(modules)
  and not (permissions ? 'linkedin.profil_checker');

-- ── Verify im selben TX, vor COMMIT ──────────────────────────────────────────
-- Health Angels: beide Keys, kein Legacy mehr. salesplay_webinar: unangetastet
-- (profile_texts ja, profil_checker NEIN). free: weder Key.
select slug, name,
       (permissions ? 'linkedin.profile_texts') as profile_texts,
       (permissions ? 'linkedin.profil_checker') as profil_checker,
       (permissions ? 'branding.linkedin_texts') as legacy_branding_lt,
       ('linkedin' = any(modules))               as li_module
from public.plans
where slug in ('sales_team_automation', 'salesplay_webinar', 'free')
order by slug;

-- Guard: kein Plan darf mehr den Legacy-Key tragen (muss 0 sein).
select 'plans_mit_legacy_branding_linkedin_texts=' || count(*) as guard_legacy
from public.plans where permissions ? 'branding.linkedin_texts';

-- Info: wie viele Plaene tragen jetzt profil_checker.
select 'plans_mit_profil_checker=' || count(*) as info_checker
from public.plans where permissions ? 'linkedin.profil_checker';

commit;

notify pgrst, 'reload schema';

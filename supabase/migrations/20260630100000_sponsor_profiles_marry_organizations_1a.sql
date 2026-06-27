-- 20260630100000_sponsor_profiles_marry_organizations_1a.sql
-- Sponsor = Unternehmen (strikte 1:1-Extension von public.organizations), TEIL 1a.
-- NICHT spalten-destruktiv: legt fehlende organizations an, haengt die Extensions ein,
-- erzwingt 1:1 (NOT NULL + UNIQUE) und stellt den FK auf ON DELETE CASCADE.
-- Die gedoppelten Spalten (name/website/linkedin_url) werden ERST in 1b gedroppt,
-- nachdem Frontend/EF/RPC nicht mehr darauf lesen → kein Breakage-Fenster.
-- Idempotent (Orphan-Loop nur solange Quell-Spalten existieren + organization_id NULL).

BEGIN;

-- 1) Orphan-Anlage: je Extension ohne organization_id ein organizations-Row.
--    Mapping: name->name, website->website, linkedin_url->linkedin_company_url, team_id->team_id.
--    EEXECUTE + IF-EXISTS-Guard → bleibt nach dem 1b-Drop fehlerfrei re-runbar.
DO $$
DECLARE r record; v_org uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='sponsoring' AND table_name='sponsor_profiles' AND column_name='name') THEN
    FOR r IN EXECUTE
      'SELECT id, team_id, name, website, linkedin_url FROM sponsoring.sponsor_profiles WHERE organization_id IS NULL'
    LOOP
      INSERT INTO public.organizations (name, team_id, website, linkedin_company_url)
      VALUES (COALESCE(NULLIF(btrim(r.name), ''), 'Unbenannt'), r.team_id,
              NULLIF(r.website, ''), NULLIF(r.linkedin_url, ''))
      RETURNING id INTO v_org;
      UPDATE sponsoring.sponsor_profiles SET organization_id = v_org WHERE id = r.id;
    END LOOP;
  END IF;
END $$;

-- 2) 1:1 erzwingen: organization_id NOT NULL
ALTER TABLE sponsoring.sponsor_profiles ALTER COLUMN organization_id SET NOT NULL;

-- 3) FK ON DELETE SET NULL -> CASCADE (NOT NULL vertraegt kein SET NULL; Extension stirbt mit dem Unternehmen)
ALTER TABLE sponsoring.sponsor_profiles DROP CONSTRAINT IF EXISTS sponsor_profiles_organization_id_fkey;
ALTER TABLE sponsoring.sponsor_profiles
  ADD CONSTRAINT sponsor_profiles_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 4) UNIQUE: genau eine Extension pro Unternehmen
ALTER TABLE sponsoring.sponsor_profiles DROP CONSTRAINT IF EXISTS sponsor_profiles_organization_id_key;
ALTER TABLE sponsoring.sponsor_profiles
  ADD CONSTRAINT sponsor_profiles_organization_id_key UNIQUE (organization_id);

COMMIT;

NOTIFY pgrst, 'reload schema';

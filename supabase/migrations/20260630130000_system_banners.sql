-- Admin-gesteuerte Hinweis-Banner fürs Customer-Dashboard (z.B. Extension-Update).
-- Lesbar für alle authenticated, schreibbar nur für Leadesk-Admins (is_leadesk_admin-Claim).
-- Idempotent. Staging-first, dann Prod.
BEGIN;

CREATE TABLE IF NOT EXISTS public.system_banners (
  key         text PRIMARY KEY,
  enabled     boolean NOT NULL DEFAULT false,
  title       text,
  message     text,
  min_version text,
  cta_label   text,
  cta_url     text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid
);

ALTER TABLE public.system_banners ENABLE ROW LEVEL SECURITY;

-- Alle eingeloggten User dürfen lesen (Dashboard rendert daraus)
DROP POLICY IF EXISTS system_banners_read ON public.system_banners;
CREATE POLICY system_banners_read ON public.system_banners FOR SELECT USING (true);

-- Nur Leadesk-Admins dürfen schreiben (JWT-Claim, NICHT profiles.role — Fallstrick #9)
DROP POLICY IF EXISTS system_banners_admin_write ON public.system_banners;
CREATE POLICY system_banners_admin_write ON public.system_banners FOR ALL
  USING (COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false))
  WITH CHECK (COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false));

-- Hetzner self-host: keine Default-Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_banners TO authenticated;

-- Default-Zeile für den Extension-Hinweis (deaktiviert)
INSERT INTO public.system_banners (key, enabled, title, message, min_version, cta_label, cta_url)
VALUES (
  'extension_update', false,
  'Wichtiges Update der Leadesk Chrome-Extension',
  'Bitte installiere bzw. aktualisiere die Leadesk Chrome-Extension. Ohne die aktuelle Version funktionieren einige Funktionen nicht korrekt (z.B. LinkedIn-Import, Vernetzungs-Abgleich, Profil-Checker).',
  '9.30.0',
  'Extension installieren / aktualisieren',
  'https://chromewebstore.google.com/detail/leadesk/iikeboliakdgmmaefjjemfakndfelpof'
)
ON CONFLICT (key) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';

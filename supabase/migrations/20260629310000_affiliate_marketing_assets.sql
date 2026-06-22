-- 20260629310000_affiliate_marketing_assets.sql
-- Affiliate-System Phase 9 — Marketing-Material-CMS.
-- Storage-Bucket (public-read, admin-write, 10MB, image-MIME) + Asset-Table + RPCs.

BEGIN;

-- 1. Storage-Bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('affiliate-marketing-assets', 'affiliate-marketing-assets', true, 10485760,
        ARRAY['image/png','image/jpeg','image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- Storage-RLS: public read, admin write (scoped auf den Bucket).
DROP POLICY IF EXISTS affiliate_assets_public_read ON storage.objects;
CREATE POLICY affiliate_assets_public_read ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'affiliate-marketing-assets');
DROP POLICY IF EXISTS affiliate_assets_admin_write ON storage.objects;
CREATE POLICY affiliate_assets_admin_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'affiliate-marketing-assets'
              AND COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false));
DROP POLICY IF EXISTS affiliate_assets_admin_modify ON storage.objects;
CREATE POLICY affiliate_assets_admin_modify ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'affiliate-marketing-assets'
         AND COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false));

-- 2. Asset-Table
CREATE TABLE IF NOT EXISTS public.affiliate_marketing_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,        -- banner_png | social_caption | email_snippet | youtube_description
  title_de text NOT NULL,
  title_en text NOT NULL,
  description_de text,
  description_en text,
  asset_url text,            -- Storage-URL (Bilder), NULL bei Text-Assets
  content_de text,           -- Text-Assets: HTML/Markdown-Body
  content_en text,
  file_size_bytes int,
  mime_type text,
  width_px int,
  height_px int,
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  CONSTRAINT affiliate_marketing_assets_kind_chk CHECK (kind IN ('banner_png','banner_jpg','social_caption','email_snippet','youtube_description'))
);
CREATE INDEX IF NOT EXISTS idx_marketing_assets_kind ON public.affiliate_marketing_assets(kind, is_active, sort_order);

ALTER TABLE public.affiliate_marketing_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketing_assets_read ON public.affiliate_marketing_assets;
CREATE POLICY marketing_assets_read ON public.affiliate_marketing_assets FOR SELECT TO authenticated
  USING (is_active = true OR COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false));

GRANT SELECT ON public.affiliate_marketing_assets TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.affiliate_marketing_assets FROM authenticated;
GRANT ALL ON public.affiliate_marketing_assets TO service_role;

-- 3. RPCs
CREATE OR REPLACE FUNCTION public.list_affiliate_marketing_assets(p_kind text DEFAULT NULL)
 RETURNS SETOF public.affiliate_marketing_assets
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT * FROM public.affiliate_marketing_assets
  WHERE is_active = true AND (p_kind IS NULL OR kind = p_kind)
  ORDER BY kind, sort_order, created_at;
$function$;

CREATE OR REPLACE FUNCTION public.admin_upload_marketing_asset(
  p_kind text, p_title_de text, p_title_en text, p_description_de text, p_description_en text,
  p_asset_url text, p_content_de text, p_content_en text,
  p_file_size int, p_mime_type text, p_width int, p_height int
) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE v_admin uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_admin IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required'; END IF;
  IF p_kind NOT IN ('banner_png','banner_jpg','social_caption','email_snippet','youtube_description') THEN
    RAISE EXCEPTION 'invalid kind %', p_kind; END IF;
  IF COALESCE(p_title_de,'')='' OR COALESCE(p_title_en,'')='' THEN RAISE EXCEPTION 'title_de + title_en required'; END IF;

  INSERT INTO public.affiliate_marketing_assets
    (kind, title_de, title_en, description_de, description_en, asset_url, content_de, content_en,
     file_size_bytes, mime_type, width_px, height_px, created_by)
  VALUES (p_kind, p_title_de, p_title_en, p_description_de, p_description_en, p_asset_url, p_content_de, p_content_en,
          p_file_size, p_mime_type, p_width, p_height, v_admin)
  RETURNING id INTO v_id;

  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, field_name, before_value, after_value, reason)
  VALUES (v_admin, 'marketing_asset_uploaded', 'affiliate_marketing_assets', v_id, 'kind',
          jsonb_build_object('kind', null), jsonb_build_object('kind', p_kind, 'title', p_title_de), 'Marketing-Asset hochgeladen');
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_archive_marketing_asset(p_id uuid, p_reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE v_admin uuid := auth.uid();
BEGIN
  IF v_admin IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_leadesk_admin')::boolean, false) THEN
    RAISE EXCEPTION 'Not authorized: is_leadesk_admin claim required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN RAISE EXCEPTION 'Reason required (mindestens 10 Zeichen)'; END IF;

  UPDATE public.affiliate_marketing_assets SET is_active = false WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'asset % not found', p_id; END IF;

  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, field_name, before_value, after_value, reason)
  VALUES (v_admin, 'marketing_asset_archived', 'affiliate_marketing_assets', p_id, 'is_active',
          jsonb_build_object('is_active', true), jsonb_build_object('is_active', false), p_reason);
END;
$function$;

REVOKE ALL ON FUNCTION public.list_affiliate_marketing_assets(text) FROM public;
REVOKE ALL ON FUNCTION public.admin_upload_marketing_asset(text,text,text,text,text,text,text,text,int,text,int,int) FROM public;
REVOKE ALL ON FUNCTION public.admin_archive_marketing_asset(uuid,text) FROM public;
GRANT EXECUTE ON FUNCTION public.list_affiliate_marketing_assets(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upload_marketing_asset(text,text,text,text,text,text,text,text,int,text,int,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_archive_marketing_asset(uuid,text) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

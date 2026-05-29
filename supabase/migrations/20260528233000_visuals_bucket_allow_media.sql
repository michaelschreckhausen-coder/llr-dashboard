-- Migration: visuals-Storage-Bucket für Multi-Media öffnen
-- Bisher: nur PNG/JPEG/WEBP, max 10 MB.
-- Neu: zusätzlich Video (MP4/MOV/WebM) und PDF, max 500 MB.

BEGIN;

UPDATE storage.buckets
SET file_size_limit     = 524288000,  -- 500 MB
    allowed_mime_types  = ARRAY[
      'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml',
      'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo',
      'application/pdf'
    ]
WHERE id = 'visuals';

COMMIT;

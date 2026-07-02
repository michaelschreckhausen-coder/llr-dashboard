-- Medien-Bibliothek: erlaubt jetzt auch Office-/Text-Dokumente im visuals-Bucket
-- (bisher nur Bilder/Video/PDF). Idempotent: setzt die vollständige Liste.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/png','image/jpeg','image/webp','image/svg+xml','image/gif',
  'video/mp4','video/quicktime','video/webm','video/x-msvideo',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain','text/csv'
]
WHERE id = 'visuals';

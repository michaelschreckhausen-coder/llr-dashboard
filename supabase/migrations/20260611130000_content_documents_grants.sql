-- 20260611130000_content_documents_grants.sql
-- Fix: "permission denied for table content_documents" (42501).
-- Self-Host: neue Tabellen bekommen KEINEN Auto-Grant — ALTER DEFAULT PRIVILEGES
-- greift nicht für supabase_admin-erstellte Tabellen. RLS allein reicht nicht;
-- die Rolle braucht erst das Table-Privileg. Idempotent.

GRANT ALL    ON public.content_documents TO authenticated;
GRANT SELECT ON public.content_documents TO anon;

NOTIFY pgrst, 'reload schema';

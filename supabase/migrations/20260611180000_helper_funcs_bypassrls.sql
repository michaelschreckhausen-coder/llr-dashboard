-- RLS-Recursion HARTER FIX: SECURITY DEFINER allein reicht nicht, weil der
-- Function-Owner (postgres) hier kein Superuser ist und RLS auch innerhalb
-- der Function greift. Konsequenz: is_task_assignee() liest lead_task_assignees,
-- triggert deren RLS, die wieder is_task_creator() liest lead_tasks, triggert
-- DEREN RLS -> Endlos-Loop.
--
-- Loesung: Owner auf supabase_admin (Superuser, der RLS implicit bypasst).
-- Damit umgeht die Helper-Function die RLS der Subtabelle wie beabsichtigt.

BEGIN;
ALTER FUNCTION public.is_task_creator(uuid, uuid) OWNER TO supabase_admin;
ALTER FUNCTION public.is_task_assignee(uuid)     OWNER TO supabase_admin;
COMMIT;

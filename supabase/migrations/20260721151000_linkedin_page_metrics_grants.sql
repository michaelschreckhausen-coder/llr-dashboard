-- Self-Host: neue Tabelle braucht explizite Grants für service_role (EF) UND authenticated.
GRANT ALL ON public.linkedin_page_metrics TO service_role;
GRANT SELECT ON public.linkedin_page_metrics TO authenticated;

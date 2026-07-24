-- FIX (Regression aus 20260724193000 + 20260724203000): Die 3-Arg-Delegier-Overloads
-- erzeugten mit den 4-Arg-Varianten (p_brand_voice_id DEFAULT NULL) eine
-- Funktions-Mehrdeutigkeit -> jeder 3-Arg-Aufruf (unipile-search, import-unipile-relations)
-- scheiterte mit "Could not choose the best candidate function" -> 0 Importe.
-- Loesung: 3-Arg-Overloads entfernen. 3-Arg-Named-Calls loesen dann eindeutig auf die
-- 4-Arg-Variante auf (4. Arg defaultet auf NULL).
DROP FUNCTION IF EXISTS public.sales_nav_upsert_inbox(uuid,uuid,jsonb);
DROP FUNCTION IF EXISTS public.import_linkedin_to_inbox(uuid,uuid,jsonb);

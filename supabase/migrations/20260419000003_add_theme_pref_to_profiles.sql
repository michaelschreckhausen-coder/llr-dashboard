-- ================================================================
-- Leadesk: User-Theme-Präferenz (Phase Theme-1)
-- ================================================================
--
-- Hintergrund
-- -----------
-- Ab Phase Theme-1 können User zwischen hellem (Cream/Navy Marketing-Look)
-- und dunklem (Glass/Neomorphic) Theme wählen. Die Präferenz wird pro
-- Account gespeichert und über Geräte synchronisiert.
--
-- Werte
-- -----
--   'light'   → Nutzer hat explizit Light gewählt
--   'dark'    → Nutzer hat explizit Dark gewählt
--   NULL      → Nutzer folgt System-Preference (prefers-color-scheme)
--
-- Default für neue User: NULL (folgt System).
-- ================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme_pref text
  CHECK (theme_pref IS NULL OR theme_pref IN ('light','dark'));

COMMENT ON COLUMN public.profiles.theme_pref IS
  'User theme preference: light | dark | NULL (system default)';

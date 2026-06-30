-- Sponsoring OS — M1: Eingabefeld zur Bild-Konkretisierung beim Mockup.
-- prompt = optionale Nutzer-Vorgabe, die generate-mockup an die Bild-Pipeline
-- anhängt (z.B. "LED-Bande mit Fußballspieler neben dem Logo, Hintergrund rot").
-- Additiv + idempotent.

ALTER TABLE sponsoring.mockups
  ADD COLUMN IF NOT EXISTS prompt text;

NOTIFY pgrst, 'reload schema';

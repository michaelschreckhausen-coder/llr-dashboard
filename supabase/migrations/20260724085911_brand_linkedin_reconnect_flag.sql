-- Kennzeichnet Marken, deren alte (OAuth-)LinkedIn-Verbindung beim Unipile-Cutover getrennt
-- wurde und die NEU über Unipile verbunden werden müssen. Treibt den Reconnect-Popup.
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS linkedin_reconnect_required boolean NOT NULL DEFAULT false;

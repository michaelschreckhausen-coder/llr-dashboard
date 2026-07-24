-- ⚠️ MANUELL beim Unipile-PROD-Cutover ausführen (NICHT in migrations/, läuft nicht automatisch).
-- Trennt die alten (OAuth-)LinkedIn-Verbindungen der Bestandsnutzer und markiert die Marken,
-- damit beim nächsten App-Öffnen der Reconnect-Popup (ReconnectLinkedInModal) erscheint.
-- Reihenfolge: ERST nach dem Frontend/EF-Merge auf main ausführen (sonst Popup ohne neuen Flow).

BEGIN;
-- 1) Marken mit alter OAuth-Verbindung markieren
UPDATE public.brand_voices
   SET linkedin_reconnect_required = true
 WHERE linkedin_member_id IS NOT NULL;

-- 2) Alte OAuth-Marker trennen (Verbindung „lösen")
UPDATE public.brand_voices
   SET linkedin_member_id = NULL,
       linkedin_display_name = NULL,
       linkedin_avatar_url = NULL,
       linkedin_verified_at = NULL
 WHERE linkedin_reconnect_required = true;

-- 3) (Optional) evtl. vorhandene alte Unipile-Accounts auf DISCONNECTED setzen, damit der
--    Slot frei ist und der Reconnect sauber greift. Nur ausführen, wenn gewünscht:
-- UPDATE public.unipile_accounts SET status='DISCONNECTED', last_status_update=now()
--  WHERE brand_voice_id IN (SELECT id FROM public.brand_voices WHERE linkedin_reconnect_required=true);

COMMIT;
-- Kontrolle:
-- SELECT count(*) FROM brand_voices WHERE linkedin_reconnect_required;

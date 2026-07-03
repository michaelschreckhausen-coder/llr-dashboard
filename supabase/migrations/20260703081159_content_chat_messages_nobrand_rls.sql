-- Hotfix markenloser Content-Bereich: content_chat_messages-RLS deckte no-brand-Chats nicht ab.
-- Die Policies filtern über can_read_brand_voice(parent.brand_voice_id); bei markenlosen Chats
-- ist brand_voice_id NULL → can_read_brand_voice(NULL)=false → INSERT+SELECT blockiert.
-- Folge: Bild-Nachrichten (client-seitig eingefügt) werden nicht persistiert und loadMessages
-- liefert 0 Zeilen → der optimistische Chat-View wird geleert = "leerer Screen".
-- Fix: Nachrichten in EIGENEN markenlosen Chats (no_brand=true AND created_by=auth.uid()) erlauben.

DROP POLICY IF EXISTS content_chat_messages_select ON content_chat_messages;
CREATE POLICY content_chat_messages_select ON content_chat_messages FOR SELECT
  USING (chat_id IN (
    SELECT id FROM content_chats
    WHERE can_read_brand_voice(brand_voice_id)
       OR (no_brand = true AND created_by = auth.uid())
  ));

DROP POLICY IF EXISTS content_chat_messages_insert ON content_chat_messages;
CREATE POLICY content_chat_messages_insert ON content_chat_messages FOR INSERT
  WITH CHECK (chat_id IN (
    SELECT id FROM content_chats
    WHERE can_read_brand_voice(brand_voice_id)
       OR (no_brand = true AND created_by = auth.uid())
  ));

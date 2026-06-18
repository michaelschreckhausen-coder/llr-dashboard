-- Index für per-Chat Dokument-Tabs (Text-Werkstatt).
CREATE INDEX IF NOT EXISTS idx_content_documents_source_chat ON public.content_documents(source_chat_id);

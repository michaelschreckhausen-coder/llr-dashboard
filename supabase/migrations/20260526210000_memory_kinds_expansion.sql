-- ============================================================
-- Memory-System: kind-Constraint erweitern
--
-- Bisher: nur content-bereich (full_post, hook, improve, brainstorm, visual_prompt)
-- Neu:    Memory auch für Nachrichten, Vernetzungen, Profiltexte
--
-- Damit jede BV Erinnerung über ALLES sammelt was sie geschrieben hat —
-- die KI lernt cross-domain den Stil/Tonalität der Person hinter der BV.
-- ============================================================

BEGIN;

ALTER TABLE public.content_generations
  DROP CONSTRAINT IF EXISTS content_generations_kind_check;

ALTER TABLE public.content_generations
  ADD CONSTRAINT content_generations_kind_check
  CHECK (kind IN (
    -- Content-Studio + Redaktionsplan
    'full_post', 'hook', 'improve', 'brainstorm', 'visual_prompt',
    -- Nachrichten (Messages.jsx — je msgType)
    'message_erstkontakt', 'message_follow_up', 'message_antwort',
    'message_reaktivierung', 'message_dank', 'message_mehrwert',
    -- Vernetzungs-Anschreiben (Vernetzungen.jsx — AnfrageModal)
    'connection_msg',
    -- Profiltexte (Profiltexte.jsx)
    'profile_slogan', 'profile_about', 'profile_position'
  ));

COMMIT;

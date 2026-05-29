// Supabase Edge Function: transcribe
//
// Audio → Text via OpenAI Whisper API.
//
// Request:
//   POST /functions/v1/transcribe
//   Authorization: Bearer <user-JWT>
//   Body: multipart/form-data
//     audio: Audio-Datei (webm/opus, wav, mp3, m4a … alles was Whisper akzeptiert)
//     language: ISO-Code (z.B. 'de', 'en') — optional, Whisper kann auch auto-detect
//     prompt: optionaler System-Prompt für besseres Vokabular (z.B. CRM-Begriffe)
//
// Response: { text, duration_ms, model, language }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY        = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;

const WHISPER_MODEL = "whisper-1";
const DEFAULT_PROMPT = "Leadly, Leadesk, CRM, Kontakt, Aufgabe, Deal, Pipeline, Status, Owner, Vernetzung. Erkenne deutsche Sätze.";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!OPENAI_API_KEY) {
    return json({ error: 'OPENAI_API_KEY not configured on server' }, 500);
  }

  try {
    const auth = req.headers.get('Authorization') || '';
    const jwt = auth.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'Missing Authorization Bearer token' }, 401);

    // JWT verifizieren — nur für eingeloggte User
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: 'Invalid token' }, 401);

    const form = await req.formData();
    const audio = form.get('audio');
    if (!(audio instanceof File) && !(audio instanceof Blob)) {
      return json({ error: 'Missing audio file' }, 400);
    }
    const language = String(form.get('language') || 'de').trim();
    const prompt   = String(form.get('prompt') || DEFAULT_PROMPT).trim();

    const audioBlob = audio instanceof Blob ? audio : new Blob([audio]);
    if (audioBlob.size < 1000) {
      return json({ error: 'Audio file too small (< 1KB) — vermutlich keine Aufnahme' }, 400);
    }
    if (audioBlob.size > 25 * 1024 * 1024) {
      return json({ error: 'Audio file too large (> 25MB) — Whisper-Limit' }, 400);
    }

    // OpenAI Whisper API call
    const whisperForm = new FormData();
    // Filename hint hilft Whisper bei format-detection
    const filename = (audio instanceof File && audio.name)
      || `recording.${(audioBlob.type || 'audio/webm').split('/')[1].split(';')[0] || 'webm'}`;
    whisperForm.append('file', audioBlob, filename);
    whisperForm.append('model', WHISPER_MODEL);
    whisperForm.append('language', language);
    if (prompt) whisperForm.append('prompt', prompt);
    whisperForm.append('response_format', 'json');

    const t0 = Date.now();
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: whisperForm,
    });
    const duration_ms = Date.now() - t0;

    if (!res.ok) {
      const errText = await res.text();
      console.warn('[transcribe] Whisper error:', res.status, errText.slice(0, 200));
      return json({ error: `Whisper ${res.status}: ${errText.slice(0, 200)}` }, 502);
    }
    const data = await res.json();

    return json({
      text: data.text || '',
      duration_ms,
      model: WHISPER_MODEL,
      language,
    });
  } catch (e) {
    console.error('[transcribe] unhandled:', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

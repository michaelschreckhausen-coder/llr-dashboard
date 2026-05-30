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
import { getCallerContext, checkCredits, recordUsage, estimateCredits } from "../_shared/credits.ts";

const OPENAI_API_KEY        = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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
    // Auth + account-Resolution via credits-Helper
    const ctx = await getCallerContext(req, supabaseAdmin);
    if (!ctx) return json({ error: 'Missing/invalid Authorization Bearer token' }, 401);

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

    // Pre-Call Credits-Gate — duration estimate via file-size (1 MB ≈ 1 min für mp3/webm)
    const estimatedMinutes = Math.max(1, Math.ceil(audioBlob.size / (1024 * 1024)));
    const estimated = await estimateCredits('openai', WHISPER_MODEL, 'transcribe', {
      minutes: estimatedMinutes,
    }, supabaseAdmin);
    const check = await checkCredits(ctx.account_id, estimated, supabaseAdmin);
    if (!check.allowed) {
      return json({
        error: check.reason === 'monthly_budget_exceeded'
          ? 'Monatliches Credit-Budget aufgebraucht.'
          : check.reason === 'daily_cap_exceeded'
          ? 'Tägliches Limit erreicht.'
          : 'Credit-Check fehlgeschlagen.',
        code: 'credits_exhausted',
        reason: check.reason,
        remaining: check.remaining,
        estimated,
      }, 402);
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

      // Quota / Rate-Limit (429) → expliziter code, Frontend kann Auto-Fallback fahren.
      // Lower-Case-Match wegen leicht variierender OpenAI-Texte
      // ("You exceeded your current quota" / "Rate limit reached").
      if (res.status === 429) {
        const lower = errText.toLowerCase();
        const isQuota = lower.includes('quota') || lower.includes('billing');
        return json({
          error: isQuota
            ? 'OpenAI-Quota erreicht — bitte Mode auf Schnell (Web Speech) wechseln oder Quota erhöhen.'
            : 'OpenAI Rate-Limit — bitte kurz warten oder Mode auf Schnell wechseln.',
          code: isQuota ? 'quota_exceeded' : 'rate_limit',
          upstream_status: 429,
        }, 429);
      }
      return json({
        error: `Whisper ${res.status}: ${errText.slice(0, 200)}`,
        code: 'whisper_error',
        upstream_status: res.status,
      }, 502);
    }
    const data = await res.json();

    // Post-Call: record_usage mit estimatedMinutes (Whisper-Response hat keine duration im 'json'-Mode)
    await recordUsage(ctx, {
      edge_function: 'transcribe',
      operation: 'transcribe',
      provider: 'openai',
      model: WHISPER_MODEL,
      units: estimatedMinutes,
      unit_type: 'minute',
      status: 'success',
      extra_metadata: { audio_size_bytes: audioBlob.size, language },
    }, supabaseAdmin).catch(() => null);

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

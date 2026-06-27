// Supabase Edge Function: speak
//
// Text → Sprache (TTS) via Azure Speech (Region germanywestcentral, EU-Datenresidenz).
// Teil von Inkrement 1B der "Leadly bekommt ein Gesicht"-Initiative: Leadly
// liest seine Antworten vor. Datenminimierung: an Azure geht NUR Leadlys
// Antworttext — keine CRM-Rohdaten.
//
// Request:
//   POST /functions/v1/speak
//   Authorization: Bearer <user-JWT>
//   Body (JSON): { text: string, voice?: string }
//
// Response:
//   200  audio/mpeg  (mp3-Bytes)
//   4xx/5xx  application/json  { error, code? }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCallerContext, checkCredits, recordUsage, estimateCredits } from "../_shared/credits.ts";

const AZURE_SPEECH_KEY     = Deno.env.get("AZURE_SPEECH_KEY") || "";
const AZURE_SPEECH_REGION  = Deno.env.get("AZURE_SPEECH_REGION") || "germanywestcentral";
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const DEFAULT_VOICE = "de-DE-ConradNeural";
// Whitelist erlaubter Stimmen (kein freier String an Azure → SSML-Injection-Schutz)
const ALLOWED_VOICES = new Set([
  "de-DE-ConradNeural",
  "de-DE-KatjaNeural",
  "de-DE-FlorianMultilingualNeural",
  "de-DE-SeraphinaMultilingualNeural",
  "de-DE-AmalaNeural",
  "de-DE-KillianNeural",
]);
const MAX_CHARS = 3000;            // Azure-Limit + Kostenbremse
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

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

// Markdown/Steuerzeichen → vorlesbarer Klartext
function toSpeakable(raw: string): string {
  return String(raw)
    .replace(/```[\s\S]*?```/g, " ")        // Code-Blöcke
    .replace(/`([^`]+)`/g, "$1")              // Inline-Code
    .replace(/!\[(.*?)\]\(.*?\)/g, "$1")      // Bilder
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")       // Links → Text
    .replace(/^\s*[#>]+\s*/gm, "")             // Überschriften / Quotes
    .replace(/^\s*[-*+]\s+/gm, "")             // Listen-Bullets
    .replace(/[*_~|]/g, "")                    // Restliche Marker
    .replace(/\s+/g, " ")
    .trim();
}

// XML-Escape für SSML
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!AZURE_SPEECH_KEY) {
    return json({ error: "AZURE_SPEECH_KEY not configured on server", code: "not_configured" }, 500);
  }

  try {
    const ctx = await getCallerContext(req, supabaseAdmin);
    if (!ctx) return json({ error: "Missing/invalid Authorization Bearer token" }, 401);

    const body = await req.json().catch(() => null);
    const rawText = body?.text;
    if (typeof rawText !== "string" || !rawText.trim()) {
      return json({ error: "Missing 'text'" }, 400);
    }

    let speakable = toSpeakable(rawText);
    if (!speakable) return json({ error: "Nothing speakable in 'text'" }, 400);
    if (speakable.length > MAX_CHARS) speakable = speakable.slice(0, MAX_CHARS);

    const voice = ALLOWED_VOICES.has(body?.voice) ? body.voice : DEFAULT_VOICE;

    // Credits-Gate (best-effort, konsistent mit transcribe) — Fallback-Estimate greift.
    const estimated = await estimateCredits("azure", voice, "tts", {
      input_chars: speakable.length,
    }, supabaseAdmin);
    const check = await checkCredits(ctx.account_id, estimated, supabaseAdmin);
    if (!check.allowed) {
      return json({
        error: check.reason === "monthly_budget_exceeded"
          ? "Monatliches Credit-Budget aufgebraucht."
          : check.reason === "daily_cap_exceeded"
          ? "Tägliches Limit erreicht."
          : "Credit-Check fehlgeschlagen.",
        code: "credits_exhausted",
        reason: check.reason,
        remaining: check.remaining,
      }, 402);
    }

    const ssml =
      `<speak version="1.0" xml:lang="de-DE">` +
      `<voice name="${voice}">${xmlEscape(speakable)}</voice>` +
      `</speak>`;

    const endpoint = `https://${AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const t0 = Date.now();
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
        "User-Agent": "leadesk-leadly",
      },
      body: ssml,
    });
    const duration_ms = Date.now() - t0;

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("[speak] Azure TTS error:", res.status, errText.slice(0, 200));
      return json({
        error: `Azure TTS ${res.status}`,
        code: "tts_error",
        upstream_status: res.status,
      }, 502);
    }

    const audio = new Uint8Array(await res.arrayBuffer());

    // Post-Call Usage-Logging (best-effort)
    await recordUsage(ctx, {
      edge_function: "speak",
      operation: "tts",
      provider: "azure",
      model: voice,
      units: 1,
      unit_type: "call",
      status: "success",
      extra_metadata: { chars: speakable.length, duration_ms, region: AZURE_SPEECH_REGION },
    }, supabaseAdmin).catch(() => null);

    return new Response(audio, {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[speak] unhandled:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

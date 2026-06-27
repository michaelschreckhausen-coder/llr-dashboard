// Supabase Edge Function: leadly-bridge
//
// Phase 2A der "Leadly bekommt ein Gesicht"-Initiative (Live-Lip-Sync-Avatar).
// OpenAI-kompatibler /chat/completions-Endpoint, der die bestehende `leadly`-EF
// verpackt. Ein Streaming-Avatar-Dienst (Tavus, HeyGen LiveAvatar, Anam …) im
// "Bring-your-own-LLM"-Modus zeigt seine LLM-base_url auf diese EF — dadurch
// bleibt **Leadly das Gehirn** (Tools, Brand-Voice, Team-Kontext, Audit, und vor
// allem der Schreib-Guardrail), der Avatar liefert nur Gesicht + Stimme.
//
// Datenfluss:
//   Avatar-Dienst (STT)  ──OpenAI /chat/completions──▶  leadly-bridge
//        ▲                                                    │
//        │ OpenAI-SSE (reply.content)                         ▼
//        └──────────────────────────────────────────  leadly-EF (mode:chat)
//
// Guardrail: `leadly` führt Schreib-Tools NICHT autonom aus, sondern gibt sie als
// pending zurück. Der Avatar spricht also nur Leadlys Text ("Soll ich das tun?");
// die Bestätigungs-Karte erscheint in der App-UI (Phase 2C: geteilter State).
//
// Auth-Modell:
//   - Avatar-Dienst authentifiziert sich mit LEADLY_BRIDGE_KEY (als sein
//     LLM-"api_key" → Authorization: Bearer <key> ODER x-api-key).
//   - User-Identität: ein echtes Supabase-User-Access-Token, das beim Erzeugen
//     der Avatar-Konversation mitgegeben wird (Phase 2C). Reihenfolge der Quellen:
//     Header x-leadesk-user-token → Body.leadesk_user_token → Body.user (falls JWT)
//     → Env LEADLY_BRIDGE_DEV_JWT (nur Staging-Spike). Mit diesem Token ruft die
//     Bridge die leadly-EF (getCallerContext validiert es dort).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const LEADLY_BRIDGE_KEY   = Deno.env.get("LEADLY_BRIDGE_KEY") || "";
const LEADLY_BRIDGE_DEV_JWT = Deno.env.get("LEADLY_BRIDGE_DEV_JWT") || ""; // optional, nur Staging
const SUPABASE_ANON_KEY   = Deno.env.get("SUPABASE_ANON_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, x-leadesk-user-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonErr(message: string, status = 400, type = "invalid_request_error") {
  // OpenAI-kompatibles Error-Format
  return new Response(JSON.stringify({ error: { message, type } }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function looksLikeJwt(s: unknown): s is string {
  return typeof s === "string" && s.split(".").length === 3 && s.length > 40;
}

// Bridge-Authentifizierung (Avatar-Dienst): erlaubt, wenn LEADLY_BRIDGE_KEY
// gesetzt ist und der Caller ihn als Bearer ODER x-api-key mitschickt.
function bridgeAuthorized(req: Request): boolean {
  if (!LEADLY_BRIDGE_KEY) return false; // nicht konfiguriert → dicht
  const auth = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const xkey = (req.headers.get("x-api-key") || "").trim();
  return auth === LEADLY_BRIDGE_KEY || xkey === LEADLY_BRIDGE_KEY;
}

// User-Token aus den möglichen Quellen ziehen (siehe Header-Kommentar).
function resolveUserToken(req: Request, body: Record<string, unknown>): string {
  const hdr = (req.headers.get("x-leadesk-user-token") || "").trim();
  if (looksLikeJwt(hdr)) return hdr;
  if (looksLikeJwt(body.leadesk_user_token)) return body.leadesk_user_token;
  if (looksLikeJwt(body.user)) return body.user; // OpenAI 'user'-Feld, falls als JWT gesetzt
  if (looksLikeJwt(LEADLY_BRIDGE_DEV_JWT)) return LEADLY_BRIDGE_DEV_JWT;
  return "";
}

// OpenAI-messages → leadly-messages (nur user/assistant, system droppt leadly selbst).
function toLeadlyMessages(messages: unknown): Array<{ role: string; content: string }> {
  if (!Array.isArray(messages)) return [];
  const out: Array<{ role: string; content: string }> = [];
  for (const m of messages) {
    const role = (m as { role?: string })?.role;
    let content = (m as { content?: unknown })?.content;
    if (Array.isArray(content)) {
      // OpenAI content-parts → Text zusammenfügen
      content = content.map((p) => (typeof p === "string" ? p : (p?.text || ""))).join(" ");
    }
    if ((role === "user" || role === "assistant") && typeof content === "string" && content.trim()) {
      out.push({ role, content: content.trim() });
    }
  }
  return out.slice(-20); // Kontext-Cap
}

// leadly-EF aufrufen, Antworttext zurückgeben.
async function callLeadly(userToken: string, messages: Array<{ role: string; content: string }>): Promise<{ ok: true; text: string } | { ok: false; status: number; error: string }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/leadly`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${userToken}`,
      "Content-Type": "application/json",
      ...(SUPABASE_ANON_KEY ? { "apikey": SUPABASE_ANON_KEY } : {}),
    },
    body: JSON.stringify({ mode: "chat", messages }),
  });
  if (!res.ok) {
    let msg = `leadly ${res.status}`;
    try { const j = await res.json(); msg = j?.error || msg; } catch { /* ignore */ }
    return { ok: false, status: res.status, error: msg };
  }
  const data = await res.json().catch(() => null);
  let text = typeof data?.reply?.content === "string" ? data.reply.content.trim() : "";

  // ─── Guardrail-Transparenz im Avatar-Pfad ────────────────────────────
  // leadly führt Schreib-Tools NIE autonom aus (server-seitiger Guardrail),
  // sondern liefert requires_confirmation + pending_actions. Die Bridge ruft
  // NIEMALS confirmed_action — schreibend passiert hier strukturell nichts.
  // Damit der Avatar nicht fälschlich "erledigt" suggeriert, sprechen wir den
  // Vorschlag ehrlich aus und verweisen auf die App-Bestätigung.
  const pending = Array.isArray(data?.pending_actions) ? data.pending_actions : [];
  const requiresConfirm = data?.requires_confirmation === true || pending.length > 0;
  if (requiresConfirm) {
    const summaries = pending.map((p: { summary?: string }) => p?.summary).filter(Boolean).join("; ");
    const ask = summaries ? `Ich kann das vorbereiten: ${summaries}.` : "";
    text = [
      text,
      ask,
      "Zum Ausführen bestätige es bitte in der App — über die Sprachsteuerung führe ich nichts Schreibendes ungefragt aus.",
    ].filter(Boolean).join(" ");
  }

  if (!text) text = "Einen Moment — ich schaue mir das an.";
  return { ok: true, text };
}

// Text in kleine Chunks zerlegen (für token-artiges SSE-Streaming → Avatar
// startet TTS/Lip-Sync früher; leadly liefert die Antwort am Stück).
function chunkText(text: string): string[] {
  const parts = text.match(/\S+\s*/g) || [text]; // wortweise inkl. Trenner
  const chunks: string[] = [];
  let buf = "";
  for (const p of parts) {
    buf += p;
    if (buf.length >= 24) { chunks.push(buf); buf = ""; }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

const enc = new TextEncoder();
const nowId = () => `chatcmpl-${crypto.randomUUID()}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return jsonErr("Method not allowed", 405);

  if (!bridgeAuthorized(req)) {
    return jsonErr("Unauthorized: invalid or missing bridge key", 401, "authentication_error");
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const userToken = resolveUserToken(req, body);
  if (!userToken) {
    return jsonErr("No Leadesk user token provided (x-leadesk-user-token / body.leadesk_user_token / dev-jwt)", 401, "authentication_error");
  }

  const messages = toLeadlyMessages(body.messages);
  if (messages.length === 0) {
    return jsonErr("No user/assistant messages provided", 400);
  }

  const model = typeof body.model === "string" ? body.model : "leadly";
  const stream = body.stream === true;

  const result = await callLeadly(userToken, messages);
  if (!result.ok) {
    const status = result.status === 401 ? 401 : 502;
    return jsonErr(`Leadly upstream: ${result.error}`, status, status === 401 ? "authentication_error" : "api_error");
  }
  const answer = result.text;

  // ─── Non-Streaming ───────────────────────────────────────────────
  if (!stream) {
    return new Response(JSON.stringify({
      id: nowId(),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        message: { role: "assistant", content: answer },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    }), { headers: { ...CORS, "Content-Type": "application/json" } });
  }

  // ─── Streaming (OpenAI SSE) ──────────────────────────────────────
  const id = nowId();
  const created = Math.floor(Date.now() / 1000);
  const sse = (obj: unknown) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);
  const baseChunk = (delta: unknown, finish: string | null) => ({
    id, object: "chat.completion.chunk", created, model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  });

  const readable = new ReadableStream({
    start(controller) {
      controller.enqueue(sse(baseChunk({ role: "assistant" }, null)));
      for (const c of chunkText(answer)) {
        controller.enqueue(sse(baseChunk({ content: c }, null)));
      }
      controller.enqueue(sse(baseChunk({}, "stop")));
      controller.enqueue(enc.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      ...CORS,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});

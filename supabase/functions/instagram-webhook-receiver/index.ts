// Supabase Edge Function: instagram-webhook-receiver
//
// BYOA-Modell: Multi-Tenant Webhook-Receiver mit per-Connection SHA256-Validation.
//
// URL-Format:
//   GET  /functions/v1/instagram-webhook-receiver/<connection_id>   — Verify-Handshake
//   POST /functions/v1/instagram-webhook-receiver/<connection_id>   — Event-Notification
//
// Verify (GET):
//   Meta sendet ?hub.mode=subscribe&hub.challenge=...&hub.verify_token=...
//   Wir matchen verify_token gegen pm_instagram_accounts.webhook_verify_token.
//   Bei Match: respond with hub.challenge (raw int).
//
// Event (POST):
//   Meta sendet Payload mit X-Hub-Signature-256: sha256=<hmac>.
//   Wir berechnen HMAC mit decrypted meta_app_secret und vergleichen.
//   Bei Match: payload nach field-name dispatchen + 200 OK.
//   Bei Mismatch: 401 + Audit-Log-Eintrag.
//
// SKELETON-LEVEL — Dispatch-Handler sind TODO. Vor Production:
//   - MessageHandler (messages, message_reactions, message_echoes, ...)
//   - CommentHandler (comments inkl. mentions)
//   - StoryInsightHandler (story_insights)
//   - LeadAdsHandler (leadgen — separater Page-Webhook, evtl. eigene Function)
//   - Lead-Erzeugung (leads-Tabelle, source-Mapping)
//   - 24h-Window-Tracking (last_inbound_at update für pm_instagram_conversations)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PM_INSTAGRAM_MASTER_KEY   = Deno.env.get("PM_INSTAGRAM_MASTER_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseConnectionId(url: URL): string | null {
  // /functions/v1/instagram-webhook-receiver/<connection_id>[?...]
  const parts = url.pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  // basic uuid sanity (8-4-4-4-12 hex)
  if (!last || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(last)) {
    return null;
  }
  return last;
}

async function getConnection(connectionId: string) {
  const { data, error } = await supabaseAdmin
    .from("pm_instagram_accounts")
    .select("id, team_id, meta_app_secret_encrypted, webhook_verify_token, subscribed_fields")
    .eq("id", connectionId)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data) {
    console.error("[webhook] connection lookup failed:", error?.message);
    return null;
  }
  return data;
}

async function decryptAppSecret(ciphertext: Uint8Array): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc("pm_instagram_decrypt", {
    p_ciphertext: ciphertext,
    p_key: PM_INSTAGRAM_MASTER_KEY,
  });
  if (error || !data) {
    console.error("[webhook] decrypt failed:", error?.message);
    return null;
  }
  return data as string;
}

// ─── Signature-Validation ───────────────────────────────────────────────────

async function verifySignature(rawBody: string, signatureHeader: string, appSecret: string): Promise<boolean> {
  // signatureHeader is in the form "sha256=<hex>"
  const expected = signatureHeader.replace(/^sha256=/, "");

  const keyData = new TextEncoder().encode(appSecret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const macBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const macHex = Array.from(new Uint8Array(macBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // constant-time compare
  if (macHex.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < macHex.length; i++) {
    diff |= macHex.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// ─── Verify-Handshake (GET) ─────────────────────────────────────────────────

async function handleVerify(url: URL, conn: { webhook_verify_token: string }): Promise<Response> {
  const mode      = url.searchParams.get("hub.mode");
  const challenge = url.searchParams.get("hub.challenge");
  const token     = url.searchParams.get("hub.verify_token");

  if (mode !== "subscribe" || !challenge || token !== conn.webhook_verify_token) {
    return new Response("Verify failed", { status: 403 });
  }
  return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

// ─── Event-Dispatch (POST) ───────────────────────────────────────────────────

interface WebhookEvent {
  object: string;            // "instagram" | "page"
  entry: Array<{
    id: string;
    time: number;
    changes?: Array<{ field: string; value: unknown }>;
    messaging?: Array<unknown>;
    changed_fields?: string[];
  }>;
}

async function handleEvent(payload: WebhookEvent, connectionId: string): Promise<void> {
  for (const entry of payload.entry || []) {
    // Messaging-Events kommen unter entry.messaging[] (Messenger-Style)
    if (Array.isArray(entry.messaging)) {
      for (const msg of entry.messaging) {
        await dispatchMessageEvent(msg, connectionId);
      }
    }
    // Changes-basierte Events (comments, mentions, story_insights)
    for (const change of entry.changes || []) {
      await dispatchChangeEvent(change.field, change.value, connectionId);
    }
  }
}

async function dispatchMessageEvent(msg: unknown, connectionId: string): Promise<void> {
  // TODO Phase 2:
  //   1. Extract sender.id, recipient.id, message.text, message.mid, timestamp
  //   2. Find or create pm_instagram_conversations row (UPSERT auf connection_id + ig_thread_id)
  //   3. INSERT pm_instagram_messages (UPSERT auf conversation_id + ig_message_id)
  //   4. Update conversation.last_inbound_at für 24h-Window
  //   5. Find/create lead via instagram_scoped_id (= sender.id) — leads-Insert mit team_id
  //   6. Link conversation.lead_id
  console.log("[webhook] TODO: dispatchMessageEvent for connection", connectionId, "payload-keys:", Object.keys(msg ?? {}));
}

async function dispatchChangeEvent(field: string, value: unknown, connectionId: string): Promise<void> {
  // TODO Phase 2:
  //   - field='comments' → INSERT pm_instagram_comments + Lead-Mapping
  //   - field='mentions' → wie comments mit is_mention=true
  //   - field='story_insights' → INSERT pm_instagram_insights_snapshots
  console.log("[webhook] TODO: dispatchChangeEvent", field, "for connection", connectionId, "value-keys:", Object.keys(value as object ?? {}));
}

// ─── Main Handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  const url = new URL(req.url);

  const connectionId = parseConnectionId(url);
  if (!connectionId) {
    return new Response("Invalid connection id", { status: 404 });
  }

  const conn = await getConnection(connectionId);
  if (!conn) {
    return new Response("Connection not found", { status: 404 });
  }

  // Verify-Handshake
  if (req.method === "GET") {
    return handleVerify(url, conn);
  }

  // Event-Notification
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("X-Hub-Signature-256") || "";

  const appSecret = await decryptAppSecret(conn.meta_app_secret_encrypted);
  if (!appSecret) {
    return new Response("App secret decrypt failed", { status: 500 });
  }

  const valid = await verifySignature(rawBody, signature, appSecret);
  if (!valid) {
    console.warn("[webhook] invalid signature for connection", connectionId);
    // TODO: in admin_audit_log eintragen (forensik)
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: WebhookEvent;
  try {
    payload = JSON.parse(rawBody);
  } catch (_e) {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Fire-and-forget — Meta erwartet 200 binnen Sekunden, sonst Retry-Storm.
  // Background-Promise; Errors gehen in Logs.
  handleEvent(payload, connectionId).catch((e) => {
    console.error("[webhook] dispatch failed for connection", connectionId, ":", e);
  });

  return new Response("EVENT_RECEIVED", { status: 200 });
});

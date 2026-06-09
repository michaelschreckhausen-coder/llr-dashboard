// Supabase Edge Function: instagram-oauth-callback
//
// BYOA-Modell: Multi-App-aware OAuth-Callback.
//
// Flow:
//   1. Frontend startet OAuth via /pm_instagram_oauth_state-Insert + Redirect zu Meta.
//   2. Meta redirected hierher mit ?code=... &state=...
//   3. Wir lookupen state → connection_id → pm_instagram_accounts.
//   4. Wir entschlüsseln meta_app_secret_encrypted via pgcrypto + Master-Key (ENV).
//   5. Token-Exchange: code → short-lived → long-lived (60 d).
//   6. Token encrypted in DB schreiben.
//   7. Webhook-Subscription für die gewählten Felder aktivieren (separater Step).
//   8. Redirect zurück ins Frontend mit ?status=ok|error.
//
// SKELETON-LEVEL — alle ECHTEN API-Calls sind TODO-markiert. Vor Production:
//   - Token-Exchange-URL pro login_mode (facebook vs instagram)
//   - Long-Lived-Exchange + Refresh-Endpoint
//   - Page-Access-Token-Holen (bei login_mode='facebook')
//   - Error-Handling für Expired-State / Invalid-Code

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PM_INSTAGRAM_MASTER_KEY   = Deno.env.get("PM_INSTAGRAM_MASTER_KEY")!;
const APP_ORIGIN                = Deno.env.get("APP_ORIGIN") || "https://app.leadesk.de";

// Module-level service-role client.
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function redirect(url: string) {
  return new Response(null, {
    status: 302,
    headers: { ...CORS, Location: url },
  });
}

function errorRedirect(reason: string) {
  return redirect(`${APP_ORIGIN}/settings/integrations/instagram?status=error&reason=${encodeURIComponent(reason)}`);
}

// ─── Encrypt/Decrypt via DB pgcrypto Helpers ─────────────────────────────────

async function decryptText(ciphertext: Uint8Array): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc("pm_instagram_decrypt", {
    p_ciphertext: ciphertext,
    p_key: PM_INSTAGRAM_MASTER_KEY,
  });
  if (error || !data) {
    console.error("[oauth-callback] decrypt failed:", error?.message);
    return null;
  }
  return data as string;
}

async function encryptText(plaintext: string): Promise<Uint8Array | null> {
  const { data, error } = await supabaseAdmin.rpc("pm_instagram_encrypt", {
    p_plaintext: plaintext,
    p_key: PM_INSTAGRAM_MASTER_KEY,
  });
  if (error || !data) {
    console.error("[oauth-callback] encrypt failed:", error?.message);
    return null;
  }
  return data as Uint8Array;
}

// ─── State-Lookup ───────────────────────────────────────────────────────────

interface ConnectionRow {
  id: string;
  team_id: string;
  user_id: string;
  meta_app_id: string;
  meta_app_secret_encrypted: Uint8Array;
  login_mode: "facebook" | "instagram";
  requested_permissions: string[];
}

async function lookupConnectionByState(state: string): Promise<ConnectionRow | null> {
  // Fetch + delete state row (one-shot use).
  const { data: stateRow, error: stateErr } = await supabaseAdmin
    .from("pm_instagram_oauth_state")
    .select("connection_id, expires_at")
    .eq("state", state)
    .maybeSingle();
  if (stateErr || !stateRow) {
    console.error("[oauth-callback] state lookup failed:", stateErr?.message);
    return null;
  }
  if (new Date(stateRow.expires_at) < new Date()) {
    console.error("[oauth-callback] state expired");
    return null;
  }

  const { data: conn, error: connErr } = await supabaseAdmin
    .from("pm_instagram_accounts")
    .select("id, team_id, user_id, meta_app_id, meta_app_secret_encrypted, login_mode, requested_permissions")
    .eq("id", stateRow.connection_id)
    .maybeSingle();
  if (connErr || !conn) {
    console.error("[oauth-callback] connection lookup failed:", connErr?.message);
    return null;
  }

  // One-shot: delete state row.
  await supabaseAdmin.from("pm_instagram_oauth_state").delete().eq("state", state);

  return conn as ConnectionRow;
}

// ─── Token-Exchange (TODO: echte Meta-Endpoints) ─────────────────────────────

interface TokenResult {
  access_token: string;
  expires_at: Date;
  granted_permissions: string[];
  ig_account_id?: string;
  ig_username?: string;
  fb_page_id?: string;
  fb_page_access_token?: string;
}

async function exchangeCodeForLongLivedToken(
  conn: ConnectionRow,
  appSecret: string,
  code: string,
): Promise<TokenResult | null> {
  // TODO Phase 2:
  //   Login-Mode 'facebook':
  //     1. POST https://graph.facebook.com/v25.0/oauth/access_token
  //        ?client_id=<conn.meta_app_id>&client_secret=<appSecret>
  //        &redirect_uri=<this-endpoint>&code=<code>
  //        → short-lived FB user token
  //     2. GET /me/accounts mit dem Token → Page-Liste, find die richtige page_id
  //     3. GET /me/accounts/<page_id>?fields=instagram_business_account → ig_account_id
  //     4. Long-Lived-Exchange via same endpoint mit grant_type=fb_exchange_token
  //
  //   Login-Mode 'instagram':
  //     1. POST https://api.instagram.com/oauth/access_token (short-lived IG token, 1h)
  //     2. GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token (long-lived, 60d)
  //     3. GET https://graph.instagram.com/me?fields=id,username (ig_account_id + username)
  //
  // Diese Skeleton-Implementierung simuliert das Ergebnis.

  console.log("[oauth-callback] TODO: real token exchange for", conn.login_mode, "with code", code.slice(0, 6) + "...");

  // PLACEHOLDER:
  return null;
}

// ─── Main Handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    return errorRedirect(`meta_${errorParam}`);
  }
  if (!code || !state) {
    return errorRedirect("missing_params");
  }

  const conn = await lookupConnectionByState(state);
  if (!conn) {
    return errorRedirect("invalid_state");
  }

  const appSecret = await decryptText(conn.meta_app_secret_encrypted);
  if (!appSecret) {
    return errorRedirect("decrypt_failed");
  }

  const tokenRes = await exchangeCodeForLongLivedToken(conn, appSecret, code);
  if (!tokenRes) {
    return errorRedirect("token_exchange_failed");
  }

  // Encrypt + persist.
  const igTokenEnc = await encryptText(tokenRes.access_token);
  const fbPageTokenEnc = tokenRes.fb_page_access_token
    ? await encryptText(tokenRes.fb_page_access_token)
    : null;

  const { error: updateErr } = await supabaseAdmin
    .from("pm_instagram_accounts")
    .update({
      ig_account_id: tokenRes.ig_account_id,
      ig_username: tokenRes.ig_username,
      fb_page_id: tokenRes.fb_page_id,
      ig_access_token_encrypted: igTokenEnc,
      fb_page_access_token_encrypted: fbPageTokenEnc,
      token_expires_at: tokenRes.expires_at.toISOString(),
      token_last_refreshed_at: new Date().toISOString(),
      granted_permissions: tokenRes.granted_permissions,
      onboarding_step: "oauth_completed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", conn.id);

  if (updateErr) {
    console.error("[oauth-callback] persist failed:", updateErr.message);
    return errorRedirect("persist_failed");
  }

  // TODO Phase 2: webhook subscription aktivieren:
  //   POST /<ig_account_id>/subscribed_apps?subscribed_fields=<conn.subscribed_fields>
  //   ODER /<fb_page_id>/subscribed_apps?subscribed_fields=...

  return redirect(`${APP_ORIGIN}/settings/integrations/instagram?status=ok&connection=${conn.id}`);
});

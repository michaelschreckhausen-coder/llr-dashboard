// supabase/functions/linkedin-publish-post/index.ts
//
// Phase 1a/1b: LinkedIn-Posts-API-Wrapper
//
// Aufrufer:
//   A) Frontend (JWT-Auth) — "Jetzt posten" — Body: { post_id }
//   B) pg_cron (service_role-Bearer) — geplanter Post — Body: { queue_id, post_id }
//
// Flow:
//   1. Auth (JWT oder service_role)
//   2. Post + brand_voice + linkedin_connection laden
//   3. Token-Refresh falls expires in <5min
//   4. POST /rest/posts (text-only in 1a; Bild folgt in 1c)
//   5. content_posts.status='published', linkedin_post_url schreiben
//   6. post_publish_queue.status='published'/'failed'

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LINKEDIN_API_VERSION = "202604";
const LINKEDIN_POSTS_URL   = "https://api.linkedin.com/rest/posts";
const LINKEDIN_TOKEN_URL   = "https://www.linkedin.com/oauth/v2/accessToken";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function refreshAccessToken(admin: any, connection: any, clientId: string, clientSecret: string) {
  if (!connection.refresh_token) {
    return { error: "Kein refresh_token — neu connecten" };
  }
  if (connection.refresh_token_expires_at &&
      new Date(connection.refresh_token_expires_at) < new Date()) {
    return { error: "refresh_token abgelaufen — neu connecten" };
  }

  const params = new URLSearchParams({
    grant_type:    "refresh_token",
    refresh_token: connection.refresh_token,
    client_id:     clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(LINKEDIN_TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    params.toString(),
  });
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.access_token) {
    await admin.from("linkedin_oauth_tokens").update({
      refresh_failed_at: new Date().toISOString(),
      refresh_failure_reason: data?.error_description || data?.error || ("HTTP " + res.status),
    }).eq("id", connection.id);
    return { error: data?.error_description || "Refresh fehlgeschlagen" };
  }

  const expiresIn = Number(data.expires_in || 0);
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  await admin.from("linkedin_oauth_tokens").update({
    access_token:            data.access_token,
    access_token_expires_at: expiresAt.toISOString(),
    last_refresh_at:         new Date().toISOString(),
    refresh_failed_at:       null,
    refresh_failure_reason:  null,
    ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
  }).eq("id", connection.id);

  return { accessToken: data.access_token, expiresAt };
}

async function markPostFailed(admin: any, postId: string, queueId: string | null, errorMsg: string, status?: number, body?: string) {
  const now = new Date().toISOString();
  await admin.from("content_posts").update({
    status:                  "failed",
    publishing_error:        errorMsg,
    last_publish_attempt_at: now,
  }).eq("id", postId);

  if (queueId) {
    await admin.from("post_publish_queue").update({
      status:               "failed",
      error_message:        errorMsg,
      last_response_status: status || null,
      last_response_body:   body || null,
    }).eq("id", queueId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  const clientId     = Deno.env.get("LINKEDIN_CLIENT_ID");
  const clientSecret = Deno.env.get("LINKEDIN_CLIENT_SECRET");
  const supabaseUrl  = Deno.env.get("SUPABASE_URL");
  const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!clientId || !clientSecret) return json({ error: "Server-Konfig: LINKEDIN_*" }, 500);
  if (!supabaseUrl || !serviceKey) return json({ error: "Server-Konfig: SB" }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Nicht autorisiert" }, 401);
  const token = authHeader.slice(7);

  const admin = createClient(supabaseUrl, serviceKey);
  const isServiceRole = (token === serviceKey);
  let invokingUserId: string | null = null;

  if (!isServiceRole) {
    const { data: { user }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !user) return json({ error: "Ungültige Session" }, 401);
    invokingUserId = user.id;
  }

  let body: { post_id?: string; queue_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Ungültiger Body" }, 400); }

  const postId  = (body.post_id  || "").toString();
  const queueId = (body.queue_id || "").toString() || null;
  if (!postId) return json({ error: "post_id fehlt" }, 400);

  // 1) Post laden
  const { data: post, error: postErr } = await admin
    .from("content_posts")
    .select("id, user_id, team_id, title, content, brand_voice_id, visual_id, status, scheduled_at")
    .eq("id", postId)
    .maybeSingle();

  if (postErr || !post)              return json({ error: "Post nicht gefunden" }, 404);
  if (post.status === "published")   return json({ skipped: true, reason: "Bereits veröffentlicht" });
  if (!post.content?.trim())         return json({ error: "Post hat keinen Content" }, 400);
  if (!isServiceRole && invokingUserId && post.user_id !== invokingUserId) {
    return json({ error: "Keine Berechtigung" }, 403);
  }

  // 2) Connection laden
  if (!post.brand_voice_id) {
    return json({ error: "Post hat keine Brand Voice" }, 400);
  }
  const { data: connection, error: connErr } = await admin
    .from("linkedin_oauth_tokens")
    .select("*")
    .eq("brand_voice_id", post.brand_voice_id)
    .is("revoked_at", null)
    .maybeSingle();

  if (connErr) return json({ error: "Connection-Lookup fehlgeschlagen" }, 500);
  if (!connection) {
    await markPostFailed(admin, postId, queueId, "Keine aktive LinkedIn-Verbindung für diese Brand Voice");
    return json({ error: "Keine aktive LinkedIn-Verbindung" }, 400);
  }

  // 3) Token-Refresh falls nötig
  let accessToken = connection.access_token as string;
  const expiresAt = new Date(connection.access_token_expires_at);
  const refreshThreshold = new Date(Date.now() + 5 * 60 * 1000);

  if (expiresAt < refreshThreshold) {
    const refreshed = await refreshAccessToken(admin, connection, clientId, clientSecret);
    if ("error" in refreshed) {
      await markPostFailed(admin, postId, queueId, "Token-Refresh: " + refreshed.error);
      return json({ error: "Token-Refresh: " + refreshed.error }, 401);
    }
    accessToken = refreshed.accessToken;
  }

  // 4) Posts-API-Body (Text-only Phase 1a)
  const postBody = {
    author:         connection.member_urn,
    commentary:     post.content,
    visibility:     "PUBLIC",
    distribution:   { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  // 5) POST an LinkedIn
  const liRes = await fetch(LINKEDIN_POSTS_URL, {
    method: "POST",
    headers: {
      "Authorization":              "Bearer " + accessToken,
      "Content-Type":               "application/json",
      "Linkedin-Version":           LINKEDIN_API_VERSION,
      "X-Restli-Protocol-Version":  "2.0.0",
    },
    body: JSON.stringify(postBody),
  });

  const liBodyText = await liRes.text();
  let liBodyJson: any = null;
  try { liBodyJson = JSON.parse(liBodyText); } catch { /* keine JSON-Antwort */ }

  if (!liRes.ok) {
    const errMsg = liBodyJson?.message || liBodyJson?.error || liBodyText.slice(0, 400) || ("HTTP " + liRes.status);
    await markPostFailed(admin, postId, queueId, "LinkedIn: " + errMsg, liRes.status, liBodyText.slice(0, 1000));
    return json({ error: "LinkedIn Posts-API: " + errMsg, status: liRes.status }, 502);
  }

  const postUrn = liRes.headers.get("x-restli-id") || liBodyJson?.id || null;
  const postUrl = postUrn ? "https://www.linkedin.com/feed/update/" + postUrn + "/" : null;

  // 6) Success speichern
  const now = new Date().toISOString();
  await admin.from("content_posts").update({
    status:                  "published",
    published_at:            now,
    linkedin_post_url:       postUrl,
    publishing_error:        null,
    last_publish_attempt_at: now,
  }).eq("id", postId);

  await admin.from("linkedin_oauth_tokens").update({ last_used_at: now }).eq("id", connection.id);

  if (queueId) {
    await admin.from("post_publish_queue").update({
      status:               "published",
      published_url:        postUrl,
      last_response_status: liRes.status,
      last_response_body:   liBodyText.slice(0, 1000),
    }).eq("id", queueId);
  }

  return json({
    success:           true,
    post_id:           postId,
    linkedin_post_url: postUrl,
    linkedin_post_urn: postUrn,
  });
});

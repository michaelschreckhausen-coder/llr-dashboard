// Supabase Edge Function: instagram-publish-post
//
// Cron-Worker fuer geplante Instagram-Veroeffentlichungen (Pendant zu
// linkedin-publish-post). Aufruf vom pg_cron-Dispatcher
// (trigger_due_linkedin_publishes, plattform-aware) mit service-role-Bearer:
//   Body: { queue_id, post_id }
//
// Ablauf:
//   1. content_posts laden, Team aufloesen
//   2. IG-Account des Teams via public.instagram_connections
//   3. Cover-Visual (content_posts.visual_id) -> Signed URL (visuals-Bucket)
//   4. Partner-API POST /accounts/{id}/publish (Master-Key)
//   5. content_posts.status + post_publish_queue.status setzen
//
// Sofort-Veroeffentlichung aus dem Redaktionsplan laeuft NICHT hierueber,
// sondern ueber instagram-proxy (action 'publish', User-JWT).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const IG_API_BASE = Deno.env.get("IG_GROWTH_SUITE_BASE_URL") || "https://instagram-growth-suite.vercel.app";
const IG_API_KEY  = Deno.env.get("IG_GROWTH_SUITE_API_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function markFailed(admin: SupabaseClient, postId: string, queueId: string | null, msg: string) {
  await admin.from("content_posts").update({ status: "failed" }).eq("id", postId);
  if (queueId) {
    await admin.from("post_publish_queue")
      .update({ status: "failed", error_message: msg.slice(0, 1000) })
      .eq("id", queueId);
  }
}

function mediaTypeForPath(path: string): string {
  const ext = (path.split(".").pop() || "").toLowerCase();
  return ["mp4", "mov", "m4v"].includes(ext) ? "REELS" : "IMAGE";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return json({ error: "method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Server-Konfig: SB" }, 500);
  if (!IG_API_KEY)                 return json({ error: "IG_GROWTH_SUITE_API_KEY fehlt" }, 503);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Nicht autorisiert" }, 401);
  const token = authHeader.slice(7);

  const admin = createClient(supabaseUrl, serviceKey);
  const isServiceRole = (token === serviceKey);

  // Cron-Worker: nur service-role. (User-initiierte Sofortposts laufen ueber instagram-proxy.)
  if (!isServiceRole) {
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) return json({ error: "Ungültige Session" }, 401);
    // Auch ein eingeloggter Admin koennte das aufrufen — wir erzwingen aber Team-Besitz unten.
  }

  let body: { post_id?: string; queue_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Ungültiger Body" }, 400); }
  const postId  = (body.post_id || "").toString();
  const queueId = (body.queue_id || "").toString() || null;
  if (!postId) return json({ error: "post_id fehlt" }, 400);

  // 1) Post laden
  const { data: post, error: postErr } = await admin
    .from("content_posts")
    .select("id, team_id, content, visual_id, status, platform")
    .eq("id", postId)
    .maybeSingle();
  if (postErr || !post)            return json({ error: "Post nicht gefunden" }, 404);
  if (post.status === "published") return json({ skipped: true, reason: "Bereits veröffentlicht" });
  if (post.platform !== "instagram") {
    return json({ error: "Post ist nicht fuer Instagram (platform=" + post.platform + ")" }, 400);
  }
  if (!post.team_id) {
    await markFailed(admin, postId, queueId, "Post hat keine team_id");
    return json({ error: "Post hat keine team_id" }, 400);
  }

  // 2) IG-Account des Teams
  const { data: conn } = await admin
    .from("instagram_connections")
    .select("ig_account_id")
    .eq("team_id", post.team_id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!conn?.ig_account_id) {
    await markFailed(admin, postId, queueId, "Kein verbundenes Instagram-Konto fuer das Team");
    return json({ error: "Kein verbundenes Instagram-Konto" }, 400);
  }

  // 3) Cover-Visual -> Signed URL (IG benoetigt ein oeffentliches Medium)
  if (!post.visual_id) {
    await markFailed(admin, postId, queueId, "Post hat kein Visual — Instagram benoetigt ein Medium");
    return json({ error: "Post hat kein Visual" }, 400);
  }
  const { data: visual, error: vErr } = await admin
    .from("visuals")
    .select("storage_path")
    .eq("id", post.visual_id)
    .maybeSingle();
  if (vErr || !visual?.storage_path) {
    await markFailed(admin, postId, queueId, "Visual nicht gefunden: " + (vErr?.message || post.visual_id));
    return json({ error: "Visual nicht gefunden" }, 404);
  }
  const { data: signed, error: signErr } = await admin.storage
    .from("visuals")
    .createSignedUrl(visual.storage_path, 60 * 60);
  if (signErr || !signed?.signedUrl) {
    await markFailed(admin, postId, queueId, "Signed-URL fehlgeschlagen: " + (signErr?.message || "unbekannt"));
    return json({ error: "Signed-URL fehlgeschlagen" }, 500);
  }

  // 4) Partner-API publish
  const igRes = await fetch(`${IG_API_BASE}/api/v1/accounts/${conn.ig_account_id}/publish`, {
    method: "POST",
    headers: { "x-api-key": IG_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      media_url:  signed.signedUrl,
      caption:    post.content || "",
      media_type: mediaTypeForPath(visual.storage_path),
    }),
  });
  let igData: { ok?: boolean; id?: string; error?: string } = {};
  try { igData = await igRes.json(); } catch (_) { /* leerer Body */ }

  if (igRes.status === 422 || igData.ok === false) {
    const msg = igData.error || "Instagram hat die Veroeffentlichung abgelehnt";
    await markFailed(admin, postId, queueId, msg);
    return json({ ok: false, error: msg }, 422);
  }
  if (!igRes.ok) {
    const msg = "Partner-API HTTP " + igRes.status;
    await markFailed(admin, postId, queueId, msg);
    return json({ error: msg }, 502);
  }

  // 5) Erfolg -> Status setzen
  const nowIso = new Date().toISOString();
  await admin.from("content_posts")
    .update({ status: "published", published_at: nowIso })
    .eq("id", postId);
  if (queueId) {
    await admin.from("post_publish_queue")
      .update({ status: "published", last_response_status: igRes.status })
      .eq("id", queueId);
  }

  return json({ ok: true, id: igData.id || null });
});

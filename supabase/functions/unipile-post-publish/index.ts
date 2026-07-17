// unipile-post-publish — veröffentlicht einen content_post über Unipile (brand-scoped).
// Aufrufer: A) Frontend (JWT) { post_id }   B) Dispatcher/Cron (service_role) { queue_id, post_id }
// Setzt content_posts.linkedin_social_id (für unipile-monitor-Analytics) + status=published.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveUnipileConn, createPost } from "../_shared/unipile.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}
async function markFailed(postId: string, queueId: string | null, msg: string) {
  await admin.from("content_posts").update({ status: "failed", publishing_error: msg, last_publish_attempt_at: new Date().toISOString() }).eq("id", postId);
  if (queueId) await admin.from("post_publish_queue").update({ status: "failed", error_message: msg }).eq("id", queueId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const isService = authHeader === `Bearer ${SB_SERVICE}`;
  let userId: string | null = null;
  if (!isService) {
    const uc = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: { user } } = await uc.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);
    userId = user.id;
  }

  const body = await req.json().catch(() => ({} as any));
  const postId = (body.post_id || "").toString() || null;
  const queueId = (body.queue_id || "").toString() || null;
  if (!postId) return json({ error: "post_id fehlt" }, 400);

  const { data: post, error: pe } = await admin.from("content_posts")
    .select("id, user_id, team_id, title, content, brand_voice_id, visual_id, status").eq("id", postId).maybeSingle();
  if (pe || !post) return json({ error: "Post nicht gefunden" }, 404);
  if (post.status === "published") return json({ skipped: true, reason: "bereits veröffentlicht" });
  if (!post.content?.trim()) return json({ error: "Post hat keinen Content" }, 400);
  if (!isService && userId && post.user_id !== userId) return json({ error: "Keine Berechtigung" }, 403);

  // Brand-scoped Verbindung (Fallback user_id während Übergang)
  const conn = await resolveUnipileConn(admin, { brandVoiceId: post.brand_voice_id, userId: post.user_id });
  if (!conn) { await markFailed(postId, queueId, "Kein aktiver Unipile-LinkedIn-Account für diese Brand"); return json({ error: "keine Unipile-Verbindung" }, 400); }

  // Bild-Anhänge best-effort (nur echte Bilder; Video/PDF folgt separat)
  const attachments: Blob[] = [];
  try {
    const { data: cpv } = await admin.from("content_post_visuals")
      .select("position, visuals(storage_path, media_type)").eq("post_id", postId).order("position", { ascending: true });
    let slides: any[] = (cpv || []).map((r: any) => r.visuals).filter((v: any) => v && v.storage_path);
    if (slides.length === 0 && post.visual_id) {
      const { data: v } = await admin.from("visuals").select("storage_path, media_type").eq("id", post.visual_id).maybeSingle();
      if (v?.storage_path) slides = [v];
    }
    for (const sl of slides) {
      if ((sl.media_type || "image").toLowerCase() !== "image") continue;
      const { data: blob } = await admin.storage.from("visuals").download(sl.storage_path);
      if (blob) {
        const name = (sl.storage_path.split("/").pop()) || "image.jpg";
        attachments.push(new File([blob], name, { type: (blob as Blob).type || "image/jpeg" }));
      }
    }
  } catch (_e) { /* Anhänge best-effort */ }

  let res: any;
  try {
    res = await createPost(conn, post.content, { attachments });
  } catch (e: any) {
    await markFailed(postId, queueId, "Unipile: " + (e?.message || String(e)));
    return json({ error: "Unipile-Post fehlgeschlagen", detail: String(e?.message || e) }, 502);
  }

  const socialId = res?.post_id || res?.id || res?.social_id || null;
  const now = new Date().toISOString();
  await admin.from("content_posts").update({
    status: "published", published_at: now, publish_channel: "unipile",
    linkedin_social_id: socialId, linkedin_account_id: conn.accountId,
  }).eq("id", postId);
  if (queueId) await admin.from("post_publish_queue").update({ status: "published" }).eq("id", queueId);
  return json({ ok: true, social_id: socialId, account: conn.accountId });
});

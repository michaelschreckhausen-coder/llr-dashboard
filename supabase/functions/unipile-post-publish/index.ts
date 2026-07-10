// =====================================================================
// Feature 2 — Post-Publishing über Unipile (Single-Row-Worker, Phase 2a)
// Zwei Trigger (analog Julians linkedin-publish-post):
//   A) Dispatcher (pg_cron trigger_due_linkedin_publishes, service_role-Bearer):
//      Body { queue_id, post_id } — routet nur content_posts mit publish_channel='unipile'.
//   B) Frontend "jetzt sofort" (JWT): Body { post_id } — ohne queue_id.
// KEIN Selbst-Scan der Queue mehr (der Dispatcher ist der einzige Queue-Consumer;
// sonst Doppel-Publish mit /linkedin-publish-post).
//
// Erfolg: schreibt die Monitoring-Brücke content_posts.linkedin_social_id = post_id
// (+ linkedin_account_id, published_url=share_url) und status='published'.
// Fallstrick #1: status (CHECK content_posts_status_check) IMMER separat updaten.
// Fallstrick #12: error-Feld nach jedem Call prüfen.
// =====================================================================
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import {
  createPost,
  getAuthenticatedUser,
  getUnipileConnection,
  serviceClient,
  UnipileError,
} from "../_shared/unipile.ts";

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  const sb = serviceClient();

  // Body zuerst lesen (queueId wird auch im Fehlerpfad gebraucht).
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const postId = String(body.post_id ?? "");
  const queueId = body.queue_id ? String(body.queue_id) : null;
  if (!postId) return jsonResponse({ error: "post_id fehlt" }, 400);

  // Queue-Fehler-Helfer (nur wenn vom Dispatcher aufgerufen).
  async function failQueue(msg: string, rateLimited = false) {
    if (!queueId) return;
    const { error } = await sb.from("post_publish_queue")
      .update({ status: rateLimited ? "pending" : "failed", error_message: msg.slice(0, 500) })
      .eq("id", queueId);
    if (error) console.warn(`[unipile-post-publish] queue update: ${error.message}`);
  }

  try {
    // ── Auth: service_role-Bearer (Dispatcher) ODER JWT (Frontend) ──
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return jsonResponse({ error: "unauthorized" }, 401);
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isServiceRole = token === serviceKey;
    let invokingUserId: string | null = null;
    if (!isServiceRole) {
      const auth = await getAuthenticatedUser(req);
      if (!auth) return jsonResponse({ error: "unauthorized" }, 401);
      invokingUserId = auth.userId;
    }

    // ── Post laden ──
    const { data: post, error: postErr } = await sb.from("content_posts")
      .select("id, user_id, team_id, content, visual_id, status")
      .eq("id", postId)
      .maybeSingle();
    if (postErr) { await failQueue(postErr.message); return jsonResponse({ error: postErr.message }, 500); }
    if (!post) { await failQueue("content_posts nicht gefunden"); return jsonResponse({ error: "Post nicht gefunden" }, 404); }
    if (post.status === "published") return jsonResponse({ skipped: true, reason: "Bereits veröffentlicht" });
    if (!post.content?.trim()) { await failQueue("Post hat keinen Content"); return jsonResponse({ error: "Post hat keinen Content" }, 400); }
    // Ownership-Check nur für JWT-Aufrufe.
    if (!isServiceRole && invokingUserId && post.user_id !== invokingUserId) {
      return jsonResponse({ error: "Keine Berechtigung" }, 403);
    }

    // ── Unipile-Verbindung (status='OK') ──
    const conn = await getUnipileConnection(sb, post.user_id);
    if (!conn) {
      await failQueue("Kein Unipile-Account für User (status OK)");
      return jsonResponse({ error: "Kein aktiver Unipile-LinkedIn-Account verbunden." }, 409);
    }

    // ── Optional: Bild aus visuals-Storage-Bucket laden (wie linkedin-publish-post) ──
    const attachments: Blob[] = [];
    if (post.visual_id) {
      const { data: visual, error: vErr } = await sb.from("visuals")
        .select("storage_path, prompt")
        .eq("id", post.visual_id)
        .maybeSingle();
      if (vErr) console.warn(`[unipile-post-publish] visual lookup: ${vErr.message}`);
      if (visual?.storage_path) {
        const { data: blob, error: dlErr } = await sb.storage.from("visuals").download(visual.storage_path);
        if (dlErr || !blob) {
          await failQueue("Visual-Download: " + (dlErr?.message || "kein Blob"));
          return jsonResponse({ error: "Visual-Download fehlgeschlagen" }, 502);
        }
        const fname = String(visual.storage_path).split("/").pop() || "image";
        attachments.push(new File([blob], fname, { type: blob.type || "image/png" }));
      }
    }

    // ── Publish (multipart) ──
    let resp: any;
    try {
      resp = await createPost(conn, post.content, { attachments });
    } catch (e) {
      const rl = e instanceof UnipileError && e.isRateLimited;
      const msg = String(e).slice(0, 500);
      await failQueue(msg, rl);                 // 429 -> pending (Dispatcher-Retry, attempts<3)
      if (!rl) {
        // Harter Fehler: content_posts als failed markieren (status SEPARAT, Fallstrick #1).
        await sb.from("content_posts").update({ publishing_error: msg, last_publish_attempt_at: new Date().toISOString() }).eq("id", postId);
        await sb.from("content_posts").update({ status: "failed" }).eq("id", postId);
      }
      return jsonResponse({ error: msg, rate_limited: rl }, rl ? 429 : 502);
    }

    // Erfolg: { object: "PostCreated", post_id }
    const socialId = resp?.post_id ?? resp?.social_id ?? resp?.id ?? null;
    const shareUrl = resp?.share_url ?? resp?.url ??
      (socialId ? `https://www.linkedin.com/feed/update/${socialId}` : null);

    // ── Monitoring-Brücke schreiben (status SEPARAT wegen CHECK, Fallstrick #1) ──
    const patch: Record<string, unknown> = {
      linkedin_social_id: socialId,           // = Unipile post_id -> Monitor-GET
      linkedin_account_id: conn.accountId,
      published_at: new Date().toISOString(),
      publishing_error: null,
    };
    if (shareUrl) patch.linkedin_post_url = shareUrl;
    const { error: upErr } = await sb.from("content_posts").update(patch).eq("id", postId);
    if (upErr) console.warn(`[unipile-post-publish] content_posts patch: ${upErr.message}`);
    const { error: stErr } = await sb.from("content_posts").update({ status: "published" }).eq("id", postId);
    if (stErr) console.warn(`[unipile-post-publish] status update: ${stErr.message}`);

    // ── post_publish_queue (nur wenn Dispatcher-Aufruf) ──
    if (queueId) {
      const { error: qErr } = await sb.from("post_publish_queue")
        .update({ status: "published", published_url: shareUrl, error_message: null })
        .eq("id", queueId);
      if (qErr) console.warn(`[unipile-post-publish] queue published: ${qErr.message}`);
    }

    return jsonResponse({
      success: true, post_id: postId,
      linkedin_social_id: socialId, published_url: shareUrl,
    });
  } catch (e) {
    console.error(`[unipile-post-publish] ${e}`);
    await failQueue(String(e));
    return jsonResponse({ error: String(e) }, 500);
  }
});

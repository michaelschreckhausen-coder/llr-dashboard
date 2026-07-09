// =====================================================================
// Feature 2 — Post-Publishing (Worker)
// Cron-getriggert (service_role) ODER user-invoke für Sofort-Publish.
// Picker: post_publish_queue.status='pending' AND scheduled_for <= now().
// Veröffentlicht content_posts.content via Unipile, schreibt social_id +
// published_url zurück.
// =====================================================================
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import {
  createPost,
  getUnipileConnection,
  serviceClient,
  UnipileError,
} from "../_shared/unipile.ts";

const BATCH = 10;

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const sb = serviceClient();
    const nowIso = new Date().toISOString();

    const { data: due, error } = await sb
      .from("post_publish_queue")
      .select("id, post_id, team_id, attempts, scheduled_for, status")
      .eq("status", "pending")
      .lte("scheduled_for", nowIso)
      .order("scheduled_for", { ascending: true })
      .limit(BATCH);
    if (error) return jsonResponse({ error: error.message }, 500);
    if (!due || due.length === 0) return jsonResponse({ ok: true, processed: 0 });

    let published = 0;
    let failed = 0;

    for (const q of due) {
      // Lock: auf in_progress setzen (optimistisch).
      await sb.from("post_publish_queue")
        .update({ status: "in_progress", last_attempt_at: nowIso, attempts: (q.attempts ?? 0) + 1 })
        .eq("id", q.id);

      const { data: post } = await sb.from("content_posts")
        .select("id, user_id, content, title, status, media_urls")
        .eq("id", q.post_id).maybeSingle();

      if (!post || !post.content) {
        await sb.from("post_publish_queue")
          .update({ status: "failed", error_message: "content_posts leer/nicht gefunden" })
          .eq("id", q.id);
        failed++;
        continue;
      }

      const conn = await getUnipileConnection(sb, post.user_id);
      if (!conn) {
        await sb.from("post_publish_queue")
          .update({ status: "failed", error_message: "Kein Unipile-Account für User" })
          .eq("id", q.id);
        failed++;
        continue;
      }

      try {
        const resp = await createPost(conn, post.content, {});
        const socialId = resp?.post_id ?? resp?.social_id ?? resp?.id ?? null;
        const publishedUrl = socialId
          ? `https://www.linkedin.com/feed/update/${socialId}`
          : (resp?.url ?? null);

        await sb.from("post_publish_queue").update({
          status: "published",
          published_url: publishedUrl,
          error_message: null,
        }).eq("id", q.id);

        await sb.from("content_posts").update({
          status: "veröffentlicht",
          published_at: new Date().toISOString(),
          linkedin_social_id: socialId,
          linkedin_account_id: conn.accountId,
        }).eq("id", post.id);

        published++;
      } catch (e) {
        const rl = e instanceof UnipileError && e.isRateLimited;
        // Bei Rate-Limit: zurück auf pending, später erneut versuchen.
        await sb.from("post_publish_queue").update({
          status: rl ? "pending" : "failed",
          error_message: String(e).slice(0, 500),
        }).eq("id", q.id);
        failed++;
        if (rl) break; // Rate-Limit -> restlichen Batch nicht weiter feuern
      }
    }

    return jsonResponse({ ok: true, processed: due.length, published, failed });
  } catch (e) {
    console.error(`[unipile-post-publish] ${e}`);
    return jsonResponse({ error: String(e) }, 500);
  }
});

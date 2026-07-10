// =====================================================================
// Feature 3 — Engagement-Worker (Auto-Kommentar / Reaktion)
// Cron- oder user-getriggert. Verarbeitet linkedin_engagement_jobs
// (status='pending', scheduled_at <= now()). Rate-Guard pro User/Tag.
// =====================================================================
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import {
  addReaction,
  dailyCount,
  getUnipileConnection,
  sendComment,
  serviceClient,
  UnipileError,
} from "../_shared/unipile.ts";

const BATCH = 15;
// Konservative Tageslimits (LinkedIn/Unipile). Ggf. aus Plan ableiten.
const MAX_COMMENTS_PER_DAY = 40;
const MAX_REACTIONS_PER_DAY = 80;

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const sb = serviceClient();
    const nowIso = new Date().toISOString();

    const { data: jobs, error } = await sb
      .from("linkedin_engagement_jobs")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(BATCH);
    if (error) return jsonResponse({ error: error.message }, 500);
    if (!jobs || jobs.length === 0) return jsonResponse({ ok: true, processed: 0 });

    let done = 0, failed = 0, skipped = 0;

    for (const job of jobs) {
      await sb.from("linkedin_engagement_jobs")
        .update({ status: "processing", attempts: (job.attempts ?? 0) + 1, executed_at: nowIso })
        .eq("id", job.id);

      const conn = await getUnipileConnection(sb, job.user_id);
      if (!conn) {
        await sb.from("linkedin_engagement_jobs")
          .update({ status: "error", error: "Kein Unipile-Account" }).eq("id", job.id);
        failed++;
        continue;
      }

      // Rate-Guard
      const usedToday = await dailyCount(sb, "linkedin_engagement_jobs", job.user_id, "executed_at");
      const cap = job.kind === "comment" ? MAX_COMMENTS_PER_DAY : MAX_REACTIONS_PER_DAY;
      if (usedToday > cap) {
        await sb.from("linkedin_engagement_jobs")
          .update({ status: "skipped", error: "Tageslimit erreicht" }).eq("id", job.id);
        skipped++;
        continue;
      }

      const socialId: string | null = job.post_social_id ?? null;
      if (!socialId) {
        await sb.from("linkedin_engagement_jobs")
          .update({ status: "error", error: "post_social_id fehlt (urn:li:activity:...)" })
          .eq("id", job.id);
        failed++;
        continue;
      }

      try {
        let result: any;
        if (job.kind === "comment") {
          let text = job.comment_text;
          if (!text && job.saved_comment_id) {
            const { data: sc } = await sb.from("saved_comments")
              .select("comment_text").eq("id", job.saved_comment_id).maybeSingle();
            text = sc?.comment_text ?? null;
          }
          if (!text) throw new Error("comment_text/saved_comment_id fehlt");
          result = await sendComment(conn, socialId, text);
          if (job.saved_comment_id) {
            await sb.from("saved_comments").update({ used: true }).eq("id", job.saved_comment_id);
          }
        } else {
          result = await addReaction(conn, socialId, job.reaction_type ?? "like");
        }
        await sb.from("linkedin_engagement_jobs")
          .update({ status: "done", result, error: null }).eq("id", job.id);
        done++;
      } catch (e) {
        const rl = e instanceof UnipileError && e.isRateLimited;
        await sb.from("linkedin_engagement_jobs")
          .update({ status: rl ? "pending" : "error", error: String(e).slice(0, 500) })
          .eq("id", job.id);
        failed++;
        if (rl) break;
      }
    }

    return jsonResponse({ ok: true, processed: jobs.length, done, failed, skipped });
  } catch (e) {
    console.error(`[unipile-engagement] ${e}`);
    return jsonResponse({ error: String(e) }, 500);
  }
});

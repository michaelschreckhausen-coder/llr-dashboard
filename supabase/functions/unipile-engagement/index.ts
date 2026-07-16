// =====================================================================
// Feature 3 — Engagement-Worker (Auto-Kommentar / Reaktion), post-scoped.
// Zwei Trigger (Muster wie F5-Härtung / unipile-post-publish):
//   - service-role-Bearer (Cron): ALLE pending Jobs.
//   - JWT (Frontend): NUR Jobs des verifizierten Users (Scope aus JWT, nicht body).
// Verarbeitet linkedin_engagement_jobs (status='pending', scheduled_at <= now).
// Reaktion/Kommentar laufen JSON (verifiziert). Konservative Tageslimits pro kind.
// =====================================================================
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import {
  addReaction,
  getAuthenticatedUser,
  getUnipileConnection,
  resolvePostSocialId,
  sendComment,
  serviceClient,
  UnipileError,
} from "../_shared/unipile.ts";
import { teamHasPermission } from "../_shared/permissions.ts";

const BATCH = 10;                    // kleine Batches (Engagement ist hart limitiert)
const PAUSE_MS = 500;                // Pause zwischen Real-Calls (Rate-Limit-Schonung)
// Konservative Tageslimits pro User/Tag, PRO kind getrennt gezählt.
const MAX_COMMENTS_PER_DAY = 40;
const MAX_REACTIONS_PER_DAY = 80;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Tagesverbrauch PRO kind (comment|reaction) für einen User.
async function dailyKindCount(sb: any, userId: string, kind: string): Promise<number> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count, error } = await sb
    .from("linkedin_engagement_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("status", "done")
    .gte("executed_at", since.toISOString());
  if (error) { console.warn(`[unipile-engagement] dailyKindCount: ${error.message}`); return 0; }
  return count ?? 0;
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  try {
    const sb = serviceClient();
    const nowIso = new Date().toISOString();

    // ── Auth-Gate (Pflicht): kein Token -> 401. service-role -> alle; JWT -> nur eigene. ──
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return jsonResponse({ error: "unauthorized" }, 401);
    const isServiceRole = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    let scopeUserId: string | null = null;
    if (!isServiceRole) {
      const auth = await getAuthenticatedUser(req);
      if (!auth) return jsonResponse({ error: "unauthorized" }, 401);
      scopeUserId = auth.userId;   // Scope aus JWT, NICHT aus dem Body
    }

    let jobQuery = sb
      .from("linkedin_engagement_jobs")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(BATCH);
    if (!isServiceRole && scopeUserId) jobQuery = jobQuery.eq("user_id", scopeUserId);
    const { data: jobs, error } = await jobQuery;
    if (error) return jsonResponse({ error: error.message }, 500);
    if (!jobs || jobs.length === 0) return jsonResponse({ ok: true, processed: 0 });

    let done = 0, failed = 0, skipped = 0;

    for (const job of jobs) {
      const conn = await getUnipileConnection(sb, job.user_id);
      if (!conn) {
        await sb.from("linkedin_engagement_jobs")
          .update({ status: "error", error: "Kein aktiver Unipile-Account (status OK / bei Unipile gültig)" }).eq("id", job.id);
        failed++;
        continue;
      }

      // P3 #4: Engagement-Gate VOR dem processing-Claim → unentitled bleibt pending (läuft nach Upgrade). Kill-Switch im Resolver.
      if (!conn.teamId || !(await teamHasPermission(sb, conn.teamId, "linkedin.engagement"))) { skipped++; continue; }

      await sb.from("linkedin_engagement_jobs")
        .update({ status: "processing", attempts: (job.attempts ?? 0) + 1, executed_at: nowIso })
        .eq("id", job.id);

      // Rate-Guard PRO kind (Kommentare/Reaktionen teilen sich NICHT mehr den Zähler).
      const usedToday = await dailyKindCount(sb, job.user_id, job.kind);
      const cap = job.kind === "comment" ? MAX_COMMENTS_PER_DAY : MAX_REACTIONS_PER_DAY;
      if (usedToday >= cap) {
        await sb.from("linkedin_engagement_jobs")
          .update({ status: "skipped", error: "Tageslimit erreicht" }).eq("id", job.id);
        skipped++;
        continue;
      }

      // Post-Identifier robust auflösen: URN aus post_social_id/post_url ableiten und
      // via getPost gegenprüfen (activity <-> ugcPost). Liefert die real auflösende social_id.
      const input = job.post_social_id ?? job.post_url ?? null;
      let socialId: string | null = null;
      try {
        socialId = await resolvePostSocialId(conn, input);
      } catch (e) {
        // Netzwerk/Nicht-404-Fehler beim Gegencheck -> als Job-Fehler (retry-fähig durch cron).
        console.warn(`[unipile-engagement] resolvePostSocialId: ${e}`);
        socialId = null;
      }
      if (!socialId) {
        await sb.from("linkedin_engagement_jobs")
          .update({ status: "error", error: "kein Post-Identifier ableitbar" })
          .eq("id", job.id);
        failed++;
        continue;
      }

      try {
        let result: any;
        if (job.kind === "comment") {
          let text = job.comment_text;
          if (!text && job.saved_comment_id) {
            const { data: sc, error: scErr } = await sb.from("saved_comments")
              .select("comment_text").eq("id", job.saved_comment_id).maybeSingle();
            if (scErr) console.warn(`[unipile-engagement] saved_comment: ${scErr.message}`);
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
        // Soft-Fail-Guard: done nur bei erwartetem Response-Objekt (2xx mit leerem/
        // anderem Objekt fängt künftige Unipile-Soft-Fails ab).
        const expected = job.kind === "comment" ? "CommentSent" : "ReactionAdded";
        if (result?.object !== expected) {
          await sb.from("linkedin_engagement_jobs")
            .update({ status: "error", error: `Unerwartete Unipile-Response: ${JSON.stringify(result).slice(0, 300)}`, result })
            .eq("id", job.id);
          failed++;
        } else {
          await sb.from("linkedin_engagement_jobs")
            .update({ status: "done", result, error: null }).eq("id", job.id);
          done++;
        }
      } catch (e) {
        const rl = e instanceof UnipileError && e.isRateLimited;
        await sb.from("linkedin_engagement_jobs")
          .update({ status: rl ? "pending" : "error", error: String(e).slice(0, 500) })
          .eq("id", job.id);
        failed++;
        if (rl) break;   // 429 -> Rest des Batches zurückstellen
      }

      await sleep(PAUSE_MS);   // Pause zwischen Real-Calls
    }

    return jsonResponse({ ok: true, processed: jobs.length, done, failed, skipped });
  } catch (e) {
    console.error(`[unipile-engagement] ${e}`);
    return jsonResponse({ error: String(e) }, 500);
  }
});

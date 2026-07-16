// =====================================================================
// Feature 4 — Post-Monitoring + Lead-Harvest (Worker)
// Cron-getriggert. Für jeden veröffentlichten content_post mit
// linkedin_social_id:
//   a) Metriken abrufen -> content_post_metrics
//   b) Kommentare abrufen -> linkedin_post_engagers (+ optional Lead anlegen)
// =====================================================================
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import {
  getAuthenticatedUser,
  getPost,
  getUnipileConnection,
  listPostComments,
  serviceClient,
  UnipileError,
} from "../_shared/unipile.ts";
import { teamHasPermission } from "../_shared/permissions.ts";

const POST_BATCH = 15;
const MIN_RESYNC_HOURS = 4;

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  try {
    const sb = serviceClient();

    // ── Auth-Gate (Pflicht): kein Token -> 401. service-role (Cron) -> alle;
    //    JWT -> nur eigene Posts. Scope aus dem Token, NICHT aus dem Body. ──
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return jsonResponse({ error: "unauthorized" }, 401);
    const isServiceRole = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    let scopeUserId: string | null = null;
    if (!isServiceRole) {
      const auth = await getAuthenticatedUser(req);
      if (!auth) return jsonResponse({ error: "unauthorized" }, 401);
      scopeUserId = auth.userId;
    }

    const input = await req.json().catch(() => ({}));
    const harvestLeads: boolean = input.harvest_leads ?? true;

    const cutoff = new Date(Date.now() - MIN_RESYNC_HOURS * 3600_000).toISOString();
    let postQuery = sb
      .from("content_posts")
      .select("id, user_id, linkedin_social_id, published_at, last_metrics_sync_at")
      .not("linkedin_social_id", "is", null)
      .or(`last_metrics_sync_at.is.null,last_metrics_sync_at.lte.${cutoff}`)
      .order("published_at", { ascending: false })
      .limit(POST_BATCH);
    if (!isServiceRole && scopeUserId) postQuery = postQuery.eq("user_id", scopeUserId);
    const { data: posts, error } = await postQuery;
    if (error) return jsonResponse({ error: error.message }, 500);
    if (!posts || posts.length === 0) return jsonResponse({ ok: true, processed: 0 });

    let metricsWritten = 0, engagersWritten = 0, leadsCreated = 0;

    for (const post of posts) {
      const conn = await getUnipileConnection(sb, post.user_id);
      if (!conn) continue;
      // P3 #3: Post-Analytics-Gate (account-Plan des Post-Teams). Skip, kein 403. Kill-Switch im Resolver.
      if (!conn.teamId || !(await teamHasPermission(sb, conn.teamId, "linkedin.post_analytics"))) continue;
      // Defensive ID-Normalisierung: Metriken UND Kommentare brauchen die activity-URN
      // (listPostComments 400 bei numerischer ID). Falls doch mal numerisch gespeichert.
      const rawId = post.linkedin_social_id as string;
      const socialId = rawId.startsWith("urn:") ? rawId : `urn:li:activity:${rawId}`;

      // content_post_metrics.team_id ist NOT NULL -> Team aus unipile_accounts
      // (Authority für die verbundene LinkedIn-Session), NICHT via team_members-Lookup.
      const teamId: string | null = conn.teamId ?? null;

      try {
        // a) Metriken (gelockte Shapes: TOP-LEVEL *_counter). getPost akzeptiert URN.
        const p = await getPost(conn, socialId);
        const daysSince = post.published_at
          ? Math.max(0, Math.floor((Date.now() - new Date(post.published_at).getTime()) / 86400_000))
          : 0;
        const impr = p?.impressions_counter ?? 0;
        const engagementRate = impr > 0
          ? Number((((p?.reaction_counter ?? 0) + (p?.comment_counter ?? 0) + (p?.repost_counter ?? 0)) / impr).toFixed(4))
          : null;
        if (teamId) await sb.from("content_post_metrics").insert({
          post_id: post.id,
          team_id: teamId,
          measured_at: new Date().toISOString(),
          days_since_publish: daysSince,
          impressions: p?.impressions_counter ?? null,
          likes: p?.reaction_counter ?? null,
          comments_count: p?.comment_counter ?? null,
          reshares: p?.repost_counter ?? null,
          clicks: null,                          // Unipile liefert keine clicks
          engagement_rate: engagementRate,
          raw_data: p ?? null,                   // enthält analytics { profile_viewers…, followers_gained… }
        });
        if (teamId) metricsWritten++;

        // b) Kommentare -> Engager (+ Lead). Gelockte Shape: c.author ist NAME-STRING,
        //    das Objekt ist c.author_details; Profil-URL = author_details.profile_url.
        const comments = await listPostComments(conn, socialId);
        const items: any[] = comments?.items ?? comments?.data ?? [];
        for (const c of items) {
          const ad = c.author_details ?? {};
          const name = (typeof c.author === "string" && c.author) || ad.name || "Unbekannt";
          const url = ad.profile_url ?? null;    // NICHT public_profile_url
          const headline = ad.headline ?? null;
          const providerId = ad.id ?? null;
          const text = c.text ?? null;
          const { error: insErr } = await sb.from("linkedin_post_engagers").upsert({
            user_id: post.user_id,
            team_id: teamId,           // team_id von Anfang an (aus unipile_accounts)
            post_id: post.id,
            post_social_id: socialId,
            engagement_type: "comment",
            actor_name: name,
            actor_headline: headline,
            actor_profile_url: url,
            actor_provider_id: providerId,
            comment_text: text,
          }, { onConflict: "post_id,actor_profile_url,engagement_type", ignoreDuplicates: true });
          if (!insErr) engagersWritten++;

          if (harvestLeads && url) {
            // Partial-Unique-Index -> manuell dedupen (siehe unipile-search).
            const { data: existing } = await sb.from("leads")
              .select("id").eq("user_id", post.user_id).eq("linkedin_url", url).maybeSingle();
            if (!existing?.id) {
              const { error: leadErr } = await sb.from("leads").insert({
                user_id: post.user_id,
                team_id: teamId,           // team_id von Anfang an (aus unipile_accounts)
                name,
                headline,
                linkedin_url: url,
                profile_url: url,
                status: "Lead",
                source: "post_engagement",
                lead_source: "linkedin",
              });
              if (!leadErr) leadsCreated++;
            }
          }
        }

        await sb.from("content_posts")
          .update({ last_metrics_sync_at: new Date().toISOString() })
          .eq("id", post.id);
      } catch (e) {
        if (e instanceof UnipileError && e.isRateLimited) break;
        console.warn(`[unipile-monitor] post ${post.id}: ${e}`);
      }
    }

    return jsonResponse({
      ok: true, processed: posts.length, metricsWritten, engagersWritten, leadsCreated,
    });
  } catch (e) {
    console.error(`[unipile-monitor] ${e}`);
    return jsonResponse({ error: String(e) }, 500);
  }
});

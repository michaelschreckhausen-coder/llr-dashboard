// =====================================================================
// Feature 4 — Post-Monitoring + Lead-Harvest (Worker)
// Cron-getriggert. Für jeden veröffentlichten content_post mit
// linkedin_social_id:
//   a) Metriken abrufen -> content_post_metrics
//   b) Kommentare abrufen -> linkedin_post_engagers (+ optional Lead anlegen)
// =====================================================================
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import {
  getPost,
  getUnipileConnection,
  listPostComments,
  serviceClient,
  UnipileError,
} from "../_shared/unipile.ts";

const POST_BATCH = 15;
const MIN_RESYNC_HOURS = 4;

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const sb = serviceClient();
    const input = await req.json().catch(() => ({}));
    const harvestLeads: boolean = input.harvest_leads ?? true;

    const cutoff = new Date(Date.now() - MIN_RESYNC_HOURS * 3600_000).toISOString();
    const { data: posts, error } = await sb
      .from("content_posts")
      .select("id, user_id, linkedin_social_id, published_at, last_metrics_sync_at")
      .not("linkedin_social_id", "is", null)
      .or(`last_metrics_sync_at.is.null,last_metrics_sync_at.lte.${cutoff}`)
      .order("published_at", { ascending: false })
      .limit(POST_BATCH);
    if (error) return jsonResponse({ error: error.message }, 500);
    if (!posts || posts.length === 0) return jsonResponse({ ok: true, processed: 0 });

    let metricsWritten = 0, engagersWritten = 0, leadsCreated = 0;

    for (const post of posts) {
      const conn = await getUnipileConnection(sb, post.user_id);
      if (!conn) continue;
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

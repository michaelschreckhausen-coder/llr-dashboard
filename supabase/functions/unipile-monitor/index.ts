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
  resolveUnipileConn,
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
      .select("id, user_id, brand_voice_id, linkedin_social_id, published_at, last_metrics_sync_at")
      .not("linkedin_social_id", "is", null)
      .or(`last_metrics_sync_at.is.null,last_metrics_sync_at.lte.${cutoff}`)
      .order("published_at", { ascending: false })
      .limit(POST_BATCH);
    if (error) return jsonResponse({ error: error.message }, 500);
    if (!posts || posts.length === 0) return jsonResponse({ ok: true, processed: 0 });

    let metricsWritten = 0, engagersWritten = 0, leadsCreated = 0;

    for (const post of posts) {
      const conn = await resolveUnipileConn(sb, { brandVoiceId: post.brand_voice_id, userId: post.user_id });
      if (!conn) continue;
      const socialId = post.linkedin_social_id as string;

      // content_post_metrics.team_id ist NOT NULL -> Team aus unipile_accounts
      // (Authority für die verbundene LinkedIn-Session), NICHT via team_members-Lookup.
      const teamId: string | null = conn.teamId ?? null;

      try {
        // a) Metriken (nur wenn team_id auflösbar)
        const p = await getPost(conn, socialId);
        const daysSince = post.published_at
          ? Math.max(0, Math.floor((Date.now() - new Date(post.published_at).getTime()) / 86400_000))
          : 0;
        if (teamId) await sb.from("content_post_metrics").insert({
          post_id: post.id,
          team_id: teamId,
          measured_at: new Date().toISOString(),
          days_since_publish: daysSince,
          impressions: p?.impressions ?? p?.stats?.impressions ?? null,
          likes: p?.reaction_count ?? p?.stats?.likes ?? null,
          comments_count: p?.comment_count ?? p?.stats?.comments ?? null,
          reshares: p?.share_count ?? p?.stats?.reshares ?? null,
          clicks: p?.stats?.clicks ?? null,
          raw_data: p ?? null,
        });
        if (teamId) metricsWritten++;

        // b) Kommentare -> Engager (+ Lead)
        const comments = await listPostComments(conn, socialId);
        const items: any[] = comments?.items ?? comments?.data ?? [];
        for (const c of items) {
          const author = c.author ?? c.commenter ?? {};
          const url = author.public_profile_url ?? author.profile_url ?? c.author_url ?? null;
          const name = author.name ?? c.author_name ?? "Unbekannt";
          const { error: insErr } = await sb.from("linkedin_post_engagers").upsert({
            user_id: post.user_id,
            team_id: teamId,           // team_id von Anfang an (aus unipile_accounts)
            post_id: post.id,
            post_social_id: socialId,
            engagement_type: "comment",
            actor_name: name,
            actor_headline: author.headline ?? null,
            actor_profile_url: url,
            actor_provider_id: author.provider_id ?? author.id ?? null,
            comment_text: c.text ?? c.comment ?? null,
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
                headline: author.headline ?? null,
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

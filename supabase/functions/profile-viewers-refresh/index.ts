// profile-viewers-refresh — Profilbesucher (WVMP) brand-scoped via Unipile.
// Service (Cron): alle OK-Accounts. JWT (Frontend): nur eigene, optional body.brand_voice_id.
// Upsert je (brand, viewer_urn) mit last_seen; anonyme Besucher (ohne URN) werden gezählt, nicht persistiert.
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { getAuthenticatedUser, getProfileViewers, serviceClient, UnipileError } from "../_shared/unipile.ts";

Deno.serve(async (req) => {
  const pre = handlePreflight(req); if (pre) return pre;
  try {
    const sb = serviceClient();
    const input = await req.json().catch(() => ({}));
    const wantBrand: string | null = input?.brand_voice_id ?? null;
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
    let q = sb.from("unipile_accounts")
      .select("user_id, team_id, unipile_account_id, brand_voice_id, status")
      .eq("status", "OK").not("unipile_account_id", "is", null);
    if (!isServiceRole && scopeUserId) q = q.eq("user_id", scopeUserId);
    if (wantBrand) q = q.eq("brand_voice_id", wantBrand);
    const { data: accts, error } = await q;
    if (error) return jsonResponse({ error: error.message }, 500);
    if (!accts || accts.length === 0) return jsonResponse({ ok: true, accounts: 0, written: 0 });

    let namedTotal = 0, anonTotal = 0, upserts = 0;
    const results: any[] = [];
    for (const c of accts) {
      try {
        const viewers = await getProfileViewers(c.unipile_account_id);
        const named = viewers.filter((v) => v.urn && v.name);
        namedTotal += named.length;
        anonTotal += viewers.length - named.length;
        for (const v of named) {
          // Upsert per (brand, urn): existiert → last_seen/caption aktualisieren, sonst neu.
          const { data: ex } = await sb.from("linkedin_profile_viewers")
            .select("id").eq("brand_voice_id", c.brand_voice_id).eq("viewer_urn", v.urn).maybeSingle();
          if (ex?.id) {
            await sb.from("linkedin_profile_viewers").update({ last_seen_at: new Date().toISOString(), caption: v.caption, viewer_headline: v.headline, viewer_name: v.name }).eq("id", ex.id);
          } else {
            await sb.from("linkedin_profile_viewers").insert({
              team_id: c.team_id, user_id: c.user_id, brand_voice_id: c.brand_voice_id,
              unipile_account_id: c.unipile_account_id,
              viewer_name: v.name, viewer_headline: v.headline, viewer_profile_url: v.profile_url,
              viewer_urn: v.urn, caption: v.caption,
            });
            upserts++;
          }
        }
        results.push({ acct: c.unipile_account_id, named: named.length, anon: viewers.length - named.length });
      } catch (e) {
        results.push({ acct: c.unipile_account_id, error: e instanceof UnipileError ? e.message : String(e) });
      }
    }
    return jsonResponse({ ok: true, accounts: accts.length, namedTotal, anonTotal, newViewers: upserts, results });
  } catch (e) { return jsonResponse({ error: String(e) }, 500); }
});

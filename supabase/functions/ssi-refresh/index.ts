// =====================================================================
// ssi-refresh — Social Selling Index brand-scoped via Unipile (kein Extension-Scrape).
// Zwei Pfade (Muster wie unipile-invitations-sync):
//   * Cron (service-role-Bearer): ALLE OK-Unipile-Accounts → SSI-Snapshot je Marke.
//   * Frontend (JWT): nur die OK-Accounts des verifizierten Users; optional body.brand_voice_id.
// Idempotent: max. 1 SSI-Zeile je Marke (bzw. User bei markenlos) pro Kalendertag (source=unipile).
// Schreibt in public.ssi_scores (total_score/4 Säulen/industry_rank/network_rank/brand_voice_id).
// =====================================================================
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import {
  getAuthenticatedUser,
  getSocialSellingIndex,
  serviceClient,
  UnipileError,
} from "../_shared/unipile.ts";

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const sb = serviceClient();
    const input = await req.json().catch(() => ({}));
    const wantBrand: string | null = input?.brand_voice_id ?? null;

    // ── Auth-Gate ──
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

    // Aktive Unipile-Accounts (Authority). JWT-Pfad: nur eigene; optional auf Marke gefiltert.
    let q = sb
      .from("unipile_accounts")
      .select("user_id, team_id, unipile_account_id, brand_voice_id, status")
      .eq("status", "OK")
      .not("unipile_account_id", "is", null);
    if (!isServiceRole && scopeUserId) q = q.eq("user_id", scopeUserId);
    if (wantBrand) q = q.eq("brand_voice_id", wantBrand);
    const { data: accts, error } = await q;
    if (error) return jsonResponse({ error: error.message }, 500);
    if (!accts || accts.length === 0) return jsonResponse({ ok: true, accounts: 0, written: 0 });

    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    let written = 0, skipped = 0, noSeat = 0;
    const results: any[] = [];

    for (const c of accts) {
      try {
        // Idempotenz: heute schon ein Unipile-SSI-Snapshot für diese Marke/User?
        let dq = sb.from("ssi_scores")
          .select("id", { count: "exact", head: true })
          .eq("source", "unipile")
          .gte("recorded_at", todayIso);
        dq = c.brand_voice_id ? dq.eq("brand_voice_id", c.brand_voice_id) : dq.is("brand_voice_id", null).eq("user_id", c.user_id);
        const { count: already } = await dq;
        if ((already ?? 0) > 0) { skipped++; continue; }

        const ssi = await getSocialSellingIndex(c.unipile_account_id);
        if (ssi.total == null) { noSeat++; results.push({ acct: c.unipile_account_id, note: "kein Score (evtl. kein Sales-Nav-Seat)" }); continue; }

        const { error: insErr } = await sb.from("ssi_scores").insert({
          user_id: c.user_id,
          team_id: c.team_id,
          brand_voice_id: c.brand_voice_id,
          total_score: ssi.total,
          build_brand: ssi.build_brand,
          find_people: ssi.find_people,
          engage_insights: ssi.engage_insights,
          build_relationships: ssi.build_relationships,
          industry_rank: ssi.industry_rank,
          network_rank: ssi.network_rank,
          source: "unipile",
          recorded_at: new Date().toISOString(),
        });
        if (insErr) { results.push({ acct: c.unipile_account_id, error: insErr.message }); continue; }
        written++;
        results.push({ acct: c.unipile_account_id, brand_voice_id: c.brand_voice_id, total: ssi.total, active_seat: ssi.active_seat });
      } catch (e) {
        const msg = e instanceof UnipileError ? e.message : String(e);
        results.push({ acct: c.unipile_account_id, error: msg });
      }
    }

    return jsonResponse({ ok: true, accounts: accts.length, written, skipped, noSeat, results });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});

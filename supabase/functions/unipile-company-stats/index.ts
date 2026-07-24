// =====================================================================
// unipile-company-stats — Page-KPIs einer verbundenen Company Page.
// Body: { brand_voice_id }  (company_page-Brand mit linkedin_org_id + acting login)
// Liefert followers_count, employee_count, logo, name, profile_url, insights
// und die eigene Follower-/Mitarbeiter-Historie (linkedin_page_metrics).
// Schreibt zusätzlich einen Tages-Snapshot (für Wachstum über Zeit).
// Auth: eingeloggter User; Brand muss zu einem Team des Users gehören.
// =====================================================================
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { getAuthenticatedUser, serviceClient } from "../_shared/unipile.ts";

const UNIPILE_DSN = Deno.env.get("UNIPILE_DSN")!;
const UNIPILE_KEY = Deno.env.get("UNIPILE_API_KEY")!;

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) return jsonResponse({ error: "unauthorized" }, 401);

    const sb = serviceClient();
    const input = await req.json().catch(() => ({}));
    const brandId = input.brand_voice_id;
    if (!brandId) return jsonResponse({ error: "brand_voice_id fehlt" }, 400);

    const { data: bv } = await sb.from("brand_voices")
      .select("id, team_id, account_type, linkedin_org_id, linkedin_acting_account_id, linkedin_org_logo_url")
      .eq("id", brandId).maybeSingle();
    if (!bv || bv.account_type !== "company_page") return jsonResponse({ error: "keine Company Page" }, 400);
    if (!bv.linkedin_org_id || !bv.linkedin_acting_account_id) return jsonResponse({ error: "not_connected", message: "Company Page nicht verbunden" }, 409);

    // Autorisierung: User im Team der Brand?
    const { data: member } = await sb.from("team_members").select("team_id")
      .eq("user_id", auth.userId).eq("team_id", bv.team_id).maybeSingle();
    if (!member) return jsonResponse({ error: "forbidden" }, 403);

    // Login-Account (muss OK sein)
    const { data: acc } = await sb.from("unipile_accounts")
      .select("unipile_account_id").eq("unipile_account_id", bv.linkedin_acting_account_id).eq("status", "OK").maybeSingle();
    if (!acc?.unipile_account_id) return jsonResponse({ error: "login_offline", message: "Admin-Login nicht verbunden" }, 409);

    // Company-Profil von Unipile
    let profile: any = null;
    try {
      const r = await fetch(`https://${UNIPILE_DSN}/api/v1/linkedin/company/${encodeURIComponent(bv.linkedin_org_id)}?account_id=${encodeURIComponent(acc.unipile_account_id)}`,
        { headers: { "X-API-KEY": UNIPILE_KEY, accept: "application/json" } });
      if (r.ok) profile = await r.json();
    } catch (_e) { /* best effort */ }

    const followers = profile?.followers_count ?? null;
    const employees = profile?.employee_count ?? null;
    const logo = profile?.logo || profile?.logo_large || null;

    // Tages-Snapshot schreiben (idempotent je Tag via Unique-Index)
    if (followers != null || employees != null) {
      await sb.from("linkedin_page_metrics").upsert({
        team_id: bv.team_id, brand_voice_id: bv.id, linkedin_org_id: bv.linkedin_org_id,
        followers_count: followers, employee_count: employees,
        captured_on: new Date().toISOString().slice(0, 10),
      }, { onConflict: "brand_voice_id,captured_on" });
    }
    // Logo an der Brand nachtragen, falls leer
    if (logo && !bv.linkedin_org_logo_url) {
      await sb.from("brand_voices").update({ linkedin_org_logo_url: logo }).eq("id", bv.id);
    }

    // Historie (letzte 90 Tage)
    const { data: history } = await sb.from("linkedin_page_metrics")
      .select("captured_on, followers_count, employee_count")
      .eq("brand_voice_id", bv.id).order("captured_on", { ascending: true }).limit(90);

    return jsonResponse({
      ok: true,
      name: profile?.name ?? null,
      profile_url: profile?.profile_url ?? null,
      logo,
      followers_count: followers,
      employee_count: employees,
      insights: profile?.insights ?? null,
      history: history || [],
    });
  } catch (e) {
    return jsonResponse({ error: "server_error", message: String((e as Error)?.message || e) }, 500);
  }
});

// =====================================================================
// unipile-list-organizations — Company Pages eines verbundenen Logins.
// Für die Company-Page-Verbindung: gibt die LinkedIn-Organisationen zurück,
// die ein bereits verbundener Unipile-Login administriert
// (connection_params.im.organizations[] aus GET /accounts/{id}).
// Body: { unipile_account_id }  ODER  { brand_voice_id } (Login der Personal-Brand).
// Auth: eingeloggter User; der Account muss zu einem Team des Users gehören.
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

    // Login-Account bestimmen: direkt via unipile_account_id ODER via brand_voice_id (dessen Login).
    let acctId: string | null = input.unipile_account_id ?? null;
    if (!acctId && input.brand_voice_id) {
      const { data: acc } = await sb
        .from("unipile_accounts")
        .select("unipile_account_id")
        .eq("brand_voice_id", input.brand_voice_id)
        .eq("status", "OK")
        .not("unipile_account_id", "is", null)
        .order("last_status_update", { ascending: false })
        .limit(1)
        .maybeSingle();
      acctId = acc?.unipile_account_id ?? null;
    }
    if (!acctId) return jsonResponse({ error: "kein_login", message: "Kein verbundener LinkedIn-Login gefunden." }, 409);

    // Autorisierung: Account muss zu einem Team des Users gehören.
    const { data: accRow } = await sb
      .from("unipile_accounts")
      .select("team_id, unipile_account_id, provider_public_id")
      .eq("unipile_account_id", acctId)
      .eq("status", "OK")
      .maybeSingle();
    if (!accRow?.team_id) return jsonResponse({ error: "not_found" }, 404);

    const { data: member } = await sb
      .from("team_members")
      .select("team_id")
      .eq("user_id", auth.userId)
      .eq("team_id", accRow.team_id)
      .maybeSingle();
    if (!member) return jsonResponse({ error: "forbidden" }, 403);

    // Unipile: Account-Detail holen, organizations[] extrahieren.
    const r = await fetch(`https://${UNIPILE_DSN}/api/v1/accounts/${acctId}`, {
      headers: { "X-API-KEY": UNIPILE_KEY, accept: "application/json" },
    });
    if (!r.ok) return jsonResponse({ error: "unipile_error", status: r.status }, 502);
    const a = await r.json();
    const im = a?.connection_params?.im ?? {};
    const rawOrgs: any[] = Array.isArray(im.organizations) ? im.organizations : [];
    const organizations = rawOrgs.map((o) => ({
      name: o?.name ?? null,
      organization_urn: o?.organization_urn ?? null,
      org_id: typeof o?.organization_urn === "string" ? o.organization_urn.split(":").pop() : null,
      messaging_enabled: !!o?.messaging_enabled,
    })).filter((o) => o.org_id);

    return jsonResponse({
      ok: true,
      unipile_account_id: acctId,
      login_public_id: accRow.provider_public_id ?? im.publicIdentifier ?? null,
      login_name: im.username ?? null,
      organizations,
    });
  } catch (e) {
    return jsonResponse({ error: "server_error", message: String((e as Error)?.message || e) }, 500);
  }
});

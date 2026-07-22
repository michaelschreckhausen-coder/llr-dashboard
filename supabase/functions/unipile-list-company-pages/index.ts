// =====================================================================
// unipile-list-company-pages — ALLE administrierten Company Pages eines Teams.
// Aggregiert organizations[] über ALLE verbundenen Unipile-Logins des Teams,
// dedupliziert je Org und löst pro Page den handelnden Admin-Login automatisch auf.
// So muss der User keinen Login manuell wählen — er sieht nur „seine" Pages.
// Body: { brand_voice_id }  (Team wird daraus abgeleitet)  ODER { team_id }.
// Auth: eingeloggter User; Team muss eins seiner Teams sein.
// =====================================================================
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { getAuthenticatedUser, serviceClient } from "../_shared/unipile.ts";

const UNIPILE_DSN = Deno.env.get("UNIPILE_DSN")!;
const UNIPILE_KEY = Deno.env.get("UNIPILE_API_KEY")!;

async function orgsOfLogin(accountId: string): Promise<any[]> {
  try {
    const r = await fetch(`https://${UNIPILE_DSN}/api/v1/accounts/${accountId}`, {
      headers: { "X-API-KEY": UNIPILE_KEY, accept: "application/json" },
    });
    if (!r.ok) return [];
    const a = await r.json();
    const im = a?.connection_params?.im ?? {};
    return Array.isArray(im.organizations) ? im.organizations : [];
  } catch { return []; }
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) return jsonResponse({ error: "unauthorized" }, 401);

    const sb = serviceClient();
    const input = await req.json().catch(() => ({}));

    // Team bestimmen
    let teamId: string | null = input.team_id ?? null;
    if (!teamId && input.brand_voice_id) {
      const { data: bv } = await sb.from("brand_voices").select("team_id").eq("id", input.brand_voice_id).maybeSingle();
      teamId = bv?.team_id ?? null;
    }
    if (!teamId) return jsonResponse({ error: "kein_team" }, 400);

    // Autorisierung
    const { data: member } = await sb.from("team_members").select("team_id")
      .eq("user_id", auth.userId).eq("team_id", teamId).maybeSingle();
    if (!member) return jsonResponse({ error: "forbidden" }, 403);

    // Alle verbundenen Logins des Teams
    const { data: logins } = await sb.from("unipile_accounts")
      .select("unipile_account_id, provider_public_id")
      .eq("team_id", teamId).eq("status", "OK").not("unipile_account_id", "is", null);
    const loginList = logins || [];

    // Pages je Login sammeln + dedupen (erster Login, der die Page hat, gewinnt)
    const byOrg = new Map<string, any>();
    for (const l of loginList) {
      const orgs = await orgsOfLogin(l.unipile_account_id);
      for (const o of orgs) {
        const urn = o?.organization_urn;
        const orgId = typeof urn === "string" ? urn.split(":").pop() : null;
        if (!orgId) continue;
        if (!byOrg.has(orgId)) {
          byOrg.set(orgId, {
            org_id: orgId,
            organization_urn: urn,
            name: o?.name ?? null,
            messaging_enabled: !!o?.messaging_enabled,
            acting_account_id: l.unipile_account_id,
            login_label: l.provider_public_id || l.unipile_account_id,
          });
        }
      }
    }
    const organizations = Array.from(byOrg.values())
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "de"));

    return jsonResponse({
      ok: true,
      logins_count: loginList.length,
      organizations,
    });
  } catch (e) {
    return jsonResponse({ error: "server_error", message: String((e as Error)?.message || e) }, 500);
  }
});

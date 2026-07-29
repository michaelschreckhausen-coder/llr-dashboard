// unipile-detect-capabilities — liest je verbundenem LinkedIn-Account das Unipile-
// Account-Objekt (connection_params.im) und leitet Capabilities ab: premium, inmail,
// sales_navigator, account_type (personal/company), verwaltete Pages. Service-role.
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/unipile.ts";
import { getAccount } from "../_shared/unipile-client.ts";

function deriveCaps(acc: any) {
  const im = acc?.connection_params?.im ?? {};
  const feats: string[] = Array.isArray(im.premiumFeatures) ? im.premiumFeatures : [];
  const featStr = feats.join(",").toLowerCase();
  const premium = !!im.premiumId || !!im.premiumContractId || feats.length > 0;
  const sales_navigator = /sales|navigator/.test(featStr);
  // InMail: Sales Navigator/Recruiter/Premium mit InMail-Feature. Ohne echten Premium-Account
  //   konservativ = jede Premium-Stufe erlaubt InMail (verfeinerbar via premiumFeatures-Tokens).
  const inmail = premium || sales_navigator || /inmail|openlink|open_link/.test(featStr);
  const orgs = Array.isArray(im.organizations) ? im.organizations : [];
  return {
    account_type: (acc?.type === "LINKEDIN" && im && Object.keys(im).length) ? "personal" : String(acc?.type || "unknown").toLowerCase(),
    premium, inmail, sales_navigator,
    premium_features: feats,
    organizations: orgs.map((o: any) => ({ name: o.name, urn: o.organization_urn, messaging: !!o.messaging_enabled })),
    detected_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req); if (pre) return pre;
  if ((req.headers.get("Authorization") || "") !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  const sb = serviceClient();
  const body = await req.json().catch(() => ({} as any));
  let q = sb.from("unipile_accounts").select("unipile_account_id").eq("status", "OK").not("unipile_account_id", "is", null);
  if (body.unipile_account_id) q = q.eq("unipile_account_id", body.unipile_account_id);
  const { data: rows, error } = await q.limit(500);
  if (error) return jsonResponse({ error: error.message }, 500);
  let updated = 0, failed = 0;
  for (const r of (rows ?? []) as Array<{ unipile_account_id: string }>) {
    try {
      const res = await getAccount(r.unipile_account_id);
      if (!res.ok) { failed++; continue; }
      const caps = deriveCaps(res.data);
      await sb.from("unipile_accounts").update({ capabilities: caps }).eq("unipile_account_id", r.unipile_account_id);
      updated++;
    } catch (_e) { failed++; }
    await new Promise((r2) => setTimeout(r2, 200));
  }
  return jsonResponse({ ok: true, updated, failed });
});

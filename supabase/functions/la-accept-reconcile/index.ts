// la-accept-reconcile — proaktive Annahme-Erkennung fuer die Automatisierung.
// Fuer wartende if_accepted-Enrollments (accepted_at NULL) prueft es per Unipile,
// ob die Person inzwischen 1.-Grad-Verbindung ist, und materialisiert dann den Schritt.
// Service-role only, per pg_cron ~alle 10 Min getriggert.
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/unipile.ts";
import { getProfile } from "../_shared/unipile-client.ts";

Deno.serve(async (req) => {
  const pre = handlePreflight(req); if (pre) return pre;
  const auth = req.headers.get("Authorization") || "";
  if (auth !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  const sb = serviceClient();
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const cap = Math.min(Number((body as any).max ?? 60), 200);

  const { data: rows, error } = await sb.rpc("la_pending_accept_checks", { p_limit: cap });
  if (error) return jsonResponse({ error: error.message }, 500);

  let checked = 0, accepted = 0, errors = 0;
  for (const r of (rows ?? []) as Array<{ enrollment_id: string; unipile_account_id: string; provider_id: string }>) {
    checked++;
    try {
      const res = await getProfile(r.unipile_account_id, r.provider_id);
      if (!res.ok) { errors++; continue; }
      const p = (res.data ?? {}) as Record<string, unknown>;
      const nd = String(p.network_distance ?? "");
      const isRel = nd === "FIRST_DEGREE" || nd === "DISTANCE_1" || p.is_relationship === true;
      if (isRel) { await sb.rpc("la_mark_accepted", { p_enrollment_id: r.enrollment_id }); accepted++; }
    } catch (_e) { errors++; }
    await new Promise((res2) => setTimeout(res2, 250)); // sanft zu Unipile
  }
  return jsonResponse({ ok: true, checked, accepted, errors });
});

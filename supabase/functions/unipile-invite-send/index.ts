// unipile-invite-send — manuelle LinkedIn-Vernetzungsanfrage (Invite + optionale Note)
// ueber Unipile. User-JWT, brand-scoped (Konto der aktiven Marke via RLS).
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { getAuthenticatedUser, serviceClient, userClientFromReq } from "../_shared/unipile.ts";
import { sendInvitation } from "../_shared/unipile-client.ts";

Deno.serve(async (req) => {
  const pre = handlePreflight(req); if (pre) return pre;
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) return jsonResponse({ error: "unauthorized" }, 401);
    const uc = userClientFromReq(req);
    if (!uc) return jsonResponse({ error: "unauthorized" }, 401);
    const sb = serviceClient();
    const input = await req.json().catch(() => ({} as any));
    const brandVoiceId = input.brand_voice_id ?? null;
    const providerId = String(input.attendee_provider_id ?? "");
    const note = input.note ? String(input.note).slice(0, 300) : undefined;
    if (!brandVoiceId || !providerId) return jsonResponse({ error: "brand_and_attendee_required" }, 400);

    const { data: acc } = await uc.from("unipile_accounts")
      .select("unipile_account_id, team_id").eq("brand_voice_id", brandVoiceId).eq("status", "OK").maybeSingle();
    if (!acc) return jsonResponse({ error: "Keine LinkedIn-Verbindung fuer diese Marke." }, 409);

    const res = await sendInvitation(acc.unipile_account_id, providerId, note);
    if (!res.ok) {
      let reason = "invite_failed", msg = "Vernetzungsanfrage fehlgeschlagen.";
      try {
        const d = JSON.parse(String((res as any).detail ?? ""));
        const t = String(d?.type ?? "");
        if (t.includes("already") || t.includes("duplicate")) { reason = "already"; msg = "Ihr seid bereits verbunden oder es ist schon eine Anfrage offen."; }
        else if (t.includes("insufficient") || t.includes("limit")) { reason = "limit"; msg = "LinkedIn-Wochenlimit fuer Anfragen erreicht — bitte spaeter erneut."; }
        else if (d?.detail) msg = String(d.detail);
      } catch { /* detail kein JSON */ }
      return jsonResponse({ error: msg, reason, detail: (res as any).detail, status: (res as any).status }, 502);
    }
    return jsonResponse({ ok: true, invitation_id: (res.data as any)?.invitation_id ?? null });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});

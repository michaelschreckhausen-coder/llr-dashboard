// asana-oauth-disconnect
// Trennt die Asana-Verbindung eines Teams: widerruft den Refresh-Token bei
// Asana (oauth_revoke), löscht die verschlüsselten Vault-Secrets und entfernt
// die asana_connections-/asana_user_links-Zeilen des Teams.
//
// Auth: Leadesk-JWT im Authorization-Header. Der aufrufende User muss
// Mitglied des Teams sein (Prüfung gegen team_members).
//
// Request (POST):  { "team_id": "<uuid>" }
// Response:        { "ok": true }              (auch wenn schon getrennt)
//                  { "error": "..." }          bei Fehlern

import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import {
  asanaConfig,
  ASANA_REVOKE_URL,
  getAuthenticatedUser,
  serviceClient,
  vaultRead,
} from "../_shared/asana.ts";

/** Refresh-Token bei Asana widerrufen (best-effort, wirft nie hart). */
async function revokeToken(token: string): Promise<void> {
  try {
    const { clientId, clientSecret } = asanaConfig();
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      token,
    });
    const res = await fetch(ASANA_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      console.warn(`asana revoke non-ok: ${res.status} ${await res.text()}`);
    }
  } catch (e) {
    // Token trotzdem lokal entfernen — der Widerruf ist Best-Effort.
    console.warn("asana revoke failed:", e);
  }
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

    // 1) Leadesk-User aus JWT bestimmen.
    const auth = await getAuthenticatedUser(req);
    if (!auth) return jsonResponse({ error: "unauthorized" }, 401);

    const { team_id } = await req.json().catch(() => ({}));
    if (!team_id) return jsonResponse({ error: "team_id_required" }, 400);

    const sb = serviceClient();

    // 2) Team-Mitgliedschaft verifizieren (Service-Client hat kein auth.uid(),
    //    daher direkte Prüfung gegen team_members).
    const { data: membership, error: memErr } = await sb
      .from("team_members")
      .select("user_id")
      .eq("team_id", team_id)
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (memErr) throw new Error(`membership_lookup: ${memErr.message}`);
    if (!membership) return jsonResponse({ error: "forbidden" }, 403);

    // 3) Verbindung laden. Keine Verbindung => idempotenter Erfolg.
    const { data: conn, error: connErr } = await sb
      .from("asana_connections")
      .select("id, access_token_id, refresh_token_id")
      .eq("team_id", team_id)
      .maybeSingle();
    if (connErr) throw new Error(`connection_lookup: ${connErr.message}`);
    if (!conn) return jsonResponse({ ok: true, already_disconnected: true });

    // 4) Refresh-Token entschlüsselt lesen und bei Asana widerrufen.
    //    (Widerruf des Refresh-Tokens invalidiert den gesamten Grant.)
    if (conn.refresh_token_id) {
      try {
        const refreshToken = await vaultRead(sb, conn.refresh_token_id);
        if (refreshToken) await revokeToken(refreshToken);
      } catch (e) {
        console.warn("refresh token read/revoke skipped:", e);
      }
    }

    // 5) Vault-Secrets löschen (Access + Refresh).
    for (const secretId of [conn.access_token_id, conn.refresh_token_id]) {
      if (!secretId) continue;
      const { error: delErr } = await sb.rpc("asana_vault_delete", { p_id: secretId });
      if (delErr) console.warn(`vault_delete ${secretId}:`, delErr.message);
    }

    // 6) User-Mappings + Connection-Zeile entfernen.
    await sb.from("asana_user_links").delete().eq("team_id", team_id);
    const { error: rmErr } = await sb
      .from("asana_connections")
      .delete()
      .eq("team_id", team_id);
    if (rmErr) throw new Error(`connection_delete: ${rmErr.message}`);

    return jsonResponse({ ok: true });
  } catch (e) {
    console.error("asana-oauth-disconnect error:", e);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});

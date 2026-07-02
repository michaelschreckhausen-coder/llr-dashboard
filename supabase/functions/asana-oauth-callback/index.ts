// asana-oauth-callback
// Tauscht den Authorization-Code gegen Tokens, speichert sie verschlüsselt
// in Vault, legt/aktualisiert asana_connections an und mappt den
// verbindenden User.
//
// Ablauf: Asana leitet auf die Frontend-Redirect-Route
//   https://app.leadesk.de/integrations/asana/callback?code=..&state=..
// weiter. Die Route POSTet { code, state } an diese Function.
//
// Request (POST):  { "code": "...", "state": "..." }
// Response:        { "ok": true, "workspace": { "gid","name" } }

import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import {
  asanaGet,
  exchangeCode,
  serviceClient,
  vaultStore,
} from "../_shared/asana.ts";

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

    const { code, state } = await req.json().catch(() => ({}));
    if (!code || !state) return jsonResponse({ error: "code_and_state_required" }, 400);

    const sb = serviceClient();

    // 1) State auflösen + Ablauf prüfen (CSRF-Schutz).
    const { data: stateRow, error: stateErr } = await sb
      .from("asana_oauth_states")
      .select("state, team_id, code_verifier, created_by, expires_at")
      .eq("state", state)
      .maybeSingle();
    if (stateErr) throw new Error(`state_lookup: ${stateErr.message}`);
    if (!stateRow) return jsonResponse({ error: "invalid_state" }, 400);
    if (new Date(stateRow.expires_at) < new Date()) {
      await sb.from("asana_oauth_states").delete().eq("state", state);
      return jsonResponse({ error: "state_expired" }, 400);
    }

    // 2) Code -> Tokens (PKCE).
    const token = await exchangeCode(code, stateRow.code_verifier);
    if (!token.refresh_token) {
      return jsonResponse({ error: "no_refresh_token" }, 400);
    }
    const accessExpiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();

    // 3) Workspace bestimmen (erste Workspace; Multi-Workspace = Follow-up).
    let workspace = { gid: "", name: "" };
    const meRes = await asanaGet(
      token.access_token,
      "/users/me?opt_fields=workspaces.name",
    );
    if (meRes.ok) {
      const me = await meRes.json();
      const ws = me?.data?.workspaces?.[0];
      if (ws) workspace = { gid: ws.gid, name: ws.name };
    }
    if (!workspace.gid) return jsonResponse({ error: "no_workspace" }, 400);

    // 4) Tokens verschlüsselt in Vault ablegen.
    const accessId = await vaultStore(
      sb, token.access_token, `asana_access_${stateRow.team_id}`,
    );
    const refreshId = await vaultStore(
      sb, token.refresh_token, `asana_refresh_${stateRow.team_id}`,
    );

    // 5) Connection upserten (eine pro Team).
    const { error: connErr } = await sb.from("asana_connections").upsert({
      team_id: stateRow.team_id,
      asana_workspace_gid: workspace.gid,
      asana_workspace_name: workspace.name,
      asana_user_gid: token.data?.gid ?? "",
      access_token_id: accessId,
      refresh_token_id: refreshId,
      access_expires_at: accessExpiresAt,
      scopes: [],
      connected_by: stateRow.created_by,
      updated_at: new Date().toISOString(),
    }, { onConflict: "team_id" });
    if (connErr) throw new Error(`connection_upsert: ${connErr.message}`);

    // 6) Verbindenden User mappen (Full-Workspace-Mapping = Follow-up).
    if (token.data?.gid) {
      await sb.from("asana_user_links").upsert({
        team_id: stateRow.team_id,
        leadesk_user_id: stateRow.created_by,
        asana_user_gid: token.data.gid,
        asana_email: token.data.email ?? null,
      }, { onConflict: "team_id,leadesk_user_id" });
    }

    // 7) State-Zeile entfernen.
    await sb.from("asana_oauth_states").delete().eq("state", state);

    return jsonResponse({ ok: true, workspace });
  } catch (e) {
    console.error("asana-oauth-callback error:", e);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});

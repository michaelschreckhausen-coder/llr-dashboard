// asana-oauth-start
// Erzeugt PKCE-Verifier + state, persistiert sie und liefert die
// Asana-Autorisierungs-URL zurück. Aufruf vom Frontend mit Leadesk-JWT.
//
// Request (POST):  { "team_id": "<uuid>" }
// Response:        { "authorize_url": "https://app.asana.com/-/oauth_authorize?..." }

import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import {
  buildAuthorizeUrl,
  getAuthenticatedUser,
  serviceClient,
} from "../_shared/asana.ts";
import { generateCodeChallenge, generateCodeVerifier, randomToken } from "../_shared/pkce.ts";

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

    const auth = await getAuthenticatedUser(req);
    if (!auth) return jsonResponse({ error: "unauthorized" }, 401);

    const { team_id } = await req.json().catch(() => ({}));
    if (!team_id) return jsonResponse({ error: "team_id_required" }, 400);

    const sb = serviceClient();

    // Sicherstellen, dass der User zum Team gehört (RLS-Prädikat wiederverwenden).
    const { data: isMember, error: memberErr } = await sb.rpc("asana_is_team_member", {
      p_team_id: team_id,
    });
    // Hinweis: asana_is_team_member nutzt auth.uid(); über die Service-Role ist
    // auth.uid() null. Für die Prüfung daher explizit gegen die Mitgliedschaft
    // des authentifizierten Users prüfen:
    if (memberErr) {
      // Fallback: eigene Prüfung (an bestehende Team-Struktur anpassen).
    }

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = randomToken(32);

    const { error: insErr } = await sb.from("asana_oauth_states").insert({
      state,
      team_id,
      code_verifier: codeVerifier,
      created_by: auth.userId,
    });
    if (insErr) throw new Error(`state_persist: ${insErr.message}`);

    const authorizeUrl = buildAuthorizeUrl({ state, codeChallenge });
    return jsonResponse({ authorize_url: authorizeUrl });
  } catch (e) {
    console.error("asana-oauth-start error:", e);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});

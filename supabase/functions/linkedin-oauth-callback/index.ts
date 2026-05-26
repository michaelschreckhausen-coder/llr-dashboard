// supabase/functions/linkedin-oauth-callback/index.ts
//
// Phase 1a: LinkedIn-OAuth-Flow — Schritt 2
//
// Tauscht code gegen access_token, holt Member-Identity via /v2/userinfo,
// upserted linkedin_oauth_tokens, spiegelt Identity in brand_voices.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LINKEDIN_TOKEN_URL    = "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Nicht autorisiert" }, 401);

  const clientId     = Deno.env.get("LINKEDIN_CLIENT_ID");
  const clientSecret = Deno.env.get("LINKEDIN_CLIENT_SECRET");
  const supabaseUrl  = Deno.env.get("SUPABASE_URL");
  const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!clientId || !clientSecret) return json({ error: "Server-Konfig: LINKEDIN_*" }, 500);
  if (!supabaseUrl || !serviceKey) return json({ error: "Server-Konfig: SB" }, 500);

  const admin = createClient(supabaseUrl, serviceKey);
  const userToken = authHeader.slice(7);
  const { data: { user }, error: authErr } = await admin.auth.getUser(userToken);
  if (authErr || !user) return json({ error: "Ungültige Session" }, 401);

  let body: { code?: string; state?: string };
  try { body = await req.json(); } catch { return json({ error: "Ungültiger Body" }, 400); }

  const code  = (body.code  || "").toString();
  const state = (body.state || "").toString();
  if (!code || !state) return json({ error: "code oder state fehlt" }, 400);

  // 1) State verifizieren
  const { data: stateRow, error: stateErr } = await admin
    .from("linkedin_oauth_states")
    .select("*")
    .eq("state", state)
    .maybeSingle();

  if (stateErr)  return json({ error: "State-Lookup: " + stateErr.message }, 500);
  if (!stateRow) return json({ error: "Unbekannter state (CSRF-Schutz)" }, 400);
  if (stateRow.user_id !== user.id) return json({ error: "State gehört nicht zum User" }, 403);
  if (new Date(stateRow.expires_at) < new Date()) {
    await admin.from("linkedin_oauth_states").delete().eq("state", state);
    return json({ error: "State abgelaufen — Connect bitte neu starten" }, 400);
  }

  // 2) Token-Exchange
  const redirectUri = stateRow.redirect_origin + "/auth/linkedin/callback";
  const tokenParams = new URLSearchParams({
    grant_type:    "authorization_code",
    code,
    redirect_uri:  redirectUri,
    client_id:     clientId,
    client_secret: clientSecret,
  });

  const tokenRes = await fetch(LINKEDIN_TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    tokenParams.toString(),
  });
  const tokenData = await tokenRes.json().catch(() => null);
  if (!tokenRes.ok || !tokenData?.access_token) {
    return json({
      error: "Token-Exchange fehlgeschlagen",
      detail: tokenData?.error_description || tokenData?.error || ("HTTP " + tokenRes.status),
    }, 502);
  }

  const accessToken = tokenData.access_token as string;
  const expiresIn   = Number(tokenData.expires_in || 0);
  const refreshToken            = tokenData.refresh_token as string | undefined;
  const refreshTokenExpiresIn   = Number(tokenData.refresh_token_expires_in || 0);
  const scopesString            = (tokenData.scope as string) || "";
  const scopes                  = scopesString.split(/[\s,]+/).filter(Boolean);

  const now            = new Date();
  const accessExpires  = new Date(now.getTime() + expiresIn * 1000);
  const refreshExpires = refreshToken ? new Date(now.getTime() + refreshTokenExpiresIn * 1000) : null;

  // 3) Userinfo
  const userinfoRes = await fetch(LINKEDIN_USERINFO_URL, {
    headers: { "Authorization": "Bearer " + accessToken },
  });
  const userinfo = await userinfoRes.json().catch(() => null);
  if (!userinfoRes.ok || !userinfo?.sub) {
    return json({
      error: "Userinfo-Abruf fehlgeschlagen",
      detail: userinfo?.error || ("HTTP " + userinfoRes.status),
    }, 502);
  }

  const memberId    = userinfo.sub as string;
  const memberUrn   = "urn:li:person:" + memberId;
  const displayName = userinfo.name as string | undefined;
  const avatarUrl   = userinfo.picture as string | undefined;
  const email       = userinfo.email as string | undefined;

  // 4) Alte aktive Connection für diese BV revoken, neue insert
  await admin
    .from("linkedin_oauth_tokens")
    .update({ revoked_at: now.toISOString() })
    .eq("brand_voice_id", stateRow.brand_voice_id)
    .is("revoked_at", null);

  const { data: connection, error: insertErr } = await admin
    .from("linkedin_oauth_tokens")
    .insert({
      user_id:                  user.id,
      team_id:                  stateRow.team_id,
      brand_voice_id:           stateRow.brand_voice_id,
      member_urn:               memberUrn,
      member_id:                memberId,
      display_name:             displayName || null,
      avatar_url:               avatarUrl   || null,
      email:                    email       || null,
      access_token:             accessToken,
      access_token_expires_at:  accessExpires.toISOString(),
      refresh_token:            refreshToken || null,
      refresh_token_expires_at: refreshExpires ? refreshExpires.toISOString() : null,
      scopes,
      last_refresh_at:          now.toISOString(),
    })
    .select()
    .single();

  if (insertErr) {
    return json({ error: "Connection-Persistierung: " + insertErr.message }, 500);
  }

  // 5) Brand Voice spiegeln
  await admin.from("brand_voices").update({
    linkedin_member_id:    memberId,
    linkedin_display_name: displayName || null,
    linkedin_avatar_url:   avatarUrl   || null,
    linkedin_verified_at:  now.toISOString(),
  }).eq("id", stateRow.brand_voice_id);

  // 6) State cleanup
  await admin.from("linkedin_oauth_states").delete().eq("state", state);

  return json({
    success: true,
    connection: {
      id:             connection.id,
      brand_voice_id: connection.brand_voice_id,
      member_urn:     connection.member_urn,
      display_name:   connection.display_name,
      avatar_url:     connection.avatar_url,
      scopes:         connection.scopes,
      expires_at:     connection.access_token_expires_at,
    },
  });
});

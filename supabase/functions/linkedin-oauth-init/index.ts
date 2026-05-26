// supabase/functions/linkedin-oauth-init/index.ts
//
// Phase 1a: LinkedIn-OAuth-Flow — Schritt 1
//
// Vom Client gerufen wenn User in BrandVoice.jsx auf "Mit LinkedIn verbinden"
// klickt. Wir generieren CSRF-State, persistieren ihn, geben dem Client
// die LinkedIn-Authorize-URL zurück.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LINKEDIN_SCOPES = ["openid", "profile", "email", "w_member_social"];
const LINKEDIN_AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function randomState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Nicht autorisiert" }, 401);

  const clientId    = Deno.env.get("LINKEDIN_CLIENT_ID");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!clientId)    return json({ error: "Server-Konfig: LINKEDIN_CLIENT_ID" }, 500);
  if (!supabaseUrl || !serviceKey) return json({ error: "Server-Konfig: SB" }, 500);

  const admin = createClient(supabaseUrl, serviceKey);
  const userToken = authHeader.slice(7);
  const { data: { user }, error: authErr } = await admin.auth.getUser(userToken);
  if (authErr || !user) return json({ error: "Ungültige Session" }, 401);

  let body: { brand_voice_id?: string; redirect_origin?: string };
  try { body = await req.json(); } catch { return json({ error: "Ungültiger Body" }, 400); }

  const brandVoiceId   = (body.brand_voice_id || "").toString();
  const redirectOrigin = (body.redirect_origin || "").toString().replace(/\/$/, "");

  if (!brandVoiceId)   return json({ error: "brand_voice_id fehlt" }, 400);
  if (!redirectOrigin) return json({ error: "redirect_origin fehlt" }, 400);

  // Allowlist: Prod, Staging, oder stable Vercel-Branch-Preview-URLs.
  // Vercel Preview-URLs sind pro Branch stabil: llr-dashboard-git-<branch>-<team>.vercel.app
  const allowedOrigins = ["https://app.leadesk.de", "https://staging.leadesk.de"];
  const isVercelPreview = /^https:\/\/llr-dashboard-git-[a-z0-9-]+\.vercel\.app$/.test(redirectOrigin)
                       || /^https:\/\/llr-dashboard-[a-z0-9-]+-[a-z0-9-]+\.vercel\.app$/.test(redirectOrigin);
  if (!allowedOrigins.includes(redirectOrigin) && !isVercelPreview) {
    return json({ error: "redirect_origin nicht in Allowlist" }, 400);
  }

  const { data: bv, error: bvErr } = await admin
    .from("brand_voices")
    .select("id, user_id, team_id, name")
    .eq("id", brandVoiceId)
    .single();
  if (bvErr || !bv)           return json({ error: "Brand Voice nicht gefunden" }, 404);
  if (bv.user_id !== user.id) return json({ error: "Keine Berechtigung für diese Brand Voice" }, 403);

  const state = randomState();
  const { error: insertErr } = await admin.from("linkedin_oauth_states").insert({
    state,
    user_id: user.id,
    team_id: bv.team_id,
    brand_voice_id: brandVoiceId,
    redirect_origin: redirectOrigin,
  });
  if (insertErr) {
    return json({ error: "State-Persistierung fehlgeschlagen: " + insertErr.message }, 500);
  }

  const redirectUri = redirectOrigin + "/auth/linkedin/callback";
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: LINKEDIN_SCOPES.join(" "),
  });
  const authorizeUrl = LINKEDIN_AUTHORIZE_URL + "?" + params.toString();

  return json({
    authorize_url: authorizeUrl,
    state,
    expires_in_seconds: 600,
    brand_voice_name: bv.name,
  });
});

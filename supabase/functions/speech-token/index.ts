// Supabase Edge Function: speech-token
//
// Stellt ein kurzlebiges Azure-Speech-Auth-Token aus (gültig ~10 Min), damit
// das Azure Speech JS-SDK CLIENT-SEITIG laufen kann (für Viseme-/Blendshape-
// Lip-Sync des selbstgebauten 3D-Avatars, Phase 2 EU-only). Der Subscription-
// Key bleibt dabei serverseitig — der Browser bekommt nur das Token.
//
// Request:  GET|POST /functions/v1/speech-token   (Authorization: Bearer <user-JWT>)
// Response: { token, region, expires_in }
//
// Gleiche Azure-Ressource wie die speak-EF (AZURE_SPEECH_KEY / AZURE_SPEECH_REGION).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCallerContext } from "../_shared/credits.ts";

const AZURE_SPEECH_KEY    = Deno.env.get("AZURE_SPEECH_KEY") || "";
const AZURE_SPEECH_REGION = Deno.env.get("AZURE_SPEECH_REGION") || "germanywestcentral";
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET" && req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!AZURE_SPEECH_KEY) {
    return json({ error: "AZURE_SPEECH_KEY not configured on server", code: "not_configured" }, 500);
  }

  // Nur eingeloggte User dürfen ein Token ziehen.
  const ctx = await getCallerContext(req, supabaseAdmin);
  if (!ctx) return json({ error: "Missing/invalid Authorization Bearer token" }, 401);

  try {
    const endpoint = `https://${AZURE_SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY,
        "Content-Length": "0",
      },
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("[speech-token] Azure issueToken error:", res.status, errText.slice(0, 160));
      return json({ error: `Azure issueToken ${res.status}`, code: "token_error", upstream_status: res.status }, 502);
    }
    const token = await res.text();
    // Azure-Token sind ~10 Min gültig; konservativ 9 Min melden.
    return json({ token, region: AZURE_SPEECH_REGION, expires_in: 540 });
  } catch (e) {
    console.error("[speech-token] unhandled:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

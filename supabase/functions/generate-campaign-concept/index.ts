// Supabase Edge Function: generate-campaign-concept (Phase 5, Kampagnentool)
// ----------------------------------------------------------------------------
// Erzeugt zu einer Kampagne ein KI-Ansprachekonzept (Aktivierungsidee, Story-
// telling, Kanal-Empfehlung) + Leadlisten-Vorschlag (auch ausserhalb LinkedIn).
// Club-Voice/Zielgruppe werden als Kontext geladen (lose, best effort) und mit-
// gegeben. Schreibt sponsoring.campaigns.concept (jsonb). Autoritativer Write
// mit Service-Role nach RLS-bewiesener Authorisierung (Read mit User-JWT).
//
// Body: { campaign_id: string, model?: string }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY    = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY    = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_MODEL        = "claude-sonnet-4-6";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

import { resolveModel, callText } from "../_shared/llm.ts";
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Providerübergreifend (ISO 27001: gewähltes Modell entscheidet den Anbieter).
async function callAnthropic(model: string, system: string, user: string) {
  const r = await callText({ model, system, user, maxTokens: 2000, jsonMode: true });
  return r.text;
}

function extractJson(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

const SYSTEM = `Du bist ein Sponsoring-Kampagnenstratege fuer Sportvereine. Entwickle aus
den Kampagnen-Eckdaten ein konkretes Ansprachekonzept. Beruecksichtige die Club-Voice
und Zielgruppe, falls gegeben. Antworte AUSSCHLIESSLICH mit JSON:
{"activation_idea":"","storytelling":"","channels":[""],
 "outreach_message":"<personalisierbarer Erstkontakt-Text>",
 "lead_suggestions":[{"name":"","reason":"","region":""}]}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "missing authorization" }, 401);

    const { campaign_id, model } = await req.json();
    if (!campaign_id) return json({ error: "campaign_id required" }, 400);

    // Read mit User-JWT -> RLS beweist Team-Zugehoerigkeit
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: c, error: readErr } = await userClient
      .schema("sponsoring").from("campaigns").select("*").eq("id", campaign_id).maybeSingle();
    if (readErr) return json({ error: readErr.message }, 400);
    if (!c) return json({ error: "not found or not authorized" }, 403);

    // Club-Voice + Zielgruppe lose laden (best effort, brechen nicht hart)
    let voice = "", audience = "";
    if (c.brand_voice_id) {
      const { data } = await supabaseAdmin.from("brand_voices").select("*").eq("id", c.brand_voice_id).maybeSingle();
      if (data) voice = JSON.stringify(data).slice(0, 1500);
    }
    if (c.target_audience_id) {
      const { data } = await supabaseAdmin.from("target_audiences").select("*").eq("id", c.target_audience_id).maybeSingle();
      if (data) audience = JSON.stringify(data).slice(0, 1500);
    }

    const userPrompt =
      `Kampagne: ${c.title}\nBranche: ${c.industry ?? "-"}\nPersona: ${c.persona ?? "-"}\n` +
      `EUR-Erwartung: ${c.expected_value ?? "-"}\nGeo-Scope: ${c.geo_scope ?? "-"}\n` +
      (voice ? `\nClub-Voice:\n${voice}\n` : "") +
      (audience ? `\nZielgruppe:\n${audience}\n` : "");

    const { data: { user: _actUser } } = await userClient.auth.getUser();
    const useModel = (typeof model === "string" && model) ? model : await resolveModel(supabaseAdmin, [_actUser?.id], DEFAULT_MODEL);
    const text = await callAnthropic(useModel, SYSTEM, userPrompt);
    const concept = extractJson(text);
    if (!concept) return json({ error: "could not parse model output", raw: text }, 502);

    const { error: writeErr } = await supabaseAdmin
      .schema("sponsoring").from("campaigns")
      .update({ concept, updated_at: new Date().toISOString() })
      .eq("id", campaign_id);
    if (writeErr) return json({ error: writeErr.message }, 500);

    return json({ ok: true, concept });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});

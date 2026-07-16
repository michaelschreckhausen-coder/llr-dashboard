// Supabase Edge Function: detect-signals (Modul 11)
// ----------------------------------------------------------------------------
// Extrahiert aus einem Freitext (z.B. eingefügter Presse-/News-/LinkedIn-Auszug)
// Sponsoring-relevante Signale per LLM und legt sie in sponsoring.signals an.
// Auth wie score-sponsor: Read des Sponsors mit User-JWT (RLS), Write mit Service-Role.
//
// Body: { sponsor_profile_id: string, text: string, source?: string, model?: string }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveModel, callText } from "../_shared/llm.ts";

const ANTHROPIC_API_KEY    = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY    = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_MODEL = "claude-haiku-4-5";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const SIGNAL_TYPES = ["new_ceo", "expansion", "new_location", "new_product", "investment", "marketing_push", "hiring", "other"];

const SYSTEM = `Du extrahierst aus Texten Sponsoring-relevante Geschaeftssignale ueber ein
Unternehmen. Moegliche signal_type: ${SIGNAL_TYPES.join(", ")}. Jedes Signal bekommt einen
score_delta zwischen 0 und 15, je nach Relevanz fuer Sport-Sponsoring-Akquise.
Antworte AUSSCHLIESSLICH mit JSON:
{"signals":[{"signal_type":"...","summary":"<kurzer Satz, Deutsch>","score_delta":<int>}]}
Wenn keine relevanten Signale: {"signals":[]}.`;

// Providerübergreifend (ISO 27001: gewähltes Modell entscheidet den Anbieter).
async function callAnthropic(model: string, system: string, user: string) {
  const r = await callText({ model, system, user, maxTokens: 900, jsonMode: true });
  return r.text;
}

function extractSignals(text: string): Array<{ signal_type: string; summary: string; score_delta: number }> {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    const o = JSON.parse(m[0]);
    if (!Array.isArray(o.signals)) return [];
    return o.signals
      .filter((s: Record<string, unknown>) => s && s.summary)
      .map((s: Record<string, unknown>) => ({
        signal_type: SIGNAL_TYPES.includes(String(s.signal_type)) ? String(s.signal_type) : "other",
        summary: String(s.summary),
        score_delta: Math.max(0, Math.min(15, Math.round(Number(s.score_delta) || 0))),
      }));
  } catch {
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "missing authorization" }, 401);

    const { sponsor_profile_id, text, source, model } = await req.json();
    if (!sponsor_profile_id || !text) return json({ error: "sponsor_profile_id and text required" }, 400);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: sponsor, error: readErr } = await userClient
      .schema("sponsoring").from("sponsor_profiles")
      .select("id, team_id, name, organization_id").eq("id", sponsor_profile_id).maybeSingle();
    if (readErr) return json({ error: readErr.message }, 400);
    if (!sponsor) return json({ error: "not found or not authorized" }, 403);

    const { data: { user: _actUser } } = await userClient.auth.getUser();
    const useModel = (typeof model === "string" && model) ? model : await resolveModel(supabaseAdmin, [_actUser?.id], DEFAULT_MODEL);
    const raw = await callAnthropic(
      useModel,
      SYSTEM,
      `Unternehmen: ${sponsor.name}\n\nText:\n${String(text).slice(0, 6000)}`,
    );
    const signals = extractSignals(raw);
    if (signals.length === 0) return json({ ok: true, inserted: 0, signals: [] });

    const rows = signals.map((s) => ({
      team_id: sponsor.team_id,
      sponsor_profile_id: sponsor.id,
      organization_id: sponsor.organization_id ?? null,
      source: typeof source === "string" ? source : "manual",
      signal_type: s.signal_type,
      summary: s.summary,
      score_delta: s.score_delta,
    }));
    const { error: insErr } = await supabaseAdmin.schema("sponsoring").from("signals").insert(rows);
    if (insErr) return json({ error: insErr.message }, 500);

    return json({ ok: true, inserted: rows.length, signals });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});

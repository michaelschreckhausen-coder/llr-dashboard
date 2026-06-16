// Supabase Edge Function: score-sponsor (Modul 10)
// ----------------------------------------------------------------------------
// Bewertet einen Sponsor-Fit (0-100) per LLM und schreibt fit_score +
// fit_score_reasoning AUTORITATIV in sponsoring.sponsor_profiles. Spiegelt die
// Konventionen der bestehenden generate-EF (Env-Vars, CORS, callLLM, ai_usage_log).
//
// Auth-Modell:
//   * Read des Sponsors mit dem USER-JWT (RLS erzwingt Team-Zugehoerigkeit).
//     Liefert der Read keine Row -> 403 (nicht berechtigt oder existiert nicht).
//   * Write mit Service-Role (RLS-Bypass), nachdem Authorisierung bewiesen ist.
//
// Body: { sponsor_profile_id: string, model?: string }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY    = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY    = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEFAULT_MODEL = "claude-haiku-4-5"; // guenstig — Scoring ist ein kleiner Task

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function callAnthropic(model: string, system: string, user: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error?.message || "Anthropic error " + res.status);
  return {
    text: d.content?.[0]?.text || "",
    usage: {
      input_tokens: d.usage?.input_tokens || 0,
      output_tokens: d.usage?.output_tokens || 0,
    },
  };
}

// Robustes JSON-Parsing: extrahiert das erste {...}-Objekt aus der Antwort.
function extractJson(text: string): { score: number; reasoning: string } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    const score = Math.max(0, Math.min(100, Math.round(Number(o.score))));
    if (Number.isNaN(score)) return null;
    return { score, reasoning: String(o.reasoning ?? "") };
  } catch {
    return null;
  }
}

const SYSTEM = `Du bist ein B2B-Sponsoring-Analyst. Bewerte, wie gut ein Unternehmen
als Sponsor zu einer Sportorganisation passt (Sponsoring-Fit). Beruecksichtige
Branche, Groesse, Marketingbudget, Region und Sport-Affinitaet. Antworte AUSSCHLIESSLICH
mit JSON in genau diesem Format:
{"score": <0-100 integer>, "reasoning": "<2-4 praegnante Saetze auf Deutsch>"}`;

function buildUserPrompt(s: Record<string, unknown>): string {
  const f = (k: string, v: unknown) => (v ? `${k}: ${v}\n` : "");
  return (
    "Bewerte diesen potenziellen Sponsor:\n" +
    f("Name", s.name) +
    f("Branche", s.industry) +
    f("Umsatzklasse", s.revenue_class) +
    f("Mitarbeiterzahl", s.employee_count) +
    f("Marketingbudget-Klasse", s.marketing_budget_class) +
    f("Region", s.region) +
    f("Sport-Affinitaet", s.sport_affinity) +
    f("Website", s.website) +
    f("Notizen", s.notes)
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const started = Date.now();
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "missing authorization" }, 401);

    const { sponsor_profile_id, model } = await req.json();
    if (!sponsor_profile_id) return json({ error: "sponsor_profile_id required" }, 400);

    // 1) User-scoped Client -> RLS erzwingt Team-Zugehoerigkeit beim Read.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: sponsor, error: readErr } = await userClient
      .schema("sponsoring")
      .from("sponsor_profiles")
      .select("*")
      .eq("id", sponsor_profile_id)
      .maybeSingle();

    if (readErr) return json({ error: readErr.message }, 400);
    if (!sponsor) return json({ error: "not found or not authorized" }, 403);

    // 2) LLM-Bewertung
    const useModel = typeof model === "string" && model ? model : DEFAULT_MODEL;
    const { text, usage } = await callAnthropic(useModel, SYSTEM, buildUserPrompt(sponsor));
    const parsed = extractJson(text);
    if (!parsed) return json({ error: "could not parse model output", raw: text }, 502);

    // 3) Autoritativer Write mit Service-Role
    const { error: writeErr } = await supabaseAdmin
      .schema("sponsoring")
      .from("sponsor_profiles")
      .update({
        fit_score: parsed.score,
        fit_score_reasoning: { reasoning: parsed.reasoning, model: useModel, scored_at: new Date().toISOString() },
        last_scored_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sponsor_profile_id);

    if (writeErr) return json({ error: writeErr.message }, 500);

    // 4) Usage-Log (fire-and-forget, gleiche Tabelle wie generate-EF)
    supabaseAdmin.from("ai_usage_log").insert({
      user_id: null,
      account_id: null,
      team_id: (sponsor as Record<string, unknown>).team_id ?? null,
      provider: "anthropic",
      model: useModel,
      feature: "score-sponsor",
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      duration_ms: Date.now() - started,
      request_id: null,
      status: "success",
      error: null,
    }).then(({ error }) => { if (error) console.error("[ai_usage_log]", error.message); });

    return json({ ok: true, score: parsed.score, reasoning: parsed.reasoning, model: useModel });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});

// Supabase Edge Function: geo-visibility-check (Modul 13)
// ----------------------------------------------------------------------------
// Prüft über mehrere KI-/Such-Provider, ob ein Sponsor/Verein/Partnerschaft in
// den Antworten genannt wird, und schreibt je Provider einen Lauf nach
// sponsoring.geo_visibility_runs.
//
// Auth: Caller muss Mitglied von team_id sein (via team_members, User-JWT/RLS).
// Write mit Service-Role.
//
// Body: { team_id, subject_type, subject_name, subject_ref?, providers?, prompt?, model? }
//   providers: Teilmenge von ["claude","openai","perplexity"] (nur mit gesetztem Key)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY  = Deno.env.get("ANTHROPIC_API_KEY") || "";
const OPENAI_API_KEY     = Deno.env.get("OPENAI_API_KEY") || "";
const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY") || "";
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY    = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function defaultPrompt(subjectType: string, name: string): string {
  if (subjectType === "club") return `Wer sind die bekanntesten Sponsoren und Partner von "${name}"? Liste sie auf.`;
  if (subjectType === "partnership") return `Was ist über die Partnerschaft "${name}" bekannt?`;
  return `In welchen Sport-Sponsorings oder Partnerschaften ist "${name}" engagiert? Liste konkrete Beispiele.`;
}

async function askClaude(prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 600, messages: [{ role: "user", content: prompt }] }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error?.message || "anthropic " + res.status);
  return d.content?.[0]?.text || "";
}

async function askOpenAICompatible(url: string, key: string, model: string, prompt: string): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 600 }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error?.message || "provider " + res.status);
  return d.choices?.[0]?.message?.content || "";
}

const PROVIDERS: Record<string, { key: string; run: (p: string) => Promise<string> }> = {
  claude: { key: ANTHROPIC_API_KEY, run: askClaude },
  openai: { key: OPENAI_API_KEY, run: (p) => askOpenAICompatible("https://api.openai.com/v1/chat/completions", OPENAI_API_KEY, "gpt-4o-mini", p) },
  perplexity: { key: PERPLEXITY_API_KEY, run: (p) => askOpenAICompatible("https://api.perplexity.ai/chat/completions", PERPLEXITY_API_KEY, "sonar", p) },
};

function isMentioned(name: string, text: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  return text.toLowerCase().includes(n);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "missing authorization" }, 401);

    const body = await req.json();
    const { team_id, subject_type, subject_name, subject_ref, providers, prompt } = body;
    if (!team_id || !subject_name || !subject_type) {
      return json({ error: "team_id, subject_type, subject_name required" }, 400);
    }

    // Authorisierung: Caller-Mitgliedschaft via RLS (team_members für eigenen User lesbar).
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: membership, error: mErr } = await userClient
      .from("team_members").select("team_id").eq("team_id", team_id).limit(1).maybeSingle();
    if (mErr) return json({ error: mErr.message }, 400);
    if (!membership) return json({ error: "not a member of team" }, 403);

    const wanted: string[] = Array.isArray(providers) && providers.length
      ? providers
      : Object.keys(PROVIDERS);
    const active = wanted.filter((p) => PROVIDERS[p] && PROVIDERS[p].key);
    if (active.length === 0) return json({ error: "no provider configured (missing API keys)" }, 400);

    const usedPrompt = typeof prompt === "string" && prompt ? prompt : defaultPrompt(subject_type, subject_name);

    const rows: Record<string, unknown>[] = [];
    const results: Record<string, unknown>[] = [];
    for (const p of active) {
      try {
        const text = await PROVIDERS[p].run(usedPrompt);
        const mentioned = isMentioned(subject_name, text);
        rows.push({
          team_id, subject_type, subject_name, subject_ref: subject_ref ?? null,
          provider: p, prompt: usedPrompt, mentioned, raw_response: text.slice(0, 4000),
        });
        results.push({ provider: p, mentioned });
      } catch (e) {
        results.push({ provider: p, error: String((e as Error).message || e) });
      }
    }

    if (rows.length) {
      const { error: insErr } = await supabaseAdmin.schema("sponsoring").from("geo_visibility_runs").insert(rows);
      if (insErr) return json({ error: insErr.message }, 500);
    }

    const mentions = results.filter((r) => r.mentioned).length;
    const index = rows.length ? Math.round((100 * mentions) / rows.length) : 0;
    return json({ ok: true, runs: rows.length, mentions, visibility_index: index, results });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});

// Supabase Edge Function: screen-partners (Phase 5, NEED Kap. 13.11)
// ----------------------------------------------------------------------------
// Screent die Website eines Clubs auf verlinkte Bestandssponsoren, leitet je
// Sponsor eine Branche ab und aggregiert die Branchen-Verteilung (offene vs.
// besetzte Branchen, TOP-3-Ebenen). Schreibt sponsoring.partner_screenings.
//
// Auth: User-JWT muss Mitglied des Ziel-Teams sein (Insert mit User-Client ->
// RLS erzwingt team_id). Schwerer LLM-Lauf -> Haiku reicht fuer Extraktion.
//
// Body: { team_id: string, source_url: string, model?: string }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const DEFAULT_MODEL     = "claude-haiku-4-5";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
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
    body: JSON.stringify({ model, max_tokens: 1500, system, messages: [{ role: "user", content: user }] }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error?.message || "Anthropic error " + res.status);
  return d.content?.[0]?.text || "";
}

function extractJson(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

// HTML grob auf sichtbaren Text + Links eindampfen (Token-schonend).
function reduceHtml(html: string): string {
  const links = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => `${m[2].replace(/<[^>]+>/g, "").trim()} -> ${m[1]}`)
    .filter((s) => s.length > 4)
    .slice(0, 200);
  return links.join("\n").slice(0, 12000);
}

const SYSTEM = `Du bist ein Sponsoring-Analyst. Du erhaeltst Links + Linktexte von der
Website eines Sportvereins. Identifiziere wahrscheinliche BESTANDSSPONSOREN (verlinkte
Unternehmen) und ordne jedem eine Branche zu. Antworte AUSSCHLIESSLICH mit JSON:
{"found_partners":[{"name":"","url":"","industry":""}],
 "industries":[{"industry":"","count":0}],
 "summary":"<2-3 Saetze: welche Branchen dominieren, welche TOP-Branchen fehlen (offen)>"}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "missing authorization" }, 401);

    const { team_id, source_url, model } = await req.json();
    if (!team_id || !source_url) return json({ error: "team_id and source_url required" }, 400);

    // Website laden
    let html = "";
    try {
      const r = await fetch(source_url, { headers: { "User-Agent": "LeadeskBot/1.0" } });
      html = await r.text();
    } catch (e) {
      return json({ error: "fetch failed: " + String((e as Error).message) }, 502);
    }

    const useModel = typeof model === "string" && model ? model : DEFAULT_MODEL;
    const text = await callAnthropic(useModel, SYSTEM, "Quelle: " + source_url + "\n\n" + reduceHtml(html));
    const parsed = extractJson(text);
    if (!parsed) return json({ error: "could not parse model output", raw: text }, 502);

    // Insert mit User-Client -> RLS erzwingt Team-Zugehoerigkeit.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data, error } = await userClient
      .schema("sponsoring")
      .from("partner_screenings")
      .insert({
        team_id,
        source_url,
        found_partners: parsed.found_partners ?? [],
        industries: parsed.industries ?? [],
        summary: parsed.summary ?? null,
      })
      .select()
      .single();

    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, screening: data });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});

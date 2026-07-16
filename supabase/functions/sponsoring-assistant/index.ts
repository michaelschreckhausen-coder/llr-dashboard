// Supabase Edge Function: sponsoring-assistant (Modul 9)
// ----------------------------------------------------------------------------
// KI-Chat über die Sponsoring-Daten des Teams. Holt einen kompakten Daten-
// Snapshot (Dashboard-KPIs + jüngste Sponsoren/Verträge) MIT dem User-JWT
// (RLS erzwingt Team), übergibt ihn als Kontext und antwortet via LLM.
//
// Body: { question: string, history?: {role:'user'|'assistant', content:string}[], model?: string }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
import { resolveModel, callText } from "../_shared/llm.ts";
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const DEFAULT_MODEL = "claude-sonnet-4-6";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const SYSTEM = `Du bist der Sponsoring-OS-Assistent. Beantworte Fragen zu den
Sponsoring-Daten des Teams (Sponsoren, Rechte/Inventar, Pakete, Angebote,
Vertraege, Aktivierung, Sichtbarkeit, Health). Nutze NUR den bereitgestellten
Daten-Snapshot; wenn etwas nicht enthalten ist, sage das ehrlich und schlage vor,
wo man es findet. Antworte praegnant auf Deutsch.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "missing authorization" }, 401);

    const { question, history, model } = await req.json();
    if (!question) return json({ error: "question required" }, 400);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Kompakter, RLS-gefilterter Snapshot.
    const [dash, sponsors, contracts] = await Promise.all([
      userClient.rpc("get_sponsoring_dashboard"),
      userClient.schema("sponsoring").from("sponsor_profiles")
        .select("name, status, fit_score, industry").order("fit_score", { ascending: false, nullsFirst: false }).limit(25),
      userClient.schema("sponsoring").from("contracts")
        .select("status, total_price, starts_on, ends_on").order("created_at", { ascending: false }).limit(25),
    ]);

    if (dash.error) return json({ error: dash.error.message }, 400);

    const snapshot = {
      dashboard: dash.data,
      top_sponsors: sponsors.data || [],
      recent_contracts: contracts.data || [],
    };

    const messages: { role: "user" | "assistant"; content: string }[] = [];
    if (Array.isArray(history)) {
      for (const h of history.slice(-8)) {
        if (h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string") {
          messages.push({ role: h.role, content: h.content });
        }
      }
    }
    messages.push({
      role: "user",
      content: `Daten-Snapshot (JSON):\n${JSON.stringify(snapshot)}\n\nFrage: ${question}`,
    });

    // Providerübergreifend + gewähltes Modell (ISO 27001). History in den User-Text gefaltet.
    const { data: { user: _actUser } } = await userClient.auth.getUser();
    const useModel = (typeof model === "string" && model) ? model : await resolveModel(userClient, [_actUser?.id], DEFAULT_MODEL);
    const _userText = messages.map((m) => (m.role === "user" ? "Nutzer: " : "Assistent: ") + m.content).join("\n\n");
    let _answer = "";
    try {
      const r = await callText({ model: useModel, system: SYSTEM, user: _userText, maxTokens: 1200 });
      _answer = r.text;
    } catch (e) {
      return json({ error: String((e as Error).message || e) }, 502);
    }
    return json({ ok: true, answer: _answer });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});

// Supabase Edge Function: brand-memory-learn
// ----------------------------------------------------------------------------
// Destilliert aus der bisherigen NUTZUNG einer Marke (Chat-Anweisungen/Korrekturen
// des Nutzers + Generierungs-Prompts) dauerhafte, wiederverwendbare Erkenntnisse,
// die ÜBER das bekannte Markenprofil HINAUSGEHEN (net-neu, keine Profil-Dopplung),
// und schreibt sie als brand_memory (source='auto'). ChatGPT/Claude-Memory-Stil.
//
// ⚠️ ISO 27001: gewähltes Modell (resolveModel). Body: { brand_voice_id, team_id?, model? }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveModel, callText } from "../_shared/llm.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY    = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_MODEL = "claude-sonnet-4-6";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
function json(d: unknown, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } }); }
function s(v: unknown): string { if (v == null) return ""; if (typeof v === "string") return v; try { return JSON.stringify(v); } catch { return String(v); } }

const SYSTEM = `Du pflegst ein ERGÄNZENDES Marken-Gedächtnis (wie ChatGPT/Claude-Memory, nur über die MARKE).
Aus den bisherigen NUTZER-ANWEISUNGEN/Korrekturen (Chat + Generierungs-Prompts) extrahierst du dauerhafte,
wiederverwendbare Erkenntnisse über die Marke: wiederkehrende Präferenzen, Korrekturen am Output, feste
Regeln, No-Gos, bevorzugte Formulierungen/Beispiele, Themen-Schwerpunkte, Zielgruppen-Details.
STRENG: Nimm NUR Dinge auf, die im bekannten Markenprofil (unten) NICHT bereits stehen oder daraus
ableitbar sind — KEINE Dopplung mit dem Profil. Ignoriere einmalige Themen-/Post-Wünsche, Tagesaufträge,
konkrete Einzelinhalte, Höflichkeitsfloskeln. Wenn nichts NEUES Dauerhaftes da ist, gib ein leeres Array.
Jeder Eintrag = EIN knapper, konkreter Satz auf Deutsch aus Markensicht ("Wir …"). 0 bis 10 Einträge.
Antworte AUSSCHLIESSLICH mit JSON: {"facts":["...","..."]}`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "unauthorized" }, 401);
    const { brand_voice_id, model, team_id: bodyTeam } = await req.json().catch(() => ({}));
    if (!brand_voice_id) return json({ error: "brand_voice_id required" }, 400);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: bv, error: bvErr } = await userClient
      .from("brand_voices")
      .select("id, team_id, brand_name, name, ai_summary, personality, tonality, voice_style, sentence_style, grammar_style, linkedin_style, dos, visual_style_description, example_texts")
      .eq("id", brand_voice_id).maybeSingle();
    if (bvErr) return json({ error: bvErr.message }, 400);
    if (!bv) return json({ error: "not found or not authorized" }, 403);
    const teamId = bodyTeam || bv.team_id;
    const { data: { user: actUser } } = await userClient.auth.getUser();
    const useModel = (typeof model === "string" && model) ? model : await resolveModel(admin, [actUser?.id], DEFAULT_MODEL);

    // Bekanntes Profil = "NICHT wiederholen"-Kontext (nicht Quelle).
    const profile = [
      bv.ai_summary && `Zusammenfassung: ${s(bv.ai_summary)}`,
      bv.personality && `Persönlichkeit: ${s(bv.personality)}`,
      bv.tonality && `Tonalität: ${s(bv.tonality)}`,
      bv.voice_style && `Voice: ${s(bv.voice_style)}`,
      bv.sentence_style && `Satzstil: ${s(bv.sentence_style)}`,
      bv.grammar_style && `Sprache: ${s(bv.grammar_style)}`,
      bv.linkedin_style && `LinkedIn-Stil: ${s(bv.linkedin_style)}`,
      bv.dos && `Dos/Don'ts: ${s(bv.dos)}`,
      bv.visual_style_description && `Visuell: ${s(bv.visual_style_description)}`,
    ].filter(Boolean).join("\n").slice(0, 4000);

    // NUTZUNGSHISTORIE = eigentliche Quelle: User-Chat-Nachrichten + Generierungs-Prompts.
    const { data: chats } = await userClient.from("content_chats").select("id").eq("brand_voice_id", brand_voice_id).limit(200);
    const chatIds = (chats || []).map((c: Record<string, unknown>) => c.id);
    let msgs: Array<Record<string, unknown>> = [];
    if (chatIds.length) {
      const { data } = await userClient.from("content_chat_messages")
        .select("content, role, created_at").in("chat_id", chatIds).eq("role", "user")
        .order("created_at", { ascending: false }).limit(60);
      msgs = data || [];
    }
    const { data: gens } = await userClient.from("content_generations")
      .select("prompt_input, created_at").eq("brand_voice_id", brand_voice_id)
      .order("created_at", { ascending: false }).limit(40);
    const usage = [
      ...msgs.map((m) => s(m.content)),
      ...(gens || []).map((g: Record<string, unknown>) => s(g.prompt_input)),
    ].map((t) => t.trim()).filter((t) => t.length > 8).slice(0, 80).map((t) => `- ${t.slice(0, 400)}`).join("\n").slice(0, 9000);

    if (!usage) return json({ ok: true, inserted: 0, facts: [], note: "keine Nutzungshistorie" });

    const user = `## Bekanntes Markenprofil (NICHT wiederholen)\n${profile || "(kein Profil)"}\n\n## Bisherige Nutzer-Anweisungen / Chats (Quelle)\n${usage}`;
    const { text } = await callText({ model: useModel, system: SYSTEM, user, maxTokens: 1200, jsonMode: true });
    let facts: string[] = [];
    try {
      const a = text.indexOf("{"); const b = text.lastIndexOf("}");
      const parsed = (a >= 0 && b > a) ? JSON.parse(text.slice(a, b + 1)) : null;
      if (Array.isArray(parsed?.facts)) facts = parsed.facts;
      else if (parsed && typeof parsed === "object") { const k = Object.keys(parsed).find((x) => Array.isArray(parsed[x])); if (k) facts = parsed[k]; }
    } catch (_) { /* */ }
    facts = facts.map((f) => String(f || "").trim()).filter((f) => f.length > 8).slice(0, 10);
    if (!facts.length) return json({ ok: true, inserted: 0, facts: [] });

    const { data: existing } = await userClient.from("brand_memory").select("content").eq("brand_voice_id", brand_voice_id).limit(500);
    const have = (existing || []).map((e: Record<string, unknown>) => String(e.content || "").toLowerCase());
    const fresh = facts.filter((f) => { const l = f.toLowerCase(); return !have.some((h) => h.includes(l) || l.includes(h)); });
    if (!fresh.length) return json({ ok: true, inserted: 0, facts: [] });

    const rows = fresh.map((content) => ({ brand_voice_id, team_id: teamId, user_id: actUser?.id || null, content, source: "auto", no_brand: false }));
    const { error: insErr } = await userClient.from("brand_memory").insert(rows);
    if (insErr) return json({ error: insErr.message }, 400);
    return json({ ok: true, inserted: rows.length, facts: fresh });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// Supabase Edge Function: brand-memory-learn
// ----------------------------------------------------------------------------
// Destilliert das vorhandene Marken-Wissen (Brand-Voice-Profil + jüngste Beiträge)
// zu dauerhaften, wiederverwendbaren Marken-Fakten und schreibt sie als
// brand_memory-Einträge (source='auto'). Wie das Langzeit-Gedächtnis von
// ChatGPT/Claude, nur über die MARKE statt über den Nutzer. Idempotent (dedupe).
//
// ⚠️ ISO 27001: nutzt ausschließlich das vom Nutzer gewählte Modell (resolveModel).
// Body: { brand_voice_id: string, model?: string, limit?: number }

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

const SYSTEM = `Du pflegst das dauerhafte Langzeit-Gedächtnis EINER MARKE für künftige Content-Erstellung.
Aus dem gegebenen Marken-Profil und den Beispiel-Beiträgen extrahierst du dauerhafte, wiederverwendbare Fakten über die Marke:
Schreibstil, Tonalität, Sprachregeln, Zielgruppe, wiederkehrende Themen, Dos & Don'ts, Bild-/Visual-Vorlieben, typische Formulierungen.
NICHT aufnehmen: einmalige Post-Themen, Tagesinhalte, Floskeln, Meta-Kommentare.
Jeder Eintrag ist EIN knapper, konkreter, allgemein gültiger Satz auf Deutsch (max ~140 Zeichen), aus Sicht der Marke ("Wir …" / "Die Marke …").
Gib 6 bis 14 Einträge. Antworte AUSSCHLIESSLICH mit JSON: {"facts":["...","..."]}`;

function s(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "unauthorized" }, 401);
    const { brand_voice_id, model, team_id: bodyTeam } = await req.json().catch(() => ({}));
    if (!brand_voice_id) return json({ error: "brand_voice_id required" }, 400);

    // RLS-scoped Read: nur wenn der Aufrufer Zugriff auf die Marke hat, kommt die Row.
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

    // Jüngste Beiträge der Marke als zusätzliches Material
    const { data: posts } = await userClient
      .from("content_posts").select("content, title, status")
      .eq("brand_voice_id", brand_voice_id)
      .order("updated_at", { ascending: false }).limit(8);
    const postBlob = (posts || [])
      .map((p: Record<string, unknown>) => s(p.content).slice(0, 600))
      .filter((t: string) => t.length > 20).join("\n---\n").slice(0, 4000);

    const profile = [
      `Marke: ${bv.brand_name || bv.name || "?"}`,
      bv.ai_summary ? `Zusammenfassung: ${s(bv.ai_summary)}` : "",
      bv.personality ? `Persönlichkeit: ${s(bv.personality)}` : "",
      bv.tonality ? `Tonalität: ${s(bv.tonality)}` : "",
      bv.voice_style ? `Voice-Stil: ${s(bv.voice_style)}` : "",
      bv.sentence_style ? `Satzstil: ${s(bv.sentence_style)}` : "",
      bv.grammar_style ? `Grammatik/Sprache: ${s(bv.grammar_style)}` : "",
      bv.linkedin_style ? `LinkedIn-Stil: ${s(bv.linkedin_style)}` : "",
      bv.dos ? `Dos/Don'ts: ${s(bv.dos)}` : "",
      bv.visual_style_description ? `Visueller Stil: ${s(bv.visual_style_description)}` : "",
      bv.example_texts ? `Beispieltexte: ${s(bv.example_texts).slice(0, 1500)}` : "",
    ].filter(Boolean).join("\n").slice(0, 8000);

    const user = `## Marken-Profil\n${profile}\n\n${postBlob ? `## Beispiel-Beiträge der Marke\n${postBlob}` : ""}`;

    const { text } = await callText({ model: useModel, system: SYSTEM, user, maxTokens: 1500, jsonMode: true });
    let facts: string[] = [];
    try {
      const a = text.indexOf("{"); const b = text.lastIndexOf("}");
      const parsed = (a >= 0 && b > a) ? JSON.parse(text.slice(a, b + 1)) : null;
      if (Array.isArray(parsed?.facts)) facts = parsed.facts;
      else if (parsed && typeof parsed === "object") { const k = Object.keys(parsed).find((x) => Array.isArray(parsed[x])); if (k) facts = parsed[k]; }
    } catch (_) { /* nichts */ }
    facts = facts.map((f) => String(f || "").trim()).filter((f) => f.length > 8).slice(0, 14);
    if (!facts.length) return json({ ok: true, inserted: 0, facts: [] });

    // Dedupe gegen Bestand
    const { data: existing } = await userClient.from("brand_memory").select("content").eq("brand_voice_id", brand_voice_id).eq("team_id", teamId).limit(500);
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

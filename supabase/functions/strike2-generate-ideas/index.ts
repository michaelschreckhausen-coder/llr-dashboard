// Supabase Edge Function: strike2-generate-ideas (Phase 4)
//
// Frontend-orchestriert: 1 Call = 1 Funnel-Phase (10 Ideen). Frontend loopt die
// 7 Phasen + treibt generation_status. EF macht: Auth+Team-Guard → Persona laden
// → Schuster-Methodik-Prompt bauen → 1 Anthropic-Call → 10 Ideen parsen →
// REPLACE-by-phase in generated_ideas (idempotent: Re-Call/Retry ersetzt die
// Phase, keine Duplicate). Direkt gegen Anthropic, weil generate-EF Custom-
// System-Prompts ignoriert (baut Brand-Voice serverseitig).
//
// Body: { persona_id, phase_tag }   Auth: Bearer-JWT (Team-Mitglied der Persona)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCallerContext } from "../_shared/credits.ts";

const ANTHROPIC_API_KEY    = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Haiku statt Sonnet: ~10s/Call statt ~35s → 7 Calls bleiben unter dem
// Isolate-Wall-Clock-Limit (Sonnet riss es bei Call 4-5). Reicht für Ideen-
// Brainstorm + liefert sauberere JSON für das simple Schema.
const MODEL = "claude-haiku-4-5";
import { resolveModel, callText } from "../_shared/llm.ts";
const IDEAS_PER_PHASE = 10;

const PHASE_ORDER = ["PER", "INF", "BEF", "EVA", "BEW", "KEN-ABS", "IMP-RUC"];
const PHASE_META: Record<string, { name: string; goal: string; contentTypes: string; tonality: string }> = {
  PER:        { name: "Problemerkennung", goal: "Probleme der Persona sichtbar & spürbar machen", contentTypes: "Blogartikel, LinkedIn-Post, Podcast-Episode, Branchen-Studie, Survey-Report", tonality: "provokativ, datengetrieben, problembewusst" },
  INF:        { name: "Informieren", goal: "Orientierung & Wissensaufbau in einem neuen Themenfeld", contentTypes: "Erklär-Artikel, How-to, Glossar, FAQ, Explainer-Video, Newsletter", tonality: "aufklärend, strukturiert, neutral-hilfreich" },
  BEF:        { name: "Befähigen", goal: "Handlungsfähigkeit der Persona herstellen", contentTypes: "Whitepaper, Webinar, Video-Tutorial, Checkliste, Canvas-Vorlage, Workshop", tonality: "praktisch, anleitend, ermutigend" },
  EVA:        { name: "Evaluieren", goal: "Optionen strukturiert vergleichbar machen", contentTypes: "Buyer-Guide, Vergleichs-Matrix, ROI-Rechner, Demo, Analystenvergleich", tonality: "sachlich, vergleichend, transparent" },
  BEW:        { name: "Bewerten", goal: "Vertrauen aufbauen & wahrgenommenes Risiko senken", contentTypes: "Case Study, Referenz-Story, Testimonial, Zertifikats-Erklärung, Pilot-Angebot", tonality: "vertrauensbildend, belegt, konkret" },
  "KEN-ABS":  { name: "Entscheiden", goal: "Die Kaufentscheidung absichern & Einwände auflösen", contentTypes: "Business-Case-Vorlage, ROI-Nachweis, Einwand-FAQ, Entscheider-One-Pager", tonality: "entscheidungssicher, einwandbehandelnd, prägnant" },
  "IMP-RUC":  { name: "Kunden entwickeln", goal: "Onboarding, Bindung und Ausbau (Up-/Cross-Sell)", contentTypes: "Onboarding-Guide, Success-Story, Community-Format, Up-/Cross-Sell-Content, KPI-Report", tonality: "partnerschaftlich, erfolgsorientiert" },
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function fmtAnswers(obj: Record<string, unknown> | null): string {
  if (!obj) return "(keine Angaben)";
  const lines = Object.entries(obj).map(([k, v]) => {
    const val = Array.isArray(v) ? v.join(", ") : String(v ?? "");
    return val.trim() ? `- ${k}: ${val}` : null;
  }).filter(Boolean);
  return lines.length ? lines.join("\n") : "(keine Angaben)";
}

function buildSystemPrompt(phaseTag: string): string {
  const m = PHASE_META[phaseTag];
  return [
    "Du bist Content-Strategist nach dem Schuster-Modell® und dem Empathischen Funnel® von Norbert Schuster (strike2.de) — der Methodik für Lead-Management & Revenue-Engineering im B2B.",
    `Aktuelle Funnel-Phase: ${phaseTag} — ${m.name}. Ziel dieser Phase: ${m.goal}.`,
    `Empfohlene Content-Typen für diese Phase: ${m.contentTypes}.`,
    `Tonalität: ${m.tonality}.`,
    "",
    `Erzeuge GENAU ${IDEAS_PER_PHASE} Content-Ideen, die exakt diese Persona in dieser Funnel-Phase abholen.`,
    "Antworte AUSSCHLIESSLICH mit einem validen JSON-Array von genau " + IDEAS_PER_PHASE + " Objekten, ohne Markdown/Code-Fences, ohne Vor-/Nachtext.",
    'Jedes Objekt: { "title": string, "hook": string, "beschreibung": string, "target_format": string }.',
    "title = prägnanter Arbeitstitel; hook = der Aufhänger/erste Satz; beschreibung = 1-2 Sätze Inhalt/Angle; target_format = einer der empfohlenen Content-Typen.",
  ].join("\n");
}

function buildUserPrompt(persona: any, phaseTag: string, priorSummary: string): string {
  const gd = persona.persona_grunddaten || {};
  const phaseAnswers = (persona.antworten || {})[phaseTag] || {};
  return [
    "## Persona",
    `Name: ${gd.name || "—"}`,
    `Rolle im Buying Center: ${Array.isArray(gd.buying_center_role) ? gd.buying_center_role.join(", ") : (gd.buying_center_role || "—")}`,
    `Branche/Größe: ${gd.branche_groesse || "—"}`,
    `Strategische Ziele: ${gd.ziele || "—"}`,
    "",
    `## Antworten zur Phase ${phaseTag} (${PHASE_META[phaseTag].name})`,
    fmtAnswers(phaseAnswers),
    priorSummary ? "\n## Bisher erzeugte Ideen (für narrative Konsistenz, nicht wiederholen)\n" + priorSummary : "",
    "",
    `Erzeuge jetzt die ${IDEAS_PER_PHASE} Content-Ideen für die Phase ${phaseTag}.`,
  ].join("\n");
}

function priorIdeasSummary(persona: any, phaseTag: string): string {
  const existing = Array.isArray(persona.generated_ideas) ? persona.generated_ideas : [];
  const curIdx = PHASE_ORDER.indexOf(phaseTag);
  const priorTags = PHASE_ORDER.slice(0, curIdx);
  const titles = existing
    .filter((i: any) => priorTags.includes(i.phase_tag))
    .map((i: any) => i.title)
    .filter(Boolean)
    .slice(0, 12);
  return titles.length ? titles.map((t: string) => `- ${t}`).join("\n").slice(0, 900) : "";
}

// Providerübergreifend + gewähltes Modell (ISO 27001).
async function callAnthropic(model: string, system: string, user: string): Promise<string> {
  const r = await callText({ model, system, user, maxTokens: 3000, jsonMode: true });
  return (r.text || "").trim();
}

// 1 Retry bei transientem Fehler (429/5xx/Timeout/Netz) mit Backoff
async function callAnthropicRetry(model: string, system: string, user: string): Promise<string> {
  try { return await callAnthropic(model, system, user); }
  catch (e) {
    console.warn("[strike2] anthropic 1st-try failed, retry:", (e as Error).message);
    await new Promise((r) => setTimeout(r, 2500));
    return await callAnthropic(model, system, user);
  }
}

function parseIdeas(raw: string, phaseTag: string): any[] {
  let s = raw.trim();
  // Code-Fences strippen
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  // erstes [ ... ] greifen falls Wrapper-Text
  const a = s.indexOf("["); const b = s.lastIndexOf("]");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  // Trailing-Commas vor ] oder } entfernen (häufigster LLM-JSON-Fail)
  s = s.replace(/,(\s*[}\]])/g, "$1");
  let arr: any;
  try { arr = JSON.parse(s); } catch (_) { throw new Error("idea JSON parse failed"); }
  if (!Array.isArray(arr)) throw new Error("idea output not an array");
  return arr.slice(0, IDEAS_PER_PHASE).map((i: any) => ({
    phase_tag: phaseTag,
    content_type: i.target_format || i.content_type || null,
    title: i.title || "",
    hook: i.hook || "",
    beschreibung: i.beschreibung || i.description || "",
    target_format: i.target_format || null,
  })).filter((i: any) => i.title);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const ctx = await getCallerContext(req, admin);
  if (!ctx?.user_id) return json({ error: "unauthorized" }, 401);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const personaId = body.persona_id as string;
  const phaseTag = body.phase_tag as string;
  if (!personaId || !phaseTag || !PHASE_META[phaseTag]) return json({ error: "bad_params" }, 400);

  // Persona laden + Team-Guard (service_role bypassed RLS → Membership manuell)
  const { data: persona, error: pErr } = await admin
    .from("strike2_personas")
    .select("id, team_id, persona_grunddaten, antworten, generated_ideas")
    .eq("id", personaId).maybeSingle();
  if (pErr || !persona) return json({ error: "persona_not_found" }, 404);

  const { data: tm } = await admin.from("team_members").select("team_id").eq("user_id", ctx.user_id);
  const teamIds = (tm || []).map((r: { team_id: string }) => r.team_id);
  if (!teamIds.includes(persona.team_id)) return json({ error: "team_forbidden" }, 403);

  try {
    console.log("[strike2] start phase=" + phaseTag + " persona=" + personaId);
    const t0 = Date.now();
    const system = buildSystemPrompt(phaseTag);
    const user = buildUserPrompt(persona, phaseTag, priorIdeasSummary(persona, phaseTag));
    const useModel = await resolveModel(admin, [ctx.user_id], MODEL);
    const raw = await callAnthropicRetry(useModel, system, user);
    console.log("[strike2] anthropic ok phase=" + phaseTag + " ms=" + (Date.now() - t0) + " len=" + raw.length);
    let ideas: any[];
    try { ideas = parseIdeas(raw, phaseTag); }
    catch (pe) { console.warn("[strike2] parse-fail phase=" + phaseTag + " raw=" + raw.slice(0, 4000)); throw pe; }
    if (!ideas.length) throw new Error("no ideas parsed (phase " + phaseTag + ")");

    // REPLACE-by-phase: bestehende Ideen dieser Phase raus, neue rein (idempotent)
    const existing = Array.isArray(persona.generated_ideas) ? persona.generated_ideas : [];
    const merged = [...existing.filter((i: any) => i.phase_tag !== phaseTag), ...ideas];
    const { error: uErr } = await admin.from("strike2_personas")
      .update({ generated_ideas: merged }).eq("id", personaId);
    if (uErr) throw new Error("persist failed: " + uErr.message);

    return json({ ok: true, phase_tag: phaseTag, ideas_count: ideas.length, total_ideas: merged.length });
  } catch (e) {
    console.warn("[strike2-generate-ideas] error:", (e as Error).message);
    return json({ error: (e as Error).message }, 502);
  }
});

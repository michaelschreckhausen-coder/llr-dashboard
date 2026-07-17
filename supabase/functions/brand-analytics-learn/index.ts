// Supabase Edge Function: brand-analytics-learn
// ----------------------------------------------------------------------------
// Destilliert aus der POSTING-PERFORMANCE einer Marke (content_post_metrics)
// dauerhafte, umsetzbare Erkenntnisse ("Was funktioniert bei dieser Marke?")
// und schreibt sie als brand_memory (source='analytics'). Ergänzt die
// Nutzungshistorie-Quelle (brand-memory-learn). Keine Profil-/Bestand-Dopplung.
// ⚠️ ISO 27001: gewähltes Modell (resolveModel). Body: { brand_voice_id, team_id?, model? }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveModel, callText } from "../_shared/llm.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_MODEL = "claude-sonnet-4-6";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
function json(d: unknown, st = 200) { return new Response(JSON.stringify(d), { status: st, headers: { ...CORS, "Content-Type": "application/json" } }); }
function s(v: unknown): string { if (v == null) return ""; if (typeof v === "string") return v; try { return JSON.stringify(v); } catch { return String(v); } }

const SYSTEM = `Du pflegst ein ERGÄNZENDES Marken-Gedächtnis über die MARKE, gespeist aus der realen LinkedIn-POSTING-PERFORMANCE.
Aus den Kennzahlen der Beiträge (Impressions, Reaktionen, Kommentare, Reshares, Engagement-Rate) und deren Inhalten
leitest du dauerhafte, UMSETZBARE Erkenntnisse ab: welche Themen/Formate/Hooks/Längen/Stilmittel überdurchschnittlich
funktionieren und welche floppen. STRENG: nur belastbare, wiederkehrende Muster (mind. mehrere Beiträge), KEINE
Dopplung mit dem bekannten Markenprofil (unten) und keine Einzelfall-Aussagen. Wenn die Datenlage zu dünn ist, gib ein
leeres Array. Jeder Eintrag = EIN knapper, konkreter Satz auf Deutsch aus Markensicht ("Wir …" / "Bei uns …"),
möglichst mit dem beobachteten Effekt. 0 bis 8 Einträge.
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
    const { data: bv, error: bvErr } = await userClient.from("brand_voices")
      .select("id, team_id, name, ai_summary, personality, tonality, linkedin_style, dos")
      .eq("id", brand_voice_id).maybeSingle();
    if (bvErr) return json({ error: bvErr.message }, 400);
    if (!bv) return json({ error: "not found or not authorized" }, 403);
    const teamId = bodyTeam || bv.team_id;
    const { data: { user: actUser } } = await userClient.auth.getUser();
    const useModel = (typeof model === "string" && model) ? model : await resolveModel(admin, [actUser?.id], DEFAULT_MODEL);

    // Posts + Metriken der Marke laden (RLS)
    const { data: posts } = await userClient.from("content_posts")
      .select("id, title, content, content_post_metrics(impressions, likes, comments_count, reshares, engagement_rate, days_since_publish, measured_at)")
      .eq("brand_voice_id", brand_voice_id).limit(80);

    // Je Post die jüngste Metrik-Messung nehmen
    type Row = { snippet: string; impr: number; likes: number; comments: number; reshares: number; er: number };
    const rows: Row[] = [];
    for (const p of (posts || []) as any[]) {
      const m = (p.content_post_metrics || []);
      if (!m.length) continue;
      const latest = m.slice().sort((a: any, b: any) => String(b.measured_at).localeCompare(String(a.measured_at)))[0];
      const txt = s(p.content || p.title).replace(/\s+/g, " ").trim();
      if (!txt) continue;
      rows.push({
        snippet: txt.slice(0, 220),
        impr: Number(latest.impressions ?? 0), likes: Number(latest.likes ?? 0),
        comments: Number(latest.comments_count ?? 0), reshares: Number(latest.reshares ?? 0),
        er: Number(latest.engagement_rate ?? 0),
      });
    }
    if (rows.length < 3) return json({ ok: true, inserted: 0, facts: [], note: "zu wenig Performance-Daten" });

    rows.sort((a, b) => b.impr - a.impr);
    const fmt = (r: Row) => `- [Impr ${r.impr} | Likes ${r.likes} | Komm ${r.comments} | Reshares ${r.reshares} | ER ${r.er}%] ${r.snippet}`;
    const perf = rows.map(fmt).join("\n").slice(0, 9000);

    const profile = [
      bv.ai_summary && `Zusammenfassung: ${s(bv.ai_summary)}`,
      bv.personality && `Persönlichkeit: ${s(bv.personality)}`,
      bv.tonality && `Tonalität: ${s(bv.tonality)}`,
      bv.linkedin_style && `LinkedIn-Stil: ${s(bv.linkedin_style)}`,
      bv.dos && `Dos/Don'ts: ${s(bv.dos)}`,
    ].filter(Boolean).join("\n").slice(0, 3000);

    const user = `## Bekanntes Markenprofil (NICHT wiederholen)\n${profile || "(kein Profil)"}\n\n## Beitrags-Performance (nach Reichweite sortiert)\n${perf}`;
    const { text } = await callText({ model: useModel, system: SYSTEM, user, maxTokens: 1000, jsonMode: true });
    let facts: string[] = [];
    try {
      const a = text.indexOf("{"); const b = text.lastIndexOf("}");
      const parsed = (a >= 0 && b > a) ? JSON.parse(text.slice(a, b + 1)) : null;
      if (Array.isArray(parsed?.facts)) facts = parsed.facts;
      else if (parsed && typeof parsed === "object") { const k = Object.keys(parsed).find((x) => Array.isArray(parsed[x])); if (k) facts = parsed[k]; }
    } catch (_) { /* */ }
    facts = facts.map((f) => String(f || "").trim()).filter((f) => f.length > 8).slice(0, 8);
    if (!facts.length) return json({ ok: true, inserted: 0, facts: [] });

    const { data: existing } = await userClient.from("brand_memory").select("content").eq("brand_voice_id", brand_voice_id).limit(500);
    const have = (existing || []).map((e: any) => String(e.content || "").toLowerCase());
    const fresh = facts.filter((f) => { const l = f.toLowerCase(); return !have.some((h) => h.includes(l) || l.includes(h)); });
    if (!fresh.length) return json({ ok: true, inserted: 0, facts: [] });

    const insRows = fresh.map((content) => ({ brand_voice_id, team_id: teamId, user_id: actUser?.id || null, content, source: "analytics", no_brand: false }));
    const { error: insErr } = await userClient.from("brand_memory").insert(insRows);
    if (insErr) return json({ error: insErr.message }, 400);
    return json({ ok: true, inserted: insRows.length, facts: fresh });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});

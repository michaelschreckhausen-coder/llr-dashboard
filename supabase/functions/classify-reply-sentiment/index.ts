// classify-reply-sentiment — Reply-Cockpit KI-Sentiment (positiv/neutral/negativ).
// Baustein 2: klassifiziert die letzte eingehende Antwort eines Kampagnen-Kontakts
// (la_enrollments.last_reply_excerpt) über dieselbe Plumbing wie analyze-lead
// (Anthropic Messages, JSON-per-Prompt), nur schlanker + billiger (Haiku).
//
// Service-role-intern: wird von unipile-inbox-sync gefeuert, NICHT vom Frontend.
// Input: { enrollment_id: uuid }.
//
// Regeln (mit Michael abgestimmt):
//  · Manuell gewinnt: sentiment_source='manuell' → gar nichts tun.
//  · KI setzt sentiment_ai IMMER (Roh-Vorschlag), sentiment (effektiv) nur wenn confident.
//    Unsicher → sentiment bleibt null → UI zeigt „KI: X?".
//  · Idempotenz sitzt im Aufrufer (inbox-sync feuert nur bei NEUER Inbound-Msg).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-haiku-4-5-20251001";
const admin = createClient(SB_URL, SB_SERVICE);
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

const SYSTEM = `Du klassifizierst die Antwort eines B2B-Kontakts auf eine LinkedIn-Kalt-Akquise-Nachricht.
Kategorien:
- "positiv": klares Interesse, Terminwunsch, Kaufabsicht, positive Rückfrage mit Kaufinteresse.
- "neutral": unverbindlich, allgemeine Rückfrage (Preis/Aufwand), „später melden", höflich-abwartend.
- "negativ": Ablehnung, kein Bedarf, „nicht kontaktieren", genervt/Beschwerde.
Antworte AUSSCHLIESSLICH mit gültigem JSON (keine Markdown-Fences, kein Text drumherum):
{"sentiment":"positiv"|"neutral"|"negativ","confident":true|false,"reason":"max 1 kurzer Satz"}
"confident":false, wenn der Text zu kurz/mehrdeutig für eine sichere Einordnung ist.`;

function parseResult(raw: string): { sentiment: string; confident: boolean } | null {
  let t = (raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const o = JSON.parse(t);
    const s = String(o?.sentiment || "").toLowerCase();
    if (!["positiv", "neutral", "negativ"].includes(s)) return null;
    return { sentiment: s, confident: o?.confident === true };
  } catch (_e) {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (req.headers.get("Authorization") !== `Bearer ${SB_SERVICE}`) return json({ error: "unauthorized" }, 401);
  if (!ANTHROPIC_KEY) return json({ error: "ANTHROPIC_API_KEY missing" }, 500);

  const { enrollment_id } = await req.json().catch(() => ({} as any));
  if (!enrollment_id) return json({ error: "enrollment_id required" }, 400);

  const { data: enr } = await admin.from("la_enrollments")
    .select("id, team_id, sentiment_source, last_reply_excerpt").eq("id", enrollment_id).maybeSingle();
  if (!enr) return json({ error: "enrollment_not_found" }, 404);
  // Manuell gewinnt — KI rührt einen manuell gesetzten Wert nie an.
  if (enr.sentiment_source === "manuell") return json({ skipped: "manual" });
  const text = (enr.last_reply_excerpt || "").trim();
  if (text.length < 2) return json({ skipped: "empty" });

  const t0 = Date.now();
  let data: any;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 200, system: SYSTEM, messages: [{ role: "user", content: `Antwort des Kontakts:\n"""${text.slice(0, 1200)}"""` }] }),
    });
    if (!res.ok) return json({ error: "anthropic_" + res.status, detail: (await res.text()).slice(0, 200) }, 502);
    data = await res.json();
  } catch (e) {
    return json({ error: "anthropic_fetch", detail: String((e as any)?.message || e) }, 502);
  }

  const parsed = parseResult(data?.content?.[0]?.text || "");
  // Robustheit: unlesbare KI-Antwort → als unsicheres neutral behandeln (UI „KI: neutral?").
  const suggestion = parsed?.sentiment || "neutral";
  const confident = parsed ? parsed.confident : false;

  // sentiment_ai IMMER; sentiment (effektiv) nur wenn confident. Race-Guard: nie manuell überschreiben.
  const patch: Record<string, unknown> = { sentiment_ai: suggestion, updated_at: new Date().toISOString() };
  if (confident) { patch.sentiment = suggestion; patch.sentiment_source = "ki"; }
  // Race-Guard: nie einen manuell gesetzten Wert überschreiben. sentiment_source IS NULL
  // ist der Normalfall (noch nicht klassifiziert) — .not.eq würde NULL fälschlich ausschließen
  // (NULL != 'manuell' ist NULL, nicht TRUE), daher explizit is.null ODER neq.manuell.
  const { error: ue } = await admin.from("la_enrollments")
    .update(patch).eq("id", enrollment_id).or("sentiment_source.is.null,sentiment_source.neq.manuell");
  if (ue) console.warn("[classify-reply-sentiment] update:", ue.message);

  // Kosten-Log (best effort, kein Gate — automatische Hintergrund-Aktion).
  try {
    const u = data?.usage || {};
    const inTok = Number(u.input_tokens || 0), outTok = Number(u.output_tokens || 0);
    await admin.from("ai_usage_log").insert({
      team_id: enr.team_id, provider: "anthropic", model: MODEL, feature: "reply_sentiment",
      input_tokens: inTok, output_tokens: outTok,
      estimated_cost_eur: (inTok * 0.80 + outTok * 4.00) / 1_000_000 * 0.93,
      duration_ms: Date.now() - t0, status: "ok",
    });
  } catch (_e) { /* best effort */ }

  return json({ ok: true, enrollment_id, sentiment_ai: suggestion, confident, applied: confident });
});

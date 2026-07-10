// supabase/functions/text-werkstatt-chat/index.ts
// Multi-Turn-Chat für die Text-Werkstatt.
//
// Request:
//   {
//     chat_id?: uuid                     — bestehender Chat, sonst neu
//     brand_voice_id: uuid               — Pflicht beim ersten Turn
//     post_id?: uuid                     — wenn Chat aus Beitrag heraus
//     target_audience_id?: uuid
//     user_message: string
//     attachments?: [{ name, type, base64_or_url, ... }]
//     knowledge_resource_ids?: uuid[]    — ausgewählte Wissens-Items
//     use_web_search?: boolean           — Anthropic Web-Search-Tool aktivieren
//     model?: string                     — Default 'claude-sonnet-4-6'
//   }
//
// Response:
//   {
//     chat_id: uuid,
//     user_message_id: uuid,
//     assistant_message_id: uuid,
//     assistant_content: string,
//     beitragstext: string | null         — extrahiert aus <beitragstext>-Tag
//     sources: [{ url, title }]           — wenn Web-Search verwendet
//     model_used: string
//   }
//
// Persistiert beide Turns in content_chat_messages.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { buildBrandPrompt, buildAudiencePrompt, buildStrike2AudiencePrompt, buildKnowledgePrompt, buildBrandCorpus, HUMAN_STYLE_GUIDE, LINKEDIN_POST_GUIDE, stripEmDashes } from "../_shared/brandPrompt.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCallerTeamIds, filterOwnedIds } from "../_shared/tenant.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const DEFAULT_MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT_BASE = `Du bist die Text-Werkstatt von Leadesk, ein erfahrener LinkedIn-Ghostwriter, der Beiträge exakt in der Brand Voice des Nutzers schreibt.

**Vorrang-Regel (wichtigste Regel):**
Die unten mitgegebene Brand Voice und ihre Vorgaben (Tonalität, Wortwahl, Satzbau, LinkedIn-Format mit Hook-Stil, Struktur, CTA und Emoji-Nutzung, Dos/Don\'ts, Beispieltexte) haben IMMER Vorrang vor allen allgemeinen Stil- und LinkedIn-Regeln. Bei jedem Konflikt gewinnt die Brand Voice. Der Beitrag muss klingen wie von genau dieser Person/Marke, nicht wie ein generischer LinkedIn-Post.

**Perspektive steht fest, niemals nachfragen:**
- Du schreibst immer aus der Perspektive der ausgewählten Brand Voice (unten).
- Ist zusätzlich ein Unternehmen angegeben, schreibst du als diese Person/Marke als Ambassador für dieses Unternehmen: Stimme und Tonalität bleiben die der ausgewählten Brand Voice, das Unternehmen liefert nur inhaltlichen Kontext.
- Frage NIEMALS, aus welcher Perspektive, als wer oder für welches Unternehmen du schreiben sollst. Das ist über die Auswahl bereits entschieden.

**Zielgruppe & Wissen kommen nur aus den Auswahlfeldern, niemals nachfragen:**
- Eine Zielgruppe oder Wissensressource wird nur genutzt, wenn sie unten mitgegeben ist (per Dropdown gewählt). Ist keine Zielgruppe angegeben, schreib für ein passendes Fachpublikum und frage NICHT nach einer Zielgruppe.

**Einfach loslegen:**
- Erzeuge standardmäßig sofort einen starken Beitrag aus dem, was da ist. Stelle KEINE Rückfragen, außer die Anfrage ist komplett leer oder völlig unverständlich. Lieber eine sinnvolle Annahme treffen und liefern.

**Antwortstruktur:**
1. Eine sehr kurze Einleitung (1 Satz), was du lieferst.
2. Der finale, kopierfertige LinkedIn-Beitrag in <beitragstext>...</beitragstext>-Tags. Nur der reine Post-Text, keine Meta-Kommentare, Erklärungen oder Quellen.
3. Eine kurze Abrundung (1-2 Sätze): worauf du geachtet hast oder ein sinnvoller nächster Schritt.

**Weitere Regeln:**
- Die Kontextblöcke unten (Brand Voice, Zielgruppe, Wissensressourcen, bisherige Inhalte) sind verbindlich und müssen den Beitrag spürbar prägen: Blickwinkel und Stil aus der Brand, Relevanz und Beispiele aus der Zielgruppe, Fakten und Zahlen ausschließlich aus den Wissensressourcen (nichts erfinden).
- Bei Anpassungswünschen gib den überarbeiteten Beitrag erneut komplett in <beitragstext>-Tags zurück.
- Du kannst angehängte Bilder und Screenshots tatsächlich sehen und PDFs lesen — analysiere sie direkt und ziehe die relevanten Infos heraus. Behaupte NIEMALS, du könntest Bilder oder Screenshots nicht ansehen.
- Postet der Nutzer einen Link, öffne ihn mit dem web_fetch-Tool und lies die Seite aus. Behaupte NIEMALS, du könntest eine URL nicht abrufen, ohne es per web_fetch versucht zu haben.
- Bei aktivierter Web-Suche: nutze die Quellen für Fakten und Aktualität. Quellen-URLs gehören in die Abrundung außerhalb der <beitragstext>-Tags.
- Verwende im Beitragstext NIEMALS <cite>- oder <thinking>-Tags, Fußnoten-Marker, eckige Quellen-Verweise oder Lupen-/Such-Emojis.`;

// Ambassador-Modell: Die Person schreibt in IHRER Stimme, aber über/für dieses Unternehmen.
// Company Brand liefert Fakten-, Marken- und Themenkontext — NICHT die Tonalität.
function buildCompanyBrandContext(bv: any): string {
  if (!bv) return "";
  const lines: string[] = ["## Unternehmen (Ambassador-Kontext)"];
  lines.push("Der Autor schreibt als Person in der oben definierten Brand Voice, aber als Ambassador für das folgende Unternehmen. Nutze die Unternehmensinformationen als inhaltlichen Kontext (Fakten, Angebot, Mission, Positionierung). Die Tonalität, Wortwahl und Perspektive bleiben die der PERSON — nicht die des Unternehmens.");
  if (bv.brand_name || bv.name) lines.push(`Unternehmen: ${bv.brand_name || bv.name}`);
  if (bv.brand_background) lines.push(`Hintergrund: ${bv.brand_background}`);
  if (bv.mission) lines.push(`Mission: ${bv.mission}`);
  if (bv.vision) lines.push(`Vision: ${bv.vision}`);
  if (bv.values) lines.push(`Werte: ${bv.values}`);
  if (bv.target_audience) lines.push(`Zielgruppe des Unternehmens: ${bv.target_audience}`);
  if (Array.isArray(bv.vocabulary) && bv.vocabulary.length) lines.push(`Schlüsselbegriffe: ${bv.vocabulary.join(", ")}`);
  if (bv.dos) lines.push(`Inhaltliche Do's des Unternehmens:\n${bv.dos}`);
  if (bv.donts) lines.push(`Inhaltliche Don'ts des Unternehmens:\n${bv.donts}`);
  if (bv.ai_summary) lines.push(`Marken-Zusammenfassung: ${bv.ai_summary}`);
  return lines.join("\n");
}

function buildPostContext(post: any, postVisuals: any[]): string {
  if (!post) return "";
  const lines: string[] = ["## Beitrags-Kontext aus dem Redaktionsplan"];
  lines.push(`Der User arbeitet an einem konkreten Beitrag — beziehe dich auf diesen Kontext.`);
  if (post.title) lines.push(`Titel: ${post.title}`);
  if (post.content?.trim()) lines.push(`Bisheriger Beitragstext:\n${post.content}`);
  if (post.notes?.trim()) lines.push(`Notizen des Users zum Beitrag:\n${post.notes}`);
  if (post.topic) lines.push(`Thema/Hook: ${post.topic}`);
  if (post.platform) lines.push(`Plattform: ${post.platform}`);
  if (postVisuals?.length) {
    const desc = postVisuals.map((v: any, i: number) => `${i + 1}. ${v.prompt || v.original_filename || v.media_type || "Visual"}`).join("\n");
    lines.push(`Medien am Beitrag (${postVisuals.length}):\n${desc}`);
  }
  return lines.join("\n");
}

// Anthropic Messages API mit optionalem Web-Search-Tool
// ─── Provider-Routing ───────────────────────────────────────────────────────
// Das oben im Topbar gewählte Modell bestimmt Anbieter UND Tools. Jeder Anbieter
// nutzt seine EIGENEN Tools (Anthropic web_search/web_fetch, OpenAI Responses
// web_search, Google google_search/url_context, Mistral Conversations web_search).
function getProvider(model: string): string {
  if (model.startsWith("claude")) return "anthropic";
  if (model.startsWith("gpt") || /^o[0-9]/.test(model)) return "openai";
  if (model.startsWith("gemini")) return "google";
  if (model.startsWith("mistral") || model.startsWith("magistral") || model.startsWith("open-mixtral") || model.startsWith("codestral") || model.startsWith("ministral") || model.startsWith("pixtral")) return "mistral";
  return "anthropic";
}

type Media = { type: "image" | "document"; mime: string; base64: string; name?: string };
type LLMKeys = { anthropic?: string; openai?: string; google?: string; mistral?: string };
type Msg = { role: "user" | "assistant"; content: string };

function pushSrc(sources: { url: string; title: string }[], url?: string, title?: string) {
  if (url && !sources.find((s) => s.url === url)) sources.push({ url, title: title || url });
}

// EIN Anbieter-Aufruf. withWeb schaltet die anbieter-eigenen Web-Tools zu.
async function callProvider(opts: {
  keys: LLMKeys; model: string; systemPrompt: string;
  history: Msg[]; userText: string; media: Media[]; withWeb: boolean;
}): Promise<{ content: string; sources: { url: string; title: string }[] }> {
  const provider = getProvider(opts.model);
  const web = opts.withWeb;
  const sources: { url: string; title: string }[] = [];

  // ---------- ANTHROPIC ----------
  if (provider === "anthropic") {
    if (!opts.keys.anthropic) throw new Error("ANTHROPIC_API_KEY fehlt");
    const blocks: any[] = [];
    for (const m of opts.media) {
      if (m.type === "image") blocks.push({ type: "image", source: { type: "base64", media_type: m.mime, data: m.base64 } });
      else blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: m.base64 } });
    }
    blocks.push({ type: "text", text: opts.userText || "Bitte schau dir den/die Anhang/Anhänge an." });
    const messages = [...opts.history, { role: "user", content: blocks.length > 1 ? blocks : opts.userText }];
    const body: any = { model: opts.model, max_tokens: 4096, system: opts.systemPrompt, messages };
    if (web) body.tools = [
      { type: "web_search_20250305", name: "web_search", max_uses: 5 },
      { type: "web_fetch_20250910", name: "web_fetch", max_uses: 5, max_content_tokens: 60000 },
    ];
    const headers: any = { "x-api-key": opts.keys.anthropic, "anthropic-version": "2023-06-01", "Content-Type": "application/json" };
    if (web) headers["anthropic-beta"] = "web-search-2025-03-05,web-fetch-2025-09-10";
    else if (opts.media.some((m) => m.type === "document")) headers["anthropic-beta"] = "pdfs-2024-09-25";
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    let text = "";
    for (const b of data.content || []) {
      if (b.type === "text") {
        text += b.text;
        if (Array.isArray(b.citations)) for (const c of b.citations) pushSrc(sources, c.url || c.source_url, c.title);
      } else if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content) pushSrc(sources, r.url, r.title);
      } else if (b.type === "web_fetch_tool_result") {
        const c = b.content; pushSrc(sources, c?.url || c?.content?.url || c?.retrieved_url, c?.content?.title);
      }
    }
    return { content: text.trim(), sources };
  }

  // ---------- OPENAI ----------
  if (provider === "openai") {
    if (!opts.keys.openai) throw new Error("OPENAI_API_KEY fehlt");
    if (web) {
      // Responses API mit web_search-Tool (Standard-Chat-API kann keine Websuche für gpt-5.x)
      const input: any[] = [];
      for (const h of opts.history) input.push({ role: h.role, content: [{ type: h.role === "assistant" ? "output_text" : "input_text", text: h.content }] });
      const cur: any[] = [];
      for (const m of opts.media) if (m.type === "image") cur.push({ type: "input_image", image_url: `data:${m.mime};base64,${m.base64}` });
      cur.push({ type: "input_text", text: opts.userText });
      input.push({ role: "user", content: cur });
      const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST", headers: { Authorization: `Bearer ${opts.keys.openai}`, "content-type": "application/json" },
        body: JSON.stringify({ model: opts.model, instructions: opts.systemPrompt, tools: [{ type: "web_search" }], input }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      let text = "";
      for (const o of data.output || []) if (o.type === "message") for (const c of o.content || []) if (c.type === "output_text") {
        text += c.text; for (const a of c.annotations || []) if (a.type === "url_citation") pushSrc(sources, a.url, a.title);
      }
      return { content: text.trim(), sources };
    } else {
      // Chat Completions (mit Vision/PDF)
      const content: any[] = [];
      for (const m of opts.media) {
        if (m.type === "image") content.push({ type: "image_url", image_url: { url: `data:${m.mime};base64,${m.base64}` } });
        else content.push({ type: "file", file: { filename: m.name || "doc.pdf", file_data: `data:application/pdf;base64,${m.base64}` } });
      }
      content.push({ type: "text", text: opts.userText });
      const messages: any[] = [{ role: "system", content: opts.systemPrompt }, ...opts.history, { role: "user", content: content.length > 1 ? content : opts.userText }];
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", headers: { Authorization: `Bearer ${opts.keys.openai}`, "content-type": "application/json" },
        body: JSON.stringify({ model: opts.model, messages }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      return { content: (data.choices?.[0]?.message?.content || "").trim(), sources };
    }
  }

  // ---------- GOOGLE ----------
  if (provider === "google") {
    if (!opts.keys.google) throw new Error("GOOGLE_API_KEY fehlt");
    const contents: any[] = [];
    for (const h of opts.history) contents.push({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] });
    const parts: any[] = [];
    for (const m of opts.media) parts.push({ inlineData: { mimeType: m.type === "document" ? "application/pdf" : m.mime, data: m.base64 } });
    parts.push({ text: opts.userText });
    contents.push({ role: "user", parts });
    const reqBody: any = { contents, systemInstruction: { parts: [{ text: opts.systemPrompt }] } };
    if (web) reqBody.tools = [{ google_search: {} }, { url_context: {} }];
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent?key=${opts.keys.google}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(reqBody),
    });
    if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const cand = data.candidates?.[0] || {};
    const text = (cand.content?.parts || []).map((pt: any) => pt.text || "").join("");
    for (const ch of cand.groundingMetadata?.groundingChunks || []) pushSrc(sources, ch.web?.uri, ch.web?.title);
    return { content: text.trim(), sources };
  }

  // ---------- MISTRAL ----------
  if (provider === "mistral") {
    if (!opts.keys.mistral) throw new Error("MISTRAL_API_KEY fehlt");
    if (web) {
      // Conversations API mit web_search-Connector (Chat-API kann keine Websuche)
      const inputs: any[] = [];
      for (const h of opts.history) inputs.push({ role: h.role, content: h.content });
      const cur: any[] = [];
      for (const m of opts.media) if (m.type === "image") cur.push({ type: "input_image", image_url: `data:${m.mime};base64,${m.base64}` });
      cur.push({ type: "input_text", text: opts.userText });
      inputs.push({ role: "user", content: cur.length > 1 ? cur : opts.userText });
      const res = await fetch("https://api.mistral.ai/v1/conversations", {
        method: "POST", headers: { Authorization: `Bearer ${opts.keys.mistral}`, "content-type": "application/json" },
        body: JSON.stringify({ model: opts.model, instructions: opts.systemPrompt, tools: [{ type: "web_search" }], inputs }),
      });
      if (!res.ok) throw new Error(`Mistral ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      let text = "";
      for (const o of data.outputs || []) {
        if (o.type === "message.output") {
          const c = o.content;
          if (typeof c === "string") text += c;
          else if (Array.isArray(c)) for (const pc of c) {
            if (typeof pc === "string") text += pc;
            else if (pc?.type === "text") text += pc.text;
            else if (pc?.type === "tool_reference") pushSrc(sources, pc.url, pc.title);
          }
        } else if (o.type === "tool.execution" && o.info?.result) {
          try {
            const r = typeof o.info.result === "string" ? JSON.parse(o.info.result) : o.info.result;
            for (const k in r) { const it = r[k]; if (it?.url) pushSrc(sources, it.url, it.title); }
          } catch (_e) { /* ignore */ }
        }
      }
      return { content: text.trim(), sources };
    } else {
      // Chat Completions (Vision auf Mistral Large 3 / Pixtral / Ministral)
      const content: any[] = [];
      for (const m of opts.media) if (m.type === "image") content.push({ type: "image_url", image_url: `data:${m.mime};base64,${m.base64}` });
      content.push({ type: "text", text: opts.userText });
      const messages: any[] = [{ role: "system", content: opts.systemPrompt }, ...opts.history, { role: "user", content: content.length > 1 ? content : opts.userText }];
      const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST", headers: { Authorization: `Bearer ${opts.keys.mistral}`, "content-type": "application/json" },
        body: JSON.stringify({ model: opts.model, messages }),
      });
      if (!res.ok) throw new Error(`Mistral ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      return { content: (data.choices?.[0]?.message?.content || "").trim(), sources };
    }
  }

  throw new Error("Unbekannter Provider für Modell: " + opts.model);
}

// callLLM: ruft den gewählten Anbieter auf. Wenn Web gewünscht aber der Aufruf
// scheitert (Modell/Anbieter unterstützt es nicht), einmal OHNE Web wiederholen
// und einen kurzen Hinweis anhängen — nie heimlich den Anbieter wechseln.
async function callLLM(opts: {
  keys: LLMKeys; model: string; systemPrompt: string;
  history: Msg[]; userText: string; media: Media[]; useWebSearch: boolean; wantFetch: boolean;
}): Promise<{ content: string; sources: { url: string; title: string }[]; note?: string }> {
  const wantWeb = opts.useWebSearch || opts.wantFetch;
  try {
    const r = await callProvider({ ...opts, withWeb: wantWeb });
    return r;
  } catch (e) {
    if (!wantWeb) throw e;
    console.log(`[text-werkstatt-chat] web-path failed for ${opts.model}, retry ohne Web:`, String((e as any)?.message || e));
    const r = await callProvider({ ...opts, withWeb: false });
    return { ...r, note: "Hinweis: Das gewählte Modell konnte für diese Anfrage keine Web-Recherche/Link-Öffnung ausführen. Die Antwort basiert daher ohne Web-Zugriff." };
  }
}

// Entfernt verirrte Control-/Zitations-Tags, die Modelle (v.a. bei Web-Suche)
// manchmal in den Text schreiben: <cite>…</cite>, <thinking>/</thinking>, 🔍 usw.
function stripCitations(t: string): string {
  if (!t) return t;
  return t
    // Lone Control-/Zitations-Tags entfernen (nur die Tags, kein Textverlust):
    // <cite>, </cite>, <thinking>, </thinking>, <search_quality…> etc.
    .replace(/<\/?(?:cite|thinking|search_quality[a-z_]*|antml:[a-z_]+)\b[^>]*>/gi, "")
    .replace(/\uD83D\uDD0D/g, "")         // 🔍 (Such-Emoji als Quellmarker)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractBeitragstext(content: string): string | null {
  const m = content.match(/<beitragstext>([\s\S]*?)<\/beitragstext>/i);
  return m ? m[1].trim() : null;
}

// Erzeugt einen kurzen, prägnanten Chat-Titel aus dem Thema (Haiku, billig & schnell).
// Fällt bei Fehler/leerer Antwort auf null zurück → Caller nutzt dann autoTitleFromMessage.
async function generateChatTitle(apiKey: string, userMessage: string, beitragstext: string | null): Promise<string | null> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 24,
        system: "Du erzeugst einen kurzen, prägnanten Titel für einen Chat in einem LinkedIn-Content-Tool. Antworte mit NUR dem Titel: 2 bis 5 Wörter, Deutsch, das inhaltliche Thema benennend (kein ganzer Satz), KEIN abschließendes Satzzeichen, keine Anführungszeichen, keine Emojis.",
        messages: [{ role: "user", content: `Leite das Thema dieses Chats ab und gib einen Titel zurück.\n\nNutzer-Anfrage: ${userMessage}` + (beitragstext ? `\n\nErzeugter Beitrag (Auszug):\n${beitragstext.slice(0, 500)}` : "") }],
      }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    let t = (d?.content?.[0]?.text || "").replace(/\s+/g, " ").trim();
    t = t.replace(/^["'«»„“]+|["'«»„“.]+$/g, "").trim();
    if (!t) return null;
    if (t.length > 60) t = t.slice(0, 57).replace(/\s+\S*$/, "") + "…";
    return t;
  } catch (_e) {
    return null;
  }
}

function autoTitleFromMessage(msg: string): string {
  const trimmed = msg.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 60) return trimmed || "Neuer Chat";
  return trimmed.slice(0, 57).replace(/\s+\S*$/, "") + "…";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const llmKeys: LLMKeys = {
      anthropic: Deno.env.get("ANTHROPIC_API_KEY") || undefined,
      openai: Deno.env.get("OPENAI_API_KEY") || undefined,
      google: Deno.env.get("GOOGLE_API_KEY") || undefined,
      mistral: Deno.env.get("MISTRAL_API_KEY") || undefined,
    };
    if (!anthropicKey) return json({ error: "ANTHROPIC_API_KEY fehlt" }, 500);

    // User-Token aus Header für RLS-Auth
    const authHeader = req.headers.get("Authorization") || "";
    const userToken = authHeader.replace(/^Bearer\s+/i, "");
    if (!userToken) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || serviceKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Ungültige oder abgelaufene Session" }, 401);

    const body = await req.json();
    let chatId: string | undefined = body.chat_id;
    const brandVoiceId: string = body.brand_voice_id;
    const postId: string | undefined = body.post_id;
    const targetAudienceId: string | undefined = body.target_audience_id;
    const strike2PersonaId: string | undefined = body.strike2_persona_id;
    // Ambassador-Modell: optionaler Company-Brand-Kontext (brand_voices.account_type='company_page')
    const companyVoiceId: string | null | undefined = body.company_voice_id;
    const companyVoiceIds: string[] = Array.isArray(body.company_voice_ids) ? body.company_voice_ids.filter(Boolean) : (companyVoiceId ? [companyVoiceId] : []);
    const companyIdsProvided: boolean = body.company_voice_ids !== undefined || companyVoiceId !== undefined;
    const userMessage: string = (body.user_message || "").trim();
    const answerFormat: string = (body.answer_format || "post").toString();
    const knowledgeIdsRaw: string[] = Array.isArray(body.knowledge_resource_ids) ? body.knowledge_resource_ids : [];
    // MANDANTEN-TRENNUNG: knowledge-IDs aus dem Body via SERVICE_ROLE → nur
    // eigene/Team-Ressourcen zulassen (sonst Injektion fremder Wissensinhalte).
    const _twTeamIds = await getCallerTeamIds(admin, user.id);
    const knowledgeIds: string[] = await filterOwnedIds(admin, 'knowledge_base', knowledgeIdsRaw, user.id, _twTeamIds);
    const useWebSearch: boolean = !!body.use_web_search;
    // Enthält die Nachricht einen Link? Dann web_fetch aktivieren (auch ohne Websuche-Toggle),
    // damit gepostete URLs zuverlässig geöffnet werden.
    const hasUrlInMessage: boolean = /https?:\/\/[^\s]+/i.test(body.user_message || "");
    const documentContext: string = (body.document_context || "").trim();
    const model: string = body.model || DEFAULT_MODEL;
    const noBrand: boolean = !!body.no_brand;
    const bodyTeamId: string | null = body.team_id || null;

    if (!userMessage) return json({ error: "user_message ist Pflicht" }, 400);
    if (!brandVoiceId && !chatId && !noBrand) return json({ error: "brand_voice_id beim ersten Turn erforderlich" }, 400);
    if (noBrand && !chatId && !bodyTeamId) return json({ error: "team_id fuer markenlosen Chat erforderlich" }, 400);

    // ─── Chat anlegen oder laden ───────────────────────────────────────────
    let chat: any;
    if (chatId) {
      const { data, error } = await userClient.from("content_chats").select("*").eq("id", chatId).maybeSingle();
      if (error) return json({ error: "Chat-Lookup fehlgeschlagen: " + error.message }, 500);
      if (!data) return json({ error: "Chat nicht gefunden oder kein Zugriff" }, 404);
      chat = data;
      if (companyIdsProvided) {
        await userClient.from("content_chats").update({ company_voice_ids: companyVoiceIds, company_voice_id: companyVoiceIds[0] || null }).eq("id", chat.id);
        chat.company_voice_ids = companyVoiceIds;
        chat.company_voice_id = companyVoiceIds[0] || null;
      }
    } else {
      // Team aus BV ableiten (denormalisiert); markenlos: team_id aus Body
      let teamId = bodyTeamId;
      if (!noBrand) {
        const { data: bvRow } = await admin.from("brand_voices").select("team_id").eq("id", brandVoiceId).maybeSingle();
        teamId = bvRow?.team_id || null;
      }
      const { data: newChat, error: insErr } = await userClient.from("content_chats").insert({
        brand_voice_id: noBrand ? null : brandVoiceId,
        no_brand: noBrand,
        team_id: teamId,
        created_by: user.id,
        target_audience_id: noBrand ? null : (targetAudienceId || null),
        strike2_persona_id: noBrand ? null : (strike2PersonaId || null),
        company_voice_id: noBrand ? null : (companyVoiceIds[0] || null),
        company_voice_ids: noBrand ? [] : companyVoiceIds,
        post_id: postId || null,
        title: "Neuer Chat", // Platzhalter — wird nach 1. Antwort durch KI-Titel ersetzt
      }).select().single();
      if (insErr) return json({ error: "Chat-Erstellung fehlgeschlagen: " + insErr.message }, 500);
      chat = newChat;
      chatId = chat.id;

      // Wenn aus einem Post heraus gestartet UND der Post noch keinen Chat-Link hat:
      // Backlink setzen damit "Text verbessern" zurückführt
      if (postId) {
        await admin.from("content_posts").update({ text_werkstatt_chat_id: chat.id })
          .eq("id", postId).is("text_werkstatt_chat_id", null);
      }
    }

    // ─── Kontext laden (BV, Zielgruppe, Wissen, Post) ──────────────────────
    const [bvRes, audRes, knowRes, postRes, s2Res] = await Promise.all([
      chat.brand_voice_id ? admin.from("brand_voices").select("*").eq("id", chat.brand_voice_id).maybeSingle() : Promise.resolve({ data: null }),
      chat.target_audience_id || targetAudienceId
        ? admin.from("target_audiences").select("*").eq("id", chat.target_audience_id || targetAudienceId).maybeSingle()
        : Promise.resolve({ data: null }),
      knowledgeIds.length
        ? admin.from("knowledge_base").select("name,category,description,content").in("id", knowledgeIds)
        : Promise.resolve({ data: [] }),
      chat.post_id
        ? admin.from("content_posts").select("title,content,notes,topic,platform").eq("id", chat.post_id).maybeSingle()
        : Promise.resolve({ data: null }),
      (chat.strike2_persona_id || strike2PersonaId)
        ? admin.from("strike2_personas").select("name, persona_grunddaten, antworten").eq("id", chat.strike2_persona_id || strike2PersonaId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    let postVisuals: any[] = [];
    if (chat.post_id) {
      const { data: cpv } = await admin
        .from("content_post_visuals")
        .select("visuals(prompt, original_filename, media_type)")
        .eq("post_id", chat.post_id);
      postVisuals = (cpv || []).map((r: any) => r.visuals).filter(Boolean);
    }

    // Ambassador: Company-Brand-Kontext laden (wenn gesetzt und != Haupt-BV)
    let companyBvs: any[] = [];
    const chatCompanyIds: string[] = (Array.isArray(chat.company_voice_ids) && chat.company_voice_ids.length)
      ? chat.company_voice_ids
      : (chat.company_voice_id ? [chat.company_voice_id] : []);
    const companyIdsRequested = chatCompanyIds.filter((id: string) => id && id !== chat.brand_voice_id);
    // MANDANTEN-TRENNUNG: nur zugängliche Company-Brands laden.
    const companyIdsToLoad = await filterOwnedIds(admin, 'brand_voices', companyIdsRequested, user.id, _twTeamIds);
    if (companyIdsToLoad.length) {
      const { data: cbvs } = await admin.from("brand_voices").select("*").in("id", companyIdsToLoad);
      companyBvs = cbvs || [];
    }

    // ─── System-Prompt zusammenbauen ───────────────────────────────────────
    const systemParts = [SYSTEM_PROMPT_BASE, LINKEDIN_POST_GUIDE, HUMAN_STYLE_GUIDE];
    const bvCtx = buildBrandPrompt(bvRes.data);
    const audCtx = s2Res?.data ? buildStrike2AudiencePrompt(s2Res.data) : buildAudiencePrompt(audRes.data);
    const knowCtx = buildKnowledgePrompt(knowRes.data || []);
    const postCtx = buildPostContext(postRes.data, postVisuals);
    if (bvCtx) systemParts.push(bvCtx);
    for (const cbv of companyBvs) {
      const companyCtx = buildCompanyBrandContext(cbv);
      if (companyCtx) systemParts.push(companyCtx);
    }
    if (audCtx) systemParts.push(audCtx);
    if (knowCtx) systemParts.push(knowCtx);
    if (postCtx) systemParts.push(postCtx);
    if (documentContext) systemParts.push(
      "## Aktueller Dokument-Inhalt (Arbeitsstand im Editor)\n" +
      "Der Nutzer arbeitet gerade im Dokument-Editor an folgendem Text. Nutze ihn als zusätzlichen Kontext. " +
      "Wenn der Nutzer um eine Überarbeitung/Verbesserung bittet, gib die überarbeitete Fassung als <beitragstext>…</beitragstext> zurück:\n\n" +
      documentContext.slice(0, 8000)
    );
    let memEnabled = false;
    try { const { data: _pf } = await admin.from("user_preferences").select("memory_enabled").eq("user_id", user.id).maybeSingle(); memEnabled = _pf?.memory_enabled !== false; } catch (_e) { memEnabled = true; }  // Memory standardmäßig AN (nur explizit false = aus)
    if (memEnabled) {
      const corpus = await buildBrandCorpus(admin, chat.brand_voice_id, { noBrand: !!chat.no_brand, userId: user.id });
      if (corpus) systemParts.push(corpus);
    if (answerFormat === "chat") {
      systemParts.push("ANTWORTMODUS: CHATTEN. Der Nutzer möchte zunächst besprechen/brainstormen, KEINEN fertigen Beitrag. Antworte natürlich und beratend im Gespräch und stelle bei Bedarf Rückfragen. Erzeuge NUR dann einen <beitragstext>, wenn der Nutzer ausdrücklich einen fertigen Beitrag verlangt.");
    } else if (answerFormat === "auto") {
      systemParts.push("ANTWORTMODUS: AUTOMATISCH. Entscheide selbst anhand der Anfrage: Will der Nutzer klar einen fertigen LinkedIn-Beitrag, liefere ihn wie oben beschrieben in <beitragstext>…</beitragstext>. Will er hingegen nur besprechen/brainstormen, gibt er Feedback, oder fehlen dir noch wichtige Infos für einen guten Beitrag, dann antworte im Gespräch OHNE <beitragstext> und stelle gezielte Rückfragen.");
    }
    }
    const systemPrompt = systemParts.join("\n\n");

    // ─── Chat-History laden ────────────────────────────────────────────────
    const { data: history } = await admin
      .from("content_chat_messages")
      .select("role,content")
      .eq("chat_id", chat.id)
      .order("created_at", { ascending: true });

    // Chat-History (nur Text vergangener Turns) — Anbieter-neutral.
    const historyMsgs: Msg[] = (history || [])
      .filter((m: any) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // Anhänge dieses Turns → anbieter-neutrale Media-Parts (Vision/Dokument).
    const rawAtts: any[] = Array.isArray(body.attachments) ? body.attachments : [];
    const mediaParts: Media[] = [];
    for (const a of rawAtts) {
      const mime: string = (a?.type || "").toLowerCase();
      const b64: string | undefined = a?.base64;
      if (!b64) continue;
      if (mime.startsWith("image/")) mediaParts.push({ type: "image", mime, base64: b64, name: a?.name });
      else if (mime === "application/pdf") mediaParts.push({ type: "document", mime: "application/pdf", base64: b64, name: a?.name });
    }

    // ─── User-Message persistieren (vor LLM-Call, damit bei Fehler trotzdem da) ─
    const { data: userMsgRow, error: umErr } = await admin
      .from("content_chat_messages")
      .insert({
        chat_id: chat.id, role: "user", content: userMessage,
        metadata: { knowledge_resource_ids: knowledgeIds, use_web_search: useWebSearch, attachments: (body.attachments || []).map((a: any) => ({ name: a?.name, type: a?.type, size: a?.size, preview: a?.preview || null })) },
      })
      .select().single();
    if (umErr) return json({ error: "User-Message konnte nicht gespeichert werden: " + umErr.message }, 500);

    // ─── LLM-Call ──────────────────────────────────────────────────────────
    let assistantContent: string;
    let sources: { url: string; title: string }[] = [];
    try {
      const result = await callLLM({
        keys: llmKeys, model, systemPrompt,
        history: historyMsgs, userText: userMessage, media: mediaParts,
        useWebSearch, wantFetch: hasUrlInMessage,
      });
      assistantContent = stripEmDashes(stripCitations(result.content));
      if (result.note) assistantContent = assistantContent + "\n\n" + result.note;
      sources = result.sources;
    } catch (e) {
      // Bei LLM-Fehler trotzdem versuchen die User-Message zu erhalten
      return json({ error: "Modell-Aufruf fehlgeschlagen: " + String(e?.message || e) }, 502);
    }

    const beitragstext = extractBeitragstext(assistantContent);

    // ─── Assistant-Message persistieren ────────────────────────────────────
    const { data: asMsgRow, error: amErr } = await admin
      .from("content_chat_messages")
      .insert({
        chat_id: chat.id, role: "assistant", content: assistantContent,
        metadata: { sources, beitragstext, model, used_web_search: useWebSearch },
      })
      .select().single();
    if (amErr) return json({ error: "Assistant-Message konnte nicht gespeichert werden: " + amErr.message }, 500);

    // Memory: produzierten Beitragstext als Generation protokollieren (fließt als Beispiel zurück)
    if (memEnabled && beitragstext) {
      try {
        await admin.from("content_generations").insert({
          user_id: user.id, team_id: chat.team_id, kind: "full_post", model,
          prompt_input: { source: "chat", chat_id: chat.id, user_message: userMessage.slice(0, 500) },
          brand_voice_id: chat.brand_voice_id, target_audience_id: chat.target_audience_id || null,
          variants: [beitragstext], picked_variant_index: 0,
        });
      } catch (_e) { /* best effort */ }
    }

    // Chat-updated_at bumpen + ggf. title aktualisieren wenn er noch Default ist
    const updates: any = { updated_at: new Date().toISOString() };
    if (chat.title === "Neuer Chat") {
      const smartTitle = await generateChatTitle(anthropicKey, userMessage, beitragstext);
      updates.title = smartTitle || autoTitleFromMessage(userMessage);
    }
    if (targetAudienceId && targetAudienceId !== chat.target_audience_id) updates.target_audience_id = targetAudienceId;
    if (strike2PersonaId && strike2PersonaId !== chat.strike2_persona_id) updates.strike2_persona_id = strike2PersonaId;
    await admin.from("content_chats").update(updates).eq("id", chat.id);

    return json({
      chat_id: chat.id,
      user_message_id: userMsgRow.id,
      assistant_message_id: asMsgRow.id,
      assistant_content: assistantContent,
      beitragstext,
      sources,
      model_used: model,
    });

  } catch (e: any) {
    return json({ error: "Unerwarteter Fehler: " + (e?.message || String(e)) }, 500);
  }
});

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
import { buildBrandPrompt, buildAudiencePrompt, buildKnowledgePrompt, buildBrandCorpus, HUMAN_STYLE_GUIDE, LINKEDIN_POST_GUIDE, stripEmDashes } from "../_shared/brandPrompt.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

const DEFAULT_MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT_BASE = `Du bist die Text-Werkstatt von Leadesk — ein erfahrener LinkedIn-Content-Coach, der den User dabei unterstützt, Beiträge in seiner Brand Voice zu schreiben.

**Wichtig — Antwortstruktur:**
1. Schreibe eine kurze, freundliche Einleitung (1-2 Sätze) was du gleich produzierst.
2. Schließe den finalen, kopierfertigen LinkedIn-Beitrag in <beitragstext>...</beitragstext>-Tags ein. Nichts anderes als der reine Post-Text gehört in diese Tags — keine Meta-Kommentare, keine Erklärungen, keine Quellen. Genau so wie er auf LinkedIn erscheinen würde.
3. Schließe mit einer kurzen Abrundung (1-2 Sätze): worauf du beim Schreiben besonders geachtet hast, oder eine Empfehlung was als nächstes passieren könnte.

**Stil-Regeln:**
- Folge konsequent der unten beschriebenen Brand Voice (Tonalität, Wortwahl, Do's & Don'ts).
- Beziehe dich auf die Zielgruppe und sprich sie in ihrer Sprache an.
- Die unten mitgegebenen Kontextblöcke (Brand Voice, Zielgruppe, Wissensressourcen) sind VERBINDLICH und müssen den Beitrag spürbar prägen: Themenwahl/Blickwinkel aus der Brand, Relevanz/Beispiele/Pain Points aus der Zielgruppe, Fakten und Zahlen ausschließlich aus den Wissensressourcen (nichts erfinden).
- Wenn der User um Anpassungen bittet, übergebe in der nächsten Antwort den überarbeiteten Beitrag erneut in <beitragstext>-Tags.
- Wenn der User keinen klaren Auftrag gibt, frage zurück statt blind zu generieren.
- Bei aktivierter Web-Suche: nutze die Quellen für Fakten/Zahlen/Aktualität. Quellen-URLs gehören in die Abrundung außerhalb der <beitragstext>-Tags.
- WICHTIG: Verwende im Beitragstext NIEMALS <cite>- oder <thinking>-Tags, Fußnoten-Marker, eckige Quellen-Verweise oder Lupen-/Such-Emojis (🔍). Der Beitragstext ist reiner, kopierfertiger LinkedIn-Text ohne jegliche technische Zitations-Artefakte.`;

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
async function callAnthropic(opts: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  conversation: { role: "user" | "assistant"; content: string }[];
  useWebSearch: boolean;
}): Promise<{ content: string; sources: { url: string; title: string }[]; stopReason?: string }> {
  const body: any = {
    model: opts.model,
    max_tokens: 4096,
    system: opts.systemPrompt,
    messages: opts.conversation,
  };
  if (opts.useWebSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "web-search-2025-03-05",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 400)}`);
  }
  const data = await res.json();

  // Content-Blocks zusammenfassen + Sources sammeln
  let textOut = "";
  const sources: { url: string; title: string }[] = [];
  for (const block of data.content || []) {
    if (block.type === "text") {
      textOut += block.text;
      // Citations in dem Text-Block
      if (Array.isArray(block.citations)) {
        for (const c of block.citations) {
          const url = c.url || c.source_url;
          const title = c.title || url;
          if (url && !sources.find((s) => s.url === url)) sources.push({ url, title });
        }
      }
    } else if (block.type === "web_search_tool_result") {
      // Auch hier können Quellen drinstecken
      if (Array.isArray(block.content)) {
        for (const r of block.content) {
          if (r.url && !sources.find((s) => s.url === r.url)) {
            sources.push({ url: r.url, title: r.title || r.url });
          }
        }
      }
    }
  }
  return { content: textOut.trim(), sources, stopReason: data.stop_reason };
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
    // Ambassador-Modell: optionaler Company-Brand-Kontext (brand_voices.account_type='company_page')
    const companyVoiceId: string | null | undefined = body.company_voice_id;
    const companyVoiceIds: string[] = Array.isArray(body.company_voice_ids) ? body.company_voice_ids.filter(Boolean) : (companyVoiceId ? [companyVoiceId] : []);
    const companyIdsProvided: boolean = body.company_voice_ids !== undefined || companyVoiceId !== undefined;
    const userMessage: string = (body.user_message || "").trim();
    const knowledgeIds: string[] = Array.isArray(body.knowledge_resource_ids) ? body.knowledge_resource_ids : [];
    const useWebSearch: boolean = !!body.use_web_search;
    const documentContext: string = (body.document_context || "").trim();
    const model: string = body.model || DEFAULT_MODEL;

    if (!userMessage) return json({ error: "user_message ist Pflicht" }, 400);
    if (!brandVoiceId && !chatId) return json({ error: "brand_voice_id beim ersten Turn erforderlich" }, 400);

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
      // Team aus BV ableiten (denormalisiert)
      const { data: bvRow } = await admin.from("brand_voices").select("team_id").eq("id", brandVoiceId).maybeSingle();
      const teamId = bvRow?.team_id || null;
      const { data: newChat, error: insErr } = await userClient.from("content_chats").insert({
        brand_voice_id: brandVoiceId,
        team_id: teamId,
        created_by: user.id,
        target_audience_id: targetAudienceId || null,
        company_voice_id: companyVoiceIds[0] || null,
        company_voice_ids: companyVoiceIds,
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
    const [bvRes, audRes, knowRes, postRes] = await Promise.all([
      admin.from("brand_voices").select("*").eq("id", chat.brand_voice_id).maybeSingle(),
      chat.target_audience_id || targetAudienceId
        ? admin.from("target_audiences").select("*").eq("id", chat.target_audience_id || targetAudienceId).maybeSingle()
        : Promise.resolve({ data: null }),
      knowledgeIds.length
        ? admin.from("knowledge_base").select("name,category,description,content").in("id", knowledgeIds)
        : Promise.resolve({ data: [] }),
      chat.post_id
        ? admin.from("content_posts").select("title,content,notes,topic,platform").eq("id", chat.post_id).maybeSingle()
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
    const companyIdsToLoad = chatCompanyIds.filter((id: string) => id && id !== chat.brand_voice_id);
    if (companyIdsToLoad.length) {
      const { data: cbvs } = await admin.from("brand_voices").select("*").in("id", companyIdsToLoad);
      companyBvs = cbvs || [];
    }

    // ─── System-Prompt zusammenbauen ───────────────────────────────────────
    const systemParts = [SYSTEM_PROMPT_BASE, LINKEDIN_POST_GUIDE, HUMAN_STYLE_GUIDE];
    const bvCtx = buildBrandPrompt(bvRes.data);
    const audCtx = buildAudiencePrompt(audRes.data);
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
    try { const { data: _pf } = await admin.from("user_preferences").select("memory_enabled").eq("user_id", user.id).maybeSingle(); memEnabled = _pf?.memory_enabled === true; } catch (_e) { memEnabled = false; }
    if (memEnabled) {
      const corpus = await buildBrandCorpus(admin, chat.brand_voice_id);
      if (corpus) systemParts.push(corpus);
    }
    const systemPrompt = systemParts.join("\n\n");

    // ─── Chat-History laden ────────────────────────────────────────────────
    const { data: history } = await admin
      .from("content_chat_messages")
      .select("role,content")
      .eq("chat_id", chat.id)
      .order("created_at", { ascending: true });

    const conversation = (history || [])
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content }));
    conversation.push({ role: "user", content: userMessage });

    // ─── User-Message persistieren (vor LLM-Call, damit bei Fehler trotzdem da) ─
    const { data: userMsgRow, error: umErr } = await admin
      .from("content_chat_messages")
      .insert({
        chat_id: chat.id, role: "user", content: userMessage,
        metadata: { knowledge_resource_ids: knowledgeIds, use_web_search: useWebSearch, attachments: body.attachments || [] },
      })
      .select().single();
    if (umErr) return json({ error: "User-Message konnte nicht gespeichert werden: " + umErr.message }, 500);

    // ─── LLM-Call ──────────────────────────────────────────────────────────
    let assistantContent: string;
    let sources: { url: string; title: string }[] = [];
    try {
      const result = await callAnthropic({
        apiKey: anthropicKey, model, systemPrompt, conversation, useWebSearch,
      });
      assistantContent = stripEmDashes(stripCitations(result.content));
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

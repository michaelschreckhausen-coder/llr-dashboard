// ─────────────────────────────────────────────────────────────────────────────
// Provider-übergreifender Agent-Layer (Tool-Calling) für Leadly.
//
// ⚠️ ISO 27001 / Datenresidenz: Leadly nutzt AUSSCHLIESSLICH das vom Nutzer
// gewählte Modell (profiles.default_ai_model). Dieser Layer führt den Tool-Use-Loop
// anbieterunabhängig aus — dieselben TOOLS funktionieren mit Anthropic, OpenAI,
// Google (Gemini) und Mistral. NIE wird ein Anbieter hardcodiert.
//
// Neutrales Nachrichtenformat = Anthropic-Block-Format (das Leadly ohnehin intern
// baut). Der Adapter übersetzt nur bei Nicht-Anthropic-Modellen. Die Antwort wird
// IMMER als Anthropic-förmige Blocks zurückgegeben (text + tool_use), sodass Leadlys
// bestehender Loop (Guardrails, Credit-Gating, Memory-Save) unverändert bleibt.
// ─────────────────────────────────────────────────────────────────────────────

import { getProvider } from "./llm.ts";

// ── Neutrale (Anthropic-förmige) Typen ──────────────────────────────────────
export type NeutralBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export type NeutralMessage = { role: "user" | "assistant"; content: string | NeutralBlock[] };

export type AnthropicTool = { name: string; description: string; input_schema: Record<string, unknown> };

export type AgentStepResult = {
  blocks: Array<{ type: string; [k: string]: unknown }>;
  finish: string;
  usage: { input_tokens: number; output_tokens: number };
};

type Keys = { anthropic: string; openai: string; google: string; mistral: string };

function loadKeys(): Keys {
  return {
    anthropic: Deno.env.get("ANTHROPIC_API_KEY") || "",
    openai: Deno.env.get("OPENAI_API_KEY") || "",
    google: Deno.env.get("GOOGLE_API_KEY") || Deno.env.get("GEMINI_API_KEY") || "",
    mistral: Deno.env.get("MISTRAL_API_KEY") || "",
  };
}

// ── Tool-Konvertierung ──────────────────────────────────────────────────────
function toOpenAITools(tools: AnthropicTool[]) {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}
function toGeminiTools(tools: AnthropicTool[]) {
  return [{
    functionDeclarations: tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: sanitizeGeminiSchema(t.input_schema),
    })),
  }];
}
function sanitizeGeminiSchema(schema: any): any {
  if (Array.isArray(schema)) return schema.map(sanitizeGeminiSchema);
  if (schema && typeof schema === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(schema)) {
      if (k === "additionalProperties" || k === "$schema") continue;
      out[k] = sanitizeGeminiSchema(v);
    }
    return out;
  }
  return schema;
}

// ── Message-Übersetzung: neutral (Anthropic) → OpenAI/Mistral ───────────────
function neutralToOpenAI(messages: NeutralMessage[], system: string) {
  const out: any[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    if (m.role === "assistant") {
      const textParts: string[] = [];
      const toolCalls: any[] = [];
      for (const b of m.content) {
        if (b.type === "text") textParts.push((b as any).text);
        else if (b.type === "tool_use") {
          toolCalls.push({
            id: (b as any).id,
            type: "function",
            function: { name: (b as any).name, arguments: JSON.stringify((b as any).input || {}) },
          });
        }
      }
      const msg: any = { role: "assistant", content: textParts.join("\n") || null };
      if (toolCalls.length) msg.tool_calls = toolCalls;
      out.push(msg);
    } else {
      const toolResults = m.content.filter((b) => b.type === "tool_result");
      if (toolResults.length) {
        for (const tr of toolResults) {
          out.push({ role: "tool", tool_call_id: (tr as any).tool_use_id, content: (tr as any).content });
        }
        continue;
      }
      const contentArr: any[] = [];
      for (const b of m.content) {
        if (b.type === "text") contentArr.push({ type: "text", text: (b as any).text });
        else if (b.type === "image") {
          const s = (b as any).source;
          contentArr.push({ type: "image_url", image_url: { url: `data:${s.media_type};base64,${s.data}` } });
        } else if (b.type === "document") {
          contentArr.push({ type: "text", text: "[PDF-Anhang — dieses Modell kann PDFs nicht direkt lesen.]" });
        }
      }
      out.push({ role: "user", content: contentArr.length === 1 && contentArr[0].type === "text" ? contentArr[0].text : contentArr });
    }
  }
  return out;
}

// ── Message-Übersetzung: neutral (Anthropic) → Gemini ───────────────────────
function neutralToGemini(messages: NeutralMessage[]) {
  const idToName: Record<string, string> = {};
  for (const m of messages) {
    if (m.role === "assistant" && Array.isArray(m.content)) {
      for (const b of m.content) if (b.type === "tool_use") idToName[(b as any).id] = (b as any).name;
    }
  }
  const contents: any[] = [];
  for (const m of messages) {
    if (typeof m.content === "string") {
      contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] });
      continue;
    }
    if (m.role === "assistant") {
      const parts: any[] = [];
      for (const b of m.content) {
        if (b.type === "text") parts.push({ text: (b as any).text });
        else if (b.type === "tool_use") parts.push({ functionCall: { name: (b as any).name, args: (b as any).input || {} } });
      }
      contents.push({ role: "model", parts: parts.length ? parts : [{ text: "" }] });
    } else {
      const toolResults = m.content.filter((b) => b.type === "tool_result");
      if (toolResults.length) {
        const parts = toolResults.map((tr) => {
          let parsed: unknown;
          try { parsed = JSON.parse((tr as any).content); } catch { parsed = { result: (tr as any).content }; }
          return { functionResponse: { name: idToName[(tr as any).tool_use_id] || "unknown", response: { result: parsed } } };
        });
        contents.push({ role: "user", parts });
        continue;
      }
      const parts: any[] = [];
      for (const b of m.content) {
        if (b.type === "text") parts.push({ text: (b as any).text });
        else if (b.type === "image" || b.type === "document") {
          const s = (b as any).source;
          parts.push({ inlineData: { mimeType: s.media_type, data: s.data } });
        }
      }
      contents.push({ role: "user", parts: parts.length ? parts : [{ text: "" }] });
    }
  }
  return contents;
}

// ── Ein Agent-Schritt (ein LLM-Call, provider-agnostisch) ───────────────────
export async function agentStep(opts: {
  model: string;
  system: string;
  messages: NeutralMessage[];
  tools: AnthropicTool[];
  maxTokens?: number;
}): Promise<AgentStepResult> {
  const { model, system, messages, tools } = opts;
  const maxTokens = opts.maxTokens ?? 2048;
  const provider = getProvider(model);
  const K = loadKeys();

  if (provider === "anthropic") {
    if (!K.anthropic) throw new Error("ANTHROPIC_API_KEY fehlt");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": K.anthropic, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, tools, messages }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d?.error?.message || `Anthropic ${res.status}`);
    return {
      blocks: d.content || [],
      finish: d.stop_reason || "unknown",
      usage: { input_tokens: d.usage?.input_tokens || 0, output_tokens: d.usage?.output_tokens || 0 },
    };
  }

  if (provider === "openai" || provider === "mistral") {
    const key = provider === "openai" ? K.openai : K.mistral;
    if (!key) throw new Error(`${provider.toUpperCase()}_API_KEY fehlt`);
    const url = provider === "openai"
      ? "https://api.openai.com/v1/chat/completions"
      : "https://api.mistral.ai/v1/chat/completions";
    const body: any = {
      model,
      messages: neutralToOpenAI(messages, system),
      tools: toOpenAITools(tools),
      tool_choice: "auto",
    };
    if (provider === "openai" && /^(gpt-5|o[0-9])/.test(model)) body.max_completion_tokens = maxTokens;
    else body.max_tokens = maxTokens;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d?.error?.message || `${provider} ${res.status}`);
    const msg = d?.choices?.[0]?.message || {};
    const blocks: Array<{ type: string; [k: string]: unknown }> = [];
    if (msg.content) blocks.push({ type: "text", text: msg.content });
    const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    for (const tc of toolCalls) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(tc.function?.arguments || "{}"); } catch { input = {}; }
      blocks.push({ type: "tool_use", id: tc.id, name: tc.function?.name, input });
    }
    const finish = toolCalls.length > 0 ? "tool_use" : (d?.choices?.[0]?.finish_reason || "stop");
    return {
      blocks,
      finish,
      usage: { input_tokens: d?.usage?.prompt_tokens || 0, output_tokens: d?.usage?.completion_tokens || 0 },
    };
  }

  if (provider === "google") {
    if (!K.google) throw new Error("GOOGLE_API_KEY fehlt");
    const body: any = {
      contents: neutralToGemini(messages),
      systemInstruction: { parts: [{ text: system }] },
      tools: toGeminiTools(tools),
      generationConfig: { maxOutputTokens: maxTokens },
    };
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${K.google}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    const d = await res.json();
    if (!res.ok) throw new Error(d?.error?.message || `Google ${res.status}`);
    const parts = d?.candidates?.[0]?.content?.parts || [];
    const blocks: Array<{ type: string; [k: string]: unknown }> = [];
    let callIdx = 0;
    let sawFnCall = false;
    for (const p of parts) {
      if (typeof p.text === "string" && p.text) blocks.push({ type: "text", text: p.text });
      else if (p.functionCall) {
        sawFnCall = true;
        blocks.push({
          type: "tool_use",
          id: `gem_${Date.now()}_${callIdx++}`,
          name: p.functionCall.name,
          input: (p.functionCall.args || {}) as Record<string, unknown>,
        });
      }
    }
    return {
      blocks,
      finish: sawFnCall ? "tool_use" : (d?.candidates?.[0]?.finishReason || "stop"),
      usage: {
        input_tokens: d?.usageMetadata?.promptTokenCount || 0,
        output_tokens: d?.usageMetadata?.candidatesTokenCount || 0,
      },
    };
  }

  throw new Error(`Unbekannter Provider für Modell: ${model}`);
}

// ── Einfacher Ein-Schritt-Textcall (kein Tool-Loop) — für Briefing/Essenz ───
export async function agentText(opts: {
  model: string; system: string; user: string | NeutralBlock[]; maxTokens?: number;
}): Promise<{ text: string; usage: { input_tokens: number; output_tokens: number } }> {
  const messages: NeutralMessage[] = [{ role: "user", content: opts.user }];
  const r = await agentStep({ model: opts.model, system: opts.system, messages, tools: [], maxTokens: opts.maxTokens });
  const text = r.blocks.filter((b) => b.type === "text").map((b) => (b as any).text).join("\n").trim();
  return { text, usage: r.usage };
}

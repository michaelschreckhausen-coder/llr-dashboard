// ─────────────────────────────────────────────────────────────────────────────
// Provider-abhängige Embeddings für Leadlys semantisches Memory.
//
// ⚠️ ISO 27001 / Datenresidenz: Auch Embeddings (Vektorisierung von Memory-Text
// für die Ähnlichkeitssuche) dürfen nur an den vom Nutzer GEWÄHLTEN Anbieter gehen.
// Deshalb folgt das Embedding-Modell dem gewählten Chat-Modell:
//   OpenAI  -> text-embedding-3-small (1536)
//   Google  -> gemini-embedding-001    (3072)
//   Mistral -> mistral-embed          (1024)
//   Anthropic (Claude): KEIN Embedding-Anbieter vorhanden -> null
//     => Aufrufer nutzt dann Recency-Fallback (keine externen Daten).
//
// Da die Ähnlichkeit in Leadly ohnehin in JS gerechnet wird (kein pgvector-Operator),
// werden Vektoren als JSON gespeichert (variable Dimension) + der erzeugende Provider.
// Verglichen wird IMMER nur innerhalb desselben Vektorraums (embed_provider gleich).
// ─────────────────────────────────────────────────────────────────────────────

import { getProvider } from "./llm.ts";

export type EmbedProvider = "openai" | "google" | "mistral";
export type EmbedResult = { vector: number[] | null; provider: EmbedProvider | null };

// Welcher Embedding-Provider gehört zum gewählten Chat-Modell?
export function embedProviderForModel(model: string): EmbedProvider | null {
  const p = getProvider(model);
  if (p === "anthropic") return null; // Claude hat keine Embedding-API
  return p; // 'openai' | 'google' | 'mistral'
}

export async function embedText(model: string, text: string): Promise<EmbedResult> {
  const provider = embedProviderForModel(model);
  if (!provider) return { vector: null, provider: null };
  if (!text || text.length < 4) return { vector: null, provider: null };
  const input = text.slice(0, 8000);
  try {
    if (provider === "openai") {
      const key = Deno.env.get("OPENAI_API_KEY") || "";
      if (!key) return { vector: null, provider: null };
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({ model: "text-embedding-3-small", input }),
      });
      if (!res.ok) { console.warn("[embed] openai", res.status, (await res.text()).slice(0, 160)); return { vector: null, provider: null }; }
      const d = await res.json();
      const v = d?.data?.[0]?.embedding;
      return Array.isArray(v) ? { vector: v, provider: "openai" } : { vector: null, provider: null };
    }
    if (provider === "mistral") {
      const key = Deno.env.get("MISTRAL_API_KEY") || "";
      if (!key) return { vector: null, provider: null };
      const res = await fetch("https://api.mistral.ai/v1/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({ model: "mistral-embed", input: [input] }),
      });
      if (!res.ok) { console.warn("[embed] mistral", res.status, (await res.text()).slice(0, 160)); return { vector: null, provider: null }; }
      const d = await res.json();
      const v = d?.data?.[0]?.embedding;
      return Array.isArray(v) ? { vector: v, provider: "mistral" } : { vector: null, provider: null };
    }
    // google
    const key = Deno.env.get("GOOGLE_API_KEY") || Deno.env.get("GEMINI_API_KEY") || "";
    if (!key) return { vector: null, provider: null };
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${key}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: { parts: [{ text: input }] } }) },
    );
    if (!res.ok) { console.warn("[embed] google", res.status, (await res.text()).slice(0, 160)); return { vector: null, provider: null }; }
    const d = await res.json();
    const v = d?.embedding?.values;
    return Array.isArray(v) ? { vector: v, provider: "google" } : { vector: null, provider: null };
  } catch (e) {
    console.warn("[embed] exception", (e as Error).message);
    return { vector: null, provider: null };
  }
}

// Cosine-Similarity zweier gleichlanger Vektoren (sonst 0).
export function cosineSim(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; magA += a[i] * a[i]; magB += b[i] * b[i]; }
  return magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
}

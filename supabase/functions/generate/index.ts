// Supabase Edge Function: generate (Multi-Provider v2)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY    = Deno.env.get("ANTHROPIC_API_KEY")!;
const OPENAI_API_KEY       = Deno.env.get("OPENAI_API_KEY") || '';
const GOOGLE_API_KEY       = Deno.env.get("GOOGLE_API_KEY") || '';
const MISTRAL_API_KEY      = Deno.env.get("MISTRAL_API_KEY") || '';
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function getProvider(model: string): string {
  if (model.startsWith('claude'))  return 'anthropic';
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
  if (model.startsWith('gemini')) return 'google';
  if (model.startsWith('mistral') || model.startsWith('open-mixtral') || model.startsWith('codestral')) return 'mistral';
  return 'anthropic';
}

async function callLLM(model: string, systemPrompt: string, userPrompt: string, maxTokens = 2000): Promise<string> {
  const provider = getProvider(model);

  if (provider === 'anthropic') {
    const body: Record<string, unknown> = { model, max_tokens: maxTokens, messages: [{ role: 'user', content: userPrompt }] };
    if (systemPrompt) body.system = systemPrompt;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error?.message || 'Anthropic error ' + res.status);
    return d.content?.[0]?.text || '';
  }

  if (provider === 'openai') {
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY nicht konfiguriert. Bitte in Supabase Secrets hinterlegen.');
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userPrompt });
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + OPENAI_API_KEY },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error?.message || 'OpenAI error ' + res.status);
    return d.choices?.[0]?.message?.content || '';
  }

  if (provider === 'google') {
    if (!GOOGLE_API_KEY) throw new Error('GOOGLE_API_KEY nicht konfiguriert. Bitte in Supabase Secrets hinterlegen.');
    const contents = [];
    if (systemPrompt) {
      contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
      contents.push({ role: 'model', parts: [{ text: 'Verstanden.' }] });
    }
    contents.push({ role: 'user', parts: [{ text: userPrompt }] });
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + GOOGLE_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: maxTokens } }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error?.message || 'Google Gemini error ' + res.status);
    return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  if (provider === 'mistral') {
    if (!MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY nicht konfiguriert. Bitte in Supabase Secrets hinterlegen.');
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userPrompt });
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + MISTRAL_API_KEY },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error?.message || 'Mistral error ' + res.status);
    return d.choices?.[0]?.message?.content || '';
  }

  throw new Error('Unbekannter Provider fuer Modell: ' + model);
}

function buildBrandVoicePrompt(bv: Record<string, unknown>): string {
  const parts = [
    bv.ai_summary as string || "",
    bv.personality ? "Persoenlichkeit: " + bv.personality : "",
    Array.isArray(bv.tone_attributes) && bv.tone_attributes.length
      ? "Ton: " + (bv.tone_attributes as string[]).join(", ") : "",
    bv.formality === "du" ? "Ansprache: Du-Form"
      : bv.formality === "sie" ? "Ansprache: Sie-Form" : "",
    bv.word_choice    ? "Wortwahl: "     + bv.word_choice    : "",
    bv.sentence_style ? "Satzstruktur: " + bv.sentence_style : "",
    bv.grammar_style  ? "Grammatik: "    + bv.grammar_style  : "",
    bv.dos  ? "Dos: "   + bv.dos  : "",
    bv.donts ? "Donts: " + bv.donts : "",
    bv.target_audience ? "Zielgruppe: " + bv.target_audience : "",
  ];
  return parts.filter(Boolean).join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Nicht angemeldet" }, 401);

    const supabase = createClient(SUPABASE_URL ?? "", SUPABASE_SERVICE_KEY ?? "");
    const body = await req.json();
    const { type, prompt, userId, model: reqModel } = body;

    let model = reqModel || 'claude-sonnet-4-6';
    if (!reqModel && userId && userId !== 'test') {
      const { data: prof } = await supabase
        .from('profiles').select('default_ai_model').eq('id', userId).single();
      if (prof?.default_ai_model) model = prof.default_ai_model;
    }

    const [bvResult, taResult] = await Promise.all([
      userId && userId !== 'test'
        ? supabase.from('brand_voices').select('*').eq('user_id', userId).eq('is_active', true).single()
        : Promise.resolve({ data: null }),
      userId && userId !== 'test'
        ? supabase.from('target_audiences').select('*').eq('user_id', userId).eq('is_active', true).single()
        : Promise.resolve({ data: null }),
    ]);
    const activeBV = bvResult?.data;
    const activeTA = taResult?.data;

    let systemPrompt = '';
    if (type !== 'brand_voice_summary' && type !== 'target_audience') {
      if (activeBV) systemPrompt += '## Aktive Brand Voice\n' + buildBrandVoicePrompt(activeBV) + '\n\n';
      if (activeTA?.ai_summary) systemPrompt += '## Aktive Zielgruppe\n' + activeTA.ai_summary + '\n\n';
    }

    const text = await callLLM(model, systemPrompt, prompt || '', 2000);

    return json({
      text, about: text, comment: text, summary: text,
      tokensUsed: Math.round(text.length / 4),
      brandVoiceApplied: !!activeBV,
      brandVoiceName: activeBV?.name || null,
      senderContext: !!activeTA,
      modelUsed: model,
      provider: getProvider(model),
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});

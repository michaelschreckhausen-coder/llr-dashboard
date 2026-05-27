// Supabase Edge Function: generate (Multi-Provider)
//
// Routet auf Anthropic / OpenAI / Google / Mistral je nach model-Prefix.
// Few-Shot-Injection aus content_generations (nur wenn user_preferences.memory_enabled=true).
//
// NOTE: Credit/Cost-Tracking ist absichtlich NICHT enthalten — wird später wieder eingebaut.

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

// Module-level service-role client für JWT-Auth + Few-Shot-Memory-Lookup.
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Response Helpers ───────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function getProvider(model: string): 'anthropic' | 'openai' | 'google' | 'mistral' {
  if (model.startsWith('claude'))  return 'anthropic';
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
  if (model.startsWith('gemini')) return 'google';
  if (model.startsWith('mistral') || model.startsWith('open-mixtral') || model.startsWith('codestral')) return 'mistral';
  return 'anthropic';
}

// ─── LLM Call ──────────────────────────────────────────────────────────────

async function callLLM(
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const provider = getProvider(model);

  if (provider === 'anthropic') {
    // Anthropic verlangt max_tokens — niedrigster gemeinsamer Nenner: 4096.
    // (Wird beim Re-Einbau der Credit-Regelung wieder dynamisch.)
    const body: Record<string, unknown> = { model, max_tokens: 4096, messages: [{ role: 'user', content: userPrompt }] };
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
      body: JSON.stringify({ model, messages }),
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
      body: JSON.stringify({ contents }),
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
      body: JSON.stringify({ model, messages }),
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

// ─── Request Handler ────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Nicht angemeldet" }, 401);

    // userId aus JWT (NICHT aus body) — Trust the token, not the request.
    const accessToken = authHeader.slice("Bearer ".length);
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !authData?.user) return json({ error: "Nicht angemeldet" }, 401);
    const userId = authData.user.id;

    // teamId aus user_preferences (wird für Few-Shot-Memory benötigt).
    let teamId: string | null = null;
    try {
      const { data: pref } = await supabaseAdmin
        .from('user_preferences')
        .select('active_team_id')
        .eq('user_id', userId)
        .maybeSingle();
      teamId = pref?.active_team_id ?? null;
    } catch (_) { /* memory bleibt aus wenn kein teamId */ }

    const body = await req.json();
    const { type, prompt, model: reqModel } = body;

    let model = reqModel || 'claude-sonnet-4-6';
    if (!reqModel) {
      const { data: prof } = await supabaseAdmin
        .from('profiles').select('default_ai_model').eq('id', userId).single();
      if (prof?.default_ai_model) model = prof.default_ai_model;
    }

    // Brand-Voice + Target-Audience-Lookup (gleicher userId aus JWT).
    const [bvResult, taResult] = await Promise.all([
      supabaseAdmin.from('brand_voices').select('*').eq('user_id', userId).eq('is_active', true).single(),
      supabaseAdmin.from('target_audiences').select('*').eq('user_id', userId).eq('is_active', true).single(),
    ]);
    const activeBV = bvResult?.data;
    const activeTA = taResult?.data;

    let systemPrompt = '';
    if (type !== 'brand_voice_summary' && type !== 'target_audience') {
      if (activeBV) systemPrompt += '## Aktive Brand Voice\n' + buildBrandVoicePrompt(activeBV) + '\n\n';
      if (activeTA?.ai_summary) systemPrompt += '## Aktive Zielgruppe\n' + activeTA.ai_summary + '\n\n';

      // Few-Shot-Injection aus Memory (nur wenn opt-in).
      const brandVoiceId = (body.brand_voice_id as string) || null;
      if (userId && brandVoiceId) {
        try {
          const { data: prefs } = await supabaseAdmin
            .from('user_preferences')
            .select('memory_enabled')
            .eq('user_id', userId)
            .maybeSingle();
          if (prefs?.memory_enabled === true) {
            const contentKind = (body.content_kind as string) || null;

            // CROSS-DOMAIN MEMORY (2026-05-26):
            //   Diese BV soll cross-domain lernen — also Stilbeispiele aus
            //   ALLEN Bereichen (Posts, Hooks, Messages, Profiltexte, Vernetzungen),
            //   nicht nur same-kind. So lernt das System die Tonalität der Person
            //   hinter der BV ganzheitlich.
            //
            // Strategie:
            //   1. 2 same-kind picks (höchste Relevanz für aktuellen Generierungs-Typ)
            //   2. 2 cross-kind picks aus anderen Bereichen (allgemeine Stil-Inspiration)

            // 1) Same-kind picks
            let sameKindExamples: any[] = [];
            if (contentKind) {
              const { data } = await supabaseAdmin
                .from('content_generations')
                .select('variants, picked_variant_index, kind, created_at')
                .eq('brand_voice_id', brandVoiceId)
                .eq('kind', contentKind)
                .not('picked_variant_index', 'is', null)
                .order('created_at', { ascending: false })
                .limit(2);
              sameKindExamples = data || [];
            }

            // 2) Cross-kind picks (alle anderen kinds)
            let crossKindQ = supabaseAdmin
              .from('content_generations')
              .select('variants, picked_variant_index, kind, created_at')
              .eq('brand_voice_id', brandVoiceId)
              .not('picked_variant_index', 'is', null)
              .order('created_at', { ascending: false })
              .limit(8);  // overshoot, dann filtern
            if (contentKind) crossKindQ = crossKindQ.not('kind', 'eq', contentKind);
            const { data: crossData } = await crossKindQ;
            const crossKindExamples = (crossData || []).slice(0, 2);

            // Zusammenfügen
            const allExamples = [...sameKindExamples, ...crossKindExamples];
            if (allExamples.length > 0) {
              systemPrompt += '## Beispiele aus deinen vorherigen Texten (Stil-Inspiration, NICHT 1:1 kopieren):\n';
              allExamples.forEach((g: any, i: number) => {
                const v = g.variants?.[g.picked_variant_index];
                const text = typeof v === 'string' ? v : (v?.text || '');
                if (text) {
                  const kindLabel = (g.kind === contentKind) ? g.kind + ' (gleicher Typ)' : g.kind + ' (anderer Typ — nur Stil/Tonalität übernehmen)';
                  systemPrompt += '### Beispiel ' + (i + 1) + ' [' + kindLabel + ']\n' + text.slice(0, 600) + '\n\n';
                }
              });
            }
          }
        } catch (e) {
          console.warn('[memory] few-shot lookup failed:', (e as Error).message);
        }
      }
    }

    const text = await callLLM(model, systemPrompt, prompt || '');

    return json({
      text, about: text, comment: text, summary: text,
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

// Supabase Edge Function: generate (Multi-Provider v2)
//
// Phase A (2026-05-12): ai_usage_log Logging hinzugefügt.
//   - userId/accountId/teamId via JWT + user_preferences-Lookup (NICHT aus body)
//   - Pricing-Tabelle + estimateCostEur() für cost-tracking
//   - logAiUsage() fire-and-forget — kein await, Latenz unverändert
//   - Tokens aus Provider-Response statt 4-char-Approximation
//
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

// Module-level service-role client für JWT-Auth + Logging.
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Pricing + Cost-Estimation ──────────────────────────────────────────────

type PricePer1M = { input: number; output: number };

const PRICING_EUR_PER_1M: Record<string, PricePer1M> = {
  'claude-opus-4-7':      { input: 13.80, output: 69.00 },
  'claude-opus-4-6':      { input: 13.80, output: 69.00 },
  'claude-sonnet-4-6':    { input:  2.76, output: 13.80 },
  'claude-haiku-4-5':     { input:  0.92, output:  4.60 },
  'gpt-4o':               { input:  2.30, output:  9.20 },
  'gpt-4o-mini':          { input:  0.14, output:  0.55 },
  'gpt-4-turbo':          { input:  9.20, output: 27.60 },
  'gemini-1.5-pro':       { input:  1.15, output:  4.60 },
  'gemini-1.5-flash':     { input:  0.07, output:  0.28 },
  'gemini-2.0-flash':     { input:  0.09, output:  0.37 },
  'mistral-large-latest': { input:  1.84, output:  5.52 },
  'mistral-small-latest': { input:  0.18, output:  0.55 },
};

function estimateCostEur(model: string, inputTokens: number, outputTokens: number): number | null {
  const p = PRICING_EUR_PER_1M[model];
  if (!p) return null;
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

// ─── AI Usage Logging (fire-and-forget) ─────────────────────────────────────

interface AiUsageLogEntry {
  user_id:       string | null;
  account_id:    string | null;
  team_id:       string | null;
  provider:      'anthropic' | 'openai' | 'google' | 'mistral';
  model:         string;
  feature:       string | null;
  input_tokens:  number;
  output_tokens: number;
  duration_ms:   number;
  request_id:    string | null;
  status:        'success' | 'error';
  error:         string | null;
}

function logAiUsage(entry: AiUsageLogEntry): void {
  const cost = entry.status === 'success'
    ? estimateCostEur(entry.model, entry.input_tokens, entry.output_tokens)
    : null;

  // Kein await — fire-and-forget, Latenz an den User bleibt unverändert.
  supabaseAdmin
    .from('ai_usage_log')
    .insert({ ...entry, estimated_cost_eur: cost })
    .then(({ error }) => {
      if (error) console.error('[ai_usage_log] insert failed:', error.message);
    });
}

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

// ─── LLM Call (with usage extraction) ───────────────────────────────────────

interface LLMResult {
  text: string;
  usage: { input_tokens: number; output_tokens: number };
}

async function callLLM(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 2000,
): Promise<LLMResult> {
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
    return {
      text: d.content?.[0]?.text || '',
      usage: {
        input_tokens:  d.usage?.input_tokens  || 0,
        output_tokens: d.usage?.output_tokens || 0,
      },
    };
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
    return {
      text: d.choices?.[0]?.message?.content || '',
      usage: {
        input_tokens:  d.usage?.prompt_tokens     || 0,
        output_tokens: d.usage?.completion_tokens || 0,
      },
    };
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
    return {
      text: d.candidates?.[0]?.content?.parts?.[0]?.text || '',
      usage: {
        input_tokens:  d.usageMetadata?.promptTokenCount     || 0,
        output_tokens: d.usageMetadata?.candidatesTokenCount || 0,
      },
    };
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
    return {
      text: d.choices?.[0]?.message?.content || '',
      usage: {
        input_tokens:  d.usage?.prompt_tokens     || 0,
        output_tokens: d.usage?.completion_tokens || 0,
      },
    };
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

  // Phase-A-Logging: ZeitMessung + hoisted Variablen für catch-block-Sichtbarkeit.
  const requestStartMs = Date.now();
  let userId:             string | null = null;
  let accountId:          string | null = null;
  let teamId:             string | null = null;
  let provider:           'anthropic' | 'openai' | 'google' | 'mistral' = 'anthropic';
  let model:              string = '';
  let feature:            string | null = null;
  // contextLookupError: aufgesammelte Errors aus dem user_preferences/teams-Lookup.
  // Wird im error-Feld von ai_usage_log mit [CTX]-Prefix protokolliert, sodass
  // Silent-Lookup-Failures (z.B. fehlende service_role-Grants) im Dashboard
  // sichtbar sind und nicht nur in docker logs.
  let contextLookupError: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Nicht angemeldet" }, 401);

    // userId aus JWT (NICHT aus body) — Trust the token, not the request.
    const accessToken = authHeader.slice("Bearer ".length);
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !authData?.user) return json({ error: "Nicht angemeldet" }, 401);
    userId = authData.user.id;

    // Account/Team-Snapshot via 2 separate queries.
    // .maybeSingle() returnt { data: null, error: {...} } bei permission-denied —
    // wir lesen BEIDE Felder + sammeln Errors für contextLookupError.
    // Silent-NULL-Failures der user_preferences/teams-Lookups wurden 2026-05-13
    // durch fehlende service_role-Grants verursacht (siehe Migration
    // 20260513090000_user_activity_service_role_grants.sql + CLAUDE.md).
    try {
      const { data: pref, error: prefError } = await supabaseAdmin
        .from('user_preferences')
        .select('active_team_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (prefError) {
        contextLookupError = `prefs: ${prefError.message}`;
        console.warn('[user-context] user_preferences lookup failed:', prefError.message);
      }
      teamId = pref?.active_team_id ?? null;

      if (teamId) {
        const { data: team, error: teamError } = await supabaseAdmin
          .from('teams')
          .select('account_id')
          .eq('id', teamId)
          .maybeSingle();
        if (teamError) {
          contextLookupError = (contextLookupError ? contextLookupError + ' | ' : '')
            + `teams: ${teamError.message}`;
          console.warn('[user-context] teams lookup failed:', teamError.message);
        }
        accountId = team?.account_id ?? null;
      }
    } catch (ctxErr) {
      const msg = ctxErr instanceof Error ? ctxErr.message : String(ctxErr);
      contextLookupError = (contextLookupError ? contextLookupError + ' | ' : '') + `exception: ${msg}`;
      console.error('[user-context] lookup threw:', ctxErr);
      // Continue mit null/null — Tracking-Pfad darf den eigentlichen Call nicht blockieren.
    }

    const body = await req.json();
    const { type, prompt, model: reqModel } = body;
    feature = (type as string) || null;

    model = reqModel || 'claude-sonnet-4-6';
    if (!reqModel) {
      const { data: prof } = await supabaseAdmin
        .from('profiles').select('default_ai_model').eq('id', userId).single();
      if (prof?.default_ai_model) model = prof.default_ai_model;
    }
    provider = getProvider(model);

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

      // Few-Shot-Injection aus Memory (nur wenn opt-in)
      if (userId && teamId) {
        try {
          const { data: prefs } = await supabaseAdmin
            .from('user_preferences')
            .select('memory_enabled')
            .eq('user_id', userId)
            .maybeSingle();
          if (prefs?.memory_enabled === true) {
            const contentKind = (body.content_kind as string) || null;
            let q = supabaseAdmin
              .from('content_generations')
              .select('variants, picked_variant_index, kind')
              .eq('team_id', teamId)
              .not('picked_variant_index', 'is', null)
              .order('created_at', { ascending: false })
              .limit(3);
            if (contentKind) q = q.eq('kind', contentKind);
            const { data: examples } = await q;
            if (examples && examples.length > 0) {
              const exampleTexts = examples
                .map((g: any) => {
                  const v = g.variants?.[g.picked_variant_index];
                  return typeof v === 'string' ? v : (v?.text || '');
                })
                .filter(Boolean)
                .slice(0, 3);
              if (exampleTexts.length > 0) {
                systemPrompt += '## Beispiele aus deiner Vergangenheit (die du behalten hast — als Stil-Inspiration, NICHT 1:1 kopieren):\n';
                exampleTexts.forEach((ex: string, i: number) => {
                  systemPrompt += (i + 1) + '. ' + ex.slice(0, 600) + '\n\n';
                });
              }
            }
          }
        } catch (e) {
          console.warn('[memory] few-shot lookup failed:', (e as Error).message);
        }
      }
    }

    const { text, usage } = await callLLM(model, systemPrompt, prompt || '', 2000);

    // Phase-A: erfolgs-Log (fire-and-forget).
    // contextLookupError wird mit [CTX]-Prefix im error-Feld protokolliert,
    // sodass Silent-NULL-Snapshots im Dashboard sichtbar werden.
    logAiUsage({
      user_id:       userId,
      account_id:    accountId,
      team_id:       teamId,
      provider,
      model,
      feature,
      input_tokens:  usage.input_tokens,
      output_tokens: usage.output_tokens,
      duration_ms:   Date.now() - requestStartMs,
      request_id:    null,
      status:        'success',
      error:         contextLookupError ? `[CTX] ${contextLookupError}` : null,
    });

    return json({
      text, about: text, comment: text, summary: text,
      tokensUsed: usage.input_tokens + usage.output_tokens,
      brandVoiceApplied: !!activeBV,
      brandVoiceName: activeBV?.name || null,
      senderContext: !!activeTA,
      modelUsed: model,
      provider,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Phase-A: error-Log (fire-and-forget). Nur loggen wenn wir mindestens userId haben.
    // contextLookupError vorangestellt mit [CTX]-Prefix wenn vorhanden — Dashboard
    // kann beide Failure-Klassen separat aggregieren.
    if (userId) {
      const errorWithCtx = contextLookupError
        ? `[CTX] ${contextLookupError} | ${msg.slice(0, 300)}`
        : msg.slice(0, 500);
      logAiUsage({
        user_id:       userId,
        account_id:    accountId,
        team_id:       teamId,
        provider,
        model:         model || 'unknown',
        feature,
        input_tokens:  0,
        output_tokens: 0,
        duration_ms:   Date.now() - requestStartMs,
        request_id:    null,
        status:        'error',
        error:         errorWithCtx,
      });
    }

    return json({ error: msg }, 500);
  }
});

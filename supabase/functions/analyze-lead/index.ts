// Supabase Edge Function: analyze-lead
//
// Backlog #4 — Sparkles KI-Analyse pro Lead.
//
// Input  (POST JSON body): { lead_id: uuid }
// Output (JSON):
//   {
//     model, generated_at,
//     score:            { value: number, reasoning: string[], delta: string|null },
//     next_best_action: { title: string, detail: string },
//     pain_points:      string[],
//     persona:          string,
//     outreach_draft:   { channel: 'linkedin'|'email', subject: string|null, body: string },
//     buying_intent:    'unbekannt' | 'niedrig' | 'mittel' | 'hoch',
//     need_detected:    string | null,
//     use_cases:        string[]
//   }
//
// Die letzten 3 Felder (buying_intent, need_detected, use_cases) werden zusätzlich
// als denormalized Mirror in den flat-Spalten leads.ai_buying_intent +
// leads.ai_need_detected + leads.ai_use_cases persistiert. Damit ist analyze-lead
// die Single-Source-of-Truth für die alte /crm-enrichment-Lead-Intelligence-Funktion.
//
// Auth: JWT in Authorization-Header (RLS-User). Lead-Read passiert per service_role.
//       Owner-Check (lead.user_id == JWT-userId) erfolgt im Function-Body.
//
// Persistierung: leads.ai_last_analysis (jsonb) + ai_last_analysis_at + ai_last_analysis_model.
//                ai_usage_log-Insert für Cost-Tracking (best-effort, fail-silent).
//
// Provider-Routing: Anthropic / OpenAI / Google / Mistral je nach model-Prefix
// (identisch zu `generate`). Modell ist hardcoded auf Claude Sonnet 4.6 für
// Cost-Predictability (Backlog #4 decision 2026-05-28) — User-Default wird
// nicht respektiert.
//
// Rate-Limit: max 1 Analyse pro Lead pro 24h. Pro User auf demselben Lead
// innerhalb des Fensters → 429 mit cached Analyse. Override via body.force=true.

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

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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

// ─── System-Prompt + JSON-Schema-Description ──────────────────────────────────

const SYSTEM_PROMPT = `Du bist ein erfahrener B2B-Sales-Analyst für LinkedIn-Outreach. Du bekommst Lead-Daten und sollst eine prägnante Analyse in 4 Sektionen erstellen.

WICHTIG: Antworte AUSSCHLIESSLICH mit gültigem JSON ohne Markdown-Codefences. Keine Erklärung davor oder danach. Nur das JSON-Objekt.

JSON-Schema (alle Felder Pflicht):
{
  "score": {
    "value": <integer 1-100>,
    "reasoning": [<3 kurze Bullet-Strings, je max 80 Zeichen>],
    "delta": <null oder "+/-N im Vergleich zum vorherigen Score">
  },
  "next_best_action": {
    "title": <kurz, max 60 Zeichen — z.B. "Vernetzungsanfrage mit Industrie-Hook">,
    "detail": <konkret und actionable, max 280 Zeichen>
  },
  "pain_points": [<bis zu 4 Strings, je 1 Pain-Point, max 60 Zeichen>],
  "persona": <max 200 Zeichen — Decision-Maker-Profil, Motivation, Hot-Buttons>,
  "outreach_draft": {
    "channel": <"linkedin" oder "email">,
    "subject": <bei email Pflicht, bei linkedin null>,
    "body": <fertige Nachricht, max 600 Zeichen, persönlich, kein Sales-Sprech>
  },
  "buying_intent": <einer von "unbekannt"|"niedrig"|"mittel"|"hoch" — Einschätzung wie heiß der Lead aktuell ist>,
  "need_detected": <max 200 Zeichen — kurzer Satz welcher konkrete Bedarf erkennbar ist; bei zu wenig Daten: "Keine ausreichenden Daten zur Bedarfsermittlung vorhanden">,
  "use_cases": [<bis zu 4 Strings, je 1 konkreter Anwendungs-Case wie Leadesk dem Lead helfen könnte, max 80 Zeichen — leer-Array wenn nicht ableitbar>]
}

Sprache: Deutsch (Sie-Form wenn keine andere Info), höflich, kein "Du" außer der Lead ist explizit jung/Tech-Sektor.`;

function buildUserPrompt(lead: Record<string, unknown>, recentActivities: Array<Record<string, unknown>>): string {
  const parts: string[] = [];

  parts.push('## Lead-Daten\n');
  parts.push(`Name: ${[lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name || 'unbekannt'}`);
  if (lead.job_title) parts.push(`Position: ${lead.job_title}`);
  if (lead.headline)  parts.push(`Headline: ${lead.headline}`);
  if (lead.company)   parts.push(`Unternehmen: ${lead.company}`);
  if (lead.industry)  parts.push(`Branche: ${lead.industry}`);
  if (lead.company_size) parts.push(`Unternehmensgröße: ${lead.company_size}`);
  if (lead.location || lead.city || lead.country) {
    parts.push(`Standort: ${[lead.location, lead.city, lead.country].filter(Boolean).join(', ')}`);
  }
  if (lead.li_about_summary) parts.push(`LinkedIn-About: ${lead.li_about_summary}`);
  if (lead.notes) parts.push(`Notizen: ${lead.notes}`);

  parts.push('');
  parts.push(`Lead-Status: ${lead.status || 'Lead'}`);
  parts.push(`Aktueller Lead-Score: ${lead.lead_score ?? 'noch nicht gesetzt'}`);
  if (lead.li_connection_status) parts.push(`LinkedIn-Connection-Status: ${lead.li_connection_status}`);
  if (lead.source) parts.push(`Quelle: ${lead.source}`);
  if (lead.tags && Array.isArray(lead.tags) && (lead.tags as string[]).length) {
    parts.push(`Tags: ${(lead.tags as string[]).join(', ')}`);
  }

  if (Array.isArray(lead.ai_pain_points) && (lead.ai_pain_points as string[]).length) {
    parts.push(`Bekannte Pain-Points: ${(lead.ai_pain_points as string[]).join('; ')}`);
  }

  if (recentActivities.length) {
    parts.push('');
    parts.push('## Letzte Aktivitäten (chronologisch absteigend)');
    for (const a of recentActivities.slice(0, 5)) {
      const t = a.type as string;
      const subj = (a.subject as string) || '';
      const body = ((a.body as string) || '').slice(0, 200);
      const dir = a.direction ? ` [${a.direction}]` : '';
      parts.push(`- ${t}${dir}: ${subj}${body ? ' — ' + body : ''}`);
    }
  }

  parts.push('');
  parts.push('Erstelle die Analyse mit den 4 Sektionen wie im System-Prompt definiert.');
  parts.push('Antworte AUSSCHLIESSLICH mit dem JSON-Objekt, kein Markdown, keine Codefences.');

  return parts.join('\n');
}

// ─── LLM Call (provider-spezifische JSON-Mode-Einstellungen) ──────────────────

async function callLLM(
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const provider = getProvider(model);

  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error?.message || 'Anthropic error ' + res.status);
    return {
      text: d.content?.[0]?.text || '',
      inputTokens:  d.usage?.input_tokens  || 0,
      outputTokens: d.usage?.output_tokens || 0,
    };
  }

  if (provider === 'openai') {
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY nicht konfiguriert');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + OPENAI_API_KEY },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt   },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error?.message || 'OpenAI error ' + res.status);
    return {
      text: d.choices?.[0]?.message?.content || '',
      inputTokens:  d.usage?.prompt_tokens     || 0,
      outputTokens: d.usage?.completion_tokens || 0,
    };
  }

  if (provider === 'google') {
    if (!GOOGLE_API_KEY) throw new Error('GOOGLE_API_KEY nicht konfiguriert');
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + GOOGLE_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user',  parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: 'Verstanden, ich antworte nur mit JSON.' }] },
          { role: 'user',  parts: [{ text: userPrompt }] },
        ],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error?.message || 'Google Gemini error ' + res.status);
    return {
      text: d.candidates?.[0]?.content?.parts?.[0]?.text || '',
      inputTokens:  d.usageMetadata?.promptTokenCount     || 0,
      outputTokens: d.usageMetadata?.candidatesTokenCount || 0,
    };
  }

  if (provider === 'mistral') {
    if (!MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY nicht konfiguriert');
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + MISTRAL_API_KEY },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt   },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error?.message || 'Mistral error ' + res.status);
    return {
      text: d.choices?.[0]?.message?.content || '',
      inputTokens:  d.usage?.prompt_tokens     || 0,
      outputTokens: d.usage?.completion_tokens || 0,
    };
  }

  throw new Error('Unbekannter Provider für Modell: ' + model);
}

// ─── JSON-Strict-Parse mit Markdown-Fence-Stripping ──────────────────────────

function parseAnalysisJSON(raw: string): Record<string, unknown> {
  // Manche Modelle wrappen trotz Anweisung in ```json ... ```
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error('LLM-Response war kein gültiges JSON: ' + (e as Error).message + ' — raw: ' + cleaned.slice(0, 200));
  }

  // Minimal-Validation: alle Sektionen müssen da sein (incl. crm-enrichment-Felder)
  const required = ['score', 'next_best_action', 'pain_points', 'persona', 'outreach_draft',
                    'buying_intent', 'need_detected', 'use_cases'];
  for (const key of required) {
    if (!(key in parsed)) throw new Error(`Pflicht-Feld fehlt im LLM-Result: ${key}`);
  }
  // buying_intent muss aus dem definierten Set kommen
  const VALID_INTENT = new Set(['unbekannt', 'niedrig', 'mittel', 'hoch']);
  if (!VALID_INTENT.has(parsed.buying_intent as string)) {
    // Fallback statt Hard-Fail — niemals den User-Workflow wegen ENUM-Drift brechen
    parsed.buying_intent = 'unbekannt';
  }
  if (!Array.isArray(parsed.use_cases)) parsed.use_cases = [];
  return parsed;
}

// ─── Cost-Estimation (grob, pro 1M Tokens) ───────────────────────────────────
// Source: Provider-Preislisten 2026-05. Approximation in EUR.

function estimateCostEur(provider: string, model: string, inputTokens: number, outputTokens: number): number {
  // [in/out] pro 1M Tokens in USD, mit *0.93 für EUR-Umrechnung
  const PRICING: Record<string, [number, number]> = {
    'claude-opus-4-7':         [15.00, 75.00],
    'claude-sonnet-4-6':       [3.00,  15.00],
    'claude-haiku-4-5':        [0.80,  4.00],
    'gpt-5.4':                 [10.00, 30.00],
    'gpt-5.4-mini':            [0.50,  1.50],
    'gemini-2.5-flash':        [0.30,  1.20],
    'mistral-large-latest':    [3.00,  9.00],
    'mistral-medium-latest':   [0.40,  2.00],
    'mistral-small-latest':    [0.20,  0.60],
  };
  const [inP, outP] = PRICING[model] || [1.00, 3.00]; // Default-Schätzung
  const usd = (inputTokens / 1_000_000) * inP + (outputTokens / 1_000_000) * outP;
  return Math.round(usd * 0.93 * 1_000_000) / 1_000_000;
}

// ─── Request Handler ────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const startedAt = Date.now();
  try {
    // 1) Auth via JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Nicht angemeldet" }, 401);
    const accessToken = authHeader.slice("Bearer ".length);
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !authData?.user) return json({ error: "Nicht angemeldet" }, 401);
    const userId = authData.user.id;

    // 2) Body
    const body = await req.json();
    const leadId = body.lead_id as string;
    const force  = body.force === true;
    if (!leadId) return json({ error: 'lead_id fehlt' }, 400);

    // 3) Lead lesen (service_role bypasst RLS — Owner-Check unten manuell)
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from('leads')
      .select('id, user_id, team_id, first_name, last_name, name, email, company, job_title, headline, industry, company_size, location, city, country, status, lead_score, source, tags, notes, ai_pain_points, li_connection_status, li_about_summary, ai_last_analysis, ai_last_analysis_at')
      .eq('id', leadId)
      .maybeSingle();
    if (leadErr || !lead) return json({ error: 'Lead nicht gefunden' }, 404);

    // 3b) Rate-Limit: max 1 Analyse pro 24h, außer force=true.
    //     Bei Hit → cached Analyse aus DB zurückgeben, Status 200 mit `cached: true`.
    if (!force && lead.ai_last_analysis && lead.ai_last_analysis_at) {
      const ageMs = Date.now() - new Date(lead.ai_last_analysis_at as string).getTime();
      const WINDOW_MS = 24 * 60 * 60 * 1000;
      if (ageMs < WINDOW_MS) {
        return json({
          ...(lead.ai_last_analysis as Record<string, unknown>),
          cached: true,
          rate_limited: true,
          message: `Letzte Analyse vor ${Math.round(ageMs / 60000)} Min — Cache wird verwendet. Mit force=true erzwingen.`,
        }, 200);
      }
    }

    // Owner-Check (matched Phase-G RLS-Policy leads_team_select)
    const isOwner = lead.user_id === userId;
    if (!isOwner) {
      // Check team-Visibility
      const { data: tm } = await supabaseAdmin
        .from('team_members')
        .select('team_id')
        .eq('user_id', userId)
        .eq('is_active', true);
      const myTeams = new Set((tm || []).map(t => t.team_id));
      const allowed = lead.team_id && myTeams.has(lead.team_id);
      if (!allowed) return json({ error: 'Kein Zugriff auf diesen Lead' }, 403);
    }

    // 4) Recent activities (last 5) für Kontext
    const { data: activities } = await supabaseAdmin
      .from('activities')
      .select('type, subject, body, direction, occurred_at')
      .eq('lead_id', leadId)
      .order('occurred_at', { ascending: false })
      .limit(5);

    // 5) Modell: hardcoded auf Claude Sonnet 4.6 für Cost-Predictability.
    //    User-Default in profiles.default_ai_model wird absichtlich ignoriert.
    const model = 'claude-sonnet-4-6';

    // 6) team/account-Kontext aus user_preferences (für ai_usage_log)
    let accountId: string | null = null;
    let teamId: string | null = null;
    try {
      const { data: pref } = await supabaseAdmin
        .from('user_preferences').select('active_team_id').eq('user_id', userId).maybeSingle();
      teamId = pref?.active_team_id ?? null;
      if (teamId) {
        const { data: team } = await supabaseAdmin
          .from('teams').select('account_id').eq('id', teamId).maybeSingle();
        accountId = team?.account_id ?? null;
      }
    } catch (_) { /* fall-through */ }

    // 7) LLM-Call
    const userPrompt = buildUserPrompt(lead as Record<string, unknown>, activities || []);
    const { text: rawResult, inputTokens, outputTokens } = await callLLM(model, SYSTEM_PROMPT, userPrompt);

    // 8) JSON-Parse + Validate
    const analysis = parseAnalysisJSON(rawResult);

    // 9) Delta zum vorherigen Score berechnen (wenn vorhanden)
    const prevAnalysis = lead.ai_last_analysis as Record<string, unknown> | null;
    if (prevAnalysis?.score && (analysis.score as Record<string, unknown>)?.value != null) {
      const prevVal = (prevAnalysis.score as Record<string, unknown>).value as number;
      const newVal  = (analysis.score as Record<string, unknown>).value as number;
      const diff = newVal - prevVal;
      if (diff !== 0 && !(analysis.score as Record<string, unknown>).delta) {
        (analysis.score as Record<string, unknown>).delta = (diff > 0 ? '+' : '') + diff + ' vs. vorherige Analyse';
      }
    }

    // 10) Vollständiges Result-Object
    const generatedAt = new Date().toISOString();
    const result = {
      model,
      generated_at: generatedAt,
      ...analysis,
    };

    // 11) Persistieren in leads
    //
    // Single-Source-of-Truth: ai_last_analysis (jsonb) — vollständiges Result.
    //
    // Plus denormalized Mirror in flat-Spalten für performante Listen-Filter
    // (z.B. /crm-enrichment "Hot Intent count" = WHERE ai_buying_intent='hoch'):
    //   - ai_buying_intent  ← analysis.buying_intent
    //   - ai_need_detected  ← analysis.need_detected
    //   - ai_use_cases      ← analysis.use_cases
    //   - ai_pain_points    ← analysis.pain_points
    //   - ai_summary_updated_at ← jetzt (für /crm-enrichment "Noch nicht enriched"-Filter)
    const updatePayload: Record<string, unknown> = {
      ai_last_analysis:       result,
      ai_last_analysis_at:    generatedAt,
      ai_last_analysis_model: model,
      ai_buying_intent:       (analysis.buying_intent as string) || 'unbekannt',
      ai_need_detected:       (analysis.need_detected as string) || null,
      ai_use_cases:           Array.isArray(analysis.use_cases) ? analysis.use_cases : [],
      ai_pain_points:         Array.isArray(analysis.pain_points) ? analysis.pain_points : [],
      ai_summary_updated_at:  generatedAt,
    };
    const { error: updateErr } = await supabaseAdmin
      .from('leads')
      .update(updatePayload)
      .eq('id', leadId);
    if (updateErr) {
      console.warn('[analyze-lead] persist failed:', updateErr.message);
      // Nicht abbrechen — Result trotzdem an den User zurückgeben
    }

    // 12) Cost-Tracking in ai_usage_log (best-effort)
    try {
      const provider = getProvider(model);
      const estCost = estimateCostEur(provider, model, inputTokens, outputTokens);
      await supabaseAdmin.from('ai_usage_log').insert({
        user_id:            userId,
        account_id:         accountId,
        team_id:            teamId,
        provider,
        model,
        feature:            'analyze-lead',
        input_tokens:       inputTokens,
        output_tokens:      outputTokens,
        estimated_cost_eur: estCost,
        duration_ms:        Date.now() - startedAt,
        status:             'success',
      });
    } catch (e) {
      console.warn('[analyze-lead] usage-log failed:', (e as Error).message);
    }

    return json(result);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[analyze-lead] error:', msg);
    return json({ error: msg }, 500);
  }
});

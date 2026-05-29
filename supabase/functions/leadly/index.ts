// Supabase Edge Function: leadly
//
// Tool-Use-Agent (Anthropic Claude Sonnet) für den globalen "Leadly"-Chatbot.
// 6 Tools schreiben/lesen auf user-scopeter Supabase-Connection (RLS greift).
//
// Request:
//   POST /functions/v1/leadly
//   Authorization: Bearer <user-JWT>
//   Body: { mode: 'chat' | 'briefing', messages?: Array<{role, content, tool_calls?, tool_use_id?, tool_result?}> }
//
// Response (chat):
//   { reply: { role, content, tool_calls? }, tool_results: Array<{tool_use_id, output}>, raw_messages, model, finish_reason }
// Response (briefing):
//   { briefing_text: string, context: { overdue_count, today_count, hot_count, ... } }
//
// Conversational Loop: solange Claude tool_use returnt, führen wir die Tools
// aus und schicken die Results zurück. Max 6 Iterationen (Safety).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY    = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY    = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEFAULT_MODEL = "claude-sonnet-4-6";  // Aligned mit src/components/ModelSelector.jsx
const MAX_ITERATIONS = 6;

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

// ─── Tool Definitions (Anthropic-Format) ────────────────────────────────────

const TOOLS = [
  {
    name: "create_lead",
    description: "Legt einen neuen Kontakt (Lead) im aktiven Team an. Nutze diese Funktion sobald der User explizit darum bittet einen Kontakt anzulegen.",
    input_schema: {
      type: "object",
      properties: {
        first_name: { type: "string", description: "Vorname" },
        last_name:  { type: "string", description: "Nachname" },
        email:      { type: "string", description: "E-Mail-Adresse (optional)" },
        phone:      { type: "string", description: "Telefonnummer (optional)" },
        company:    { type: "string", description: "Firma als Text (optional, FK-Auflösung passiert später)" },
        job_title:  { type: "string", description: "Position (optional)" },
        linkedin_url: { type: "string", description: "LinkedIn-Profil-URL (optional)" },
        status:     { type: "string", enum: ["Lead", "LQL", "MQL", "MQN", "SQL"], description: "CRM-Status (default: Lead)" },
        lead_score: { type: "number", description: "Score 0-100 (optional)" },
        notes:      { type: "string", description: "Notizen (optional)" },
      },
      required: ["first_name", "last_name"],
    },
  },
  {
    name: "create_task",
    description: "Legt eine Aufgabe an. Optional verknüpft mit einem Kontakt (lead_id). Sonst Standalone-Task.",
    input_schema: {
      type: "object",
      properties: {
        title:    { type: "string", description: "Aufgaben-Titel" },
        due_date: { type: "string", description: "Fälligkeit als YYYY-MM-DD" },
        lead_id:  { type: "string", description: "UUID des verknüpften Kontakts (optional)" },
        priority: { type: "string", enum: ["low", "normal", "high"], description: "Priorität (default: normal)" },
        description: { type: "string", description: "Beschreibung (optional)" },
      },
      required: ["title"],
    },
  },
  {
    name: "create_deal",
    description: "Legt einen Deal an. Mindestens title + stage. Optional Wert + Verknüpfung zu Lead/Unternehmen.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Deal-Bezeichnung" },
        stage: { type: "string", enum: ["interessent", "prospect", "qualifiziert", "opportunity", "angebot", "verhandlung", "gewonnen", "verloren"], description: "Pipeline-Stage" },
        value: { type: "number", description: "Wert in EUR (optional)" },
        probability: { type: "number", description: "Wahrscheinlichkeit 0-100 (optional)" },
        lead_id: { type: "string", description: "UUID des verknüpften Kontakts (optional)" },
        organization_id: { type: "string", description: "UUID des verknüpften Unternehmens (optional)" },
        expected_close_date: { type: "string", description: "Erwartetes Abschluss-Datum YYYY-MM-DD (optional)" },
      },
      required: ["title", "stage"],
    },
  },
  {
    name: "search_leads",
    description: "Sucht/filtert Kontakte im aktiven Team. Kombiniere optionale Filter. Gibt max 20 Treffer mit id, name, company, status, score, owner_id zurück.",
    input_schema: {
      type: "object",
      properties: {
        query:     { type: "string", description: "Volltext-Suche auf Name/Company/Email (optional)" },
        status:    { type: "string", enum: ["Lead", "LQL", "MQL", "MQN", "SQL"], description: "Status-Filter" },
        score_min: { type: "number", description: "Mindest-Score (0-100)" },
        owner_id:  { type: "string", description: "Owner-UUID-Filter" },
        only_overdue_followup: { type: "boolean", description: "Nur Leads mit überfälligem next_followup" },
        limit:     { type: "number", description: "Max Treffer (default 20, max 50)" },
      },
    },
  },
  {
    name: "update_lead",
    description: "Aktualisiert einen Lead per ID. Status, Owner, Score, next_followup änderbar.",
    input_schema: {
      type: "object",
      properties: {
        lead_id:      { type: "string", description: "Lead-UUID" },
        status:       { type: "string", enum: ["Lead", "LQL", "MQL", "MQN", "SQL"] },
        owner_id:     { type: "string", description: "UUID des neuen Owners (oder null um zu entfernen)" },
        lead_score:   { type: "number", description: "Neuer Score 0-100" },
        next_followup: { type: "string", description: "Nächstes Follow-up YYYY-MM-DD" },
        notes:        { type: "string", description: "Notizen überschreiben" },
      },
      required: ["lead_id"],
    },
  },
  {
    name: "update_deal",
    description: "Aktualisiert einen Deal per ID. Stage, Value, Probability änderbar.",
    input_schema: {
      type: "object",
      properties: {
        deal_id:     { type: "string", description: "Deal-UUID" },
        stage:       { type: "string", enum: ["interessent", "prospect", "qualifiziert", "opportunity", "angebot", "verhandlung", "gewonnen", "verloren"] },
        value:       { type: "number", description: "Neuer Wert in EUR" },
        probability: { type: "number", description: "Neue Wahrscheinlichkeit 0-100" },
        expected_close_date: { type: "string", description: "Neues Datum YYYY-MM-DD" },
      },
      required: ["deal_id"],
    },
  },
];

// ─── Tool Executor ──────────────────────────────────────────────────────────
//
// Alle Tools laufen auf einem user-scopeten Supabase-Client (User-JWT
// durchgereicht). RLS greift automatisch — kein Cross-Team-Zugriff möglich.
// Bei UPDATE auf Status-Feldern Top-Fallstrick #1 (CLAUDE.md) berücksichtigen:
// ENUM/CHECK-Felder NICHT mit anderen Feldern bundlen.

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  ctx: { userId: string; teamId: string | null },
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    switch (name) {
      case "create_lead": {
        const fn = String(input.first_name || '').trim();
        const ln = String(input.last_name || '').trim();
        const composedName = `${fn} ${ln}`.trim() || (input.company ? String(input.company).trim() : 'Unbenannt');
        const payload: Record<string, unknown> = {
          first_name: fn || null,
          last_name:  ln || null,
          // ⚠️ leads.name hat NOT NULL Constraint auf Hetzner (legacy-composite),
          // first_name/last_name sind nullable. Defensive: name synthetisieren.
          name:       composedName,
          email:      input.email || null,
          phone:      input.phone || null,
          company:    input.company || null,
          job_title:  input.job_title || null,
          linkedin_url: input.linkedin_url || null,
          status:     input.status || 'Lead',
          lead_score: typeof input.lead_score === 'number' ? input.lead_score : null,
          notes:      input.notes || null,
          user_id:    ctx.userId,
          team_id:    ctx.teamId,
          source:     'leadly',
        };
        const { data, error } = await supabase
          .from('leads')
          .insert(payload)
          .select('id, first_name, last_name, company, status, lead_score')
          .single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, data };
      }

      case "create_task": {
        const payload: Record<string, unknown> = {
          title:       input.title,
          due_date:    input.due_date || null,
          lead_id:     input.lead_id || null,
          priority:    input.priority || 'normal',
          description: input.description || null,
          status:      'open',
          created_by:  ctx.userId,
          team_id:     ctx.teamId,
        };
        const { data, error } = await supabase
          .from('lead_tasks')
          .insert(payload)
          .select('id, title, due_date, status, priority, lead_id')
          .single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, data };
      }

      case "create_deal": {
        const payload: Record<string, unknown> = {
          title:      input.title,
          stage:      input.stage,
          value:      typeof input.value === 'number' ? input.value : null,
          probability: typeof input.probability === 'number' ? input.probability : null,
          lead_id:    input.lead_id || null,
          organization_id: input.organization_id || null,
          expected_close_date: input.expected_close_date || null,
          created_by: ctx.userId,
          team_id:    ctx.teamId,
        };
        const { data, error } = await supabase
          .from('deals')
          .insert(payload)
          .select('id, title, stage, value, probability, lead_id, organization_id')
          .single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, data };
      }

      case "search_leads": {
        const limit = Math.min(Number(input.limit) || 20, 50);
        let q = supabase
          .from('leads')
          .select('id, first_name, last_name, company, status, lead_score, owner_id, next_followup')
          .eq('archived', false)
          .order('updated_at', { ascending: false })
          .limit(limit);
        // RLS scopt schon auf team — wir filtern nicht zusätzlich, weil
        // search auch über Solo-Leads soll wenn kein Team aktiv ist.
        if (input.status)    q = q.eq('status', input.status);
        if (input.owner_id)  q = q.eq('owner_id', input.owner_id);
        if (typeof input.score_min === 'number') q = q.gte('lead_score', input.score_min);
        if (input.only_overdue_followup) {
          const today = new Date().toISOString().split('T')[0];
          q = q.lt('next_followup', today);
        }
        if (input.query) {
          const esc = String(input.query).replace(/[%,]/g, '');
          q = q.or(`first_name.ilike.%${esc}%,last_name.ilike.%${esc}%,company.ilike.%${esc}%,email.ilike.%${esc}%`);
        }
        const { data, error } = await q;
        if (error) return { ok: false, error: error.message };
        return { ok: true, data };
      }

      case "update_lead": {
        const { lead_id, ...rest } = input as Record<string, unknown>;
        if (!lead_id) return { ok: false, error: 'lead_id required' };
        // Top-Fallstrick #1: status separat updaten
        const { status, ...other } = rest;
        if (Object.keys(other).length > 0) {
          const { error: e1 } = await supabase.from('leads')
            .update(other)
            .eq('id', lead_id);
          if (e1) return { ok: false, error: e1.message };
        }
        if (typeof status === 'string') {
          const { error: e2 } = await supabase.from('leads')
            .update({ status })
            .eq('id', lead_id);
          if (e2) return { ok: false, error: e2.message };
        }
        const { data, error } = await supabase
          .from('leads')
          .select('id, first_name, last_name, status, owner_id, lead_score, next_followup')
          .eq('id', lead_id)
          .maybeSingle();
        if (error) return { ok: false, error: error.message };
        return { ok: true, data };
      }

      case "update_deal": {
        const { deal_id, ...rest } = input as Record<string, unknown>;
        if (!deal_id) return { ok: false, error: 'deal_id required' };
        const { stage, ...other } = rest;
        if (Object.keys(other).length > 0) {
          const { error: e1 } = await supabase.from('deals').update(other).eq('id', deal_id);
          if (e1) return { ok: false, error: e1.message };
        }
        if (typeof stage === 'string') {
          const { error: e2 } = await supabase.from('deals').update({ stage }).eq('id', deal_id);
          if (e2) return { ok: false, error: e2.message };
        }
        const { data, error } = await supabase
          .from('deals')
          .select('id, title, stage, value, probability')
          .eq('id', deal_id)
          .maybeSingle();
        if (error) return { ok: false, error: error.message };
        return { ok: true, data };
      }

      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Briefing-Builder ───────────────────────────────────────────────────────

async function buildBriefingContext(supabase: ReturnType<typeof createClient>) {
  const today = new Date().toISOString().split('T')[0];
  const [overdueRes, todayRes, hotRes, dealsRes] = await Promise.all([
    supabase.from('lead_tasks').select('id, title, lead_id, due_date').eq('status', 'open').lt('due_date', today).limit(10),
    supabase.from('lead_tasks').select('id, title, lead_id, due_date').eq('status', 'open').eq('due_date', today).limit(10),
    supabase.from('leads').select('id, first_name, last_name, company, lead_score').gte('lead_score', 70).eq('archived', false).limit(5),
    supabase.from('deals').select('id, title, value, stage').not('stage', 'in', '("verloren","gewonnen","kein_deal")').limit(5),
  ]);
  return {
    overdue_count: overdueRes.data?.length || 0,
    today_count:   todayRes.data?.length || 0,
    hot_count:     hotRes.data?.length || 0,
    open_deals_count: dealsRes.data?.length || 0,
    overdue_tasks: overdueRes.data || [],
    today_tasks:   todayRes.data || [],
    hot_leads:     hotRes.data || [],
  };
}

// ─── System Prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Du bist Leadly, der KI-Assistent von Leadesk — einer Multi-Tenant LinkedIn-Sales-Suite.

Deine Aufgabe: Im CRM aktiv mitarbeiten. Du kannst Kontakte und Aufgaben anlegen, Deals managen, Daten durchsuchen und Status ändern. Antworte immer auf Deutsch, kurz und konkret. Frage NICHT nach allen Feldern — leg den Datensatz mit dem an was du hast, der User kann ihn später ergänzen.

Verhalten:
- Wenn der User einen Kontakt nennt, suche zuerst (search_leads), bevor du etwas änderst.
- Erstelle direkt ohne Rückfragen, wenn der User klar formuliert hat ("Leg Anna Müller bei Acme an").
- Bei Mehrdeutigkeit (z.B. zwei Kontakte mit ähnlichem Namen) frage kurz nach.
- Antworte nach erfolgreichem Tool-Call mit einer 1-Satz-Bestätigung + ggf. Lead-ID/Link-Hinweis.
- Status-Werte: Lead, LQL, MQL, MQN, SQL (genau diese Schreibweise).
- Deal-Stages: interessent, prospect, qualifiziert, opportunity, angebot, verhandlung, gewonnen, verloren.
- Datumsangaben immer als YYYY-MM-DD.`;

// ─── Main Handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'Missing Authorization Bearer token' }, 401);

    // User-scoped client für RLS-Compliance
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    // User aus JWT extrahieren
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: 'Invalid token' }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'chat';
    const teamId = body.team_id || null;
    const ctx = { userId, teamId };

    // ─── Mode: briefing ──────────────────────────────────────────────
    if (mode === 'briefing') {
      const today = new Date().toISOString().split('T')[0];
      // Falls existing briefing für heute → direkt zurück (kein neuer LLM-Call).
      const { data: existing } = await supabase
        .from('assistant_briefings')
        .select('briefing_text, context_json, briefing_date, read_at')
        .eq('user_id', userId)
        .eq('briefing_date', today)
        .maybeSingle();
      if (existing) {
        return json({
          briefing_text: existing.briefing_text,
          context: existing.context_json,
          briefing_date: existing.briefing_date,
          cached: true,
        });
      }

      const context = await buildBriefingContext(supabase);
      const total = context.overdue_count + context.today_count + context.hot_count;

      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const persistBriefing = async (text: string) => {
        await admin.from('assistant_briefings').upsert({
          user_id: userId,
          team_id: teamId,
          briefing_date: today,
          briefing_text: text,
          context_json: context,
        }, { onConflict: 'user_id,briefing_date' });
      };

      if (total === 0) {
        const text = `Guten Morgen! Heute ist deine Pipeline ruhig — keine überfälligen Aufgaben, kein dringender Follow-up. Gute Gelegenheit, neue Hot Leads zu identifizieren.`;
        await persistBriefing(text);
        return json({ briefing_text: text, context, briefing_date: today });
      }

      const briefingPrompt = `Erstelle ein kurzes Morgens-Briefing (max 4 Sätze) auf Basis dieser Zahlen:
- ${context.overdue_count} überfällige Aufgaben
- ${context.today_count} Aufgaben heute fällig
- ${context.hot_count} Hot Leads (Score ≥ 70)
- ${context.open_deals_count} offene Deals

Konkret aufzählen sind nur die ersten 2-3 Items pro Kategorie. Schließe mit einer Empfehlung wo der User anfangen soll. Sprich den User direkt an, freundlich aber knapp.

Daten:
${JSON.stringify(context, null, 2)}`;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          max_tokens: 600,
          system: 'Du bist Leadly, der KI-Sales-Assistent. Antworte auf Deutsch, kurz und konkret.',
          messages: [{ role: 'user', content: briefingPrompt }],
        }),
      });
      const aj = await res.json();
      if (!res.ok) return json({ error: aj.error?.message || 'Briefing-Generierung fehlgeschlagen' }, 500);
      const text = (aj.content || []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('\n').trim();
      await persistBriefing(text);
      return json({ briefing_text: text, context, briefing_date: today });
    }

    // ─── Mode: chat (Tool-Use-Loop) ──────────────────────────────────
    const incoming = Array.isArray(body.messages) ? body.messages : [];
    // Defensive: nur valide user/assistant-text-Messages durchreichen.
    // Tool-Use-Replays aus dem Frontend-Verlauf verwerfen — Anthropic
    // verlangt strikte tool_use↔tool_result-Paarung in derselben Konversation;
    // ein DB-persistierter Verlauf hat orphan tool_results die das brechen.
    // (Tool-Calls innerhalb DIESES Requests werden im Loop unten korrekt
    // gepaart.)
    const anthropicMessages: Array<{ role: string; content: unknown }> = incoming
      .filter((m: { role: string; content?: unknown }) =>
        (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length > 0
      )
      .map((m: { role: string; content: string }) => ({ role: m.role, content: m.content }));

    const toolResults: Array<{ tool_use_id: string; name: string; output: unknown }> = [];
    let lastAssistantBlocks: unknown[] = [];
    let lastFinish = 'unknown';
    let iter = 0;

    while (iter < MAX_ITERATIONS) {
      iter++;
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          tools: TOOLS,
          messages: anthropicMessages,
        }),
      });
      const aj = await res.json();
      if (!res.ok) return json({ error: aj.error?.message || 'LLM call failed', detail: aj }, 500);

      lastAssistantBlocks = aj.content || [];
      lastFinish = aj.stop_reason || 'unknown';

      // Tool-Use erkennen
      const toolUses = lastAssistantBlocks.filter((b: { type: string }) => b.type === 'tool_use') as Array<{ id: string; name: string; input: Record<string, unknown> }>;

      if (toolUses.length === 0 || lastFinish !== 'tool_use') {
        break; // Final assistant message
      }

      // Assistant-Turn ans Message-Array hängen
      anthropicMessages.push({ role: 'assistant', content: lastAssistantBlocks });

      // Tools nacheinander ausführen + Results an Anthropic zurückgeben
      const toolResultBlocks: unknown[] = [];
      for (const tu of toolUses) {
        const result = await executeTool(tu.name, tu.input || {}, supabase, ctx);
        toolResults.push({ tool_use_id: tu.id, name: tu.name, output: result });
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result),
          is_error: !result.ok,
        });
      }
      anthropicMessages.push({ role: 'user', content: toolResultBlocks });
    }

    // Reply: text-Blocks aus dem letzten assistant-Turn
    const textParts = lastAssistantBlocks
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('\n')
      .trim();

    const toolCallsFromLast = lastAssistantBlocks
      .filter((b: { type: string }) => b.type === 'tool_use')
      .map((b: { id: string; name: string; input: unknown }) => ({ id: b.id, name: b.name, input: b.input }));

    return json({
      reply: {
        role: 'assistant',
        content: textParts || null,
        tool_calls: toolCallsFromLast.length > 0 ? toolCallsFromLast : null,
      },
      tool_results: toolResults,
      model: DEFAULT_MODEL,
      finish_reason: lastFinish,
      iterations: iter,
    });

  } catch (e) {
    console.error('[leadly] unhandled error:', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

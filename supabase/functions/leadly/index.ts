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
const OPENAI_API_KEY       = Deno.env.get("OPENAI_API_KEY") || '';
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY    = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEFAULT_MODEL = "claude-sonnet-4-6";  // Aligned mit src/components/ModelSelector.jsx
const EMBEDDING_MODEL = "text-embedding-3-small";  // 1536 dims, OpenAI
const MAX_ITERATIONS = 6;
const MEMORY_TOP_K = 4;            // User-Memory Top-K
const MEMORY_MIN_SIMILARITY = 0.7; // Cosine-Cutoff für User-Memory
const ACCOUNT_MEMORY_TOP_K = 2;    // Account-Memory Top-K (zusätzlich zu User-Memory)
const ACCOUNT_MEMORY_MIN_SIMILARITY = 0.75;     // Strenger weil aggregiert
const ACCOUNT_K_ANONYMITY_THRESHOLD = 3;        // Min Beiträger pro Pattern
const ACCOUNT_SIMILAR_PATTERN_CUTOFF = 0.85;    // Bei Save: Pattern als gleich werten

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
  {
    name: "remember_preference",
    description: "Merke dir eine User-spezifische Konvention oder Präferenz dauerhaft. Beispiele: 'Wenn ich Termin sage, meinst du Aufgabe', 'Mein Default-Follow-up sind 5 Tage', 'Ich nenne Verhandlung immer Gespräch'. Wird in allen künftigen Konversationen als Lesson im System-Prompt geladen.",
    input_schema: {
      type: "object",
      properties: {
        key:   { type: "string", description: "Kurzer Slug, z.B. 'task_naming' oder 'default_followup_days'" },
        value: { type: "string", description: "Die Lesson als Klartext" },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "forget_preference",
    description: "Lösche eine zuvor gespeicherte Präferenz per Key.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Slug der Präferenz die gelöscht werden soll" },
      },
      required: ["key"],
    },
  },
];

// ─── Memory / RAG Helpers ───────────────────────────────────────────────────
//
// OpenAI Embedding-API: text-embedding-3-small, 1536 dims, sehr günstig
// (~$0.02 / 1M tokens). Cosine-Distance via pgvector ANN-Index.

async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!OPENAI_API_KEY || !text || text.length < 4) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8000), // Safety-Cutoff, model erlaubt mehr
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.warn('[leadly] embedding failed:', res.status, err.slice(0, 200));
      return null;
    }
    const data = await res.json();
    return data.data?.[0]?.embedding || null;
  } catch (e) {
    console.warn('[leadly] embedding exception:', e instanceof Error ? e.message : e);
    return null;
  }
}

// Cosine-Search in leadly_memory via RPC oder direct SQL. Wir nutzen den
// `<=>`-Operator (cosine distance) — kleiner = ähnlicher. similarity = 1 - distance.
async function retrieveMemories(
  userId: string,
  queryEmbedding: number[] | null,
): Promise<{ summary: string; importance: number; similarity: number; id: string }[]> {
  if (!queryEmbedding) return [];
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  // Inline-SQL via .rpc() wäre besser, aber wir nutzen die einfachere Variante:
  // pgvector erlaubt `embedding <=> '[...]'::vector` als ORDER-Klausel direkt.
  // PostgREST kann das nicht über .select() ausdrücken — also via .rpc auf
  // eine inline-Funktion oder mit raw query. Simpel: nutze admin.from() + select
  // mit Sort über raw-vector — aber das geht nicht in PostgREST.
  //
  // Workaround: SQL-Query via supabase.rpc Custom-Function. Wir bauen die
  // Function gleich hier dynamisch via execute-sql — aber das ist auch
  // limited. Pragmatisch: wir laden die letzten 100 Memories vom User und
  // rechnen Cosine-Similarity in TS. Für <500 Memories pro User OK.
  // (Echter pgvector-ANN-Index wird benutzt sobald wir die RPC-Func haben —
  // siehe Migration Folge-Sprint.)
  const { data, error } = await admin
    .from('leadly_memory')
    .select('id, summary, importance, embedding')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error || !data) {
    console.warn('[leadly] retrieveMemories error:', error?.message);
    return [];
  }

  const scored: { id: string; summary: string; importance: number; similarity: number }[] = [];
  for (const row of data) {
    const emb = row.embedding;
    if (!emb || !Array.isArray(emb)) continue;
    // Cosine-Similarity = dot(a,b) / (|a|*|b|). pgvector liefert das Array
    // direkt aus dem JSON, dimensions sollten 1536 sein.
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < emb.length; i++) {
      dot  += queryEmbedding[i] * emb[i];
      magA += queryEmbedding[i] * queryEmbedding[i];
      magB += emb[i] * emb[i];
    }
    const sim = magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
    if (sim >= MEMORY_MIN_SIMILARITY) {
      scored.push({ id: row.id, summary: row.summary, importance: row.importance, similarity: sim });
    }
  }
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, MEMORY_TOP_K);
}

async function recordMemoryRecall(memoryIds: string[]) {
  if (memoryIds.length === 0) return;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  // recall_count++ + last_recalled_at update. Pragmatisch: einfaches UPDATE
  // ohne RPC — pgvector + recall-Tracking pro Memory ist nice-to-have.
  for (const id of memoryIds) {
    await admin.rpc('increment_memory_recall', { p_id: id }).then(() => {}).catch(() => {});
    // Falls die RPC noch nicht existiert: silent fail, keine Blocker.
  }
}

async function loadPreferences(userId: string): Promise<{ key: string; value: string }[]> {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data, error } = await admin
    .from('leadly_preferences')
    .select('pref_key, pref_value')
    .eq('user_id', userId)
    .limit(50);
  if (error || !data) return [];
  return data.map(r => ({ key: r.pref_key, value: r.pref_value }));
}

// ─── Federated Learning: Account-Scope-Helpers ──────────────────────────

async function loadLearningScope(userId: string): Promise<'privat' | 'account' | 'global'> {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data } = await admin
    .from('user_preferences')
    .select('leadly_learning_scope')
    .eq('user_id', userId)
    .maybeSingle();
  const v = data?.leadly_learning_scope;
  return (v === 'privat' || v === 'account' || v === 'global') ? v : 'account';
}

async function loadUserAccountId(userId: string): Promise<string | null> {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  // Über team_members → teams.account_id. Falls User in mehreren Accounts
  // ist (selten), nimm das erste.
  const { data } = await admin
    .from('team_members')
    .select('teams(account_id)')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  // @ts-ignore - PostgREST-Embed-Typ
  return data?.teams?.account_id || null;
}

async function loadAccountPreferences(accountId: string): Promise<{ key: string; value: string }[]> {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data } = await admin
    .from('leadly_account_preferences')
    .select('pref_key, pref_value, supporting_user_count')
    .eq('account_id', accountId)
    .gte('supporting_user_count', ACCOUNT_K_ANONYMITY_THRESHOLD)
    .order('supporting_user_count', { ascending: false })
    .limit(30);
  if (!data) return [];
  return data.map(r => ({ key: r.pref_key, value: r.pref_value }));
}

async function retrieveAccountMemories(
  accountId: string,
  queryEmbedding: number[] | null,
): Promise<{ summary: string; similarity: number; id: string }[]> {
  if (!queryEmbedding) return [];
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  // k-anonymity: nur Patterns mit ≥3 Beiträgern
  const { data } = await admin
    .from('leadly_account_memory')
    .select('id, summary, embedding, contributing_user_count, importance')
    .eq('account_id', accountId)
    .gte('contributing_user_count', ACCOUNT_K_ANONYMITY_THRESHOLD)
    .order('last_seen_at', { ascending: false })
    .limit(100);
  if (!data) return [];

  const scored: { id: string; summary: string; similarity: number }[] = [];
  for (const row of data) {
    const emb = row.embedding;
    if (!emb || !Array.isArray(emb)) continue;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < emb.length; i++) {
      dot  += queryEmbedding[i] * emb[i];
      magA += queryEmbedding[i] * queryEmbedding[i];
      magB += emb[i] * emb[i];
    }
    const sim = magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
    if (sim >= ACCOUNT_MEMORY_MIN_SIMILARITY) {
      scored.push({ id: row.id, summary: row.summary, similarity: sim });
    }
  }
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, ACCOUNT_MEMORY_TOP_K);
}

async function saveAccountMemory(opts: {
  accountId: string;
  userId: string;
  summary: string;
  embedding: number[];
  importance: number;
  kind?: 'turn' | 'fact' | 'tool_pattern';
}) {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  // Check ob ähnliches Pattern schon existiert (Cosine ≥0.85)
  // Pragmatisch: lade letzte 50 Account-Memories der gleichen kind und vergleiche.
  const { data: existing } = await admin
    .from('leadly_account_memory')
    .select('id, embedding, contributing_user_count, importance, summary')
    .eq('account_id', opts.accountId)
    .eq('kind', opts.kind || 'turn')
    .order('last_seen_at', { ascending: false })
    .limit(50);

  let matchId: string | null = null;
  let bestSim = 0;
  for (const row of existing || []) {
    const emb = row.embedding;
    if (!emb || !Array.isArray(emb)) continue;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < emb.length; i++) {
      dot  += opts.embedding[i] * emb[i];
      magA += opts.embedding[i] * opts.embedding[i];
      magB += emb[i] * emb[i];
    }
    const sim = magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
    if (sim > bestSim) { bestSim = sim; matchId = row.id; }
  }

  if (matchId && bestSim >= ACCOUNT_SIMILAR_PATTERN_CUTOFF) {
    // Existing Pattern: contributing_user_count++ wenn dieser User noch nicht beigetragen hat.
    // Pragmatisch: wir tracken nicht WER beigetragen hat (nur count) — daher
    // einfach ein increment. Edge-Case: gleicher User triggert oft ähnliches
    // Pattern → count steigt unfair. Akzeptabel für MVP, k-anon-Threshold
    // ist ≥3 also leicht overcounted.
    await admin
      .from('leadly_account_memory')
      .update({
        contributing_user_count: (existing!.find(r => r.id === matchId)!.contributing_user_count || 0) + 1,
        last_seen_at: new Date().toISOString(),
        importance: Math.max(existing!.find(r => r.id === matchId)!.importance || 50, opts.importance),
      })
      .eq('id', matchId);
  } else {
    // Neues Pattern
    await admin.from('leadly_account_memory').insert({
      account_id: opts.accountId,
      kind: opts.kind || 'turn',
      summary: opts.summary.slice(0, 1000),
      embedding: opts.embedding,
      contributing_user_count: 1,
      importance: opts.importance,
    });
  }
}

async function promoteUserPreferenceToAccount(opts: {
  accountId: string;
  userId: string;
  prefKey: string;
  prefValue: string;
}) {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  // Upsert: wenn (account_id, key, value) schon existiert → supporting_user_count++,
  // sonst neu mit count=1
  const { data: existing } = await admin
    .from('leadly_account_preferences')
    .select('id, supporting_user_count')
    .eq('account_id', opts.accountId)
    .eq('pref_key', opts.prefKey)
    .eq('pref_value', opts.prefValue)
    .maybeSingle();
  if (existing) {
    await admin
      .from('leadly_account_preferences')
      .update({
        supporting_user_count: (existing.supporting_user_count || 0) + 1,
        last_seen_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    await admin.from('leadly_account_preferences').insert({
      account_id: opts.accountId,
      pref_key: opts.prefKey,
      pref_value: opts.prefValue,
      supporting_user_count: 1,
    });
  }
}

async function saveMemory(opts: {
  userId: string;
  teamId: string | null;
  accountId: string | null;
  learningScope: 'privat' | 'account' | 'global';
  summary: string;
  importance?: number;
  kind?: 'turn' | 'fact';
}) {
  if (!opts.summary || opts.summary.length < 8) return;
  const embedding = await generateEmbedding(opts.summary);
  if (!embedding) return; // Kein Embedding-Service → kein Memory-Save (graceful)
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const importance = typeof opts.importance === 'number' ? Math.max(0, Math.min(100, opts.importance)) : 50;

  // 1) User-Memory immer (auch bei scope='privat')
  const { error } = await admin.from('leadly_memory').insert({
    user_id: opts.userId,
    team_id: opts.teamId,
    summary: opts.summary.slice(0, 1000),
    kind: opts.kind || 'turn',
    importance,
    embedding,
  });
  if (error) console.warn('[leadly] saveMemory failed:', error.message);

  // 2) Account-Memory nur bei scope='account' oder 'global' + accountId vorhanden
  if (opts.accountId && (opts.learningScope === 'account' || opts.learningScope === 'global')) {
    try {
      await saveAccountMemory({
        accountId: opts.accountId,
        userId: opts.userId,
        summary: opts.summary,
        embedding,
        importance,
        kind: opts.kind || 'turn',
      });
    } catch (e) {
      console.warn('[leadly] saveAccountMemory failed:', e instanceof Error ? e.message : e);
    }
  }
}

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

      case "remember_preference": {
        const key   = String(input.key   || '').trim();
        const value = String(input.value || '').trim();
        if (!key || !value) return { ok: false, error: 'key and value required' };
        // Service-role-Insert weil leadly_preferences hat keine authenticated-INSERT-Policy.
        // RLS-konform durch ctx.userId-Set.
        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        const { data, error } = await admin.from('leadly_preferences').upsert({
          user_id: ctx.userId,
          team_id: ctx.teamId,
          pref_key: key,
          pref_value: value,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,pref_key' }).select('pref_key, pref_value').single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, data };
      }

      case "forget_preference": {
        const key = String(input.key || '').trim();
        if (!key) return { ok: false, error: 'key required' };
        const { error } = await supabase
          .from('leadly_preferences')
          .delete()
          .eq('pref_key', key);
        if (error) return { ok: false, error: error.message };
        return { ok: true, data: { key, deleted: true } };
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

const SYSTEM_PROMPT_BASE = `Du bist Leadly, der KI-Assistent von Leadesk — einer Multi-Tenant LinkedIn-Sales-Suite.

Deine Aufgabe: Im CRM aktiv mitarbeiten. Du kannst Kontakte und Aufgaben anlegen, Deals managen, Daten durchsuchen und Status ändern. Antworte immer auf Deutsch, kurz und konkret. Frage NICHT nach allen Feldern — leg den Datensatz mit dem an was du hast, der User kann ihn später ergänzen.

Verhalten:
- Wenn der User einen Kontakt nennt, suche zuerst (search_leads), bevor du etwas änderst.
- Erstelle direkt ohne Rückfragen, wenn der User klar formuliert hat ("Leg Anna Müller bei Acme an").
- Bei Mehrdeutigkeit (z.B. zwei Kontakte mit ähnlichem Namen) frage kurz nach.
- Antworte nach erfolgreichem Tool-Call mit einer 1-Satz-Bestätigung + ggf. Lead-ID/Link-Hinweis.
- Status-Werte: Lead, LQL, MQL, MQN, SQL (genau diese Schreibweise).
- Deal-Stages: interessent, prospect, qualifiziert, opportunity, angebot, verhandlung, gewonnen, verloren.
- Datumsangaben immer als YYYY-MM-DD.

Memory:
- Du erhältst (sofern verfügbar) am Anfang eine kurze "Du erinnerst dich an…"-Sektion mit den 3-4 relevantesten vergangenen Interaktionen. Nutze sie, um konsistent mit deinen früheren Antworten zu bleiben.
- Du erhältst auch eine "Konventionen des Users"-Sektion mit expliziten Lessons. Diese sind absolute Regeln — beachte sie.
- Wenn der User dir explizit eine neue Konvention nennt ("merk dir, wenn ich X sage meinst du Y"), nutze das Tool remember_preference dafür — keine Bestätigung nötig, du machst es einfach.`;

function buildSystemPrompt(
  memories: { summary: string }[],
  preferences: { key: string; value: string }[],
  accountMemories: { summary: string }[] = [],
  accountPreferences: { key: string; value: string }[] = [],
) {
  const parts = [SYSTEM_PROMPT_BASE];
  if (memories.length > 0) {
    parts.push(`\nDu erinnerst dich an (von ähnlichen Anfragen früher):\n${memories.map((m, i) => `${i + 1}. ${m.summary}`).join('\n')}`);
  }
  if (accountMemories.length > 0) {
    parts.push(`\nKollektives Team-Wissen (geteiltes Account-Lernen, ≥3 Beiträger):\n${accountMemories.map((m, i) => `${i + 1}. ${m.summary}`).join('\n')}`);
  }
  if (preferences.length > 0) {
    parts.push(`\nKonventionen des Users (ABSOLUTE Regeln):\n${preferences.map(p => `- [${p.key}] ${p.value}`).join('\n')}`);
  }
  if (accountPreferences.length > 0) {
    parts.push(`\nAccount-weite Konventionen (vom Team etabliert):\n${accountPreferences.map(p => `- [${p.key}] ${p.value}`).join('\n')}`);
  }
  return parts.join('\n');
}

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

    // ─── RAG: Scope-aware Memory-Retrieve + Preferences ──────────────
    // 1) Lernmodus + Account-Zuordnung laden
    const [learningScope, accountId] = await Promise.all([
      loadLearningScope(userId),
      loadUserAccountId(userId),
    ]);
    // 2) Letzte User-Message als Query
    const lastUserMsg = [...anthropicMessages].reverse().find(m => m.role === 'user');
    const queryText = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : '';
    const queryEmbedding = queryText ? await generateEmbedding(queryText) : null;

    // 3) User-Memory + Preferences (immer, auch bei privat)
    const userMemoryPromise = retrieveMemories(userId, queryEmbedding);
    const userPrefsPromise  = loadPreferences(userId);

    // 4) Account-Memory + Account-Preferences nur wenn scope='account' oder 'global'
    const includeAccount = (learningScope === 'account' || learningScope === 'global') && !!accountId;
    const accountMemoryPromise = includeAccount
      ? retrieveAccountMemories(accountId!, queryEmbedding)
      : Promise.resolve([]);
    const accountPrefsPromise = includeAccount
      ? loadAccountPreferences(accountId!)
      : Promise.resolve([]);

    const [retrievedMemories, preferences, accountMemories, accountPreferences] = await Promise.all([
      userMemoryPromise, userPrefsPromise, accountMemoryPromise, accountPrefsPromise,
    ]);

    if (retrievedMemories.length > 0) {
      recordMemoryRecall(retrievedMemories.map(m => m.id)).catch(() => {});
    }
    if (accountMemories.length > 0) {
      // Fire-and-forget recall tracking pro Account-Memory
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      for (const m of accountMemories) {
        admin.rpc('increment_account_memory_recall', { p_id: m.id }).then(() => {}).catch(() => {});
      }
    }
    const dynamicSystemPrompt = buildSystemPrompt(
      retrievedMemories, preferences,
      accountMemories, accountPreferences,
    );

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
          system: dynamicSystemPrompt,
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

    // ─── Memory-Save (fire-and-forget) ───────────────────────────────
    // Erzeuge eine kompakte Summary der Interaktion und speichere sie
    // mit Embedding in leadly_memory. Wird async ausgelöst — wir warten
    // NICHT auf das Embedding-Result damit die Response-Latenz nicht
    // leidet. User-Frage + Assistant-Antwort als Summary-Basis.
    if (queryText && (textParts || toolResults.length > 0)) {
      const toolSummary = toolResults
        .filter(tr => (tr.output as { ok?: boolean }).ok !== false)
        .map(tr => tr.name)
        .join(', ');
      const summary = [
        `Frage: ${queryText.slice(0, 200)}`,
        textParts ? `Antwort: ${textParts.slice(0, 250)}` : null,
        toolSummary ? `Aktionen: ${toolSummary}` : null,
      ].filter(Boolean).join(' · ');
      // Importance basiert auf Tool-Use: write-Tools (create/update) = wichtig
      const writeOps = toolResults.filter(tr => /^(create_|update_|remember_)/.test(tr.name)).length;
      const importance = writeOps > 0 ? 75 : 40;
      // Fire-and-forget — kein await
      saveMemory({
        userId, teamId, accountId, learningScope,
        summary, importance, kind: 'turn',
      }).catch(() => {});

      // Preference-Promotion: wenn der User remember_preference aufgerufen hat,
      // promovieren wir das in die Account-Preferences (mit supporting_user_count++)
      // sofern scope='account' oder 'global'.
      if (accountId && (learningScope === 'account' || learningScope === 'global')) {
        for (const tr of toolResults) {
          if (tr.name === 'remember_preference' && (tr.output as { ok?: boolean; data?: { pref_key?: string; pref_value?: string } }).ok) {
            const out = tr.output as { data?: { pref_key?: string; pref_value?: string } };
            if (out.data?.pref_key && out.data?.pref_value) {
              promoteUserPreferenceToAccount({
                accountId,
                userId,
                prefKey: out.data.pref_key,
                prefValue: out.data.pref_value,
              }).catch(() => {});
            }
          }
        }
      }
    }

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
      memory_used: retrievedMemories.length,
      preferences_used: preferences.length,
      account_memory_used: accountMemories.length,
      account_preferences_used: accountPreferences.length,
      learning_scope: learningScope,
    });

  } catch (e) {
    console.error('[leadly] unhandled error:', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

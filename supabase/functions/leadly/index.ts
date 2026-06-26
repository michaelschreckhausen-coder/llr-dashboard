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
import { getCallerContext, checkCredits, recordUsage, estimateCredits } from "../_shared/credits.ts";

const ANTHROPIC_API_KEY    = Deno.env.get("ANTHROPIC_API_KEY")!;
const OPENAI_API_KEY       = Deno.env.get("OPENAI_API_KEY") || '';
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY    = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEFAULT_MODEL = "claude-sonnet-4-6";  // Aligned mit src/components/ModelSelector.jsx

// ─── Guardrail: schreibende/außenwirksame Tools brauchen explizite Bestätigung ──
// Diese Tools werden im Loop NICHT autonom ausgeführt, sondern als pending_action
// ans Frontend zurückgegeben. Ausführung erst nach User-Klick via confirmed_action.
// (remember_/forget_preference sind interne Lern-Config → kein Bestätigungszwang.)
const WRITE_TOOLS = new Set<string>([
  'create_lead', 'create_task', 'create_deal',
  'update_lead', 'update_deal', 'update_organization',
  'add_brand_memory', 'report_problem',
  'complete_task', 'update_task',
  // revert_action ist NICHT als LLM-Tool definiert (kein Eintrag in TOOLS) — es wird
  // nur per Frontend-„Rückgängig" über confirmed_action ausgeführt; steht aber in der
  // Write-Liste, damit der confirmed_action-Pfad es akzeptiert.
  'revert_action',
]);
// Update-Tools, deren Vorher-Zustand fürs Undo gesichert wird: tool → [tabelle, id-feld]
const BEFORE_CAPTURE: Record<string, [string, string]> = {
  update_lead:         ['leads', 'lead_id'],
  update_deal:         ['deals', 'deal_id'],
  update_organization: ['organizations', 'organization_id'],
  complete_task:       ['lead_tasks', 'task_id'],
  update_task:         ['lead_tasks', 'task_id'],
};

function summarizeAction(name: string, input: Record<string, unknown>): string {
  const i = input || {};
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  switch (name) {
    case 'create_lead': return `Kontakt anlegen: ${[s(i.first_name), s(i.last_name)].filter(Boolean).join(' ') || '—'}${i.company ? ` (${s(i.company)})` : ''}`;
    case 'update_lead': return `Kontakt aktualisieren${i.status ? ` → Status ${s(i.status)}` : ''}${i.lead_score != null ? ` · Score ${i.lead_score}` : ''}`;
    case 'create_task': return `Aufgabe anlegen: ${s(i.title) || '—'}${i.due_date ? ` (fällig ${s(i.due_date)})` : ''}`;
    case 'complete_task': return `Aufgabe als erledigt markieren`;
    case 'update_task': return `Aufgabe aktualisieren${i.status ? ` → ${s(i.status)}` : ''}${i.due_date ? ` · fällig ${s(i.due_date)}` : ''}${i.priority ? ` · ${s(i.priority)}` : ''}`;
    case 'create_deal': return `Deal anlegen: ${s(i.title) || '—'}${i.value != null ? ` · ${i.value} €` : ''}${i.stage ? ` · ${s(i.stage)}` : ''}`;
    case 'update_deal': return `Deal aktualisieren${i.stage ? ` → ${s(i.stage)}` : ''}${i.value != null ? ` · ${i.value} €` : ''}`;
    case 'update_organization': return `Unternehmen aktualisieren`;
    case 'add_brand_memory': return `Brand-Notiz speichern: ${s(i.content).slice(0, 80) || '—'}`;
    case 'report_problem': return `Support-Ticket erstellen: ${s(i.summary).slice(0, 80) || '—'}`;
    default: return `Aktion: ${name}`;
  }
}
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
    name: "complete_task",
    description: "Markiert eine Aufgabe als erledigt (status='done'). Braucht die task_id (z.B. aus search/Listen).",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "UUID der Aufgabe" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "update_task",
    description: "Aktualisiert eine Aufgabe (Fälligkeit, Priorität, Status, Titel, Beschreibung). Braucht die task_id.",
    input_schema: {
      type: "object",
      properties: {
        task_id:     { type: "string", description: "UUID der Aufgabe" },
        due_date:    { type: "string", description: "Neue Fälligkeit YYYY-MM-DD" },
        priority:    { type: "string", enum: ["low", "normal", "high"], description: "Priorität" },
        status:      { type: "string", enum: ["open", "done"], description: "Status" },
        title:       { type: "string", description: "Neuer Titel" },
        description: { type: "string", description: "Neue Beschreibung" },
      },
      required: ["task_id"],
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
    description: "Aktualisiert einen Deal per ID. Stage, Value, Probability, Owner änderbar.",
    input_schema: {
      type: "object",
      properties: {
        deal_id:     { type: "string", description: "Deal-UUID" },
        stage:       { type: "string", enum: ["interessent", "prospect", "qualifiziert", "opportunity", "angebot", "verhandlung", "gewonnen", "verloren"] },
        value:       { type: "number", description: "Neuer Wert in EUR" },
        probability: { type: "number", description: "Neue Wahrscheinlichkeit 0-100" },
        expected_close_date: { type: "string", description: "Neues Datum YYYY-MM-DD" },
        owner_id:    { type: "string", description: "Neuer Owner (auth.users-UUID, null um zu entfernen)" },
      },
      required: ["deal_id"],
    },
  },
  {
    name: "update_organization",
    description: "Aktualisiert ein Unternehmen per ID. Owner, Website, Branche änderbar.",
    input_schema: {
      type: "object",
      properties: {
        organization_id: { type: "string", description: "Unternehmen-UUID" },
        owner_id:        { type: "string", description: "Neuer Owner (auth.users-UUID, null um zu entfernen)" },
        website:         { type: "string", description: "Neue Website-URL" },
        notes:           { type: "string", description: "Notizen überschreiben" },
      },
      required: ["organization_id"],
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
  {
    name: "get_account_overview",
    description: "Zahlen-Überblick über den Account: Kontakte, Deals (offen/gewonnen), offene & überfällige Aufgaben, Beiträge nach Status, Personal/Company Brands, Zielgruppen, Wissenseinträge, Vernetzungen, aktueller SSI. Für Fragen wie 'Wie ist mein Stand?', 'Was habe ich alles?'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_brands",
    description: "Listet die Brand Voices (Markenstimmen) des Teams — Personal und Company Brands — mit Name, Typ, aktiv/Standard und wie vollständig sie ausgefüllt sind. Für Branding-/Markenstimme-Fragen.",
    input_schema: { type: "object", properties: { account_type: { type: "string", enum: ["personal", "company_page"], description: "Optional auf Personal- oder Company-Brands filtern" } } },
  },
  {
    name: "list_audiences",
    description: "Listet die Zielgruppen des Teams mit Name, Jobtiteln, Branchen, Pain Points und Region.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_knowledge",
    description: "Listet die Einträge der Wissensdatenbank (Name, Kategorie, Typ, Quelle) — ohne Volltext.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_posts",
    description: "Listet LinkedIn-Beiträge aus dem Redaktionsplan (Titel, Status, geplantes Datum, Typ). Optional Status-Filter (idee, draft, scheduled, published).",
    input_schema: { type: "object", properties: { status: { type: "string", description: "Status-Filter, z.B. idee, draft, scheduled, published" }, limit: { type: "number", description: "Max Treffer (default 20, max 50)" } } },
  },
  {
    name: "get_ssi",
    description: "Aktueller LinkedIn Social Selling Index (SSI) und die vier Säulen, je Brand. Für SSI-/LinkedIn-Performance-Fragen.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_connections",
    description: "Listet die jüngsten Vernetzungen/Connection-Anfragen (Name, Headline, Firma, Status, gesendet am).",
    input_schema: { type: "object", properties: { limit: { type: "number", description: "Max Treffer (default 20, max 50)" } } },
  },
  {
    name: "get_brand_memory",
    description: "Zeigt die gemerkten Notizen/Fakten (Memory) einer Brand und woraus die Brand sonst lernt (Beiträge). Ohne brand_voice_id die aktuell aktive Brand. Für Fragen wie 'Was hat sich meine Brand gemerkt?'.",
    input_schema: { type: "object", properties: { brand_voice_id: { type: "string", description: "UUID der Brand (optional; sonst aktive Brand)" } } },
  },
  {
    name: "add_brand_memory",
    description: "Fügt der Memory einer Brand manuell eine Notiz/Fakt/Regel hinzu (z.B. 'Wir betonen immer Datenschutz'). Fließt künftig in die Content-Generierung dieser Brand ein. Ohne brand_voice_id die aktive Brand.",
    input_schema: { type: "object", properties: { content: { type: "string", description: "Die zu merkende Notiz/Fakt als Klartext" }, brand_voice_id: { type: "string", description: "UUID der Brand (optional; sonst aktive Brand)" } }, required: ["content"] },
  },
  {
    name: "diagnose_publishing",
    description: "Technische Diagnose für Veröffentlichungs-Probleme: listet Beiträge mit Publish-Fehler (Fehlermeldung + letzter Versuch). Für 'mein Beitrag wurde nicht veröffentlicht'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_credit_status",
    description: "Aktueller Credit-Stand des Accounts (verbleibende Credits, Tageslimit). Für 'warum geht die KI nicht mehr / sind meine Credits aufgebraucht'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_connection_status",
    description: "LinkedIn-Verbindungsstatus je Brand (verbunden? Token abgelaufen? widerrufen? Refresh fehlgeschlagen?). Für 'LinkedIn/Extension verbindet nicht', fehlgeschlagene Posts, SSI/Vernetzungen-Probleme.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "report_problem",
    description: "Eskalation: meldet ein technisches Problem an den Support (legt ein Ticket an). Nutze es, wenn du ein Problem nicht selbst lösen kannst ODER der User es eskalieren möchte. Fasse das Problem klar zusammen.",
    input_schema: { type: "object", properties: { summary: { type: "string", description: "Kurze Problembeschreibung" }, details: { type: "string", description: "Details/Schritte/Fehlermeldung (optional)" }, area: { type: "string", description: "Betroffener Bereich, z.B. Content, LinkedIn, Vernetzung (optional)" } }, required: ["summary"] },
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

// Aktive Brand des Users (Brand-Ebene) für Kontext + Brand-Memory-Default.
async function loadActiveBrand(admin: ReturnType<typeof createClient>, userId: string): Promise<{ id: string; label: string; typ: string } | null> {
  try {
    const { data: pref } = await admin.from('user_preferences').select('active_brand_voice_id').eq('user_id', userId).maybeSingle();
    const bvId = (pref as any)?.active_brand_voice_id;
    if (!bvId) return null;
    const { data: bv } = await admin.from('brand_voices').select('id, name, brand_name, account_type').eq('id', bvId).maybeSingle();
    if (!bv) return null;
    return { id: (bv as any).id, label: (bv as any).brand_name || (bv as any).name || 'Brand', typ: (bv as any).account_type === 'company_page' ? 'Company Brand' : 'Personal Brand' };
  } catch { return null; }
}

// Brand-ID auflösen: explizit übergeben oder aktive Brand des Users.
async function resolveBrandId(input: unknown, supabase: ReturnType<typeof createClient>, ctx: { userId: string }): Promise<string | null> {
  if (input) return String(input);
  const { data } = await supabase.from('user_preferences').select('active_brand_voice_id').eq('user_id', ctx.userId).maybeSingle();
  return (data as any)?.active_brand_voice_id || null;
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
  ctx: { userId: string; teamId: string | null; accountId?: string | null },
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

      case "complete_task": {
        if (!input.task_id) return { ok: false, error: 'task_id erforderlich' };
        const { data, error } = await supabase
          .from('lead_tasks').update({ status: 'done' }).eq('id', input.task_id)
          .select('id, title, status').single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, data };
      }

      case "update_task": {
        if (!input.task_id) return { ok: false, error: 'task_id erforderlich' };
        // status separat updaten (Top-Fallstrick #1: constrained field nicht bündeln)
        if (input.status !== undefined) {
          const { error: se } = await supabase.from('lead_tasks').update({ status: input.status }).eq('id', input.task_id);
          if (se) return { ok: false, error: se.message };
        }
        const patch: Record<string, unknown> = {};
        if (input.due_date !== undefined)    patch.due_date = input.due_date;
        if (input.priority !== undefined)    patch.priority = input.priority;
        if (input.title !== undefined)       patch.title = input.title;
        if (input.description !== undefined) patch.description = input.description;
        if (Object.keys(patch).length) {
          const { error } = await supabase.from('lead_tasks').update(patch).eq('id', input.task_id);
          if (error) return { ok: false, error: error.message };
        }
        const { data } = await supabase.from('lead_tasks')
          .select('id, title, status, due_date, priority').eq('id', input.task_id).maybeSingle();
        return { ok: true, data };
      }

      case "revert_action": {
        // Undo (B2.3): macht eine zuvor bestätigte create_/update_-Aktion rückgängig.
        const auditId = input.audit_id;
        if (!auditId) return { ok: false, error: 'audit_id erforderlich' };
        const { data: a } = await supabase.from('leadly_action_audit').select('*').eq('id', auditId).maybeSingle();
        if (!a) return { ok: false, error: 'Audit-Eintrag nicht gefunden' };
        const tn = a.tool_name as string;
        const ti = (a.tool_input || {}) as Record<string, unknown>;
        const res = (a.result || {}) as { data?: { id?: string } };
        const bef = (a.before || null) as Record<string, unknown> | null;
        const createMap: Record<string, string> = { create_lead: 'leads', create_task: 'lead_tasks', create_deal: 'deals', add_brand_memory: 'brand_memory' };
        if (createMap[tn]) {
          const newId = res?.data?.id;
          if (!newId) return { ok: false, error: 'Keine ID zum Rückgängigmachen gespeichert' };
          const { error } = await supabase.from(createMap[tn]).delete().eq('id', newId);
          if (error) return { ok: false, error: error.message };
          return { ok: true, data: { reverted: tn, deleted: newId } };
        }
        if (BEFORE_CAPTURE[tn]) {
          if (!bef) return { ok: false, error: 'Kein Vorher-Zustand gespeichert' };
          const [tbl, idf] = BEFORE_CAPTURE[tn];
          const idv = ti[idf];
          if (!idv) return { ok: false, error: 'Keine Ziel-ID' };
          const patch: Record<string, unknown> = {};
          for (const k of Object.keys(ti)) { if (k === idf) continue; if (k in bef) patch[k] = bef[k]; }
          if (tn === 'complete_task' && bef.status !== undefined) patch.status = bef.status;
          if (Object.keys(patch).length === 0) return { ok: false, error: 'Nichts rückgängig zu machen' };
          if ('status' in patch) {
            await supabase.from(tbl).update({ status: patch.status }).eq('id', idv);
            delete patch.status;
          }
          if (Object.keys(patch).length) {
            const { error } = await supabase.from(tbl).update(patch).eq('id', idv);
            if (error) return { ok: false, error: error.message };
          }
          return { ok: true, data: { reverted: tn, id: idv } };
        }
        return { ok: false, error: 'Diese Aktion ist nicht umkehrbar (' + tn + ')' };
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
        if (ctx.teamId) q = q.eq('team_id', ctx.teamId); // TEAM-ISOLATION: nur Leads des aktiven Teams
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
          .select('id, first_name, last_name, status, owner_id, lead_score, next_followup, company')
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
          .select('id, title, stage, value, probability, owner_id')
          .eq('id', deal_id)
          .maybeSingle();
        if (error) return { ok: false, error: error.message };
        return { ok: true, data };
      }

      case "update_organization": {
        const { organization_id, ...rest } = input as Record<string, unknown>;
        if (!organization_id) return { ok: false, error: 'organization_id required' };
        if (Object.keys(rest).length > 0) {
          const { error: e1 } = await supabase.from('organizations').update(rest).eq('id', organization_id);
          if (e1) return { ok: false, error: e1.message };
        }
        const { data, error } = await supabase
          .from('organizations')
          .select('id, name, website, owner_id')
          .eq('id', organization_id)
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

      case "get_account_overview": {
        const today = new Date().toISOString().split('T')[0];
        const tid = ctx.teamId;
        // vernetzungen hat kein team_id → über die Brands des aktiven Teams scopen
        const tbv = await supabase.from('brand_voices').select('id').eq('team_id', tid);
        const teamBvIds = ((tbv.data as any[]) || []).map((b: any) => b.id);
        const bvFilter = teamBvIds.length ? teamBvIds : ['00000000-0000-0000-0000-000000000000'];
        const [leads, dealsR, tasksOpen, tasksOverdue, posts, brands, auds, kb, conns, ssi] = await Promise.all([
          supabase.from('leads').select('id', { count: 'exact', head: true }).eq('archived', false).eq('team_id', tid),
          supabase.from('deals').select('stage').eq('team_id', tid),
          supabase.from('lead_tasks').select('id', { count: 'exact', head: true }).eq('status', 'open').eq('team_id', tid),
          supabase.from('lead_tasks').select('id', { count: 'exact', head: true }).eq('status', 'open').lt('due_date', today).eq('team_id', tid),
          supabase.from('content_posts').select('status').eq('team_id', tid),
          supabase.from('brand_voices').select('account_type').eq('team_id', tid),
          supabase.from('target_audiences').select('id', { count: 'exact', head: true }).eq('team_id', tid),
          supabase.from('knowledge_base').select('id', { count: 'exact', head: true }).eq('team_id', tid),
          supabase.from('vernetzungen').select('id', { count: 'exact', head: true }).in('brand_voice_id', bvFilter),
          supabase.from('ssi_scores').select('total_score, recorded_at').eq('team_id', tid).order('recorded_at', { ascending: false }).limit(1),
        ]);
        const dealsOpen = (dealsR.data || []).filter((d: any) => d.stage !== 'gewonnen' && d.stage !== 'verloren').length;
        const dealsWon = (dealsR.data || []).filter((d: any) => d.stage === 'gewonnen').length;
        const postsByStatus: Record<string, number> = {};
        (posts.data || []).forEach((p: any) => { postsByStatus[p.status] = (postsByStatus[p.status] || 0) + 1; });
        let personal = 0, company = 0;
        (brands.data || []).forEach((b: any) => { if (b.account_type === 'company_page') company++; else personal++; });
        return { ok: true, data: {
          kontakte: leads.count || 0,
          deals_offen: dealsOpen, deals_gewonnen: dealsWon,
          aufgaben_offen: tasksOpen.count || 0, aufgaben_ueberfaellig: tasksOverdue.count || 0,
          beitraege_gesamt: (posts.data || []).length, beitraege_nach_status: postsByStatus,
          personal_brands: personal, company_brands: company,
          zielgruppen: auds.count || 0, wissenseintraege: kb.count || 0, vernetzungen: conns.count || 0,
          ssi_aktuell: ssi.data?.[0]?.total_score ?? null,
        } };
      }

      case "get_brands": {
        let q = supabase.from('brand_voices')
          .select('id, name, brand_name, account_type, is_active, mission, tonality, linkedin_style, example_texts, perspective')
          .eq('team_id', ctx.teamId)
          .order('updated_at', { ascending: false }).limit(50);
        if (input.account_type) q = q.eq('account_type', input.account_type);
        const { data, error } = await q;
        if (error) return { ok: false, error: error.message };
        const brands = (data || []).map((b: any) => ({
          id: b.id, name: b.brand_name || b.name,
          typ: b.account_type === 'company_page' ? 'Company Brand' : 'Personal Brand',
          aktiv: !!b.is_active,
          ausgefuellt: {
            mission: !!b.mission, tonalitaet: !!b.tonality,
            linkedin_stil: !!(b.linkedin_style && typeof b.linkedin_style === 'object' && Object.keys(b.linkedin_style).length),
            beispieltexte: !!b.example_texts,
          },
        }));
        return { ok: true, data: brands };
      }

      case "list_audiences": {
        const { data, error } = await supabase.from('target_audiences')
          .select('id, name, job_titles, industries, pain_points, region, is_active')
          .eq('team_id', ctx.teamId)
          .order('updated_at', { ascending: false }).limit(50);
        if (error) return { ok: false, error: error.message };
        return { ok: true, data: data || [] };
      }

      case "list_knowledge": {
        const { data, error } = await supabase.from('knowledge_base')
          .select('id, name, category, product_form, source_url, file_name')
          .eq('team_id', ctx.teamId)
          .order('updated_at', { ascending: false }).limit(50);
        if (error) return { ok: false, error: error.message };
        return { ok: true, data: data || [] };
      }

      case "list_posts": {
        const limit = Math.min(Number(input.limit) || 20, 50);
        let q = supabase.from('content_posts')
          .select('id, title, status, scheduled_at, published_at, topic')
          .eq('team_id', ctx.teamId)
          .order('updated_at', { ascending: false }).limit(limit);
        if (input.status) q = q.eq('status', String(input.status));
        const { data, error } = await q;
        if (error) return { ok: false, error: error.message };
        return { ok: true, data: data || [] };
      }

      case "get_ssi": {
        const { data, error } = await supabase.from('ssi_scores')
          .select('total_score, build_brand, find_people, engage_insights, build_relationships, industry_rank, network_rank, recorded_at, brand_voice_id')
          .eq('team_id', ctx.teamId)
          .order('recorded_at', { ascending: false }).limit(12);
        if (error) return { ok: false, error: error.message };
        const seen = new Set(); const latest: any[] = [];
        for (const r of (data || []) as any[]) { const k = r.brand_voice_id || '_'; if (!seen.has(k)) { seen.add(k); latest.push(r); } }
        return { ok: true, data: latest };
      }

      case "list_connections": {
        const limit = Math.min(Number(input.limit) || 20, 50);
        const tbvC = await supabase.from('brand_voices').select('id').eq('team_id', ctx.teamId);
        const cBvIds = ((tbvC.data as any[]) || []).map((b: any) => b.id);
        const { data, error } = await supabase.from('vernetzungen')
          .select('id, li_name, li_headline, li_company, status, sent_at, responded_at, outcome_notes')
          .in('brand_voice_id', cBvIds.length ? cBvIds : ['00000000-0000-0000-0000-000000000000'])
          .order('created_at', { ascending: false }).limit(limit);
        if (error) return { ok: false, error: error.message };
        return { ok: true, data: data || [] };
      }

      case "get_brand_memory": {
        const bvId = await resolveBrandId(input.brand_voice_id, supabase, ctx);
        if (!bvId) return { ok: false, error: 'Keine Brand angegeben und keine aktive Brand gefunden.' };
        const [mem, brand, posts] = await Promise.all([
          supabase.from('brand_memory').select('id, content, source, created_at').eq('brand_voice_id', bvId).order('created_at', { ascending: false }).limit(50),
          supabase.from('brand_voices').select('name, brand_name, account_type').eq('id', bvId).maybeSingle(),
          supabase.from('content_posts').select('id', { count: 'exact', head: true }).eq('brand_voice_id', bvId),
        ]);
        return { ok: true, data: {
          brand: (brand.data as any)?.brand_name || (brand.data as any)?.name || bvId,
          gemerkte_notizen: ((mem.data as any[]) || []).map(m => ({ id: m.id, inhalt: m.content, quelle: m.source })),
          lernt_aus_beitraegen: posts.count || 0,
        } };
      }

      case "add_brand_memory": {
        const content = String(input.content || '').trim();
        if (!content) return { ok: false, error: 'content required' };
        const bvId = await resolveBrandId(input.brand_voice_id, supabase, ctx);
        if (!bvId) return { ok: false, error: 'Keine Brand angegeben und keine aktive Brand gefunden.' };
        const { data, error } = await supabase.from('brand_memory')
          .insert({ brand_voice_id: bvId, team_id: ctx.teamId, user_id: ctx.userId, content, source: 'assistant' })
          .select('id, content').single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, data };
      }

      case "diagnose_publishing": {
        const { data, error } = await supabase.from('content_posts')
          .select('id, title, status, publishing_error, last_publish_attempt_at, scheduled_at')
          .not('publishing_error', 'is', null)
          .order('last_publish_attempt_at', { ascending: false }).limit(20);
        if (error) return { ok: false, error: error.message };
        return { ok: true, data: { mit_fehler: data || [], anzahl: (data || []).length } };
      }

      case "get_credit_status": {
        if (!ctx.accountId) return { ok: true, data: { hinweis: 'Kein aktiver Account/Plan zugeordnet.' } };
        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        const { data, error } = await admin.rpc('check_credits_for_account', { p_account_id: ctx.accountId, p_estimated_credits: 0 });
        if (error) return { ok: false, error: error.message };
        return { ok: true, data };
      }

      case "get_connection_status": {
        const { data, error } = await supabase.from('linkedin_oauth_tokens')
          .select('brand_voice_id, display_name, access_token_expires_at, revoked_at, refresh_failed_at, refresh_failure_reason, last_used_at')
          .order('updated_at', { ascending: false }).limit(20);
        if (error) return { ok: false, error: error.message };
        const now = Date.now();
        const conns = ((data as any[]) || []).map(t => ({
          brand_voice_id: t.brand_voice_id, name: t.display_name,
          status: t.revoked_at ? 'widerrufen'
            : (t.refresh_failed_at ? 'refresh_fehlgeschlagen'
            : (t.access_token_expires_at && new Date(t.access_token_expires_at).getTime() < now ? 'token_abgelaufen' : 'verbunden')),
          fehler: t.refresh_failure_reason || null,
          token_gueltig_bis: t.access_token_expires_at,
        }));
        return { ok: true, data: { linkedin_verbindungen: conns, anzahl: conns.length,
          hinweis: conns.length === 0 ? 'Keine LinkedIn-Verbindung gefunden — LinkedIn verbinden bzw. Chrome Extension installieren & einloggen.' : undefined } };
      }

      case "report_problem": {
        const summary = String(input.summary || '').trim();
        if (!summary) return { ok: false, error: 'summary required' };
        const { data, error } = await supabase.from('support_tickets')
          .insert({ user_id: ctx.userId, team_id: ctx.teamId, account_id: ctx.accountId,
            summary, details: input.details ? String(input.details) : null, area: input.area ? String(input.area) : null, source: 'assistant' })
          .select('id, summary, status').single();
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

const LEADESK_GUIDE = `Leadesk ist eine LinkedIn-Suite (Multi-Tenant SaaS). Funktionsumfang und Limits hängen vom gewählten Plan ab. Nutze diesen Überblick, um Funktionen zu erklären und beim Verständnis zu helfen.

STARTSEITE: Dashboard mit KPIs, Aktivitäten und anstehenden Aufgaben.
ASSISTENT: Das bist du — Berater für alle Fragen zu Funktionen und zu den eigenen Daten.

BRANDING (Fundament; die KI nutzt diese Angaben überall):
- Personal Brand: persönliche Markenstimme (Tonalität, Hook-Stil, CTA-Stil, Emoji-Nutzung, Sprachregeln, Beispieltexte). Per KI aus Website/LinkedIn-Profil erstellbar oder manuell.
- Company Brand: Unternehmensstimme für die LinkedIn Company Page. Ambassador-Modus: eine Personal Brand schreibt zusätzlich mit einer Company Brand — persönlich formuliert, aber mit Botschaften/Fakten des Unternehmens.
- Zielgruppen: wen man erreichen will (Position, Bedürfnisse, Pain Points, Branchen, Region). Die KI richtet Ansprache und Inhalt darauf aus.
- Wissensdatenbank: Fakten, Dokumente, URLs, LinkedIn-Profile — fließen automatisch in jede Generierung ein.
- KI-Sichtbarkeit (Auralis): misst, wie gut man in ChatGPT, Claude & Co. gefunden wird.

CONTENT:
- Text-Werkstatt: KI-Chat, der LinkedIn-Beiträge in der Brand Voice schreibt. Splitscreen: links Chat, rechts Dokument. Beiträge per Klick „ins Dokument“ übernehmen oder direkt als Beitrag in den Redaktionsplan (neu oder zu bestehendem). Markierter Text im Dokument blendet eine KI-Werkzeugleiste ein (umschreiben, kürzen/verlängern, übersetzen, Emojis, eigene Befehle). Ein Chat kann mehrere Dokumente haben, ein Dokument mehreren Chats zugeordnet sein.
- Dokumente: alle Beiträge als bearbeitbare Dokumente; zeigt je Dokument, in wie vielen Chats es liegt.
- Visuals: KI-Bilder/Grafiken zu Beiträgen (Stil/Vorlage, Referenzmedien aus der Brand, Format/Anzahl/Modell).
- Medien: Brand-Asset-Hub (Logos, Bilder, generierte Visuals).
- Redaktionsplan: Beiträge planen und terminieren (Ansichten Board/Woche/Monat/Liste). Phasen Ideen → In Arbeit → Eingeplant → Veröffentlicht; Eingeplantes wird automatisch publiziert. „Brainstormen“ liefert KI-Themenvorschläge.
- Memory: die KI lernt pro Brand aus den bisherigen Texten und Dokumenten.

SALES / CRM:
- Kontakte (Leads): Status Lead/LQL/MQL/MQN/SQL, Score, Notizen, Aktivitäten, Follow-ups.
- Unternehmen, Deals/Pipeline (Stages: interessent, prospect, qualifiziert, opportunity, angebot, verhandlung, gewonnen, verloren), Aufgaben.
- Import: per CSV oder über die Chrome Extension aus LinkedIn.

LINKEDIN / COMMUNICATION:
- Vernetzungen: personalisierte Vernetzungsanfragen (über die Chrome Extension, mit Plan-Limits).
- Nachrichten / KI-Nachrichten, Automatisierung.
- SSI-Tracker: täglicher LinkedIn Social Selling Index mit vier Säulen.
- Profiltexte: KI-optimierte LinkedIn-Profiltexte.

REPORTING: Sales Reports und SSI-Verlauf.
DELIVERY: Projekte aus gewonnenen Deals (Kanban) — Workflow nach Deal-Gewinn.
ADMIN: Benutzerverwaltung, Whitelabel, Tenants, Changelog, Dokumentation.

WICHTIGE KONZEPTE:
- Chrome Extension: Brücke zu LinkedIn (Lead-Import, Auto-Vernetzung, SSI-Scraping, Nachrichten). Muss installiert sein.
- Brand-Wechsel: oben im Header zwischen Personal- und Company Brands wechseln; jede Brand hat eigenen Content und eigenes Memory.
- Plan & Credits: KI-Funktionen verbrauchen Credits; Limits richten sich nach dem Plan (Verbrauch ist in der App sichtbar).
- Geführte Touren: pro Bereich (Content, Branding), startbar über das Fragezeichen oben rechts oder unter „Erste Schritte“ (Profil-Menü).

AUFBAU / EBENEN (kannst du dem User erklären):
- USER-EBENE (nur für die einzelne Person): Profil, bevorzugtes KI-Modell, aktive Brand-Auswahl, Memory an/aus, Onboarding-/Touren-Status sowie persönliche Konventionen für den Assistenten. Gilt nur für dich.
- TEAM-/ACCOUNT-EBENE (im Team geteilt): fast alle Geschäftsdaten — Kontakte, Unternehmen, Deals, Pipeline, Aufgaben — und auch die Brands, Zielgruppen, Wissensdatenbank und Beiträge. Jedes Teammitglied sieht und bearbeitet sie. Zweck: gemeinsam am selben Bestand arbeiten.
- BRAND-EBENE (pro Markenstimme): der gesamte Content hängt an einer Brand — Text-Werkstatt-Chats, Dokumente, Beiträge, Visuals/Medien, SSI, Vernetzungen UND das Content-Memory. Wechselt man oben im Header die Brand, wechselt der komplette Content-Kontext. Zweck: jede Person/Marke hat eigene Stimme, Themen und Lerndaten — die KI vermischt sie nicht.
Faustregel: Content-Funktionen sind brand-gebunden (die aktive Brand zählt), CRM/LinkedIn/Reporting sind team-geteilt, Einstellungen/Modell/Touren sind user-persönlich.`;

const TROUBLESHOOTING_GUIDE = `## Technischer Support — häufige Probleme & Lösungswege:
- "KI-Generierung schlägt fehl / antwortet nicht": Credits prüfen (get_credit_status) — bei aufgebraucht Top-Up/Plan; sicherstellen, dass oben eine Brand aktiv ist. Bei sporadischem Bildgenerierungs-Fehler: einmal erneut versuchen (bekannte Flakiness bei manchen Bild-Modellen).
- "Beitrag wurde nicht veröffentlicht": diagnose_publishing nutzen (zeigt die Fehlermeldung). Oft abgelaufene LinkedIn-Verbindung → get_connection_status, dann LinkedIn neu verbinden.
- "LinkedIn/Extension verbindet nicht": get_connection_status (Token abgelaufen/widerrufen/Refresh-Fehler). Lösung: LinkedIn neu verbinden; Chrome Extension installieren, einloggen, Seite neu laden. Vernetzungen, SSI und Nachrichten laufen über die Extension.
- "SSI aktualisiert nicht": SSI wird über die Extension täglich erfasst — Extension muss installiert/eingeloggt sein und LinkedIn besucht werden. get_ssi zeigt das letzte Datum.
- "Neue Funktion/Änderung nicht sichtbar": Hard-Refresh (Cmd/Strg+Shift+R) — der Browser hält manchmal alte Versionen.
- "Limit erreicht": plan-abhängige Limits (Vernetzungen/Tag, Credits/Monat) — Plan/Top-Up prüfen.
Vorgehen bei technischen Problemen: erst mit den Diagnose-Tools die Ursache eingrenzen und einen konkreten Lösungsweg nennen. Der User kann dir Screenshots, Bilder oder PDFs anhängen — sieh sie dir genau an (Fehlermeldung, Bildschirminhalt) und beziehe dich konkret darauf. Wenn du es nicht lösen kannst oder der User eskalieren möchte: mit report_problem ein Support-Ticket anlegen (Problem vorher klar zusammenfassen).`;

const SYSTEM_PROMPT_BASE = `Du bist Leadly, der interne Assistent und Produkt-Berater von Leadesk — einer LinkedIn-Suite. Du kennst jede Funktion von Leadesk und alle Daten des Users (Kontakte, Deals, Aufgaben, Brand Voices, Zielgruppen, Wissensdatenbank, Beiträge, SSI, Vernetzungen) und hilfst bei allen Fragen.

Deine zwei Rollen:
1) BERATER & SUPPORT: Erkläre Funktionen und hilf weiter, wenn der User etwas nicht versteht („Wie funktioniert X?“, „Wo finde ich Y?“, „Was bedeutet Z?“). Stütze dich auf den „Leadesk-Funktionsüberblick“ weiter unten. Antworte klar, freundlich und konkret, mit konkreten Schritten („Geh auf …, dann klick …“). Wenn etwas planabhängig ist oder du es nicht sicher weißt, sag das ehrlich, statt zu raten.
2) AKTIVER CRM-ASSISTENT: Du kannst Kontakte und Aufgaben anlegen, Deals managen, Daten durchsuchen und Status ändern.

Daten des Users: Für Fragen zu den konkreten Daten des Users IMMER die Lese-Tools nutzen (get_account_overview, get_brands, list_audiences, list_knowledge, list_posts, get_ssi, list_connections, get_brand_memory, search_leads) statt zu raten oder Zahlen zu erfinden.

Ebenen: Leadesk hat drei Ebenen — User (persönlich), Team/Account (geteilt) und Brand (pro Markenstimme). Du weißt, auf welcher Ebene welche Funktion liegt (siehe Funktionsüberblick) und welche Brand/welches Team gerade aktiv ist (siehe „Aktueller Kontext"). Erkläre das auf Nachfrage konkret.

Brand-Memory: Jede Brand hat eine kuratierte Memory. Mit get_brand_memory zeigst du sie, mit add_brand_memory ergänzt du auf Wunsch des Users eine Notiz/Regel — diese fließt dann in die Content-Generierung dieser Brand ein.

Technischer Support: Bei technischen Problemen ('X geht nicht', Fehlermeldung, 'nicht veröffentlicht', 'LinkedIn verbindet nicht') grenzt du die Ursache mit den Diagnose-Tools ein (diagnose_publishing, get_credit_status, get_connection_status) und nennst einen konkreten Lösungsweg (siehe Technischer-Support-Abschnitt). Wenn du es nicht lösen kannst oder der User eskalieren will, legst du mit report_problem ein Support-Ticket an.

Du darfst auch erklären, was du selbst alles kannst, und schlägst nach einer Antwort ggf. einen sinnvollen nächsten Schritt vor (kurz, nicht aufdringlich).

Antworte immer auf Deutsch, kurz und konkret. Bei klaren Aufträgen frage NICHT nach allen Feldern — leg den Datensatz mit dem an was du hast, der User kann ihn später ergänzen.

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
  contextInfo = '',
) {
  const parts = [SYSTEM_PROMPT_BASE, '\n\n## Leadesk-Funktionsüberblick (nutze ihn für Support- und Verständnisfragen):\n' + LEADESK_GUIDE, '\n\n' + TROUBLESHOOTING_GUIDE];
  if (contextInfo) parts.push('\n\n' + contextInfo);
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

    // Service-role admin client für getCallerContext + record_usage
    const adminForCredits = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const caller = await getCallerContext(req, adminForCredits);
    if (!caller) return json({ error: 'Invalid token' }, 401);
    const userId = caller.user_id;

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'chat';
    const teamId = body.team_id || caller.team_id || null;
    const ctx = { userId, teamId, accountId: caller.account_id };

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

      // Pre-Call Credits-Gate für Briefing-LLM-Call
      const estBrief = await estimateCredits('anthropic', DEFAULT_MODEL, 'text_generate', {
        input_chars: briefingPrompt.length, max_output_tokens: 600,
      }, adminForCredits);
      const checkBrief = await checkCredits(caller.account_id, estBrief, adminForCredits);
      if (!checkBrief.allowed) {
        return json({
          error: 'Credits aufgebraucht — Briefing kann nicht erzeugt werden.',
          code: 'credits_exhausted', reason: checkBrief.reason,
          remaining: checkBrief.remaining, estimated: estBrief,
        }, 402);
      }

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

      // Post-Call: record_usage mit echten Token-Counts aus aj.usage
      await recordUsage(caller, {
        edge_function: 'leadly',
        operation: 'text_generate',
        provider: 'anthropic',
        model: DEFAULT_MODEL,
        input_tokens: aj.usage?.input_tokens,
        output_tokens: aj.usage?.output_tokens,
        status: 'success',
        extra_metadata: { mode: 'briefing' },
      }, adminForCredits).catch(() => null);

      const text = (aj.content || []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('\n').trim();
      await persistBriefing(text);
      return json({ briefing_text: text, context, briefing_date: today });
    }

    // ─── Confirmed write execution (Guardrail-Freigabe) ──────────────
    // Frontend ruft nach User-Klick „Übernehmen" mit confirmed_action. Es wird
    // GENAU dieses bestätigte Tool ausgeführt (RLS-scoped als der User) + auditiert.
    // Kein LLM-Call, kein Credit-Gate (Tools sind kostenlos).
    if (body.confirmed_action && typeof body.confirmed_action === 'object') {
      const ca = body.confirmed_action as { name?: string; input?: Record<string, unknown> };
      const caName = String(ca.name || '');
      if (!WRITE_TOOLS.has(caName)) {
        return json({ error: 'Unbekannte oder nicht bestätigungspflichtige Aktion.' }, 400);
      }
      const caInput = (ca.input && typeof ca.input === 'object') ? ca.input as Record<string, unknown> : {};

      // B2.3 — Vorher-Zustand für Undo sichern (nur bei update-/complete-Tools).
      let beforeState: Record<string, unknown> | null = null;
      if (BEFORE_CAPTURE[caName]) {
        const [tbl, idf] = BEFORE_CAPTURE[caName];
        const idv = caInput[idf];
        if (idv) {
          const { data: row } = await supabase.from(tbl).select('*').eq('id', idv).maybeSingle();
          beforeState = (row as Record<string, unknown>) || null;
        }
      }

      const result = await executeTool(caName, caInput, supabase, ctx);
      // Audit (service-role; darf den Flow nie blocken) — Insert mit before-State + id zurück.
      let auditId: string | null = null;
      try {
        const { data: auditRow } = await adminForCredits.from('leadly_action_audit').insert({
          user_id: userId, team_id: teamId, account_id: caller.account_id,
          tool_name: caName, tool_input: caInput, result, before: beforeState,
          ok: !!(result as { ok?: boolean }).ok, confirmed: true,
        }).select('id').single();
        auditId = auditRow?.id || null;
      } catch (_e) { /* audit non-blocking */ }
      const ok = !!(result as { ok?: boolean }).ok;
      const okMsg = ok ? 'Erledigt.' : ('Das hat nicht geklappt: ' + ((result as { error?: string }).error || 'unbekannter Fehler') + '.');
      // Revertierbar, wenn erfolgreich + kein Revert selbst + create/update-Tool.
      const revertible = ok && caName !== 'revert_action'
        && (BEFORE_CAPTURE[caName] !== undefined || ['create_lead', 'create_task', 'create_deal', 'add_brand_memory'].includes(caName));
      return json({
        reply: { role: 'assistant', content: okMsg, tool_calls: null },
        tool_results: [{ tool_use_id: 'confirmed-' + caName, name: caName, output: result }],
        executed: true,
        audit_id: auditId,
        revertible,
        model: DEFAULT_MODEL,
        finish_reason: 'confirmed',
        iterations: 0,
      });
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

    // ─── Datei-/Bild-Anhänge → an die letzte User-Message als multimodale
    //     Content-Blocks hängen (Anthropic base64). Bilder + PDFs liest das
    //     Modell direkt; andere Typen werden als Text-Hinweis erwähnt. ──────
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    if (attachments.length && lastUserMsg) {
      const txt = typeof lastUserMsg.content === 'string' ? lastUserMsg.content : '';
      const blocks: Array<Record<string, unknown>> = [];
      if (txt) blocks.push({ type: 'text', text: txt });
      for (const a of attachments.slice(0, 5)) {
        const data = typeof a?.base64 === 'string' ? a.base64 : '';
        const mime = typeof a?.type === 'string' ? a.type : '';
        if (!data || !mime) continue;
        if (mime.startsWith('image/')) {
          blocks.push({ type: 'image', source: { type: 'base64', media_type: mime, data } });
        } else if (mime === 'application/pdf') {
          blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } });
        } else {
          blocks.push({ type: 'text', text: `[Anhang "${a?.name || 'Datei'}" (${mime}) — Format kann nicht direkt gelesen werden.]` });
        }
      }
      if (blocks.length === 0) blocks.push({ type: 'text', text: txt || '(Anhang)' });
      else if (!txt) blocks.unshift({ type: 'text', text: 'Hier ist mein Anhang:' });
      lastUserMsg.content = blocks;
    }

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
    const activeBrand = await loadActiveBrand(adminForCredits, userId);
    const contextInfo = '## Aktueller Kontext des Users (Ebenen):\n'
      + '- Team-/Account-Ebene aktiv: geteilte Daten (Kontakte, Deals, Aufgaben, Brands, Zielgruppen, Wissen, Beiträge).\n'
      + (activeBrand
          ? '- Aktive Brand (Brand-Ebene): „' + activeBrand.label + '" (' + activeBrand.typ + '). Der gesamte Content (Text-Werkstatt, Dokumente, Beiträge, Visuals, Memory, SSI, Vernetzungen) bezieht sich auf DIESE Brand. Brand-Memory-Tools nutzen sie als Default.'
          : '- Aktuell ist KEINE Brand ausgewählt. Für content-/brand-spezifische Aktionen den User bitten, oben eine Brand zu wählen.');
    const dynamicSystemPrompt = buildSystemPrompt(
      retrievedMemories, preferences,
      accountMemories, accountPreferences,
      contextInfo,
    );

    const toolResults: Array<{ tool_use_id: string; name: string; output: unknown }> = [];
    let lastAssistantBlocks: unknown[] = [];
    let lastFinish = 'unknown';
    let iter = 0;

    // Pre-Call Credits-Gate VOR der Tool-Use-Loop.
    // Estimate: input wächst mit jeder Iteration (tool_results+system_prompt akkumulieren).
    // Konservative Schätzung: max 3 Iterationen × ~(systemPrompt + messages).
    const conversationChars = anthropicMessages.reduce((s, m) => s + String(m.content || '').length, 0);
    const estChat = await estimateCredits('anthropic', DEFAULT_MODEL, 'text_generate', {
      input_chars: (dynamicSystemPrompt.length + conversationChars) * 3,
      max_output_tokens: 2048 * 3,
    }, adminForCredits);
    const checkChat = await checkCredits(caller.account_id, estChat, adminForCredits);
    if (!checkChat.allowed) {
      return json({
        error: checkChat.reason === 'monthly_budget_exceeded'
          ? 'Monatliches Credit-Budget aufgebraucht.'
          : checkChat.reason === 'daily_cap_exceeded'
          ? 'Tägliches Limit erreicht.'
          : 'Credit-Check fehlgeschlagen.',
        code: 'credits_exhausted',
        reason: checkChat.reason,
        remaining: checkChat.remaining,
        estimated: estChat,
      }, 402);
    }

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

      // Post-Call: record_usage pro Iteration mit echten Token-Counts
      await recordUsage(caller, {
        edge_function: 'leadly',
        operation: 'text_generate',
        provider: 'anthropic',
        model: DEFAULT_MODEL,
        input_tokens: aj.usage?.input_tokens,
        output_tokens: aj.usage?.output_tokens,
        status: 'success',
        extra_metadata: { mode: 'chat', iteration: iter, has_tools: true },
      }, adminForCredits).catch(() => null);

      lastAssistantBlocks = aj.content || [];
      lastFinish = aj.stop_reason || 'unknown';

      // Tool-Use erkennen
      const toolUses = lastAssistantBlocks.filter((b: { type: string }) => b.type === 'tool_use') as Array<{ id: string; name: string; input: Record<string, unknown> }>;

      if (toolUses.length === 0 || lastFinish !== 'tool_use') {
        break; // Final assistant message
      }

      // ─── Guardrail: WRITE-Tools NIE autonom ausführen ──────────────
      // Will das Modell ein schreibendes/außenwirksames Tool nutzen, führen wir
      // es NICHT aus, sondern geben es als pending_action zur Bestätigung zurück.
      // (Lese-Tools in derselben Runde werden dann ebenfalls nicht ausgeführt —
      //  selten; der Loop endet hier. Der orphan tool_use im persistierten Verlauf
      //  wird beim nächsten Replay ohnehin verworfen, s. Filter oben.)
      const writeUses = toolUses.filter(tu => WRITE_TOOLS.has(tu.name));
      if (writeUses.length > 0) {
        const preamble = lastAssistantBlocks
          .filter((b: { type: string }) => b.type === 'text')
          .map((b: { text: string }) => b.text).join('\n').trim();
        return json({
          reply: { role: 'assistant', content: preamble || null, tool_calls: null },
          pending_actions: writeUses.map(tu => ({
            tool_use_id: tu.id, name: tu.name, input: tu.input || {},
            summary: summarizeAction(tu.name, tu.input || {}),
          })),
          requires_confirmation: true,
          tool_results: [],
          model: DEFAULT_MODEL,
          finish_reason: 'pending_confirmation',
          iterations: iter,
          learning_scope: learningScope,
        });
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

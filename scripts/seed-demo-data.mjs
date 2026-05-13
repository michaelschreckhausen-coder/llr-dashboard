#!/usr/bin/env node
// =============================================================================
// Demo-Daten-Seed für info@leadesk.de — Volume-Inserts (Teil 2 von 2)
// =============================================================================
// Teil 1 (Setup, brand_voices/target_audiences/knowledge_base/pm_projects/columns)
// läuft als SQL-Migration: supabase/migrations/20260513120000_demo_data_*.sql
//
// Dieser Script-Teil seedet die volumigen Tabellen via @supabase/supabase-js
// mit service_role-Key. Realistische Verteilungen via @faker-js/faker (de-AT/
// de-DE Locale) + reproduzierbarer Seed (faker.seed(42)).
//
// USAGE:
//   export SUPABASE_URL='https://<prod-host>'
//   export SUPABASE_SERVICE_ROLE_KEY='...'
//   node scripts/seed-demo-data.mjs [--dry-run]
//
// PROD-WARNING: Schreibt direkt auf den angegebenen Supabase-Endpoint. Erst
// gegen Staging-DB testen wenn möglich (falls dort die Account-IDs existieren).
//
// Idempotency: prüft pre-flight ob Demo-Leads bereits existieren — abortet
// dann mit klarer Meldung.
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import { faker } from '@faker-js/faker/locale/de';

// ─── Constants ──────────────────────────────────────────────────────────────

const DEMO_ACCOUNT_ID = '692eab89-baa8-4cc9-9315-f068b8797609';
const DEMO_TEAM_ID    = 'ada0b02b-fb10-4967-b55f-44eeb0c2b663';
const DEMO_USER_ID    = '2b6b5a17-c6c9-47af-bc57-83825286c0d2';

const DRY_RUN = process.argv.includes('--dry-run');

// Reproducible seed → gleicher Run = gleiche Daten
faker.seed(42);

// ─── Pricing-Table (synchron mit supabase/functions/generate/index.ts) ──────

const PRICING_EUR_PER_1M = {
  'claude-opus-4-7':      { input: 13.80, output: 69.00 },
  'claude-sonnet-4-6':    { input:  2.76, output: 13.80 },
  'claude-haiku-4-5':     { input:  0.92, output:  4.60 },
  'gpt-4o':               { input:  2.30, output:  9.20 },
  'gpt-4o-mini':          { input:  0.14, output:  0.55 },
  'gemini-1.5-flash':     { input:  0.07, output:  0.28 },
  'mistral-small-latest': { input:  0.18, output:  0.55 },
};
function costEur(model, inT, outT) {
  const p = PRICING_EUR_PER_1M[model];
  if (!p) return null;
  return Number(((inT / 1_000_000) * p.input + (outT / 1_000_000) * p.output).toFixed(6));
}

// ─── Distributions / Helpers ────────────────────────────────────────────────

function pickWeighted(items) {
  // items: [[value, weight], ...]
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = faker.number.float({ min: 0, max: total });
  for (const [v, w] of items) {
    r -= w;
    if (r <= 0) return v;
  }
  return items[items.length - 1][0];
}

function logNormalInt(median, sigma) {
  // Log-normal-distributed int (median = exp(mu))
  const u = faker.number.float({ min: 0.01, max: 0.99 });
  const v = faker.number.float({ min: 0.01, max: 0.99 });
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); // Box-Muller
  return Math.max(1, Math.round(median * Math.exp(sigma * z)));
}

function weekdayBiased30dTimestamp() {
  // Mo-Do peak, Fr/Sa/So niedriger. Last-30-days.
  const daysAgo = faker.number.int({ min: 0, max: 30 });
  const target = new Date();
  target.setUTCDate(target.getUTCDate() - daysAgo);
  // Reject Fr/Sa/So 70% der Zeit (1 retry → milde Weekday-Bias)
  const dayOfWeek = target.getUTCDay(); // 0=So, 6=Sa
  if ((dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6) && faker.number.float() < 0.7) {
    return weekdayBiased30dTimestamp();
  }
  // Random hour 7-19 UTC (= 8-20 CET)
  target.setUTCHours(
    faker.number.int({ min: 7, max: 19 }),
    faker.number.int({ min: 0, max: 59 }),
    faker.number.int({ min: 0, max: 59 })
  );
  return target.toISOString();
}

function uniform30dTimestamp() {
  const daysAgo = faker.number.float({ min: 0, max: 30 });
  const t = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return t.toISOString();
}

// ─── Hardcoded German B2B Pools (statt Faker für realistische Demo) ────────

const GERMAN_LASTNAMES = [
  'Müller','Schmidt','Schneider','Fischer','Weber','Meyer','Wagner','Becker',
  'Schulz','Hoffmann','Schäfer','Koch','Bauer','Richter','Klein','Wolf',
  'Schröder','Neumann','Schwarz','Zimmermann','Hartmann','Braun','Krüger',
  'Schmitt','Hofmann','Schmid','Lange','Werner','Krause','Lehmann','Köhler',
  'Herrmann','König','Walter','Mayer','Huber','Kaiser','Fuchs','Peters',
  'Lang','Scholz','Möller','Weiß','Jung','Hahn','Schubert','Vogel','Keller',
];
const GERMAN_FIRSTNAMES = [
  'Anna','Tobias','Sarah','Markus','Lisa','Florian','Julia','Daniel','Katharina',
  'Stefan','Vanessa','Lukas','Nicole','Christian','Sandra','Patrick','Maria',
  'Alexander','Sophie','Andreas','Laura','Sebastian','Carolin','Michael','Lena',
  'Benjamin','Verena','Philipp','Jasmin','Matthias','Antonia','Felix','Hannah',
  'Jonas','Lara','Maximilian','Eva','Christoph','Theresa','Niklas','Mara',
];
const GERMAN_CITIES = [
  'Hamburg','München','Köln','Frankfurt','Stuttgart','Düsseldorf','Berlin',
  'Leipzig','Hannover','Bremen','Nürnberg','Essen','Dortmund','Dresden','Bonn',
  'Karlsruhe','Mannheim','Münster','Freiburg','Augsburg','Wiesbaden','Mainz',
  'Aachen','Heidelberg','Regensburg','Ingolstadt','Würzburg','Heilbronn',
];
const INDUSTRY_WORDS = [
  'Logistik','Consulting','Solutions','Group','Industries','Engineering',
  'FinTech','MedTech','Software','Tech','Manufacturing','Services','Partners',
  'Cloud','Digital','Holding','Systems','Innovation','Beratung','Capital',
];
const COMPANY_SUFFIXES = ['GmbH','AG','SE','GmbH & Co. KG','Holding'];
// industry_slug-Werte (FK auf public.industries) — siehe Migration
// 20260513140000_demo_industries_seed.sql für die korrespondierenden Rows.
const INDUSTRIES = [
  'saas','industrie','consulting','fintech','martech','logistik','engineering',
  'medtech','cloud-services','b2b-marketplace',
];
const JOB_TITLES = [
  'Head of Sales','Sales Director','VP Sales','Geschäftsführer',
  'Marketing Manager','Head of Operations','CMO','Founder','CTO',
  'Head of Customer Success','Account Executive','Account Manager',
  'Business Development Manager','Sales Operations Lead',
];

function pickGermanFullName() {
  return [
    faker.helpers.arrayElement(GERMAN_FIRSTNAMES),
    faker.helpers.arrayElement(GERMAN_LASTNAMES),
  ];
}
function pickGermanCompany() {
  // "Bauer Logistik GmbH" — single lastname + industry-word + suffix
  const name   = faker.helpers.arrayElement(GERMAN_LASTNAMES);
  const word   = faker.helpers.arrayElement(INDUSTRY_WORDS);
  const suffix = faker.helpers.arrayElement(COMPANY_SUFFIXES);
  return `${name} ${word} ${suffix}`;
}
function companyToDomain(companyName) {
  // "Bauer Logistik GmbH" → "bauer-logistik.de"
  const stem = companyName
    .replace(/\s+(GmbH|AG|SE|KG|& Co\.|Holding).*/g, '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `https://${stem}.de`;
}
const LEAD_STATUS_DIST = [
  ['Lead', 30], ['LQL', 20], ['MQL', 15], ['MQN', 10], ['SQL', 5],
];
const DEAL_STAGE_DIST = [
  ['prospect',    8],  // "Demo geplant"
  ['angebot',     6],
  ['verhandlung', 5],
  ['gewonnen',    4],
  ['verloren',    2],
];
const TASK_PRIORITY_DIST    = [['low', 1], ['normal', 3], ['high', 1]];
const TASK_STATUS_DIST      = [['open', 6], ['done', 3], ['cancelled', 1]];
const PM_TASK_PRIORITY_DIST = [['low', 1], ['medium', 4], ['high', 3], ['urgent', 1]];

const PROVIDER_MODEL_DIST = [
  ['anthropic', 'claude-sonnet-4-6',    50],
  ['anthropic', 'claude-haiku-4-5',     15],
  ['openai',    'gpt-4o-mini',          15],
  ['openai',    'gpt-4o',               10],
  ['google',    'gemini-1.5-flash',      5],
  ['mistral',   'mistral-small-latest',  5],
];
const FEATURE_DIST = [
  ['brand_voice',      10], ['target_audience',   15],
  ['redaktion',        35], ['lead_enrich',       20],
  ['profiltext',       10], ['assistant',         10],
];

// ─── Generators ─────────────────────────────────────────────────────────────

function genOrganizations(n) {
  return Array.from({ length: n }, () => {
    const industry = faker.helpers.arrayElement(INDUSTRIES);
    const name     = pickGermanCompany();
    return {
      name,
      website:      companyToDomain(name),
      industry_slug: industry,
      city:         faker.helpers.arrayElement(GERMAN_CITIES),
      country:      'DE',
      notes:        `[DEMO] ${faker.company.catchPhrase()}`,
      team_id:      DEMO_TEAM_ID,
      user_id:      DEMO_USER_ID,
      created_by:   DEMO_USER_ID,
      created_at:   uniform30dTimestamp(),
      updated_at:   new Date().toISOString(),
    };
  });
}

function genLeads(n, orgIds) {
  const statusList = LEAD_STATUS_DIST.flatMap(([s, w]) => Array(w).fill(s)); // 80 entries
  faker.helpers.shuffle(statusList);
  return statusList.slice(0, n).map((status, i) => {
    const [firstName, lastName] = pickGermanFullName();
    const company = pickGermanCompany();
    // Score korreliert mit Status: SQL → 75-95, MQN → 65-85, MQL → 50-75, LQL → 35-65, Lead → 20-55
    const scoreBase = { Lead: 35, LQL: 50, MQL: 60, MQN: 75, SQL: 85 }[status];
    const score = Math.min(99, Math.max(1, scoreBase + faker.number.int({ min: -15, max: 15 })));
    const emailLocal = `${firstName}.${lastName}`.toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
    const linkedinSlug = `${firstName}-${lastName}`.toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
    return {
      name:         `${firstName} ${lastName}`,
      first_name:   firstName,
      last_name:    lastName,
      email:        `${emailLocal}@${companyToDomain(company).replace('https://','').replace('/','')}`,
      phone:        faker.phone.number({ style: 'international' }),
      company,
      job_title:    faker.helpers.arrayElement(JOB_TITLES),
      linkedin_url: `https://linkedin.com/in/${linkedinSlug}-${faker.number.int({ min: 10000, max: 99999 })}`,
      location:     `${faker.helpers.arrayElement(GERMAN_CITIES)}, DE`,
      status,
      lead_score:   score,
      source:       faker.helpers.arrayElement(['linkedin', 'referral', 'event', 'inbound', 'cold_outreach']),
      tags:         faker.helpers.arrayElements(['enterprise','dach','webinar-lead','referral','warm','hot','cold'], { min: 0, max: 3 }),
      notes:        `[DEMO] ${faker.lorem.sentence({ min: 8, max: 18 })}`,
      next_followup: faker.helpers.maybe(() => uniform30dTimestamp(), { probability: 0.6 }),
      owner_id:     DEMO_USER_ID,
      organization_id: faker.helpers.arrayElement([null, ...orgIds, ...orgIds]), // ~66% mit org
      team_id:      DEMO_TEAM_ID,
      user_id:      DEMO_USER_ID,
      created_by:   DEMO_USER_ID,
      created_at:   uniform30dTimestamp(),
      updated_at:   new Date().toISOString(),
    };
  });
}

function genDeals(n, leads) {
  const stageList = DEAL_STAGE_DIST.flatMap(([s, w]) => Array(w).fill(s));
  faker.helpers.shuffle(stageList);
  // Bevorzuge Deals für höher-scored Leads (LQL/MQL/MQN/SQL)
  const eligibleLeads = leads.filter(l => l.status !== 'Lead').sort(() => Math.random() - 0.5);
  return stageList.slice(0, n).map((stage, i) => {
    const lead = eligibleLeads[i % eligibleLeads.length];
    const value = logNormalInt(15000, 0.8); // median 15k, log-normal
    const probability = { prospect: 30, angebot: 50, verhandlung: 70, gewonnen: 100, verloren: 0 }[stage];
    const isClosed = stage === 'gewonnen' || stage === 'verloren';
    const expClose = new Date();
    expClose.setUTCDate(expClose.getUTCDate() + (isClosed ? -faker.number.int({ min: 1, max: 25 }) : faker.number.int({ min: 5, max: 60 })));
    return {
      title:        `[DEMO] ${faker.helpers.arrayElement(['Q2-Vertrag','Pilot-Phase','Roll-out','Renewal','Pro-Plan-Upgrade','Enterprise-Lizenz'])} — ${lead.company}`,
      lead_id:      lead.id,
      team_id:      DEMO_TEAM_ID,
      owner_id:     DEMO_USER_ID,
      value,
      currency:     'EUR',
      stage,
      probability,
      expected_close_date: expClose.toISOString().slice(0, 10),
      closed_at:    isClosed ? new Date(Date.now() - faker.number.int({ min: 1, max: 25 }) * 86400000).toISOString() : null,
      lost_reason:  stage === 'verloren' ? faker.helpers.arrayElement(['Budget gestrichen', 'Wettbewerber gewählt', 'Timing nicht passend']) : null,
      description:  `[DEMO] ${faker.lorem.sentence({ min: 6, max: 14 })}`,
      next_step:    !isClosed ? faker.helpers.arrayElement(['Demo-Call vereinbaren', 'Angebot nachfassen', 'Decision-Maker einbeziehen', 'Pricing klären']) : null,
      organization_id: lead.organization_id,
      created_by:   DEMO_USER_ID,
      created_at:   uniform30dTimestamp(),
      updated_at:   new Date().toISOString(),
    };
  });
}

function genLeadTasks(n, leadIds) {
  return Array.from({ length: n }, () => {
    const status = pickWeighted(TASK_STATUS_DIST);
    const isPast = faker.number.float() < 0.4; // 40% überfällig
    const due = new Date();
    due.setUTCDate(due.getUTCDate() + (isPast ? -faker.number.int({ min: 1, max: 14 }) : faker.number.int({ min: 0, max: 21 })));
    return {
      lead_id:      faker.helpers.arrayElement(leadIds),
      team_id:      DEMO_TEAM_ID,
      created_by:   DEMO_USER_ID,
      assigned_to:  DEMO_USER_ID,
      title:        `[DEMO] ${faker.helpers.arrayElement(['Follow-up Call', 'LinkedIn-Nachricht senden', 'Vernetzungs-Anfrage','Angebot vorbereiten','Discovery-Call','Demo durchführen','Decision-Maker einbeziehen','Re-Engagement'])}`,
      description:  `[DEMO] ${faker.lorem.sentence({ min: 5, max: 12 })}`,
      due_date:     due.toISOString().slice(0, 10),
      priority:     pickWeighted(TASK_PRIORITY_DIST),
      status,
      completed_at: status === 'done' ? new Date(Date.now() - faker.number.int({ min: 1, max: 20 }) * 86400000).toISOString() : null,
      created_at:   uniform30dTimestamp(),
      updated_at:   new Date().toISOString(),
    };
  });
}

function genContentPosts(n) {
  // 15 published (last 4 weeks), 12 scheduled (next 2 weeks), 8 draft
  const posts = [];
  const types = [
    { status: 'published', count: 15, getDate: () => new Date(Date.now() - faker.number.int({ min: 1, max: 28 }) * 86400000) },
    { status: 'scheduled', count: 12, getDate: () => new Date(Date.now() + faker.number.int({ min: 1, max: 14 }) * 86400000) },
    { status: 'draft',     count: 8,  getDate: () => new Date(Date.now() - faker.number.int({ min: 0, max: 7 }) * 86400000) },
  ];
  for (const t of types) {
    for (let i = 0; i < t.count; i++) {
      const d = t.getDate();
      posts.push({
        user_id:      DEMO_USER_ID,
        title:        `[DEMO] ${faker.helpers.arrayElement(['LinkedIn-Pipeline','Brand-Voice','Outreach-Tipps','Sales-Math','Webinar-Recap','Customer-Story','Founder-Insight','Pricing','Hiring'])}: ${faker.lorem.sentence({ min: 4, max: 8 })}`,
        content:      faker.lorem.paragraphs({ min: 2, max: 4 }, '\n\n'),
        platform:     'linkedin',
        status:       t.status,
        scheduled_at: t.status === 'scheduled' ? d.toISOString() : null,
        published_at: t.status === 'published' ? d.toISOString() : null,
        tags:         faker.helpers.arrayElements(['B2B','Sales','LinkedIn','AI','Outreach','Growth'], { min: 1, max: 3 }),
        notes:        `[DEMO]`,
        is_demo_data: true,
        created_at:   t.status === 'published' ? d.toISOString() : (t.status === 'draft' ? d.toISOString() : new Date(Date.now() - faker.number.int({ min: 0, max: 14 }) * 86400000).toISOString()),
        updated_at:   new Date().toISOString(),
      });
    }
  }
  return posts;
}

function genPmTasks(n, columnsByProject) {
  // columnsByProject: { project_id: [col_id_todo, col_id_inprogress, col_id_review, col_id_done] }
  const projectIds = Object.keys(columnsByProject);
  // Distribution: 40% To Do, 30% In Progress, 15% Review, 15% Done
  return Array.from({ length: n }, () => {
    const projectId = faker.helpers.arrayElement(projectIds);
    const cols      = columnsByProject[projectId];
    const colIdx    = pickWeighted([[0, 4], [1, 3], [2, 1.5], [3, 1.5]]);
    const columnId  = cols[colIdx];
    return {
      column_id:    columnId,
      project_id:   projectId,
      user_id:      DEMO_USER_ID,
      title:        `[DEMO] ${faker.helpers.arrayElement(['Outreach-Sequenz','Pricing-Page','Customer-Demo','Webinar-Slides','Onboarding-Email','Pipeline-Review','Q2-Goals','CRM-Cleanup','LinkedIn-Post','Sales-Coaching'])} — ${faker.lorem.words({ min: 2, max: 4 })}`,
      description:  `[DEMO] ${faker.lorem.sentence({ min: 8, max: 16 })}`,
      priority:     pickWeighted(PM_TASK_PRIORITY_DIST),
      due_date:     faker.helpers.maybe(() => new Date(Date.now() + faker.number.int({ min: -5, max: 14 }) * 86400000).toISOString().slice(0, 10), { probability: 0.7 }),
      tags:         faker.helpers.arrayElements(['internal','customer','urgent','blocked'], { min: 0, max: 2 }),
      position:     faker.number.int({ min: 0, max: 100 }),
      estimated_hours: faker.helpers.maybe(() => faker.number.float({ min: 0.5, max: 8, fractionDigits: 1 }), { probability: 0.4 }),
      assignee_name: 'Demo-User',
      is_billable:  false,
      created_at:   uniform30dTimestamp(),
      updated_at:   new Date().toISOString(),
    };
  });
}

function genAiUsageLog(n) {
  return Array.from({ length: n }, () => {
    const providerModel = pickWeighted(PROVIDER_MODEL_DIST.map(pm => [[pm[0], pm[1]], pm[2]]));
    const [provider, model] = providerModel;
    const isError = faker.number.float() < 0.05;
    const inT  = isError ? 0 : logNormalInt(800, 0.8);
    const outT = isError ? 0 : logNormalInt(600, 0.7);
    const cost = isError ? null : costEur(model, inT, outT);
    return {
      user_id:    DEMO_USER_ID,
      account_id: DEMO_ACCOUNT_ID,
      team_id:    DEMO_TEAM_ID,
      provider,
      model,
      feature:    pickWeighted(FEATURE_DIST),
      input_tokens:  inT,
      output_tokens: outT,
      estimated_cost_eur: cost,
      duration_ms: isError ? faker.number.int({ min: 200, max: 1500 }) : logNormalInt(3500, 0.6),
      status:     isError ? 'error' : 'success',
      error:      isError ? faker.helpers.arrayElement(['provider rate-limit hit','timeout after 30s','context window exceeded','invalid model selection']) : null,
      is_demo_data: true,
      created_at: weekdayBiased30dTimestamp(),
    };
  });
}

function genUserLoginLog(n) {
  return Array.from({ length: n }, () => ({
    user_id:    DEMO_USER_ID,
    account_id: DEMO_ACCOUNT_ID,
    team_id:    DEMO_TEAM_ID,
    is_demo_data: true,
    logged_in_at: weekdayBiased30dTimestamp(),
  }));
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!DRY_RUN && (!url || !key)) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
    process.exit(1);
  }
  console.log(`[seed] Target: ${url || '(no target — DRY-RUN)'} ${DRY_RUN ? '(DRY-RUN)' : ''}`);

  const sb = DRY_RUN ? null : createClient(url, key, { auth: { persistSession: false } });

  if (!DRY_RUN) {
    // Idempotency-Check: schon Demo-Leads?
    const { count: existingLeads } = await sb.from('leads').select('*', { count: 'exact', head: true })
      .eq('team_id', DEMO_TEAM_ID).like('notes', '[DEMO]%');
    if (existingLeads > 0) {
      console.error(`[seed] ABORT: ${existingLeads} Demo-Leads existieren bereits. Erst wipen.`);
      process.exit(1);
    }
    console.log('[seed] Pre-Flight OK — clean state.');
  }

  // ── 1. Organizations (25) ──
  const orgs = genOrganizations(25);
  console.log(`[seed] Inserting ${orgs.length} organizations…`);
  if (!DRY_RUN) {
    const { data: orgInserted, error: orgErr } = await sb.from('organizations').insert(orgs).select('id');
    if (orgErr) throw new Error(`organizations insert: ${orgErr.message}`);
    orgs.forEach((o, i) => { o.id = orgInserted[i].id; });
  } else {
    orgs.forEach((_, i) => { orgs[i].id = `dry-org-${i}`; });
  }

  // ── 2. Leads (80) ──
  const leads = genLeads(80, orgs.map(o => o.id));
  console.log(`[seed] Inserting ${leads.length} leads…`);
  if (!DRY_RUN) {
    const { data: leadInserted, error: leadErr } = await sb.from('leads').insert(leads).select('id, status, company, organization_id');
    if (leadErr) throw new Error(`leads insert: ${leadErr.message}`);
    leads.forEach((l, i) => { l.id = leadInserted[i].id; });
  } else {
    leads.forEach((_, i) => { leads[i].id = `dry-lead-${i}`; });
  }

  // ── 3. Deals (25) ──
  const deals = genDeals(25, leads);
  console.log(`[seed] Inserting ${deals.length} deals…`);
  if (!DRY_RUN) {
    const { error: dealErr } = await sb.from('deals').insert(deals);
    if (dealErr) throw new Error(`deals insert: ${dealErr.message}`);
  }

  // ── 4. Lead-Tasks (40) ──
  const leadTasks = genLeadTasks(40, leads.map(l => l.id));
  console.log(`[seed] Inserting ${leadTasks.length} lead_tasks…`);
  if (!DRY_RUN) {
    const { error: taskErr } = await sb.from('lead_tasks').insert(leadTasks);
    if (taskErr) throw new Error(`lead_tasks insert: ${taskErr.message}`);
  }

  // ── 5. Content-Posts (35) ──
  const posts = genContentPosts(35);
  console.log(`[seed] Inserting ${posts.length} content_posts…`);
  if (!DRY_RUN) {
    const { error: postErr } = await sb.from('content_posts').insert(posts);
    if (postErr) throw new Error(`content_posts insert: ${postErr.message}`);
  }

  // ── 6. PM-Tasks (40) — braucht pm_columns aus SQL-Migration ──
  console.log('[seed] Fetching pm_columns für demo-projekte…');
  let columnsByProject = {};
  if (!DRY_RUN) {
    const { data: cols, error: colErr } = await sb.from('pm_columns')
      .select('id, project_id, position, project:pm_projects!inner(name)')
      .eq('user_id', DEMO_USER_ID)
      .like('project.name', '[DEMO]%')
      .order('project_id').order('position');
    if (colErr) throw new Error(`pm_columns fetch: ${colErr.message}`);
    cols.forEach(c => {
      if (!columnsByProject[c.project_id]) columnsByProject[c.project_id] = [];
      columnsByProject[c.project_id].push(c.id);
    });
  } else {
    columnsByProject = { 'dry-project-1': ['dry-c1', 'dry-c2', 'dry-c3', 'dry-c4'] };
  }

  const pmTasks = genPmTasks(40, columnsByProject);
  console.log(`[seed] Inserting ${pmTasks.length} pm_tasks…`);
  if (!DRY_RUN) {
    const { error: pmErr } = await sb.from('pm_tasks').insert(pmTasks);
    if (pmErr) throw new Error(`pm_tasks insert: ${pmErr.message}`);
  }

  // ── 7. AI-Usage-Log (120) ──
  const aiLogs = genAiUsageLog(120);
  console.log(`[seed] Inserting ${aiLogs.length} ai_usage_log…`);
  if (!DRY_RUN) {
    const { error: aiErr } = await sb.from('ai_usage_log').insert(aiLogs);
    if (aiErr) throw new Error(`ai_usage_log insert: ${aiErr.message}`);
  }

  // ── 8. User-Login-Log (50) ──
  const logins = genUserLoginLog(50);
  console.log(`[seed] Inserting ${logins.length} user_login_log…`);
  if (!DRY_RUN) {
    const { error: loginErr } = await sb.from('user_login_log').insert(logins);
    if (loginErr) throw new Error(`user_login_log insert: ${loginErr.message}`);
  }

  console.log('[seed] ✓ Alle Volume-Inserts durch.');
  console.log(`[seed] Total: ${orgs.length + leads.length + deals.length + leadTasks.length + posts.length + pmTasks.length + aiLogs.length + logins.length} Records.`);

  // ── Sample-Output (für Sign-off-Review) ──
  console.log('\n=== SAMPLE-OUTPUT (3 Records pro Modul) ===\n');
  console.log('--- organizations[0..2] ---');     console.dir(orgs.slice(0, 3), { depth: 1 });
  console.log('\n--- leads[0..2] ---');           console.dir(leads.slice(0, 3), { depth: 1 });
  console.log('\n--- deals[0..2] ---');           console.dir(deals.slice(0, 3), { depth: 1 });
  console.log('\n--- lead_tasks[0..2] ---');      console.dir(leadTasks.slice(0, 3), { depth: 1 });
  console.log('\n--- content_posts[0..2] ---');   console.dir(posts.slice(0, 3), { depth: 1 });
  console.log('\n--- pm_tasks[0..2] ---');        console.dir(pmTasks.slice(0, 3), { depth: 1 });
  console.log('\n--- ai_usage_log[0..2] ---');    console.dir(aiLogs.slice(0, 3), { depth: 1 });
  console.log('\n--- user_login_log[0..2] ---'); console.dir(logins.slice(0, 3), { depth: 1 });
}

main().catch((e) => {
  console.error('[seed] FAILED:', e.message);
  process.exit(1);
});

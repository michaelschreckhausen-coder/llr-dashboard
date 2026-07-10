// la-audience — führt eine la_audiences aus (Suche classic/salesnav/recruiter, Relations-Pull ODER
// Import-Inbox-Liste kind='list' via query.list_id → inbox_list_members → linkedin_inbox),
// legt la_enrollments an (Dedup je campaign über provider_id ODER public_identifier) und materialisiert
// den ersten Step-Job GESTAFFELT nach la_campaigns.caps (per-Tag/Aktion, Jitter) — kein all-at-once.
// On-demand-Invoke oder via Relations-Cron. service_role. Kein Real-Send (Runner sendet nur bei aktiver Kampagne + fälligem Job).
// Prozess-Vereinheitlichung 2026-07: kind='list' ist die kanonische Zielgruppe aus der Import-Inbox (eine Listen-Quelle).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { search, getRelations, type Person, type Page, type UnipileResult } from "../_shared/unipile-client.ts";

// public_identifier aus einer LinkedIn-URL ziehen (…/in/<slug>) — Fallback-Arbiter wenn provider_id fehlt.
function publicIdFromUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/\/in\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const PAGES_PER_INVOKE = 5;  // Chunk pro Invoke — Cursor-Checkpoint (sync_cursor) gegen EF-Wall-Clock
const DEFAULT_PER_DAY = 20;  // Fallback-Cap
const WINDOW_H = 10;         // Arbeits-Fenster/Tag (h) für die Staffelung

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

// Gestaffeltes scheduled_at: i-tes neues Enrollment über die Cap-Tagesfenster verteilen (+ Jitter), nicht now() für alle.
function staggeredSchedule(i: number, perDay: number): string {
  const dayOffset = Math.floor(i / perDay);
  const slot = i % perDay;
  const jitterMs = Math.floor(Math.random() * 5 * 60000); // 0–5 min
  const ms = Date.now() + dayOffset * 86400000 + (slot / Math.max(perDay, 1)) * WINDOW_H * 3600000 + jitterMs;
  return new Date(ms).toISOString();
}

const seenHas = (p: Person, s: Set<string>) =>
  (p.provider_id && s.has("p:" + p.provider_id)) || (p.public_identifier && s.has("u:" + p.public_identifier));
const seenAdd = (p: Person, s: Set<string>) => {
  if (p.provider_id) s.add("p:" + p.provider_id);
  if (p.public_identifier) s.add("u:" + p.public_identifier);
};

Deno.serve(async (req) => {
  const { audience_id, campaign_id } = await req.json().catch(() => ({} as any));
  if (!audience_id) return json({ error: "audience_id required" }, 400);

  const { data: aud } = await db.from("la_audiences").select("id, team_id, kind, query, search_url, sync_cursor").eq("id", audience_id).maybeSingle();
  if (!aud) return json({ error: "audience_not_found" }, 404);

  // Ziel-Kampagne: input ODER via la_campaigns.audience_id-Bindung (team-scoped).
  let campId = campaign_id;
  if (!campId) {
    const { data: c } = await db.from("la_campaigns").select("id").eq("audience_id", audience_id).eq("team_id", aud.team_id).limit(1).maybeSingle();
    campId = c?.id;
  }
  if (!campId) return json({ error: "no_campaign_for_audience" }, 400);
  const { data: camp } = await db.from("la_campaigns").select("id, team_id, account_id, caps").eq("id", campId).maybeSingle();
  if (!camp || camp.team_id !== aud.team_id) return json({ error: "campaign_team_mismatch" }, 400); // Team-Invariante
  const { data: acct } = await db.from("la_accounts").select("unipile_account_id").eq("id", camp.account_id).maybeSingle();
  if (!acct?.unipile_account_id) return json({ error: "account_missing" }, 400);
  const accountId: string = acct.unipile_account_id;
  const { data: step0 } = await db.from("la_steps").select("id, action").eq("campaign_id", campId).eq("position", 0).maybeSingle();
  if (!step0) return json({ error: "no_step0" }, 400);

  // Personen sammeln — kind='list' aus der Import-Inbox (endlich, ein Pass), sonst Unipile paginiert.
  const persons: Person[] = [];
  let cursor: string | null = aud.sync_cursor ?? null, pages = 0; let fetchErr: unknown = null; // ab Checkpoint fortsetzen
  if (aud.kind === "list") {
    // query.list_id → inbox_list_members → linkedin_inbox (team-scoped auf audience-Team).
    const listId: string | null = (aud.query as any)?.list_id ?? null;
    if (!listId) return json({ error: "list_audience_missing_list_id" }, 400);
    const { data: members } = await db.from("inbox_list_members").select("inbox_id").eq("list_id", listId);
    const inboxIds = (members ?? []).map((m: any) => m.inbox_id).filter(Boolean);
    if (inboxIds.length) {
      const { data: rows } = await db.from("linkedin_inbox")
        .select("id, provider_id, linkedin_url, name, headline, job_title, company")
        .eq("team_id", aud.team_id).in("id", inboxIds);
      for (const r of rows ?? []) {
        persons.push({
          provider_id: (r as any).provider_id ?? null,
          public_identifier: publicIdFromUrl((r as any).linkedin_url ?? null),
          name: (r as any).name ?? null,
          headline: (r as any).headline ?? (r as any).job_title ?? null,
          profile_url: (r as any).linkedin_url ?? null,
          raw: r,
        });
      }
    }
    cursor = null; // Inbox-Liste ist endlich → kein Checkpoint
  } else {
    do {
      const res: UnipileResult<Page> = aud.kind === "relations"
        ? await getRelations(accountId, cursor)
        : await search(accountId, { kind: aud.kind, params: (aud.query as any) ?? undefined, search_url: aud.search_url ?? undefined, cursor });
      if (!res.ok) { fetchErr = { status: res.status, type: res.type, detail: res.detail }; break; }
      persons.push(...res.data.items);
      cursor = res.data.cursor; pages++;
    } while (cursor && pages < PAGES_PER_INVOKE);
  }

  // Dedup gegen bestehende Enrollments (provider_id ODER public_identifier)
  const { data: existing } = await db.from("la_enrollments").select("provider_id, public_identifier").eq("campaign_id", campId);
  const seen = new Set<string>();
  for (const e of existing ?? []) { if (e.provider_id) seen.add("p:" + e.provider_id); if (e.public_identifier) seen.add("u:" + e.public_identifier); }

  const perDay: number = (camp.caps as any)?.[step0.action]?.per_day ?? (camp.caps as any)?.per_day ?? DEFAULT_PER_DAY;
  let inserted = 0, deduped = 0, jobs = 0, idx = 0;
  for (const p of persons) {
    if (!p.provider_id && !p.public_identifier) continue;
    if (seenHas(p, seen)) { deduped++; continue; }
    seenAdd(p, seen);
    const { data: enr, error: eErr } = await db.from("la_enrollments").insert({
      campaign_id: campId, team_id: camp.team_id,           // Team-Invariante: enrollment-Team == campaign-Team
      provider_id: p.provider_id, public_identifier: p.public_identifier,
      person: { name: p.name, headline: p.headline, profile_url: p.profile_url },
      current_position: 0, state: "active",
    }).select("id").maybeSingle();
    if (eErr || !enr) { deduped++; continue; }              // Unique-Race → als deduped
    inserted++;
    const { error: jErr } = await db.from("la_jobs").insert({
      enrollment_id: enr.id, team_id: camp.team_id, step_id: step0.id, action: step0.action,
      scheduled_at: staggeredSchedule(idx++, perDay),        // GESTAFFELT (Anti-Massen-Send)
      idempotency_key: enr.id + ":" + step0.id,
    });
    if (!jErr) jobs++;
  }

  const done = !cursor || !!fetchErr;   // Cursor erschöpft ODER Fehler → Pull beendet; sonst Checkpoint für Fortsetzung
  await db.from("la_audiences").update({
    sync_cursor: done ? null : cursor, sync_done: done, last_run_at: new Date().toISOString(),
  }).eq("id", audience_id);
  return json({ audience_id, campaign_id: campId, kind: aud.kind, pages, fetched: persons.length, inserted, deduped, jobs, per_day: perDay, more_available: !done, fetch_error: fetchErr });
});

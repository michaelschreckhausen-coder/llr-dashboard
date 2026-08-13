// import-unipile-salesnav — On-Demand Sales-Nav-Import via Unipile-Search → linkedin_inbox.
// POST /linkedin/search {api:'sales_navigator', ...} liefert id (=ACwAA sales_nav_id) + public_profile_url
// (=linkedin_url) INLINE → sales_nav_upsert_inbox(source='unipile_salesnav'). Löst die Sales-Nav-URL-Lücke
// am Ursprung (der Auslöser des Sprints). provider_id (ACoAA) kommt hier NICHT mit — Runner löst über die
// URL auf (getProfile), Fix A; die URL reicht für Filter-Match + Automatisierung.
// Import gegatet auf linkedin.sales_nav (P3; war frei bis 2026-07-07). Input: { unipile_account_id, search, max_pages?, inbox_list_id?, mode? }.
//
// HÄRTUNG (Overfetch-Fix 2026-08-13): das Sicherheits-Gerüst des job-basierten sales-nav-import
// in den Unipile-Pfad gezogen — ein Mechanismus, aber nicht mehr cap-/blind:
//   - mode:'preview' → Trefferzahl OHNE Schreiben (D2: Frontend fragt „N Treffer — importieren?").
//   - Job-Row (sales_nav_import_jobs) mit source_url = gepastete URL → Observability + persistiert die
//     URL (schließt den Diagnose-Blindfleck) + erscheint im bestehenden Job-Monitor. team/brand aus JWT.
//   - Harter Cap IMPORT_MAX_PAGES (500 statt 1000) + truncated:true bei Ceiling-Hit (D1) → ehrlich statt still.
// Die Pagination steckt in _shared/salesnavPaginate.ts (injizierbar → gegen Fixtures getestet).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireBrandLinkedinScope, teamHasPermission } from "../_shared/permissions.ts";
import { fetchSearchPages, IMPORT_MAX_PAGES, PAGE, PREVIEW_MAX_PAGES, type SearchPage } from "../_shared/salesnavPaginate.ts";

const UNIPILE_DSN = Deno.env.get("UNIPILE_DSN")!;
const UNIPILE_KEY = Deno.env.get("UNIPILE_API_KEY")!;
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const U = `https://${UNIPILE_DSN}/api/v1`;
const db = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
}

const UNIPILE_HEADERS = { "X-API-KEY": UNIPILE_KEY, "accept": "application/json", "content-type": "application/json" };

// Unipile-Fehler getypt durch die Pagination durchreichen → der Handler mappt auf 502 + Job-Row 'error'.
class UnipileSearchError extends Error {
  constructor(public status: number, public unipile_type: string | null, public detail: string) { super("unipile_search_failed"); }
}

// Eine Unipile-Search-Seite holen (die konkrete fetchPage-Impl, die in die Pagination injiziert wird).
function makeFetchPage(accountId: string, searchBody: unknown) {
  return async (cursor: string | null): Promise<SearchPage> => {
    const url = `${U}/linkedin/search?account_id=${encodeURIComponent(accountId)}&limit=${PAGE}`
      + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    const r = await fetch(url, { method: "POST", headers: UNIPILE_HEADERS, body: JSON.stringify(searchBody) });
    if (!r.ok) {
      const txt = await r.text();
      let ut: string | null = null;
      try { ut = JSON.parse(txt)?.type ?? null; } catch { /* nicht-JSON */ }
      throw new UnipileSearchError(r.status, ut, txt.slice(0, 200));
    }
    const body: any = await r.json();
    return { items: body.items ?? [], cursor: body.cursor ?? null };
  };
}

Deno.serve(async (req) => {
  const { unipile_account_id, search, max_pages, inbox_list_id, mode } = await req.json().catch(() => ({} as any));
  if (!unipile_account_id) return json({ error: "unipile_account_id required" }, 400);
  if (!search || typeof search !== "object") return json({ error: "search (sales_navigator params) required" }, 400);
  const isPreview = mode === "preview";
  const maxPages = isPreview ? PREVIEW_MAX_PAGES : Math.min(Number(max_pages) || IMPORT_MAX_PAGES, IMPORT_MAX_PAGES);

  // Caller aus dem JWT ableiten (IMMER) — er bestimmt das Ziel-Team des User-initiierten Imports,
  // NICHT acct.team_id (das Unipile-Account-Team kann ein anderes sein → cross-team-Orphan).
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: gu } = await db.auth.getUser(jwt);
  const callerId: string | null = gu?.user?.id ?? null;

  // Ziel-Team: die gewählte Liste ist autoritativ (Inbox-Rows + Mitgliedschaft im SELBEN Team),
  // sonst das aktive Team des Callers. Listen-Zugriff dabei prüfen (Owner ODER is_shared+Team).
  let targetTeamId: string | null = null;
  if (inbox_list_id) {
    if (!callerId) return json({ error: "Auth erforderlich für inbox_list_id" }, 401);
    const { data: listRow } = await db.from("inbox_lists").select("user_id, team_id, is_shared").eq("id", inbox_list_id).maybeSingle();
    if (!listRow) return json({ error: "inbox_list nicht gefunden" }, 404);
    let ok = listRow.user_id === callerId;
    if (!ok && listRow.is_shared && listRow.team_id) {
      const { data: tm } = await db.from("team_members").select("team_id").eq("user_id", callerId).eq("team_id", listRow.team_id).maybeSingle();
      ok = !!tm;
    }
    if (!ok) return json({ error: "keine Berechtigung für diese Liste" }, 403);
    targetTeamId = listRow.team_id;
  } else if (callerId) {
    const { data: up } = await db.from("user_preferences").select("active_team_id").eq("user_id", callerId).maybeSingle();
    targetTeamId = up?.active_team_id ?? null;
  }

  const { data: acct, error: aerr } = await db.from("unipile_accounts")
    .select("user_id, team_id, status, brand_voice_id").eq("unipile_account_id", unipile_account_id).maybeSingle();
  if (aerr) return json({ error: "acct lookup: " + aerr.message }, 500);
  if (!acct) return json({ error: "unipile_account not found" }, 404);
  if (acct.status !== "OK") return json({ skipped: "account_status:" + acct.status });
  if (!acct.team_id) return json({ skipped: "no_team" });
  const brandId: string | null = (acct as any).brand_voice_id ?? null; // Import der aktiven Marke zuordnen (strict brand-scope)

  // C3: Such-Scope am Aufrufer (USER-JWT-Kontext, nicht service_role). Nur wenn ein
  // Caller da ist UND die Rows einer Marke zugeordnet werden. Service/Cron (kein Caller)
  // handelt für den Owner -> übersprungen (wie das teamHasPermission-Split unten).
  if (callerId && brandId) {
    const uc = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } }, auth: { persistSession: false } });
    const denied = await requireBrandLinkedinScope(uc, brandId, "search");
    if (denied) return denied;
  }

  // Ziel-Team/-User für die Inbox-Rows = Caller/Liste (User-Kontext), NICHT das Unipile-Account-Team.
  // Fallback acct nur wenn kein Caller/kein aktives Team (z.B. service-role-Aufruf ohne Kontext).
  const teamId = targetTeamId ?? acct.team_id;
  const userId = callerId ?? acct.user_id;

  // P3 #6: Sales-Nav-Gate auf das Ziel-Team. Split: JWT-Caller → 403 need_permission; Service/Cron → skip 200. Kill-Switch im Resolver.
  if (!(await teamHasPermission(db, teamId, "linkedin.sales_nav"))) {
    return callerId ? json({ error: "need_permission", key: "linkedin.sales_nav" }, 403)
                    : json({ skipped: "no_permission" }, 200);
  }

  const searchBody = { ...search, api: "sales_navigator" };
  const fetchPage = makeFetchPage(unipile_account_id, searchBody);

  // ── PREVIEW (D2): Trefferzahl OHNE Schreiben/Job-Row, geboundet auf PREVIEW_MAX_PAGES.
  // Läuft NACH allen Auth-/Scope-/Permission-Checks (man darf nur previewen, was man importieren dürfte).
  if (isPreview) {
    let count = 0;
    try {
      const { truncated } = await fetchSearchPages(fetchPage, PREVIEW_MAX_PAGES, (items) => { count += items.length; });
      // truncated → mehr verfügbar; sonst ist count exakt (exhausted).
      return json({ preview: true, count, exhausted: !truncated, more_available: truncated });
    } catch (e) {
      if (e instanceof UnipileSearchError) return json({ error: "unipile_search_failed", unipile_status: e.status, unipile_type: e.unipile_type, detail: e.detail }, 502);
      throw e;
    }
  }

  // ── IMPORT: Job-Row anlegen (Observability + persistiert source_url für künftige Diagnose).
  // team_id/user_id/brand_voice_id aus dem JWT-Kontext (oben aufgelöst), NICHT geraten → keine Fremd-Zuordnung.
  const { data: jobRow } = await db.from("sales_nav_import_jobs").insert({
    team_id: teamId, user_id: userId, brand_voice_id: brandId,
    source_type: "unipile_salesnav",
    source_url: (typeof (search as any).url === "string" ? (search as any).url : null),
    status: "running", total_leads: 0,
  }).select("id").maybeSingle();
  const jobId: string | null = jobRow?.id ?? null;

  let inserted = 0, updated = 0, failed = 0, seen = 0;
  const importedIds: string[] = []; // inbox-Row-ids der importierten Kontakte (für Teil 2: Listen-Zuordnung)

  let truncated = false;
  try {
    const res = await fetchSearchPages(fetchPage, maxPages, async (items) => {
      for (const it of items) {
        seen++;
        const sales_nav_id: string | null = it.id ?? null;
        const public_id: string | null = it.public_identifier ?? null;
        const linkedin_url: string | null = it.public_profile_url
          || (public_id ? `https://www.linkedin.com/in/${public_id}` : null);
        if (!sales_nav_id && !linkedin_url) { failed++; continue; }

        const lead = {
          sales_nav_id, linkedin_url,
          name: it.name || [it.first_name, it.last_name].filter(Boolean).join(" ") || null,
          first_name: it.first_name ?? null,
          last_name: it.last_name ?? null,
          headline: it.headline ?? null,
          company: it.current_positions?.[0]?.company ?? null,
          job_title: it.current_positions?.[0]?.role ?? null,
          source: "unipile_salesnav",
        };
        const { data: ins, error: uerr } = await db.rpc("sales_nav_upsert_inbox", {
          p_team_id: teamId, p_user_id: userId, p_lead: lead, p_brand_voice_id: brandId,
        });
        if (uerr) { failed++; continue; }
        const r = ins as any; // RPC gibt jsonb {id, inserted} — dedupliziert per (team_id, sales_nav_id/provider_id/url)
        r?.inserted ? inserted++ : updated++;
        if (r?.id) importedIds.push(r.id);
      }
    });
    truncated = res.truncated; // cursor am Cap noch da → es gäbe mehr, wurde gedeckelt
  } catch (e) {
    if (e instanceof UnipileSearchError) {
      if (jobId) {
        await db.from("sales_nav_import_jobs").update({
          status: "error", error_message: `unipile ${e.status}: ${e.detail.slice(0, 120)}`,
          processed_leads: inserted + updated, failed_leads: failed, current_offset: seen, updated_at: new Date().toISOString(),
        }).eq("id", jobId);
      }
      return json({ error: "unipile_search_failed", unipile_status: e.status, unipile_type: e.unipile_type, detail: e.detail, inserted, updated, failed, job_id: jobId }, 502);
    }
    throw e;
  }

  // Job-Row finalisieren (vor der Listen-Zuordnung, damit der Import-Zustand robust festliegt).
  if (jobId) {
    await db.from("sales_nav_import_jobs").update({
      status: "done", total_leads: seen, processed_leads: inserted + updated, failed_leads: failed,
      current_offset: seen, truncated,
      error_message: truncated ? `Ergebnis auf ${seen} begrenzt — mehr verfügbar, Suche verfeinern.` : null,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
  }

  // Listen-Zuordnung — idempotent via Unique (list_id, inbox_id) → ON CONFLICT DO NOTHING (ignoreDuplicates).
  let list_linked = 0;
  if (inbox_list_id && callerId && importedIds.length) {
    const rows = importedIds.map((id) => ({ list_id: inbox_list_id, inbox_id: id, user_id: callerId }));
    const { error: mErr } = await db.from("inbox_list_members")
      .upsert(rows, { onConflict: "list_id,inbox_id", ignoreDuplicates: true });
    if (mErr) {
      return json({ unipile_account_id, team_id: teamId, seen, inserted, updated, failed, inbox_list_id, list_error: mErr.message, truncated, job_id: jobId });
    }
    list_linked = rows.length; // versuchte Zuordnungen (Duplikate werden idempotent übersprungen)
  }

  return json({
    unipile_account_id, team_id: teamId,
    seen, inserted, updated, failed,
    inbox_list_id: inbox_list_id ?? null, list_linked,
    truncated, more_available: truncated, job_id: jobId,
  });
});

// import-unipile-salesnav — On-Demand Sales-Nav-Import via Unipile-Search → linkedin_inbox.
// POST /linkedin/search {api:'sales_navigator', ...} liefert id (=ACwAA sales_nav_id) + public_profile_url
// (=linkedin_url) INLINE → sales_nav_upsert_inbox(source='unipile_salesnav'). Löst die Sales-Nav-URL-Lücke
// am Ursprung (der Auslöser des Sprints). provider_id (ACoAA) kommt hier NICHT mit — Runner löst über die
// URL auf (getProfile), Fix A; die URL reicht für Filter-Match + Automatisierung.
// Import ist FREI (kein Addon-Gate). Input: { unipile_account_id, search, max_pages? }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const UNIPILE_DSN = Deno.env.get("UNIPILE_DSN")!;
const UNIPILE_KEY = Deno.env.get("UNIPILE_API_KEY")!;
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const U = `https://${UNIPILE_DSN}/api/v1`;
const db = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

const PAGE = 50;
const DEFAULT_MAX_PAGES = 20; // gezielte Suche → weniger Seiten als Relations

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  const { unipile_account_id, search, max_pages, inbox_list_id } = await req.json().catch(() => ({} as any));
  if (!unipile_account_id) return json({ error: "unipile_account_id required" }, 400);
  if (!search || typeof search !== "object") return json({ error: "search (sales_navigator params) required" }, 400);
  const maxPages = Math.min(Number(max_pages) || DEFAULT_MAX_PAGES, DEFAULT_MAX_PAGES);

  // Optionale Listen-Zuordnung: aufrufenden User aus dem JWT ableiten + Listen-Zugriff prüfen (RLS-konsistent).
  // member.user_id = Caller; Zugriff = Owner ODER (is_shared UND Team-Mitglied) — sonst 403 (kein Fremd-Listen-Write).
  let callerId: string | null = null;
  if (inbox_list_id) {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: gu } = await db.auth.getUser(jwt);
    const caller = gu?.user;
    if (!caller) return json({ error: "Auth erforderlich für inbox_list_id" }, 401);
    callerId = caller.id;
    const { data: listRow } = await db.from("inbox_lists").select("user_id, team_id, is_shared").eq("id", inbox_list_id).maybeSingle();
    if (!listRow) return json({ error: "inbox_list nicht gefunden" }, 404);
    let ok = listRow.user_id === callerId;
    if (!ok && listRow.is_shared && listRow.team_id) {
      const { data: tm } = await db.from("team_members").select("team_id").eq("user_id", callerId).eq("team_id", listRow.team_id).maybeSingle();
      ok = !!tm;
    }
    if (!ok) return json({ error: "keine Berechtigung für diese Liste" }, 403);
  }

  const { data: acct, error: aerr } = await db.from("unipile_accounts")
    .select("user_id, team_id, status").eq("unipile_account_id", unipile_account_id).maybeSingle();
  if (aerr) return json({ error: "acct lookup: " + aerr.message }, 500);
  if (!acct) return json({ error: "unipile_account not found" }, 404);
  if (acct.status !== "OK") return json({ skipped: "account_status:" + acct.status });
  if (!acct.team_id) return json({ skipped: "no_team" });

  const searchBody = { ...search, api: "sales_navigator" };
  let cursor: string | null = null;
  let pages = 0, inserted = 0, updated = 0, failed = 0, seen = 0;
  const importedIds: string[] = []; // inbox-Row-ids der importierten Kontakte (für Teil 2: Listen-Zuordnung)
  do {
    const url: string = `${U}/linkedin/search?account_id=${encodeURIComponent(unipile_account_id)}&limit=${PAGE}`
      + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    const r: Response = await fetch(url, {
      method: "POST",
      headers: { "X-API-KEY": UNIPILE_KEY, "accept": "application/json", "content-type": "application/json" },
      body: JSON.stringify(searchBody),
    });
    if (!r.ok) {
      const txt = await r.text();
      let unipile_type: string | null = null;
      try { unipile_type = JSON.parse(txt)?.type ?? null; } catch { /* nicht-JSON */ }
      return json({ error: "unipile_search_failed", unipile_status: r.status, unipile_type, detail: txt.slice(0, 200), pages, inserted, updated, failed }, 502);
    }
    const body: any = await r.json();
    const items: any[] = body.items ?? [];
    cursor = body.cursor ?? null;
    pages++;

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
        p_team_id: acct.team_id, p_user_id: acct.user_id, p_lead: lead,
      });
      if (uerr) { failed++; continue; }
      const res = ins as any; // RPC gibt jetzt jsonb {id, inserted}
      res?.inserted ? inserted++ : updated++;
      if (res?.id) importedIds.push(res.id);
    }
  } while (cursor && pages < maxPages);

  // Listen-Zuordnung — idempotent via Unique (list_id, inbox_id) → ON CONFLICT DO NOTHING (ignoreDuplicates).
  let list_linked = 0;
  if (inbox_list_id && callerId && importedIds.length) {
    const rows = importedIds.map((id) => ({ list_id: inbox_list_id, inbox_id: id, user_id: callerId }));
    const { error: mErr } = await db.from("inbox_list_members")
      .upsert(rows, { onConflict: "list_id,inbox_id", ignoreDuplicates: true });
    if (mErr) {
      return json({ unipile_account_id, team_id: acct.team_id, pages, seen, inserted, updated, failed, inbox_list_id, list_error: mErr.message });
    }
    list_linked = rows.length; // versuchte Zuordnungen (Duplikate werden idempotent übersprungen)
  }

  return json({
    unipile_account_id, team_id: acct.team_id,
    pages, seen, inserted, updated, failed,
    inbox_list_id: inbox_list_id ?? null, list_linked,
    more_available: !!cursor && pages >= maxPages,
  });
});

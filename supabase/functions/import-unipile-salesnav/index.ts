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
  const { unipile_account_id, search, max_pages } = await req.json().catch(() => ({} as any));
  if (!unipile_account_id) return json({ error: "unipile_account_id required" }, 400);
  if (!search || typeof search !== "object") return json({ error: "search (sales_navigator params) required" }, 400);
  const maxPages = Math.min(Number(max_pages) || DEFAULT_MAX_PAGES, DEFAULT_MAX_PAGES);

  const { data: acct, error: aerr } = await db.from("unipile_accounts")
    .select("user_id, team_id, status").eq("unipile_account_id", unipile_account_id).maybeSingle();
  if (aerr) return json({ error: "acct lookup: " + aerr.message }, 500);
  if (!acct) return json({ error: "unipile_account not found" }, 404);
  if (acct.status !== "OK") return json({ skipped: "account_status:" + acct.status });
  if (!acct.team_id) return json({ skipped: "no_team" });

  const searchBody = { ...search, api: "sales_navigator" };
  let cursor: string | null = null;
  let pages = 0, inserted = 0, updated = 0, failed = 0, seen = 0;
  do {
    const url: string = `${U}/linkedin/search?account_id=${encodeURIComponent(unipile_account_id)}&limit=${PAGE}`
      + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    const r: Response = await fetch(url, {
      method: "POST",
      headers: { "X-API-KEY": UNIPILE_KEY, "accept": "application/json", "content-type": "application/json" },
      body: JSON.stringify(searchBody),
    });
    if (!r.ok) {
      return json({ error: `search ${r.status}: ${(await r.text()).slice(0, 200)}`, pages, inserted, updated, failed }, 502);
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
      ins === true ? inserted++ : updated++;
    }
  } while (cursor && pages < maxPages);

  return json({
    unipile_account_id, team_id: acct.team_id,
    pages, seen, inserted, updated, failed,
    more_available: !!cursor && pages >= maxPages,
  });
});

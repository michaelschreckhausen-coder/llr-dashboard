// =====================================================================
// Feature 1 — LinkedIn-Suche / Prospecting
// User-getriggert: invoke('unipile-search', { body: { search_id } })
//   ODER Ad-hoc: { params, api, category, target_list_id }
// Führt eine Unipile-LinkedIn-Suche aus und importiert Personen-Treffer in die
// Import-Inbox (public.linkedin_inbox, source='linkedin_search') via RPC
// sales_nav_upsert_inbox — NICHT mehr ins CRM (public.leads). Prozess-Vereinheitlichung
// 2026-07: eine Listen-Quelle (inbox_lists). Optionale target_list_id = inbox_lists.id
// → Mitgliedschaft in inbox_list_members. Dedup team-scoped über sales_nav_id/provider_id
// in der RPC. Sales-Nav-Treffer: it.id = sales_nav_id (ACwAA); Classic: it.id = provider_id.
// =====================================================================
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import {
  getAuthenticatedUser,
  getUnipileConnection,
  hasAddon,
  identifierFromUrl,
  linkedinSearch,
  serviceClient,
  UnipileError,
  userClientFromReq,
} from "../_shared/unipile.ts";

const MAX_PAGES = 5;      // Schutz gegen Endlos-Pagination pro Aufruf
const PREVIEW_CAP = 100;  // max. Treffer, die als Vorschau (items) zurückgegeben werden

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) return jsonResponse({ error: "unauthorized" }, 401);

    // Addon-Gate 'automation' (gleiche Autorität wie unipile-connect-link).
    const uc = userClientFromReq(req);
    if (!uc) return jsonResponse({ error: "unauthorized" }, 401);
    if (!(await hasAddon(uc, "automation"))) {
      return jsonResponse({ error: "no_addon", message: "Automatisierung-Addon nicht aktiv" }, 403);
    }

    const sb = serviceClient();
    const conn = await getUnipileConnection(sb, auth.userId);
    if (!conn) {
      return jsonResponse({ error: "Kein aktiver Unipile-LinkedIn-Account verbunden." }, 409);
    }

    const input = await req.json().catch(() => ({}));
    let search: any = null;

    if (input.search_id) {
      const { data, error } = await sb
        .from("linkedin_searches")
        .select("*")
        .eq("id", input.search_id)
        .eq("user_id", auth.userId)
        .maybeSingle();
      if (error || !data) return jsonResponse({ error: "Suche nicht gefunden." }, 404);
      search = data;
    }

    const api = search?.api ?? input.api ?? "classic";
    const category = search?.category ?? input.category ?? "people";
    const params = search?.params ?? input.params ?? {};
    const searchUrl = search?.search_url ?? input.search_url ?? null;
    const isSalesNav = api === "sales_navigator";
    // target_list_id zeigt jetzt auf inbox_lists (nicht mehr lead_lists) — Prozess-Vereinheitlichung.
    const targetListId = search?.target_list_id ?? input.target_list_id ?? null;

    // Body für Unipile: entweder Parameter- oder URL-basierte Suche.
    const body: Record<string, unknown> = searchUrl
      ? { url: searchUrl }
      : { api, category, ...params };

    if (search) {
      await sb.from("linkedin_searches")
        .update({ status: "running", last_run_at: new Date().toISOString(), last_error: null })
        .eq("id", search.id);
    }

    let cursor: string | undefined = search?.last_cursor ?? undefined;
    let imported = 0;
    const seen: any[] = [];
    const results: Array<Record<string, unknown>> = [];  // gemappte Vorschau-Treffer (Phase 1.5)

    for (let page = 0; page < MAX_PAGES; page++) {
      const resp = await linkedinSearch(conn, body, cursor);
      const items: any[] = resp?.items ?? resp?.results ?? resp?.data ?? [];
      for (const it of items) {
        seen.push(it);
        // Feldnamen gegen import-unipile-relations/-salesnav verifiziert (2026-07):
        // Unipile liefert public_profile_url (=linkedin_url) bzw. public_identifier.
        const linkedinUrl = it.public_profile_url ?? it.profile_url ?? it.url
          ?? (it.public_identifier ? `https://www.linkedin.com/in/${it.public_identifier}` : null);
        const name = it.name
          || [it.first_name, it.last_name].filter(Boolean).join(" ")
          || "Unbekannt";
        // Einheitliches Mapping für Vorschau UND Import (immer gemappt, unabhängig
        // vom Auto-Import), damit das Frontend die Treffer direkt anzeigen kann.
        const mapped: Record<string, unknown> = {
          name,
          first_name: it.first_name ?? null,
          last_name: it.last_name ?? null,
          headline: it.headline ?? it.title ?? null,
          company: it.company?.name ?? it.company ?? it.current_positions?.[0]?.company ?? null,
          job_title: it.position ?? it.title ?? it.current_positions?.[0]?.role ?? null,
          location: it.location ?? null,
          linkedin_url: linkedinUrl,
          avatar_url: it.profile_picture_url ?? it.avatar_url ?? null,
        };
        // Vorschau-Liste (gedeckelt) für die Anzeige im Frontend.
        if (results.length < PREVIEW_CAP) results.push(mapped);

        // Nur Personen-Treffer werden in die Inbox importiert (Unternehmen: nur gezählt).
        if (category !== "people") continue;

        // Import in die Import-Inbox (linkedin_inbox) via RPC — NICHT ins CRM.
        // it.id = sales_nav_id (Sales-Nav, ACwAA) bzw. provider_id (Classic, ACoAA).
        const idRaw: string | null = (it.id ?? it.provider_id ?? it.member_id) ?? null;
        const lead: Record<string, unknown> = {
          ...mapped,                                   // name/first/last/headline/company/job_title/location/linkedin_url/avatar_url
          sales_nav_id: isSalesNav ? idRaw : null,
          provider_id: isSalesNav ? (it.provider_id ?? null) : idRaw,
          source: "linkedin_search",
        };
        // RPC dedupt team-scoped über sales_nav_id/provider_id. Ohne beide Arbiter → skip.
        if (!lead.sales_nav_id && !lead.provider_id) continue;
        const { data: up, error: upErr } = await sb.rpc("sales_nav_upsert_inbox", {
          p_team_id: conn.teamId, p_user_id: auth.userId, p_lead: lead,
        });
        if (upErr) { console.warn(`[unipile-search] inbox upsert: ${upErr.message}`); continue; }
        const res = up as { id?: string; inserted?: boolean } | null;
        if (res?.inserted) imported++;
        const inboxId = res?.id ?? null;
        // Optionale Ziel-Liste = inbox_lists.id → Mitgliedschaft (idempotent).
        if (targetListId && inboxId) {
          const { error: mErr } = await sb.from("inbox_list_members")
            .upsert({ list_id: targetListId, inbox_id: inboxId, user_id: auth.userId },
              { onConflict: "list_id,inbox_id", ignoreDuplicates: true });
          if (mErr) console.warn(`[unipile-search] inbox_list_members: ${mErr.message}`);
        }
      }
      cursor = resp?.cursor ?? resp?.paging?.cursor ?? undefined;
      if (!cursor || items.length === 0) break;
    }

    if (search) {
      await sb.from("linkedin_searches").update({
        status: "done",
        last_cursor: cursor ?? null,
        results_imported: (search.results_imported ?? 0) + imported,
      }).eq("id", search.id);
    }

    return jsonResponse({
      ok: true,
      found: seen.length,
      imported,
      items: results,                       // Vorschau-Treffer für die Anzeige (Phase 1.5)
      preview_truncated: seen.length > results.length,
      cursor: cursor ?? null,
    });
  } catch (e) {
    const rateLimited = e instanceof UnipileError && e.isRateLimited;
    console.error(`[unipile-search] ${e}`);
    return jsonResponse(
      { error: String(e), rate_limited: rateLimited },
      rateLimited ? 429 : 500,
    );
  }
});

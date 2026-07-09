// =====================================================================
// Feature 1 — LinkedIn-Suche / Prospecting
// User-getriggert: invoke('unipile-search', { body: { search_id } })
//   ODER Ad-hoc: { params, api, category, auto_import_leads }
// Führt eine Unipile-LinkedIn-Suche aus und importiert Treffer als leads
// (source='linkedin_search'), dedupe über leads.linkedin_url.
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

const MAX_PAGES = 5; // Schutz gegen Endlos-Pagination pro Aufruf

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
    const autoImport = search?.auto_import_leads ?? input.auto_import_leads ?? true;
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

    for (let page = 0; page < MAX_PAGES; page++) {
      const resp = await linkedinSearch(conn, body, cursor);
      const items: any[] = resp?.items ?? resp?.results ?? resp?.data ?? [];
      for (const it of items) {
        seen.push(it);
        if (!autoImport || category !== "people") continue;
        // Feldnamen gegen import-unipile-relations/-salesnav verifiziert (2026-07):
        // Unipile liefert public_profile_url (=linkedin_url) bzw. public_identifier.
        const linkedinUrl = it.public_profile_url ?? it.profile_url ?? it.url
          ?? (it.public_identifier ? `https://www.linkedin.com/in/${it.public_identifier}` : null);
        const name = it.name
          || [it.first_name, it.last_name].filter(Boolean).join(" ")
          || "Unbekannt";
        // Dedupe: Upsert über leads.linkedin_url (Partial-Unique-Index existiert).
        const leadRow: Record<string, unknown> = {
          user_id: auth.userId,
          team_id: conn.teamId,          // team_id von Anfang an (späterer Modul-Lockdown ohne Backfill)
          name,
          first_name: it.first_name ?? null,
          last_name: it.last_name ?? null,
          headline: it.headline ?? it.title ?? null,
          company: it.company?.name ?? it.company ?? it.current_positions?.[0]?.company ?? null,
          job_title: it.position ?? it.title ?? it.current_positions?.[0]?.role ?? null,
          location: it.location ?? null,
          linkedin_url: linkedinUrl,
          profile_url: linkedinUrl,
          avatar_url: it.profile_picture_url ?? it.avatar_url ?? null,
          status: "Lead",              // Fallstrick #2: gültiger Lead-Status
          source: "linkedin_search",
          lead_source: "linkedin",
        };
        // Dedupe manuell: der Unique-Index auf leads(user_id, linkedin_url) ist
        // PARTIAL (WHERE linkedin_url IS NOT NULL AND != '') und daher per
        // ON CONFLICT nicht zuverlässig inferierbar -> erst prüfen, dann einfügen.
        let leadId: string | null = null;
        if (linkedinUrl) {
          const { data: existing } = await sb.from("leads")
            .select("id").eq("user_id", auth.userId).eq("linkedin_url", linkedinUrl).maybeSingle();
          leadId = existing?.id ?? null;
        }
        if (!leadId) {
          const { data: inserted, error } = await sb.from("leads").insert(leadRow).select("id").maybeSingle();
          if (!error) { imported++; leadId = inserted?.id ?? null; }
          else console.warn(`[unipile-search] lead insert: ${error.message}`);
        }
        if (targetListId && leadId) {
          await sb.from("lead_list_members")
            .upsert({ list_id: targetListId, lead_id: leadId },
              { onConflict: "list_id,lead_id", ignoreDuplicates: true });
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

    return jsonResponse({ ok: true, found: seen.length, imported, cursor: cursor ?? null });
  } catch (e) {
    const rateLimited = e instanceof UnipileError && e.isRateLimited;
    console.error(`[unipile-search] ${e}`);
    return jsonResponse(
      { error: String(e), rate_limited: rateLimited },
      rateLimited ? 429 : 500,
    );
  }
});

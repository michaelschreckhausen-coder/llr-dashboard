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
  identifierFromUrl,
  linkedinSearch,
  resolveSearchParameter,
  serviceClient,
  UnipileError,
  userClientFromReq,
} from "../_shared/unipile.ts";
import { requirePermission } from "../_shared/permissions.ts";
import { validateSearchUrl } from "../_shared/linkedinSearchUrl.ts";

const MAX_PAGES = 5;      // Schutz gegen Endlos-Pagination pro Aufruf
const PREVIEW_CAP = 100;  // max. Treffer, die als Vorschau (items) zurückgegeben werden

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  // Hoisted, damit der äußere catch die Suche bei Fehler auf 'failed' setzen kann.
  let searchId: string | null = null;
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) return jsonResponse({ error: "unauthorized" }, 401);

    // Permission-Gate linkedin.automation (Kill-Switch im Resolver).
    const uc = userClientFromReq(req);
    if (!uc) return jsonResponse({ error: "unauthorized" }, 401);
    { const denied = await requirePermission(uc, "linkedin.automation"); if (denied) return denied; }

    const sb = serviceClient();
    const conn = await getUnipileConnection(sb, auth.userId);
    if (!conn) {
      return jsonResponse({ error: "Kein aktiver Unipile-LinkedIn-Account verbunden." }, 409);
    }

    const input = await req.json().catch(() => ({}));
    const brandVoiceId: string | null = input.brand_voice_id ?? null; // aktive Marke -> Treffer sichtbar in brand-scoped LinkedIn Kontakte
    let search: any = null;

    if (input.search_id) {
      searchId = input.search_id;
      // Autorisierung via RLS (Policy linkedin_searches_brand: has_brand_access(brand_voice_id))
      // — IDENTISCH zur Liste. Darum den User-Client (RLS-enforced) statt Service-Client +
      // owner-Filter: jedes brand-berechtigte Team-Mitglied darf die Team-Suche ausführen
      // (owner-only war die Anomalie — Liste zeigt team-/markenweit, Execute verlangte Ersteller).
      // Airtight: ohne bestandenen RLS-SELECT gibt es keine Row → früher Return; kein anderer
      // Zweig fasst die Suche ohne diesen Fetch an.
      const { data, error } = await uc
        .from("linkedin_searches")
        .select("*")
        .eq("id", input.search_id)
        .maybeSingle();
      if (error || !data) return jsonResponse({ error: "Suche nicht gefunden oder kein Zugriff." }, 404);
      search = data;
    }

    const api = search?.api ?? input.api ?? "classic";
    const category = search?.category ?? input.category ?? "people";
    const params = search?.params ?? input.params ?? {};
    const searchUrl = search?.search_url ?? input.search_url ?? null;
    const isSalesNav = api === "sales_navigator";
    // target_list_id zeigt jetzt auf inbox_lists (nicht mehr lead_lists) — Prozess-Vereinheitlichung.
    const targetListId = search?.target_list_id ?? input.target_list_id ?? null;

    // ── Modus 'import': ausgewaehlte Vorschau-Treffer jetzt in die LinkedIn Kontakte
    //    schreiben (aus der Suche kommt NICHTS mehr automatisch rein). ──
    if (input.mode === "import") {
      const items: any[] = Array.isArray(input.items) ? input.items : [];
      let imported = 0, skipped = 0;
      for (const it of items) {
        const lead: Record<string, unknown> = {
          name: it.name ?? "Unbekannt",
          first_name: it.first_name ?? null, last_name: it.last_name ?? null,
          headline: it.headline ?? null, company: it.company ?? null,
          job_title: it.job_title ?? null, location: it.location ?? null,
          linkedin_url: it.linkedin_url ?? null, avatar_url: it.avatar_url ?? null,
          sales_nav_id: it.sales_nav_id ?? null, provider_id: it.provider_id ?? null,
          source: "linkedin_search",
        };
        if (!lead.sales_nav_id && !lead.provider_id) { skipped++; continue; }
        const { data: up, error: upErr } = await sb.rpc("sales_nav_upsert_inbox", {
          p_team_id: conn.teamId, p_user_id: auth.userId, p_lead: lead, p_brand_voice_id: brandVoiceId,
        });
        if (upErr) { console.warn(`[unipile-search] import upsert: ${upErr.message}`); skipped++; continue; }
        const res = up as { id?: string; inserted?: boolean } | null;
        if (res?.inserted) imported++;
        const inboxId = res?.id ?? null;
        if (targetListId && inboxId) {
          const { error: mErr } = await sb.from("inbox_list_members")
            .upsert({ list_id: targetListId, inbox_id: inboxId, user_id: auth.userId },
              { onConflict: "list_id,inbox_id", ignoreDuplicates: true });
          if (mErr) console.warn(`[unipile-search] inbox_list_members: ${mErr.message}`);
        }
      }
      if (search) {
        await sb.from("linkedin_searches")
          .update({ results_imported: (search.results_imported ?? 0) + imported })
          .eq("id", search.id);
      }
      return jsonResponse({ ok: true, imported, requested: items.length, skipped });
    }

    // Guard: eine hinterlegte search_url MUSS eine echte Such-Ergebnis-URL sein
    // (kein Profil-/Company-/Post-Link). Fängt den malformed_request-Roundtrip früh ab
    // und beendet die Suche sichtbar auf 'failed' statt sie auf 'running' hängen zu lassen.
    {
      const v = validateSearchUrl(searchUrl);
      if (!v.ok) {
        if (search) {
          await sb.from("linkedin_searches")
            .update({ status: "error", last_error: v.message, last_run_at: new Date().toISOString() })
            .eq("id", search.id);
        }
        return jsonResponse({ error: v.message }, 400);
      }
    }

    // Body für Unipile: entweder URL- oder Parameter-basierte Suche.
    // WICHTIG (Classic/People-Schema): required = api+category; keywords = STRING;
    // location/industry/company = Array<ID-String> (via /linkedin/search/parameters
    // aufgelöst, NIE Freitext) — leere/unauflösbare Filter WEGLASSEN, sonst 400 anyOf.
    let body: Record<string, unknown>;
    if (searchUrl) {
      body = { url: searchUrl };
    } else {
      body = { api, category };
      const kw = typeof params.keywords === "string" ? params.keywords.trim() : "";
      if (kw) body.keywords = kw;
      // Berufsposition/Titel → Unipile-SN-Filter `keywords_title` (verifiziert 2026-08-10).
      // Quirk: keywords_title greift nur mit gesetztem keywords → Titel in keywords spiegeln,
      // wenn kein separates Keyword da ist (sonst liefert die SN-Suche 0). Classic ignoriert
      // Titel weitgehend — dafür gibt's den UI-Hinweis „nur Sales Navigator".
      const kwTitle = typeof params.keywords_title === "string" ? params.keywords_title.trim() : "";
      if (kwTitle) {
        body.keywords_title = kwTitle;
        if (!body.keywords) body.keywords = kwTitle;
      }
      // Freitext-Filter nur für Personen-Suche auflösen (Company-Kategorie: nur keywords).
      if (category === "people") {
        const filters: Array<[string, "LOCATION" | "INDUSTRY" | "COMPANY"]> = [
          ["location", "LOCATION"], ["industry", "INDUSTRY"], ["company", "COMPANY"],
        ];
        for (const [field, ptype] of filters) {
          const v = (params as Record<string, unknown>)[field];
          if (Array.isArray(v)) { if (v.length) body[field] = v; continue; } // schon IDs
          const raw = typeof v === "string" ? v.trim() : "";
          if (!raw) continue;
          try {
            const id = await resolveSearchParameter(conn, ptype, raw);
            if (id) body[field] = [id];
            else console.warn(`[unipile-search] '${raw}' (${ptype}) nicht auflösbar — Filter weggelassen`);
          } catch (e) {
            console.warn(`[unipile-search] Parameter-Auflösung '${raw}' (${ptype}) fehlgeschlagen: ${e}`);
          }
        }
      }
    }

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

        // KEIN Auto-Import mehr — die Suche liefert nur eine Vorschau.
        // Arbiter-IDs an den Vorschau-Treffer haengen, damit der spaetere
        // Import (mode:'import') team-scoped dedupen kann.
        if (category === "people") {
          const idRaw: string | null = (it.id ?? it.provider_id ?? it.member_id) ?? null;
          (mapped as any).sales_nav_id = isSalesNav ? idRaw : null;
          (mapped as any).provider_id  = isSalesNav ? (it.provider_id ?? null) : idRaw;
          (mapped as any).source = "linkedin_search";
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
    // Stuck-running-Fix: bei jedem Fehler die Suche auf 'failed' setzen (nicht ewig 'running'),
    // mit Fehlertext — retry-fähig. Nur im gespeicherte-Suche-Pfad (searchId gesetzt).
    if (searchId) {
      try {
        await serviceClient().from("linkedin_searches")
          .update({ status: "error", last_error: String(e), last_run_at: new Date().toISOString() })
          .eq("id", searchId);
      } catch (_e) { /* best effort — Fehler-Response geht trotzdem raus */ }
    }
    return jsonResponse(
      { error: String(e), rate_limited: rateLimited },
      rateLimited ? 429 : 500,
    );
  }
});

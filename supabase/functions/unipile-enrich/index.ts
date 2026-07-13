// =====================================================================
// Feature 6 — Profil-/Firmen-Enrichment
// User-getriggert: invoke('unipile-enrich', { body: { lead_id } })
//   -> reichert einen Lead per Unipile-Profil an und (falls Firma erkannt)
//      zusätzlich per Firmenprofil (mit Cache).
// Optional: { company_identifier } nur Firma; { linkedin_url } ad-hoc.
// =====================================================================
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import {
  getAuthenticatedUser,
  getCompany,
  getProfile,
  getUnipileConnection,
  hasAddon,
  identifierFromUrl,
  serviceClient,
  UnipileError,
  userClientFromReq,
} from "../_shared/unipile.ts";

const COMPANY_CACHE_TTL_DAYS = 30;

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
    if (!conn) return jsonResponse({ error: "Kein aktiver Unipile-LinkedIn-Account." }, 409);

    const input = await req.json().catch(() => ({}));

    // --- Nur-Firma-Anreicherung ---
    if (input.company_identifier && !input.lead_id) {
      const company = await enrichCompany(sb, conn, input.company_identifier);
      return jsonResponse({ ok: true, company });
    }

    // --- Lead-Anreicherung ---
    let lead: any = null;
    if (input.lead_id) {
      const { data } = await sb.from("leads").select("*")
        .eq("id", input.lead_id).eq("user_id", auth.userId).maybeSingle();
      lead = data;
      if (!lead) return jsonResponse({ error: "Lead nicht gefunden." }, 404);
    }

    const url = lead?.linkedin_url ?? lead?.profile_url ?? input.linkedin_url ?? null;
    const identifier = identifierFromUrl(url);
    if (!identifier) return jsonResponse({ error: "Kein LinkedIn-Identifier ableitbar." }, 400);

    const profile = await getProfile(conn, identifier);

    // Rückschreiben in leads (nur wenn Lead-Kontext vorhanden)
    let companyResult: any = null;
    if (lead) {
      // Reale Unipile-getProfile-Shape: first_name/last_name/headline/summary/
      // location/profile_picture_url liegen TOP-LEVEL; Position/Firma/Branche
      // dagegen in work_experience[0] (.position/.company als String/.industry).
      // ⚠️ Envelope noch zu verifizieren: falls Unipile das Profil wrappt
      //    (z.B. unter data/ oder als Array), greift profile.* ins Leere -> per
      //    read-only Test-GET /api/v1/users/{identifier} die echte Shape prüfen
      //    und den Zugriff hier ggf. entpacken.
      const exp = Array.isArray(profile?.work_experience) ? profile.work_experience[0] : null;
      const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
      const patch: Record<string, unknown> = {
        // name nur setzen, wenn der Lead noch keinen echten Namen hat
        name: (!lead.name || lead.name === "Unbekannt") && fullName ? fullName : lead.name,
        headline: profile?.headline ?? lead.headline,
        job_title: exp?.position ?? profile?.headline ?? lead.job_title,
        company: exp?.company ?? lead.company,
        location: profile?.location ?? exp?.location ?? lead.location,
        first_name: profile?.first_name ?? lead.first_name,
        last_name: profile?.last_name ?? lead.last_name,
        avatar_url: profile?.profile_picture_url ?? lead.avatar_url,
        industry: exp?.industry ?? lead.industry,
        li_about_summary: profile?.summary ?? lead.li_about_summary,
        enriched_at: new Date().toISOString(),
        enrichment_source: "unipile_profile",
      };
      // Fallstrick #1: keine ENUM-Felder in kombiniertem Update mischen.
      // (company_size ist ENUM -> separat unten, falls Firma es liefert.)
      const { error } = await sb.from("leads").update(patch).eq("id", lead.id);
      if (error) console.warn(`[unipile-enrich] lead update: ${error.message}`);

      // Firmenprofil: kein profile.company-Objekt — der aktuelle Arbeitgeber
      // kommt aus work_experience[0]. Company-ID/URN bevorzugen, sonst
      // best-effort über den Firmennamen (getCompany akzeptiert "name or ID").
      const companyId = exp?.company_id ?? exp?.company_urn
        ?? identifierFromUrl(exp?.company_url) ?? exp?.company ?? null;
      if (companyId) {
        companyResult = await enrichCompany(sb, conn, companyId);
        if (companyResult) {
          const cp: Record<string, unknown> = {
            company: companyResult.name ?? patch.company,
            company_website: companyResult.website ?? lead.company_website,
            industry: companyResult.industry ?? patch.industry,
          };
          await sb.from("leads").update(cp).eq("id", lead.id);
        }
      }
    }

    return jsonResponse({ ok: true, profile_fetched: true, company: companyResult });
  } catch (e) {
    const rl = e instanceof UnipileError && e.isRateLimited;
    console.error(`[unipile-enrich] ${e}`);
    return jsonResponse({ error: String(e), rate_limited: rl }, rl ? 429 : 500);
  }
});

// Firmenprofil mit Cache (TTL). Gibt das (ggf. gecachte) Firmen-Objekt zurück.
async function enrichCompany(sb: any, conn: any, identifier: string) {
  const ttl = new Date(Date.now() - COMPANY_CACHE_TTL_DAYS * 86400_000).toISOString();
  const { data: cached } = await sb.from("linkedin_company_cache")
    .select("*").eq("identifier", identifier).gte("fetched_at", ttl).maybeSingle();
  if (cached) return cached;

  const c = await getCompany(conn, identifier);
  const row = {
    identifier,
    name: c?.name ?? null,
    industry: c?.industry ?? null,
    employee_count: c?.employee_count ?? c?.staff_count ?? null,
    website: c?.website ?? null,
    hq_location: c?.headquarters ?? c?.location ?? null,
    description: c?.description ?? null,
    raw: c ?? null,
    fetched_at: new Date().toISOString(),
  };
  await sb.from("linkedin_company_cache").upsert(row, { onConflict: "identifier" });
  return row;
}

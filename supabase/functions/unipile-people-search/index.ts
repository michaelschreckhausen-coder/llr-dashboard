// unipile-people-search — schlanke Live-LinkedIn-Personensuche (Keyword) fuer den
// Empfaenger-Picker. User-JWT, brand-scoped. Liefert Vorschau-Treffer inkl. provider_id.
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { getAuthenticatedUser, userClientFromReq } from "../_shared/unipile.ts";
import { search } from "../_shared/unipile-client.ts";

Deno.serve(async (req) => {
  const pre = handlePreflight(req); if (pre) return pre;
  try {
    const auth = await getAuthenticatedUser(req); if (!auth) return jsonResponse({ error: "unauthorized" }, 401);
    const uc = userClientFromReq(req); if (!uc) return jsonResponse({ error: "unauthorized" }, 401);
    const input = await req.json().catch(() => ({} as any));
    const brandVoiceId = input.brand_voice_id ?? null;
    const query = String(input.query ?? "").trim();
    if (!brandVoiceId || query.length < 2) return jsonResponse({ items: [] });
    const { data: acc } = await uc.from("unipile_accounts").select("unipile_account_id").eq("brand_voice_id", brandVoiceId).eq("status", "OK").maybeSingle();
    if (!acc) return jsonResponse({ error: "Keine LinkedIn-Verbindung fuer diese Marke.", items: [] }, 409);
    const res = await search(acc.unipile_account_id, { kind: "search_classic", params: { keywords: query }, limit: 15 });
    if (!res.ok) return jsonResponse({ error: "LinkedIn-Suche fehlgeschlagen.", items: [] }, 502);
    const items = (res.data.items || []).slice(0, 15).map((p: any) => {
      const raw = p.raw || {};
      return { provider_id: p.provider_id, url: p.profile_url, name: p.name || "Profil", headline: p.headline, avatar_url: raw.profile_picture_url || raw.avatar_url || raw.profile_picture_url_large || null, source: "suche" };
    });
    return jsonResponse({ items });
  } catch (e) { return jsonResponse({ error: String(e), items: [] }, 500); }
});

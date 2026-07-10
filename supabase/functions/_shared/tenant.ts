// _shared/tenant.ts
//
// Mandanten-Trennung für Edge Functions, die mit dem SERVICE_ROLE-Client
// (supabaseAdmin) arbeiten und damit RLS KOMPLETT umgehen. IDs aus dem
// Request-Body (brand_voice_id, knowledge_ids, storage-Pfade …) sind
// User-Input und müssen gegen den authentifizierten Aufrufer validiert
// werden, sonst kann jeder eingeloggte User Fremd-Daten anderer Teams laden.
//
// Ebenen: USER (user_id) · TEAM (team_id, Multi-Team) · BRAND (brand_voice_id).

// deno-lint-ignore no-explicit-any
type Admin = any;

// Alle Team-IDs des Aufrufers (Multi-Team). Gecacht pro Invocation über Closure.
export async function getCallerTeamIds(admin: Admin, userId: string): Promise<string[]> {
  if (!userId) return [];
  const { data } = await admin.from('team_members').select('team_id').eq('user_id', userId);
  return (data || []).map((r: { team_id: string }) => r.team_id).filter(Boolean);
}

// Darf der Aufrufer diese Brand Voice nutzen? Owner ODER Team-Mitglied
// (inkl. geteilte Brands: is_shared im eigenen Team ODER explizit geteilt).
// Gibt die Brand-Row zurück (mit gewünschten cols) oder null.
export async function loadBrandVoiceIfAllowed(
  admin: Admin, brandVoiceId: string, userId: string, teamIds: string[], cols = '*',
): Promise<Record<string, unknown> | null> {
  if (!brandVoiceId) return null;
  const { data: bv } = await admin
    .from('brand_voices')
    .select(`${cols}, user_id, team_id, is_shared`)
    .eq('id', brandVoiceId)
    .maybeSingle();
  if (!bv) return null;
  const ownedByUser = bv.user_id === userId;
  const inTeam = bv.team_id && teamIds.includes(bv.team_id);
  if (ownedByUser || inTeam) return bv;
  // Explizit an den User geteilt?
  const { data: share } = await admin
    .from('brand_voice_shares').select('brand_voice_id')
    .eq('brand_voice_id', brandVoiceId).eq('user_id', userId).maybeSingle();
  if (share) return bv;
  // An eines der Teams des Users geteilt?
  if (teamIds.length) {
    const { data: tShare } = await admin
      .from('brand_voice_team_shares').select('brand_voice_id')
      .eq('brand_voice_id', brandVoiceId).in('team_id', teamIds).maybeSingle();
    if (tShare) return bv;
  }
  return null; // kein Zugriff
}

// Filtert eine Liste angeforderter IDs einer team-gescopeten Tabelle auf die,
// die tatsächlich zu einem Team des Aufrufers gehören (oder ihm gehören).
export async function filterOwnedIds(
  admin: Admin, table: string, ids: string[], userId: string, teamIds: string[],
): Promise<string[]> {
  if (!ids?.length) return [];
  const { data } = await admin.from(table).select('id, user_id, team_id').in('id', ids);
  return (data || [])
    .filter((r: { user_id: string; team_id: string }) =>
      r.user_id === userId || (r.team_id && teamIds.includes(r.team_id)))
    .map((r: { id: string }) => r.id);
}

// Filtert Storage-Pfade (visuals-Bucket) auf die des aktiven Teams / eigene.
// Pfad-Konvention: "<team_id|user_id>/…". Zusätzlich Abgleich mit visuals-Tabelle.
export async function filterOwnedStoragePaths(
  admin: Admin, paths: string[], userId: string, teamIds: string[],
): Promise<string[]> {
  if (!paths?.length) return [];
  const allowedPrefixes = new Set([userId, ...teamIds]);
  // 1. Präfix-Check (billiger First-Pass)
  const prefixOk = paths.filter(p => allowedPrefixes.has(String(p).split('/')[0]));
  if (!prefixOk.length) return [];
  // 2. Gegen visuals-Tabelle absichern (team_id/user_id der Row)
  const { data } = await admin.from('visuals')
    .select('storage_path, user_id, team_id').in('storage_path', prefixOk);
  const verified = (data || [])
    .filter((r: { user_id: string; team_id: string }) =>
      r.user_id === userId || (r.team_id && teamIds.includes(r.team_id)))
    .map((r: { storage_path: string }) => r.storage_path);
  return verified;
}

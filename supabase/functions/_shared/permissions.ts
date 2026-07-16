// ============================================================================
// P3 · Schritt 2 — zentraler Permission-/Seat-Guard fuer Edge Functions
// ============================================================================
// EIN Guard-Punkt statt verstreuter i_have_addon-Checks. Member-basiert (B1):
// kein Seat-Zwang (Seats werden erst in P4 load-bearing).
//
// INERT bis Schritt 3: noch keine EF importiert diese Helfer. Erst beim Gate-Bau
// (EF #1-#8) werden sie an den jeweiligen Guard-Punkt gehaengt.
//
// Beide Pfade leiten aus derselben Wahrheit ab wie das Frontend:
//   requirePermission(user, key)          -> RPC i_have_permission   (== get_my_entitlements)
//   requirePermissionForAccount(svc, a,k) -> RPC account_has_permission
//   requireSeat(user)                     -> RPC get_my_entitlements .is_active
// -> "FE zeigt an, EF verweigert" (oder umgekehrt) ist strukturell ausgeschlossen.
// ============================================================================

function deny(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * USER-getriggerte EFs (#2 publish, #6 sales-nav-import, #7 search/enrich).
 * @returns null wenn erlaubt; sonst eine 403-Response (Body: need_permission + key)
 *          zum direkten `return`. Das FE zeigt daran den Upgrade-CTA.
 */
export async function requirePermission(
  userClient: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
  key: string,
): Promise<Response | null> {
  const { data, error } = await userClient.rpc("i_have_permission", { p_key: key });
  if (error) {
    console.warn(`[require_permission] rpc error for key=${key}:`, error);
    return deny(403, { error: "need_permission", key });
  }
  return data === true ? null : deny(403, { error: "need_permission", key });
}

/**
 * CRON/SERVICE-EFs (#3 monitor, #4 engagement, #5 invitations, #7 la-runner,
 * #8 relations). Kein auth.uid() — prueft das Entitlement des ACCOUNT-Plans.
 * @returns true wenn der Account den Key hat. Cron SKIPPT den Account/Job bei
 *          false (kein 403 — Server-Kontext).
 */
export async function accountHasPermission(
  serviceClient: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
  accountId: string,
  key: string,
): Promise<boolean> {
  const { data, error } = await serviceClient.rpc("account_has_permission", {
    p_account_id: accountId,
    p_key: key,
  });
  if (error) {
    console.warn(`[account_has_permission] rpc error acct=${accountId} key=${key}:`, error);
    return false; // fail-closed im Cron
  }
  return data === true;
}

/**
 * CRON/SERVICE, team-keyed — der ergonomische Cron-Guard: alle EF-Tabellen tragen
 * team_id (nicht account_id); team_has_permission macht den teams->accounts->plans-
 * Join + Kill-Switch server-seitig.
 * @returns true wenn der Account des Teams den Key hat. Cron SKIPPT bei false.
 */
export async function teamHasPermission(
  serviceClient: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
  teamId: string,
  key: string,
): Promise<boolean> {
  const { data, error } = await serviceClient.rpc("team_has_permission", {
    p_team_id: teamId,
    p_key: key,
  });
  if (error) {
    console.warn(`[team_has_permission] rpc error team=${teamId} key=${key}:`, error);
    return false; // fail-closed im Cron
  }
  return data === true;
}

/**
 * Connect (#1) — member-basiert (B1): der User muss aktives Mitglied eines
 * nutzbaren Accounts sein (get_my_entitlements.is_active). KEIN Seat-Zwang.
 * @returns null wenn erlaubt; sonst 403 need_active_plan.
 */
export async function requireSeat(
  userClient: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
): Promise<Response | null> {
  const { data, error } = await userClient.rpc("get_my_entitlements", {});
  if (error || !data) {
    console.warn(`[require_seat] entitlements error:`, error);
    return deny(403, { error: "need_active_plan" });
  }
  const isActive = (data as { is_active?: boolean }).is_active === true;
  return isActive ? null : deny(403, { error: "need_active_plan" });
}

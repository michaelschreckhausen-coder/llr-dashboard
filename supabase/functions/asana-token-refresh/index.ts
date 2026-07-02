// asana-token-refresh
// Erneuert Access-Tokens, die demnächst ablaufen. Per pg_cron (z. B. alle
// 15 min) oder manuell aufrufbar. Nutzt die Service-Role — kein User-JWT.
//
// Response: { "refreshed": <n>, "failed": <n> }

import { jsonResponse } from "../_shared/cors.ts";
import {
  refreshAccessToken,
  serviceClient,
  vaultRead,
  vaultUpdate,
} from "../_shared/asana.ts";

// Tokens, die innerhalb dieses Fensters ablaufen, werden erneuert.
const REFRESH_WINDOW_MS = 10 * 60 * 1000; // 10 Minuten

Deno.serve(async (_req) => {
  const sb = serviceClient();
  let refreshed = 0;
  let failed = 0;

  try {
    const threshold = new Date(Date.now() + REFRESH_WINDOW_MS).toISOString();
    const { data: conns, error } = await sb
      .from("asana_connections")
      .select("team_id, access_token_id, refresh_token_id, access_expires_at")
      .lt("access_expires_at", threshold);
    if (error) throw new Error(`select_connections: ${error.message}`);

    for (const conn of conns ?? []) {
      try {
        const refreshToken = await vaultRead(sb, conn.refresh_token_id);
        const token = await refreshAccessToken(refreshToken);

        await vaultUpdate(sb, conn.access_token_id, token.access_token);
        // Asana kann bei Refresh einen neuen Refresh-Token zurückgeben.
        if (token.refresh_token) {
          await vaultUpdate(sb, conn.refresh_token_id, token.refresh_token);
        }
        const accessExpiresAt = new Date(
          Date.now() + token.expires_in * 1000,
        ).toISOString();
        await sb
          .from("asana_connections")
          .update({ access_expires_at: accessExpiresAt, updated_at: new Date().toISOString() })
          .eq("team_id", conn.team_id);
        refreshed++;
      } catch (e) {
        console.error(`refresh failed for team ${conn.team_id}:`, e);
        failed++;
      }
    }

    return jsonResponse({ refreshed, failed });
  } catch (e) {
    console.error("asana-token-refresh error:", e);
    return jsonResponse({ error: "internal_error", refreshed, failed }, 500);
  }
});

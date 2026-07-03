// Asana-API- und OAuth-Client sowie Supabase-Service-Helfer.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const ASANA_AUTHORIZE_URL = "https://app.asana.com/-/oauth_authorize";
export const ASANA_TOKEN_URL = "https://app.asana.com/-/oauth_token";
export const ASANA_REVOKE_URL = "https://app.asana.com/-/oauth_revoke";
export const ASANA_API_BASE = "https://app.asana.com/api/1.0";

// Hinweis Scopes: Die Asana-App nutzt den Default-Scope (Full Access).
// Granulare Scopes (projects:read, tasks:write, …) werden NICHT angefragt —
// sie erfordern eine explizite Freischaltung in der Asana-App-Konfiguration,
// sonst lehnt Asana den Authorize-Request mit `forbidden_scopes` ab.
// Bei Bedarf granulare Scopes hier definieren UND in der App aktivieren.

export interface AsanaTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  data?: { gid: string; name: string; email: string };
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function asanaConfig() {
  return {
    clientId: requireEnv("ASANA_CLIENT_ID"),
    clientSecret: requireEnv("ASANA_CLIENT_SECRET"),
    redirectUri: requireEnv("ASANA_REDIRECT_URI"),
  };
}

/** Supabase-Client mit Service-Role (umgeht RLS — nur serverseitig!). */
export function serviceClient(): SupabaseClient {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
}

/** Autorisierungs-URL für den OAuth-Start bauen. */
export function buildAuthorizeUrl(params: {
  state: string;
  codeChallenge: string;
}): string {
  const { clientId, redirectUri } = asanaConfig();
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state: params.state,
    code_challenge_method: "S256",
    code_challenge: params.codeChallenge,
    // Kein scope-Param => Asana vergibt den Default-Scope (Full Access).
    // Siehe Hinweis oben: granulare Scopes würden forbidden_scopes auslösen.
  });
  return `${ASANA_AUTHORIZE_URL}?${q.toString()}`;
}

/** Authorization-Code gegen Tokens tauschen (mit PKCE-Verifier). */
export async function exchangeCode(
  code: string,
  codeVerifier: string,
): Promise<AsanaTokenResponse> {
  const { clientId, clientSecret, redirectUri } = asanaConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
    code_verifier: codeVerifier,
  });
  const res = await fetch(ASANA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Asana token exchange failed: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

/** Access-Token per Refresh-Token erneuern. */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<AsanaTokenResponse> {
  const { clientId, clientSecret } = asanaConfig();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  const res = await fetch(ASANA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Asana token refresh failed: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

/** Authentifizierter GET gegen die Asana-API. */
export async function asanaGet(
  accessToken: string,
  path: string,
): Promise<Response> {
  return await fetch(`${ASANA_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

// ---- Vault-Helfer (rufen die SQL-SECURITY-DEFINER-Funktionen auf) ----

export async function vaultStore(
  sb: SupabaseClient,
  secret: string,
  name: string,
): Promise<string> {
  const { data, error } = await sb.rpc("asana_vault_store", {
    p_secret: secret,
    p_name: name,
  });
  if (error) throw new Error(`vault_store: ${error.message}`);
  return data as string;
}

export async function vaultUpdate(
  sb: SupabaseClient,
  id: string,
  secret: string,
): Promise<void> {
  const { error } = await sb.rpc("asana_vault_update", {
    p_id: id,
    p_secret: secret,
  });
  if (error) throw new Error(`vault_update: ${error.message}`);
}

export async function vaultRead(
  sb: SupabaseClient,
  id: string,
): Promise<string> {
  const { data, error } = await sb.rpc("asana_vault_read", { p_id: id });
  if (error) throw new Error(`vault_read: ${error.message}`);
  return data as string;
}

/**
 * Verifiziert das Leadesk-JWT aus dem Authorization-Header und gibt die
 * User-ID zurück. Nutzt den Anon-Client mit dem übergebenen Token.
 */
export async function getAuthenticatedUser(
  req: Request,
): Promise<{ userId: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const anon = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_ANON_KEY"),
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data, error } = await anon.auth.getUser();
  if (error || !data.user) return null;
  return { userId: data.user.id };
}

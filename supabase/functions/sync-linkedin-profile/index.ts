// Supabase Edge Function: sync-linkedin-profile
//
// LinkedIn-Profile-Sync Phase 1 (OIDC-only).
//
// Zwei Modes via body.action:
//   - 'check' (default): liest fresh identity_data von auth.users.identities[linkedin_oidc],
//                        vergleicht via md5(JSON) gegen profiles.linkedin_data_raw,
//                        wenn ungleich: returnt diff-Array, schreibt NICHTS.
//                        Beim allererstmaligen Sync (linkedin_data_raw IS NULL):
//                        `firstSync: true` damit Frontend auto-confirm-all default
//                        statt explicit-Modal.
//   - 'apply':  Frontend bestätigt n Felder → schreibt sie in profiles + UPDATE
//               linkedin_data_raw + linkedin_data_last_synced_at.
//
// Auth: JWT in Authorization-Header. supabaseAdmin.auth.getUser(jwt) liefert
// das User-Objekt incl. `identities[]` (vom GoTrue-Server).
//
// Mapping OIDC-Claims → profiles-Spalten:
//   identity_data.picture            → profiles.avatar_url
//   identity_data.given_name + ' ' + identity_data.family_name  → profiles.full_name
//   (identity_data.email wird NICHT in profiles geschrieben — Auth-Email lebt
//    in auth.users.email und ändert sich nur via separate Confirm-Flow)
//
// linkedin_url wird aus identity_data.profile (falls vorhanden) bzw. aus dem
// 'iss'+'sub'-Pattern gebaut (LinkedIn liefert die Profile-URL aktuell nur
// indirekt — wir versuchen mehrere Felder als Fallback).
//
// Phase 2 (Extension-Scrape) wird zusätzliche Diff-Felder einliefern
// (linkedin_headline, linkedin_summary, linkedin_company) — diese Spalten
// sind erst ab Phase-2-Migration vorhanden, sync-Function hier ignoriert sie.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ─── md5-Hash für stable Compare ──────────────────────────────────────────────
// Deno-std hat keine md5-Implementierung mehr (deprecated). Wir nutzen
// SHA-1 als billigeren Hash für nicht-kryptographische Compares.
async function shortHash(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf  = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Stable JSON serialization (key-order independent)
function stableStringify(obj: Record<string, unknown> | null | undefined): string {
  if (!obj || typeof obj !== 'object') return JSON.stringify(obj);
  const keys = Object.keys(obj).sort();
  const sorted: Record<string, unknown> = {};
  for (const k of keys) sorted[k] = obj[k];
  return JSON.stringify(sorted);
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

interface OIDCData {
  sub?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email?: string;
  email_verified?: boolean;
  locale?: string;
  // LinkedIn-spezifische Felder, je nach GoTrue-Version unterschiedlich befüllt
  profile?: string;       // Manchmal die Profile-URL
  preferred_username?: string;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  linkedin_url: string | null;
  linkedin_data_raw: OIDCData | null;
  linkedin_data_last_synced_at: string | null;
}

interface DiffField {
  field: 'avatar_url' | 'full_name' | 'linkedin_url';
  label: string;
  current: string | null;
  fresh: string | null;
  // Pretty hints für das Modal
  type: 'image' | 'text';
}

function computeDiff(oidc: OIDCData, profile: ProfileRow): DiffField[] {
  const diff: DiffField[] = [];

  // avatar_url
  const freshAvatar = oidc.picture || null;
  if (freshAvatar && freshAvatar !== profile.avatar_url) {
    diff.push({
      field:   'avatar_url',
      label:   'Profilbild',
      current: profile.avatar_url,
      fresh:   freshAvatar,
      type:    'image',
    });
  }

  // full_name
  const freshName = [oidc.given_name, oidc.family_name].filter(Boolean).join(' ').trim()
                 || oidc.name
                 || null;
  if (freshName && freshName !== profile.full_name) {
    diff.push({
      field:   'full_name',
      label:   'Name',
      current: profile.full_name,
      fresh:   freshName,
      type:    'text',
    });
  }

  // linkedin_url (best-effort aus identity_data)
  const freshUrl = oidc.profile || null;
  if (freshUrl && freshUrl !== profile.linkedin_url) {
    diff.push({
      field:   'linkedin_url',
      label:   'LinkedIn-URL',
      current: profile.linkedin_url,
      fresh:   freshUrl,
      type:    'text',
    });
  }

  return diff;
}

// ─── Request Handler ──────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // 1) Auth via JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Nicht angemeldet" }, 401);
    const accessToken = authHeader.slice("Bearer ".length);
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !authData?.user) return json({ error: "Nicht angemeldet" }, 401);
    const userId = authData.user.id;

    // 2) Body
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* leerer Body okay für check */ }
    const action = (body.action as string) || 'check';

    // 3) LinkedIn-Identity aus auth.users.identities[]
    const identities = authData.user.identities || [];
    const liIdent = identities.find((i: { provider: string }) => i.provider === 'linkedin_oidc');
    if (!liIdent) {
      return json({
        hasChanges: false,
        notLinked: true,
        message: 'LinkedIn ist nicht mit diesem Account verknüpft',
      }, 200);
    }
    const oidc = (liIdent.identity_data || {}) as OIDCData;

    // 4) Profile-Row laden
    const { data: profile, error: profErr } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, avatar_url, linkedin_url, linkedin_data_raw, linkedin_data_last_synced_at')
      .eq('id', userId)
      .maybeSingle<ProfileRow>();
    if (profErr || !profile) return json({ error: 'Profile nicht gefunden' }, 404);

    // ─── Mode: check ─────────────────────────────────────────────────────
    if (action === 'check') {
      // Hash-Vergleich: identical → no-op
      const freshHash    = await shortHash(stableStringify(oidc));
      const previousHash = profile.linkedin_data_raw
        ? await shortHash(stableStringify(profile.linkedin_data_raw as Record<string, unknown>))
        : null;

      if (previousHash && freshHash === previousHash) {
        return json({
          hasChanges: false,
          message:    'Keine Änderungen seit letztem Sync',
          lastSync:   profile.linkedin_data_last_synced_at,
        }, 200);
      }

      const diff = computeDiff(oidc, profile);
      if (diff.length === 0) {
        // Hash unterschiedlich aber keine User-facing-Felder geändert
        // (z.B. nur locale gewechselt) → still update raw silently
        await supabaseAdmin.from('profiles').update({
          linkedin_data_raw:            oidc,
          linkedin_data_last_synced_at: new Date().toISOString(),
        }).eq('id', userId);
        return json({
          hasChanges: false,
          message:    'Nicht-relevante Änderungen — silent update',
          lastSync:   new Date().toISOString(),
        }, 200);
      }

      const firstSync = profile.linkedin_data_raw === null;

      return json({
        hasChanges: true,
        firstSync,
        diff,
        oidc, // Frontend braucht den Snapshot für Apply
      }, 200);
    }

    // ─── Mode: apply ─────────────────────────────────────────────────────
    if (action === 'apply') {
      const selectedFields = (body.fields as string[]) || [];
      const oidcSnapshot   = (body.oidc as OIDCData) || oidc; // Vom Frontend mit-geschickt oder fresh

      // Whitelist + Mapping zurück nach profiles-Spalten
      const updates: Record<string, unknown> = {};
      const diff = computeDiff(oidcSnapshot, profile);
      for (const d of diff) {
        if (!selectedFields.includes(d.field)) continue;
        updates[d.field] = d.fresh;
      }

      // Immer: linkedin_data_raw + linkedin_data_last_synced_at aktualisieren
      // (auch wenn keine selectedFields → markiert "User hat gesehen + verworfen")
      updates.linkedin_data_raw            = oidcSnapshot;
      updates.linkedin_data_last_synced_at = new Date().toISOString();

      const { error: updErr } = await supabaseAdmin
        .from('profiles')
        .update(updates)
        .eq('id', userId);
      if (updErr) return json({ error: 'Update fehlgeschlagen: ' + updErr.message }, 500);

      return json({
        success:        true,
        appliedFields:  selectedFields,
        lastSync:       updates.linkedin_data_last_synced_at,
      }, 200);
    }

    return json({ error: 'Unbekannte action: ' + action }, 400);

  } catch (e) {
    console.error('[sync-linkedin-profile] error:', e);
    return json({ error: (e as Error).message }, 500);
  }
});

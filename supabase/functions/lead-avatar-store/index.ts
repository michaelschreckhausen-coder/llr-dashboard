// Supabase Edge Function: lead-avatar-store
// ----------------------------------------------------------------------------
// Lädt das LinkedIn-Profilbild eines CRM-Kontakts server-seitig herunter und legt
// es dauerhaft im Bucket 'lead-avatars' ab; schreibt die stabile Storage-URL in
// leads.avatar_url. Grund: die Quell-URLs (media.licdn.com/...?e=<epoch>) laufen
// nach ~30 Tagen ab. Server-seitig, um Hotlink-/CORS-Probleme zu vermeiden.
//
// Body:
//   { "lead_id": "<uuid>" }                      → einzelner Kontakt (User-JWT, eigenes Team)
//   { "mode": "backfill", "limit": 50 }          → Batch (nur mit service_role-Key)
//
// Idempotent: zeigt avatar_url schon auf den Bucket, wird der Kontakt übersprungen.
// Fehler werden toleriert (kein Bild → Initialen-Fallback im Frontend, kein harter Fehler).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY    = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// WICHTIG: SUPABASE_URL ist intern (http://kong:8000) → getPublicUrl liefert eine
// im Browser nicht ladbare URL. Für die persistierte avatar_url die EXTERNE Basis
// nehmen (SUPABASE_PUBLIC_URL, z.B. https://supabase.leadesk.de).
const PUBLIC_BASE          = (Deno.env.get("SUPABASE_PUBLIC_URL") || SUPABASE_URL).replace(/\/+$/, "");
const BUCKET = "lead-avatars";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const isStorageUrl = (u: string | null) =>
  !!u && u.includes(`/storage/v1/object/public/${BUCKET}/`);

const extFor = (mime: string) =>
  mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("gif") ? "gif" : "jpg";

// Ein Kontakt: Quelle bestimmen → herunterladen → in Bucket → avatar_url setzen.
// Rückgabe: 'stored' | 'skipped' | 'nosource' | 'dead' | 'error'
async function storeOne(
  lead: { id: string; team_id: string | null; avatar_url: string | null; linkedin_url: string | null },
  nullifyDead = false,
): Promise<string> {
  if (isStorageUrl(lead.avatar_url)) return "skipped"; // schon dauerhaft

  // Quelle: vorhandene (externe) avatar_url, sonst Match aus linkedin_inbox.
  let src: string | null = lead.avatar_url && lead.avatar_url.trim() ? lead.avatar_url.trim() : null;
  if (!src && lead.linkedin_url) {
    const norm = lead.linkedin_url.toLowerCase().replace(/\/+$/, "");
    const { data: inbox } = await admin
      .from("linkedin_inbox")
      .select("avatar_url, linkedin_url")
      .not("avatar_url", "is", null)
      .limit(50);
    const hit = (inbox || []).find(
      (r: any) => (r.linkedin_url || "").toLowerCase().replace(/\/+$/, "") === norm && r.avatar_url && r.avatar_url.trim(),
    );
    src = hit ? hit.avatar_url.trim() : null;
  }
  if (!src || isStorageUrl(src)) return src ? "skipped" : "nosource";

  // Herunterladen. 'dead' = definitiver HTTP-Fehler (abgelaufene licdn-URL →
  // 403/404): das Bild kommt nie wieder. 'error' = transient (Timeout/Netz) →
  // beim nächsten Lauf erneut versuchen. Bei 'dead' im Backfill wird die tote
  // avatar_url auf NULL gesetzt, damit der tägliche Cron nicht ewig gegen
  // dieselben Leichen läuft (Frontend fällt sauber auf Initialen zurück).
  let bytes: Uint8Array; let mime = "image/jpeg";
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 10000);
    const res = await fetch(src, { signal: ctl.signal, redirect: "follow" });
    clearTimeout(to);
    if (!res.ok) {
      if (nullifyDead && src === lead.avatar_url) {
        await admin.from("leads").update({ avatar_url: null }).eq("id", lead.id).eq("avatar_url", src);
      }
      return "dead";
    }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.startsWith("image/")) mime = ct.split(";")[0];
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > 5_242_880) return "error";
    bytes = buf;
  } catch (_e) {
    return "error"; // transient — kein Nullen, nächster Lauf versucht erneut
  }

  const path = `${lead.team_id || "no-team"}/${lead.id}.${extFor(mime)}`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: true });
  if (upErr) return "error";
  const publicUrl = `${PUBLIC_BASE}/storage/v1/object/public/${BUCKET}/${path}`;

  const { error: updErr } = await admin.from("leads").update({ avatar_url: publicUrl }).eq("id", lead.id);
  if (updErr) return "error";
  return "stored";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { /* leerer Body ok */ }
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  // ── Batch-Backfill: nur mit service_role-Key ──────────────────────────────
  if (body.mode === "backfill") {
    if (token !== SUPABASE_SERVICE_KEY) return json({ error: "service_role required for backfill" }, 403);
    const limit = Math.min(Math.max(parseInt(body.limit ?? "50", 10) || 50, 1), 200);
    // Kandidaten: externe (nicht-Storage) avatar_url — v.a. die ablaufenden licdn-Links.
    const { data: leads, error } = await admin
      .from("leads")
      .select("id, team_id, avatar_url, linkedin_url")
      .not("avatar_url", "is", null)
      .neq("avatar_url", "")
      .not("avatar_url", "ilike", `%/${BUCKET}/%`)
      .limit(limit);
    if (error) return json({ error: error.message }, 500);
    const counts: Record<string, number> = { stored: 0, skipped: 0, nosource: 0, dead: 0, error: 0 };
    for (const l of leads || []) {
      const r = await storeOne(l as any, true); // nullifyDead: tote licdn-URLs entfernen (Cron-Bounding)
      counts[r] = (counts[r] || 0) + 1;
    }
    // Ergebnis wird vom Cron-curl geloggt (JSON) → Sichtbarkeit pro Lauf.
    return json({ mode: "backfill", processed: (leads || []).length, ...counts });
  }

  // ── Einzel-Kontakt: User-JWT, muss im Team des Kontakts sein ──────────────
  const leadId = body.lead_id;
  if (!leadId) return json({ error: "lead_id required" }, 400);

  // Caller verifizieren (RLS-Client mit dem User-Token).
  const asUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userRes } = await asUser.auth.getUser();
  const uid = userRes?.user?.id;
  const isService = token === SUPABASE_SERVICE_KEY;
  if (!uid && !isService) return json({ error: "unauthenticated" }, 401);

  // Kontakt laden (Sichtbarkeit über RLS des Callers, außer service_role).
  const reader = isService ? admin : asUser;
  const { data: lead, error: lErr } = await reader
    .from("leads")
    .select("id, team_id, avatar_url, linkedin_url")
    .eq("id", leadId)
    .single();
  if (lErr || !lead) return json({ error: "lead not found or not visible" }, 404);

  const result = await storeOne(lead as any);
  // avatar_url zurückgeben, damit das Frontend sofort umschalten kann.
  const { data: fresh } = await admin.from("leads").select("avatar_url").eq("id", leadId).single();
  return json({ lead_id: leadId, result, avatar_url: fresh?.avatar_url ?? null });
});

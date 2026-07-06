// process-automation-jobs — Unipile-Runner (ersetzt den Extension-Worker).
// Per pg_cron (SQL-Wrapper trigger_process_automation_jobs) minütlich aufgerufen.
// Claim (single-flight) → Unipile-API → writeback running→done/error.
// Welle 1: connect + visit. message-Handler ist im Code, wird aber NICHT geclaimt (dormant).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const UNIPILE_DSN = Deno.env.get("UNIPILE_DSN")!;
const UNIPILE_KEY = Deno.env.get("UNIPILE_API_KEY")!;
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const U = `https://${UNIPILE_DSN}/api/v1`;
const uHeaders = { "X-API-KEY": UNIPILE_KEY, "accept": "application/json", "content-type": "application/json" };
const db = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

const DAILY_CAP: Record<string, number> = { connect: 100, message: 150, visit: 135, follow: 100 };
const BATCH = 5;

function publicIdFromUrl(url: string): string | null {
  const m = url?.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

async function getProfile(accountId: string, publicId: string) {
  const r = await fetch(`${U}/users/${encodeURIComponent(publicId)}?account_id=${accountId}`, { headers: uHeaders });
  if (!r.ok) return { ok: false as const, error: `profile ${r.status}: ${await r.text()}` };
  const p = await r.json();
  return { ok: true as const, provider_id: p.provider_id as string, profile: p };
}

async function sendInvite(accountId: string, providerId: string, message?: string) {
  const body: Record<string, unknown> = { account_id: accountId, provider_id: providerId };
  if (message) body.message = message; // Notiz optional, LinkedIn-Limit 300 Zeichen
  const r = await fetch(`${U}/users/invite`, { method: "POST", headers: uHeaders, body: JSON.stringify(body) });
  return r.ok ? { ok: true as const, result: await r.json() } : { ok: false as const, error: `invite ${r.status}: ${await r.text()}` };
}

async function sendMessage(accountId: string, providerId: string, text: string, inmail = false) {
  const form = new FormData();
  form.append("account_id", accountId);
  form.append("text", text);
  form.append("attendees_ids", providerId);
  if (inmail) { form.append("linkedin[api]", "classic"); form.append("linkedin[inmail]", "true"); }
  const r = await fetch(`${U}/chats`, { method: "POST", headers: { "X-API-KEY": UNIPILE_KEY, "accept": "application/json" }, body: form });
  return r.ok ? { ok: true as const, result: await r.json() } : { ok: false as const, error: `message ${r.status}: ${await r.text()}` };
}

async function countDoneToday(userId: string, action: string): Promise<number> {
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const { count } = await db.from("automation_jobs").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("action", action).eq("status", "done").gte("executed_at", since.toISOString());
  return count ?? 0;
}

async function claim(jobId: string): Promise<boolean> {
  const { data } = await db.from("automation_jobs")
    .update({ status: "running", executed_at: new Date().toISOString() })
    .eq("id", jobId).eq("status", "pending").select("id"); // bedingter Claim
  return !!data && data.length === 1;
}

async function finish(jobId: string, status: "done" | "error", extra: Record<string, unknown>) {
  await db.from("automation_jobs").update({ status, executed_at: new Date().toISOString(), ...extra }).eq("id", jobId);
}

Deno.serve(async () => {
  const nowIso = new Date().toISOString();
  const { data: jobs } = await db.from("automation_jobs")
    .select("id, action, target_url, payload, user_id")
    .eq("status", "pending").lte("scheduled_at", nowIso)
    .in("action", ["connect", "visit"]) // Welle 1; message dormant, follow Welle 2
    .order("scheduled_at", { ascending: true }).limit(BATCH);

  const out: unknown[] = [];
  for (const job of jobs ?? []) {
    // 1) sendenden Unipile-Account des Users (Status OK)
    const { data: acct } = await db.from("unipile_accounts")
      .select("unipile_account_id").eq("user_id", job.user_id).eq("status", "OK").limit(1).maybeSingle();
    if (!acct) { await finish(job.id, "error", { error: "Kein verbundener LinkedIn-Account (Unipile) für diesen User" }); continue; }
    const accountId = acct.unipile_account_id;

    // 2) Tages-Cap
    if (await countDoneToday(job.user_id, job.action) >= (DAILY_CAP[job.action] ?? 100)) {
      out.push({ id: job.id, skipped: "daily_cap" }); continue;
    }
    // 3) Claim (single-flight)
    if (!(await claim(job.id))) { out.push({ id: job.id, skipped: "not_claimed" }); continue; }

    try {
      const publicId = publicIdFromUrl(job.target_url);
      if (!publicId) { await finish(job.id, "error", { error: "target_url ohne /in/<id>" }); continue; }

      if (job.action === "visit") {
        const p = await getProfile(accountId, publicId);
        p.ok
          ? await finish(job.id, "done", { provider_id: p.provider_id, unipile_account_id: accountId, result: { visited: true, name: (p.profile as any)?.name ?? null } })
          : await finish(job.id, "error", { error: p.error });

      } else if (job.action === "connect") {
        const p = await getProfile(accountId, publicId);
        if (!p.ok) { await finish(job.id, "error", { error: p.error }); continue; }
        const note = (job.payload as any)?.message as string | undefined;
        const inv = await sendInvite(accountId, p.provider_id, note);
        inv.ok
          ? await finish(job.id, "done", { provider_id: p.provider_id, unipile_account_id: accountId, result: inv.result })
          : await finish(job.id, "error", { provider_id: p.provider_id, error: inv.error });

      } else if (job.action === "message") {
        const p = await getProfile(accountId, publicId);
        if (!p.ok) { await finish(job.id, "error", { error: p.error }); continue; }
        const text = (job.payload as any)?.message as string;
        const msg = await sendMessage(accountId, p.provider_id, text, !!(job.payload as any)?.inmail);
        msg.ok
          ? await finish(job.id, "done", { provider_id: p.provider_id, unipile_account_id: accountId, result: msg.result })
          : await finish(job.id, "error", { provider_id: p.provider_id, error: msg.error });
      }
      out.push({ id: job.id, action: job.action });
    } catch (e) {
      await finish(job.id, "error", { error: String((e as Error).message ?? e) }); // nie stuck-running
    }
  }
  return new Response(JSON.stringify({ processed: out }), { headers: { "content-type": "application/json" } });
});

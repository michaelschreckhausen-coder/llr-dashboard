// la-runner — Greenfield-Runner für la_jobs (Unipile-nativ, kein Alt-Port). Per pg_cron (trigger_la_runner) minütlich.
// Claim (FOR UPDATE SKIP LOCKED via la_claim_jobs, kein Aktions-Filter) → Addon-Gate gegen das JOB-Team →
// claimed→running→done|failed. failed: attempts++; retryable & attempts<max → pending+Backoff; sonst dead.
// done: nächsten Step (position+1, condition='always') materialisieren (la_materialize_next). Heartbeat je Lauf.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getProfile, sendInvitation } from "../_shared/unipile-client.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

const BATCH = 5;
const nowIso = () => new Date().toISOString();
const backoffMin = (attempts: number) => Math.min(120, Math.pow(2, attempts)); // 2,4,8,16,32,64,120…

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
}
async function patch(id: string, p: Record<string, unknown>) {
  await db.from("la_jobs").update({ ...p, updated_at: nowIso() }).eq("id", id);
}
// retryable & attempts<max → pending+Backoff (scheduled_at treibt den Claim); sonst dead.
async function fail(job: any, retryable: boolean, error: string, response?: unknown): Promise<"retry" | "dead"> {
  const attempts = (job.attempts ?? 0) + 1;
  if (retryable && attempts < (job.max_attempts ?? 5)) {
    const at = new Date(Date.now() + backoffMin(attempts) * 60000).toISOString();
    await patch(job.id, { state: "pending", attempts, next_attempt_at: at, scheduled_at: at, error, response: response ?? null });
    return "retry";
  }
  await patch(job.id, { state: "dead", attempts, error, response: response ?? null });
  return "dead";
}

Deno.serve(async () => {
  // 1) Claim (atomar, SKIP LOCKED)
  const { data: claimed, error: cErr } = await db.rpc("la_claim_jobs", { p_limit: BATCH });
  if (cErr) {
    await db.from("la_runner_heartbeat").update({ last_run_at: nowIso(), last_claimed: 0, last_error: cErr.message }).eq("id", 1);
    return json({ error: "claim: " + cErr.message }, 500);
  }
  const jobs: any[] = claimed ?? [];
  // 2) Heartbeat
  await db.from("la_runner_heartbeat").update({ last_run_at: nowIso(), last_claimed: jobs.length, last_error: null }).eq("id", 1);

  const out: unknown[] = [];
  for (const job of jobs) {
    // 3a) Addon-Gate gegen das JOB-Team (la_jobs.team_id), NICHT active_team_id. Ohne Addon: zurück auf pending (idle).
    const { data: paid } = await db.rpc("team_has_addon", { p_team_id: job.team_id, p_slug: "automation" });
    if (!paid) { await patch(job.id, { state: "pending", error: "no_automation_addon" }); out.push({ id: job.id, skipped: "no_addon" }); continue; }

    // 3b) running
    await patch(job.id, { state: "running" });

    // 3c) Kontext: enrollment → campaign → account (unipile_account_id)
    const { data: enr } = await db.from("la_enrollments")
      .select("id, campaign_id, provider_id, public_identifier").eq("id", job.enrollment_id).maybeSingle();
    if (!enr) { const r = await fail(job, false, "enrollment_missing"); out.push({ id: job.id, [r]: "enrollment_missing" }); continue; }
    const { data: camp } = await db.from("la_campaigns").select("account_id").eq("id", enr.campaign_id).maybeSingle();
    const { data: acct } = camp
      ? await db.from("la_accounts").select("unipile_account_id, status").eq("id", camp.account_id).maybeSingle()
      : { data: null } as any;
    if (!acct?.unipile_account_id) { const r = await fail(job, false, "account_missing"); out.push({ id: job.id, [r]: "account_missing" }); continue; }
    const accountId: string = acct.unipile_account_id;

    // provider_id auflösen (falls fehlt: getProfile über public_identifier)
    let providerId: string | null = enr.provider_id ?? null;
    if (!providerId && enr.public_identifier) {
      const p = await getProfile(accountId, enr.public_identifier);
      if (p.ok) {
        providerId = p.data.provider_id ?? null;
        if (providerId) await db.from("la_enrollments").update({ provider_id: providerId, updated_at: nowIso() }).eq("id", enr.id);
      } else { const r = await fail(job, p.retryable, `getProfile ${p.status}: ${p.detail}`, p); out.push({ id: job.id, [r]: "getProfile" }); continue; }
    }
    if (!providerId) { const r = await fail(job, false, "no_provider_id"); out.push({ id: job.id, [r]: "no_provider_id" }); continue; }

    // 3d) Dispatch nach action — P1: invite (weitere Actions folgen in P2+)
    if (job.action === "invite") {
      const note = (job.request as any)?.note ?? undefined;
      const inv = await sendInvitation(accountId, providerId, note);
      if (inv.ok) {
        await patch(job.id, { state: "done", provider_ref: inv.data.invitation_id ?? null, response: inv.data, error: null });
        const { data: mat } = await db.rpc("la_materialize_next", { p_enrollment_id: enr.id });
        out.push({ id: job.id, done: "invite", invitation_id: inv.data.invitation_id ?? null, next: mat });
      } else {
        const r = await fail(job, inv.retryable, `invite ${inv.status}: ${inv.detail}`, inv);
        out.push({ id: job.id, [r]: `invite_${inv.status}` });
      }
    } else {
      const r = await fail(job, false, `action_not_implemented_p1: ${job.action}`);
      out.push({ id: job.id, [r]: `action_${job.action}` });
    }
  }
  return json({ processed: out.length, results: out });
});

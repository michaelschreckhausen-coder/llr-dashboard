-- LinkedIn-Automation Greenfield · Phase 1 · Cron.
-- la-runner minütlich über den GUC-Wrapper trigger_la_runner (net.http_post, fire-and-forget).
-- Idempotent: cron.schedule upsertet per jobname. Scharf NUR wo appliziert (P1 = ausschliesslich Staging;
-- Prod-Scheduling ist eine bewusste Cutover-Entscheidung in einer spaeteren Phase, NICHT beilaeufig).

SELECT cron.schedule('la-runner', '* * * * *', $$SELECT public.trigger_la_runner()$$);

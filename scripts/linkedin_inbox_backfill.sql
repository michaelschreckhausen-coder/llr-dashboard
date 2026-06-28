-- ════════════════════════════════════════════════════════════════
-- scripts/linkedin_inbox_backfill.sql  —  MANUELLES OPERATIVES SCRIPT (KEINE Migration!)
-- ⚠ NICHT nach supabase/migrations/ verschieben: läge es dort, würde der nächste
--   Prod-Migrations-Apply UNGEFRAGT echte Leads auf archived=true kippen — ohne den
--   Audit-Human-Checkpoint. Pro Env MANUELL ausführen, NUR nach grünem Audit
--   (scripts/linkedin_inbox_backfill_audit.sql) + explizitem Go ("los prod-backfill").
-- Backfill: NIE angefasste Sales-Nav-Importe aus leads → Inbox zurückführen.
-- ----------------------------------------------------------------------------
-- Kandidat = via Sales-Nav importierter, völlig unberührter Lead (source='sales_nav',
-- kein Score/Kontakt/Notiz/Tag/Favorit, keine verknüpften Datensätze).
--
-- REVERSIBEL & idempotent:
--   * Inbox-Insert mit raw->>'backfilled_from_lead' = leads.id (Marker, kein Datenverlust).
--   * leads.archived=true (NICHT löschen) → bleibt für Promote-Reaktivierung erhalten.
--   * ON CONFLICT DO NOTHING (kein Ziel → fängt beide Unique-Indizes ab).
--   * Re-Run: cand verlangt archived=false → bereits zurückgeführte Leads fallen raus → No-op.
--
-- Rollback (manuell, falls nötig):
--   UPDATE leads SET archived=false, archived_at=NULL
--     WHERE id IN (SELECT (raw->>'backfilled_from_lead')::uuid FROM linkedin_inbox
--                  WHERE raw ? 'backfilled_from_lead');
--   DELETE FROM linkedin_inbox WHERE raw ? 'backfilled_from_lead' AND review_status='new';
--
-- ZUERST Staging, nur nach grünem Audit (Kandidaten-Count + Ausschluss-Breakdown).
-- ════════════════════════════════════════════════════════════════

BEGIN;

WITH cand AS (
  SELECT l.*
  FROM public.leads l
  WHERE l.source = 'sales_nav'
    AND l.archived = false
    AND l.status = 'Lead'
    AND l.lead_status = 'new'
    AND COALESCE(l.lead_score, 0) = 0
    AND COALESCE(l.hs_score, 0) = 0
    AND l.first_contacted_at IS NULL
    AND COALESCE(l.num_contacts, 0) = 0
    AND l.last_reply_at IS NULL
    AND COALESCE(l.li_connection_status::text, 'nicht_verbunden') = 'nicht_verbunden'
    AND (l.notes IS NULL OR btrim(l.notes) = '')
    AND (l.tags IS NULL OR cardinality(l.tags) = 0)
    AND l.is_favorite = false
    AND NOT EXISTS (SELECT 1 FROM public.deals d                     WHERE d.lead_id  = l.id)
    AND NOT EXISTS (SELECT 1 FROM public.activities a                WHERE a.lead_id  = l.id)
    AND NOT EXISTS (SELECT 1 FROM public.contact_notes cn            WHERE cn.lead_id = l.id)
    AND NOT EXISTS (SELECT 1 FROM public.lead_tasks lt               WHERE lt.lead_id = l.id)
    AND NOT EXISTS (SELECT 1 FROM public.connection_queue cq         WHERE cq.lead_id = l.id)
    AND NOT EXISTS (SELECT 1 FROM public.automation_campaign_leads acl WHERE acl.lead_id = l.id)
),
ins AS (
  INSERT INTO public.linkedin_inbox (
    team_id, user_id, source, sales_nav_id, linkedin_url, name, first_name, last_name,
    headline, job_title, company, location, avatar_url, li_about_summary,
    review_status, raw, imported_at
  )
  SELECT
    c.team_id, c.user_id, 'sales_nav', c.sales_nav_id, c.linkedin_url, c.name,
    c.first_name, c.last_name, c.headline, c.job_title, c.company, c.location,
    c.avatar_url, c.li_about_summary, 'new',
    jsonb_build_object('backfilled_from_lead', c.id, 'backfilled_at', now()),
    now()
  FROM cand c
  ON CONFLICT DO NOTHING
  RETURNING 1
)
UPDATE public.leads
   SET archived = true, archived_at = now()
 WHERE id IN (SELECT id FROM cand);

COMMIT;

NOTIFY pgrst, 'reload schema';

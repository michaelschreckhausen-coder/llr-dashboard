-- READ-ONLY Audit für 20260703100300_linkedin_inbox_backfill.sql
-- Kandidaten-Count + Ausschluss-Breakdown (Basis: source='sales_nav' AND archived=false)
SELECT
  count(*) AS total_salesnav_active,
  count(*) FILTER (WHERE
        l.status='Lead' AND l.lead_status='new'
    AND COALESCE(l.lead_score,0)=0 AND COALESCE(l.hs_score,0)=0
    AND l.first_contacted_at IS NULL AND COALESCE(l.num_contacts,0)=0 AND l.last_reply_at IS NULL
    AND COALESCE(l.li_connection_status::text,'nicht_verbunden')='nicht_verbunden'
    AND (l.notes IS NULL OR btrim(l.notes)='') AND (l.tags IS NULL OR cardinality(l.tags)=0)
    AND l.is_favorite=false
    AND NOT EXISTS (SELECT 1 FROM public.deals d                      WHERE d.lead_id=l.id)
    AND NOT EXISTS (SELECT 1 FROM public.activities a                 WHERE a.lead_id=l.id)
    AND NOT EXISTS (SELECT 1 FROM public.contact_notes cn             WHERE cn.lead_id=l.id)
    AND NOT EXISTS (SELECT 1 FROM public.lead_tasks lt                WHERE lt.lead_id=l.id)
    AND NOT EXISTS (SELECT 1 FROM public.connection_queue cq          WHERE cq.lead_id=l.id)
    AND NOT EXISTS (SELECT 1 FROM public.automation_campaign_leads acl WHERE acl.lead_id=l.id)
  ) AS candidates,
  count(*) FILTER (WHERE NOT (l.status='Lead' AND l.lead_status='new'))                                   AS excl_status_or_leadstatus,
  count(*) FILTER (WHERE COALESCE(l.lead_score,0)>0 OR COALESCE(l.hs_score,0)>0)                          AS excl_score,
  count(*) FILTER (WHERE l.first_contacted_at IS NOT NULL OR COALESCE(l.num_contacts,0)>0 OR l.last_reply_at IS NOT NULL) AS excl_contacted,
  count(*) FILTER (WHERE COALESCE(l.li_connection_status::text,'nicht_verbunden')<>'nicht_verbunden')     AS excl_connected,
  count(*) FILTER (WHERE (l.notes IS NOT NULL AND btrim(l.notes)<>'') OR (l.tags IS NOT NULL AND cardinality(l.tags)>0) OR l.is_favorite) AS excl_notes_tags_fav,
  count(*) FILTER (WHERE
        EXISTS (SELECT 1 FROM public.deals d                      WHERE d.lead_id=l.id)
     OR EXISTS (SELECT 1 FROM public.activities a                 WHERE a.lead_id=l.id)
     OR EXISTS (SELECT 1 FROM public.contact_notes cn             WHERE cn.lead_id=l.id)
     OR EXISTS (SELECT 1 FROM public.lead_tasks lt                WHERE lt.lead_id=l.id)
     OR EXISTS (SELECT 1 FROM public.connection_queue cq          WHERE cq.lead_id=l.id)
     OR EXISTS (SELECT 1 FROM public.automation_campaign_leads acl WHERE acl.lead_id=l.id)
  ) AS excl_has_related_records
FROM public.leads l
WHERE l.source='sales_nav' AND l.archived=false;

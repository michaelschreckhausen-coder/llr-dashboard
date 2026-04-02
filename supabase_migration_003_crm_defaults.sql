-- ================================================================
-- MIGRATION 003: CRM Default-Werte für bestehende Leads
-- Bestehende 18k Datensätze bekommen sinnvolle CRM-Startwerte
-- ================================================================

-- 1. Lifecycle Stage aus bestehendem Status ableiten
UPDATE leads SET lifecycle_stage = CASE
  WHEN status = 'SQL' THEN 'sales_qualified'::crm_lifecycle_stage
  WHEN status = 'MQL' THEN 'marketing_qualified'::crm_lifecycle_stage
  WHEN status = 'MQN' THEN 'marketing_qualified'::crm_lifecycle_stage
  WHEN status = 'LQL' THEN 'lead'::crm_lifecycle_stage
  ELSE 'lead'::crm_lifecycle_stage
END
WHERE lifecycle_stage IS NULL;

-- 2. Lead Status aus bestehendem Status ableiten
UPDATE leads SET lead_status = CASE
  WHEN status = 'SQL' THEN 'connected'::crm_lead_status
  WHEN status IN ('MQL','MQN') THEN 'in_progress'::crm_lead_status
  WHEN status = 'LQL' THEN 'open'::crm_lead_status
  ELSE 'new'::crm_lead_status
END
WHERE lead_status IS NULL;

-- 3. Deal Stage initialisieren
UPDATE leads SET deal_stage = 'kein_deal'::crm_deal_stage
WHERE deal_stage IS NULL;

-- 4. LinkedIn Connection Status aus vernetzung_status ableiten
UPDATE leads SET li_connection_status = CASE
  WHEN vernetzung_status = 'vernetzt' THEN 'verbunden'::crm_connection_status
  WHEN vernetzung_status = 'ausstehend' THEN 'pending'::crm_connection_status
  WHEN vernetzung_status = 'nicht_vernetzt' THEN 'nicht_verbunden'::crm_connection_status
  ELSE 'nicht_verbunden'::crm_connection_status
END
WHERE li_connection_status IS NULL OR li_connection_status = 'nicht_verbunden';

-- 5. Connection Status aus connection_status-Feld ableiten (falls vorhanden)
UPDATE leads SET li_connection_status = CASE
  WHEN connection_status = 'connected' THEN 'verbunden'::crm_connection_status
  WHEN connection_status = 'pending' THEN 'pending'::crm_connection_status
  ELSE li_connection_status
END
WHERE connection_status IS NOT NULL;

-- 6. LinkedIn connected_at aus connected_at ableiten
UPDATE leads SET li_connected_at = connected_at
WHERE connected_at IS NOT NULL AND li_connected_at IS NULL;

-- 7. Connection requested aus connection_sent_at ableiten
UPDATE leads SET li_connection_requested_at = connection_sent_at
WHERE connection_sent_at IS NOT NULL AND li_connection_requested_at IS NULL;

-- 8. HubSpot Score aus lead_score / icp_match berechnen
UPDATE leads SET hs_score = LEAST(100, GREATEST(0,
  COALESCE(icp_match, 0) * 0.6 +
  CASE WHEN li_connection_status = 'verbunden' THEN 20 ELSE 0 END +
  CASE WHEN status = 'SQL' THEN 20 WHEN status IN ('MQL','MQN') THEN 10 ELSE 0 END
))
WHERE hs_score = 0 OR hs_score IS NULL;

-- 9. Deal Probability aus hs_score ableiten
UPDATE leads SET deal_probability = CASE
  WHEN deal_stage = 'gewonnen' THEN 100
  WHEN deal_stage = 'verhandlung' THEN 80
  WHEN deal_stage = 'angebot' THEN 60
  WHEN deal_stage = 'opportunity' THEN 40
  WHEN deal_stage = 'prospect' THEN 20
  ELSE 5
END
WHERE deal_probability = 0 OR deal_probability IS NULL;

-- 10. Activity Level aus last_activity_at schätzen
UPDATE leads SET li_activity_level = CASE
  WHEN last_activity_at > NOW() - INTERVAL '7 days' THEN 'hoch'::crm_activity_level
  WHEN last_activity_at > NOW() - INTERVAL '30 days' THEN 'mittel'::crm_activity_level
  WHEN last_activity_at IS NOT NULL THEN 'niedrig'::crm_activity_level
  ELSE 'unbekannt'::crm_activity_level
END
WHERE li_activity_level IS NULL OR li_activity_level = 'unbekannt';

-- 11. Original Source setzen (alle bestehenden sind LinkedIn)
UPDATE leads SET original_source = 'linkedin'::crm_lead_source
WHERE original_source IS NULL;

-- 12. GDPR Consent (bestehende Nutzer haben implizit zugestimmt)
UPDATE leads SET gdpr_consent = TRUE, gdpr_consent_at = created_at
WHERE gdpr_consent IS NULL OR gdpr_consent = FALSE;

-- 13. Preferred Language default
UPDATE leads SET preferred_language = 'de' WHERE preferred_language IS NULL;

-- 14. Num contacts aus pipeline_stage schätzen
UPDATE leads SET num_contacts = CASE
  WHEN status IN ('SQL','MQL') THEN 3
  WHEN status IN ('MQN','LQL') THEN 2
  ELSE 1
END
WHERE num_contacts = 0 OR num_contacts IS NULL;

-- Result
SELECT 
  'Migration 003 complete' as status,
  COUNT(*) as total_leads,
  COUNT(CASE WHEN lifecycle_stage IS NOT NULL THEN 1 END) as with_lifecycle,
  COUNT(CASE WHEN deal_stage IS NOT NULL THEN 1 END) as with_deal_stage,
  COUNT(CASE WHEN hs_score > 0 THEN 1 END) as with_score,
  COUNT(CASE WHEN li_connection_status = 'verbunden' THEN 1 END) as connected
FROM leads;

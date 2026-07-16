-- ============================================================================
-- P3 · Schritt 1 — Plan-Permissions auf Ziel-Tier-Sets (DATEN, keine Gates)
-- ============================================================================
-- Verhaltensneutral: setzt NUR die 7 verwalteten LinkedIn/Content-Keys pro Plan
-- auf das Ziel-Set des Tiers. Solange kein Gate (P3 Schritt 3) sie liest, aendert
-- das nichts fuer Bestandskunden — reine Datenvorbereitung VOR den Guards.
--
-- Verwaltete Keys (nur diese 7 werden angefasst; alle anderen Permissions je
-- Plan bleiben unveraendert — insb. content.studio, branding.*, crm.*, reports.*):
--   content.calendar · linkedin.post_analytics · linkedin.connections ·
--   linkedin.messages · linkedin.engagement · linkedin.sales_nav · linkedin.automation
--
-- Ziel-Set pro Tier:
--   Marketing : content.calendar, linkedin.post_analytics
--   Sales     : linkedin.{connections,messages,engagement,sales_nav,automation}
--   All-in    : alle 7
--   Trial     : All-in MINUS linkedin.automation (6 Keys) — Entscheidung Variante 2:
--               Trials testen alles (vernetzen/sales-nav/posten/analytics), aber die
--               automatisierte AUSFUEHRUNG bleibt bezahlten Plaenen vorbehalten
--               (Abuse-/Reputations-Schutz gegen Signup-Farmen; ~null Testerfahrungs-
--               Kosten; Upgrade-Hebel "fuer Automation -> Plan buchen"). Reversibel:
--               ein Key im Trial-Set zufuegen = Voll-Test-Trial.
--
-- Plan->Tier (aus Worksheet; salesplay_webinar bewusst NICHT angefasst;
-- free + archivierte/inaktive uebersprungen, 0 Accounts):
--   Marketing : marketing, marketing-team
--   Sales     : sales, sales-team
--   All-in    : all-in, customized, sales_team_automation, trail_bochum, kmu, vorstellung
--   Trial     : trial, trial-classic
--
-- Connect (#1) ist KEIN Permission-Key -> nicht Teil dieses Diffs (P3 member-basiert, separat).
-- Keys sind PERMISSIONS, keine Module -> nur in permissions schreiben (plans_modules_valid_keys unberuehrt).
--
-- Idempotenz: pro Tier werden erst ALLE 7 Keys entfernt (jsonb "- text" strip,
-- entfernt auch etwaige Duplikate), dann das Ziel-Set angehaengt -> Re-Run stabil.
-- Rollback (revert): dieselbe Datei-Struktur mit den HEUTIGEN Ist-Sets pro Plan
-- (siehe Kommentar-Block am Ende) — kein Auto-Down, bewusst manuell.
--
-- B3-Guard: bricht ab, wenn ein Account auf marketing/marketing-team haengt
-- (dann wuerde das Entfernen von connections/messages SOFORT eine Kunden-Sidebar
-- aendern). Pre-Apply-Check auch manuell:
--   SELECT count(*) FROM accounts a JOIN plans p ON a.plan_id=p.id
--   WHERE p.slug IN ('marketing','marketing-team');   -- muss 0 sein
-- ============================================================================

\set ON_ERROR_STOP on
BEGIN;

-- ---------- B3-Guard: keine Marketing-Accounts (sonst Live-Sidebar-Change) ----------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM public.accounts a JOIN public.plans p ON p.id = a.plan_id
  WHERE p.slug IN ('marketing','marketing-team');
  IF n <> 0 THEN
    RAISE EXCEPTION 'B3-Guard: % Account(s) auf marketing/marketing-team — Entfernen von connections/messages wuerde eine Live-Kunden-Sidebar aendern. Abbruch.', n;
  END IF;
END $$;

-- ---------- Marketing-Tier: {content.calendar, linkedin.post_analytics} ----------
UPDATE public.plans
SET permissions =
      (permissions
        - 'content.calendar' - 'linkedin.post_analytics' - 'linkedin.connections'
        - 'linkedin.messages' - 'linkedin.engagement' - 'linkedin.sales_nav' - 'linkedin.automation')
      || '["content.calendar","linkedin.post_analytics"]'::jsonb,
    updated_at = now()
WHERE slug IN ('marketing','marketing-team');

-- ---------- Sales-Tier: linkedin.{connections,messages,engagement,sales_nav,automation} ----------
UPDATE public.plans
SET permissions =
      (permissions
        - 'content.calendar' - 'linkedin.post_analytics' - 'linkedin.connections'
        - 'linkedin.messages' - 'linkedin.engagement' - 'linkedin.sales_nav' - 'linkedin.automation')
      || '["linkedin.connections","linkedin.messages","linkedin.engagement","linkedin.sales_nav","linkedin.automation"]'::jsonb,
    updated_at = now()
WHERE slug IN ('sales','sales-team');

-- ---------- All-in-Tier: alle 7 ----------
UPDATE public.plans
SET permissions =
      (permissions
        - 'content.calendar' - 'linkedin.post_analytics' - 'linkedin.connections'
        - 'linkedin.messages' - 'linkedin.engagement' - 'linkedin.sales_nav' - 'linkedin.automation')
      || '["content.calendar","linkedin.post_analytics","linkedin.connections","linkedin.messages","linkedin.engagement","linkedin.sales_nav","linkedin.automation"]'::jsonb,
    updated_at = now()
WHERE slug IN ('all-in','customized','sales_team_automation','trail_bochum','kmu','vorstellung');

-- ---------- Trial-Tier: All-in MINUS linkedin.automation (Variante 2) ----------
UPDATE public.plans
SET permissions =
      (permissions
        - 'content.calendar' - 'linkedin.post_analytics' - 'linkedin.connections'
        - 'linkedin.messages' - 'linkedin.engagement' - 'linkedin.sales_nav' - 'linkedin.automation')
      || '["content.calendar","linkedin.post_analytics","linkedin.connections","linkedin.messages","linkedin.engagement","linkedin.sales_nav"]'::jsonb,
    updated_at = now()
WHERE slug IN ('trial','trial-classic');

-- ---------- Verify: Ziel-Set je Tier exakt getroffen (sonst Rollback) ----------
DO $$
DECLARE bad int;
BEGIN
  -- Marketing: hat cc+pa, hat KEINEN der 5 Outreach-Keys
  SELECT count(*) INTO bad FROM public.plans
  WHERE slug IN ('marketing','marketing-team')
    AND NOT (permissions ?& ARRAY['content.calendar','linkedin.post_analytics']
             AND NOT (permissions ?| ARRAY['linkedin.connections','linkedin.messages','linkedin.engagement','linkedin.sales_nav','linkedin.automation']));
  IF bad <> 0 THEN RAISE EXCEPTION 'Verify Marketing-Tier fehlgeschlagen (% Plan/e)', bad; END IF;

  -- Sales: hat die 5 Outreach-Keys, hat KEINEN Content-Key
  SELECT count(*) INTO bad FROM public.plans
  WHERE slug IN ('sales','sales-team')
    AND NOT (permissions ?& ARRAY['linkedin.connections','linkedin.messages','linkedin.engagement','linkedin.sales_nav','linkedin.automation']
             AND NOT (permissions ?| ARRAY['content.calendar','linkedin.post_analytics']));
  IF bad <> 0 THEN RAISE EXCEPTION 'Verify Sales-Tier fehlgeschlagen (% Plan/e)', bad; END IF;

  -- All-in: hat alle 7
  SELECT count(*) INTO bad FROM public.plans
  WHERE slug IN ('all-in','customized','sales_team_automation','trail_bochum','kmu','vorstellung')
    AND NOT (permissions ?& ARRAY['content.calendar','linkedin.post_analytics','linkedin.connections','linkedin.messages','linkedin.engagement','linkedin.sales_nav','linkedin.automation']);
  IF bad <> 0 THEN RAISE EXCEPTION 'Verify All-in-Tier fehlgeschlagen (% Plan/e)', bad; END IF;

  -- Trial: hat die 6 (All-in ohne automation), hat NICHT linkedin.automation
  SELECT count(*) INTO bad FROM public.plans
  WHERE slug IN ('trial','trial-classic')
    AND NOT (permissions ?& ARRAY['content.calendar','linkedin.post_analytics','linkedin.connections','linkedin.messages','linkedin.engagement','linkedin.sales_nav']
             AND NOT (permissions ? 'linkedin.automation'));
  IF bad <> 0 THEN RAISE EXCEPTION 'Verify Trial-Tier fehlgeschlagen (% Plan/e)', bad; END IF;
END $$;

COMMIT;

-- ============================================================================
-- REVERT (manuell, falls noetig) — die HEUTIGEN Ist-Sets der 7 Keys pro Plan:
--   marketing / marketing-team : content.calendar, linkedin.connections, linkedin.messages
--   sales / sales-team         : linkedin.connections, linkedin.messages
--   all-in / customized / kmu /
--     trail_bochum / vorstellung: content.calendar, linkedin.connections, linkedin.messages, linkedin.automation
--   sales_team_automation      : linkedin.connections, linkedin.messages, linkedin.automation
--   trial                      : linkedin.connections, linkedin.messages
--   trial-classic              : content.calendar, linkedin.connections, linkedin.messages
-- Revert = pro Plan: die 7 Keys strippen, obiges Ist-Set wieder anhaengen.
-- ============================================================================

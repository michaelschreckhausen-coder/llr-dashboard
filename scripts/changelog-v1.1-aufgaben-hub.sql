-- ──────────────────────────────────────────────────────────────────────────
-- Changelog v1.1 — Aufgaben-Hub-Sprint (2026-06-01)
-- ──────────────────────────────────────────────────────────────────────────
-- Apply auf Hetzner-Prod (db-01 = 128.140.123.163) via SSH+psql:
--
--   ssh root@128.140.123.163 'docker exec -i supabase-db psql \
--     -U supabase_admin -d postgres -v ON_ERROR_STOP=1' \
--     < scripts/changelog-v1.1-aufgaben-hub.sql
--
-- Re-Run-Safe: NICHT idempotent (kein ON CONFLICT, weil commit_sha keinen
-- Unique-Constraint hat). Pre-Flight unten checkt Dupletten, rollbacked
-- bei >0 Treffern.
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

-- Pre-Flight: dürfen 0 Rows zurückgeben. Falls >0 → ROLLBACK manuell.
\echo '--- Pre-Flight: existieren commit_shas schon? ---'
SELECT commit_sha, version, title
FROM public.changelog
WHERE commit_sha IN ('c4236d0','b9b5bd0','5df3437','3ab616e','423aa37');

INSERT INTO public.changelog (type, version, author, title, description, affected, commit_sha, is_breaking) VALUES

('feature', '1.1', 'Admin',
 'Aufgaben-Hub: Aufgaben aus allen Bereichen an einem Ort',
 'Der Aufgaben-Bereich (/aufgaben) aggregiert ab sofort Aufgaben aus acht Quellen in einer einzigen Liste: CRM-Aufgaben, Redaktionsplan-Posts mit Zuweisung, Projekt-Tasks, Deal-Follow-ups (anstehende Closing-Termine), Lead-Follow-ups, ein SSI-Tages-Reminder, unbeantwortete LinkedIn-Nachrichten und stale Leads (>7 Tage ohne Status-Update). Pro Card zeigt eine farbige Quell-Badge die Herkunft, plus Filter-Pills oberhalb der Liste zum Ein-/Ausblenden. Sidebar-Eintrag wurde von der Sales-Section direkt unter „Assistent" verschoben. Das Dashboard zeigt im Morgens-Block jetzt alle überfälligen und heute fälligen Aufgaben aus allen Quellen, plus „alle Aufgaben →"-Link im Sub-Header.',
 ARRAY['aufgaben','dashboard','sidebar','ux']::text[],
 'c4236d0',
 false),

('feature', '1.1', 'Admin',
 'Aufgaben: universelles Edit-Pop-up beim Klick auf eine Card',
 'Klick auf eine Aufgaben-Card öffnet jetzt ein einheitliches Pop-up, in dem du die Aufgabe weiterbeschreiben und Team-Mitgliedern zuweisen kannst. Je nach Quelle sind Titel, Beschreibung, Zuweisung, Fälligkeit und Priorität editierbar: CRM-Aufgaben sind voll editierbar inkl. Löschen-Button; Redaktionsplan-Posts erlauben Titel + Notiz + Zuweisung + Veröffentlichungs-Datum; Projekt-Tasks Titel + Beschreibung + Fälligkeit + Priorität; Deal- und Lead-Follow-ups erlauben Owner-Wechsel + Datum. SSI- und LinkedIn-Hinweise zeigen read-only-Info plus Link zur Quelle. Footer hat „Quelle öffnen →" für direkten Sprung zur jeweiligen Detail-Page.',
 ARRAY['aufgaben','ux']::text[],
 'b9b5bd0',
 false),

('bugfix', '1.1', 'Admin',
 'Aufgaben für alle Pläne erreichbar + NaN-Anzeige im Dashboard behoben',
 'Zwei Bugs nach dem Aufgaben-Hub-Release: 1) PermissionGuard hatte /aufgaben mit der CRM-Permission gegated — User auf Marketing-Plan wurden stumm auf /settings/konto umgeleitet, obwohl der Hub Quellen aus allen Modulen aggregiert. /aufgaben ist jetzt für alle Pläne erreichbar. 2) Auf dem Dashboard zeigten überfällige Follow-up-Cards „NaN Tage überfällig", weil das Lead-Follow-up-Datum als Zeitstempel mit einem Date-Parser kollidiert ist. Date-Handling jetzt konsistent — sauberer Zähler statt NaN.',
 ARRAY['aufgaben','dashboard']::text[],
 '5df3437',
 false),

('bugfix', '1.1', 'Admin',
 'Redaktionsplan-Posts ohne explizite Zuweisung im Aufgaben-Hub sichtbar',
 'Beim Erstellen eines Posts im Redaktionsplan war der „Zuweisung an"-Eintrag in der Datenbank leer, das Post-Modal zeigte den Ersteller aber als zugewiesen (Display-Fallback). Der Aufgaben-Hub-Filter war strikter als das UI und übersprang diese Posts — sie tauchten gar nicht in der Aufgaben-Liste auf. Filter erweitert auf „explizit zugewiesen ODER (kein Assignee UND ich bin Ersteller)" — gleiche Semantik wie das UI im Redaktionsplan-Modal.',
 ARRAY['aufgaben','content']::text[],
 '3ab616e',
 false),

('bugfix', '1.1', 'Admin',
 'Content-Post-Notiz im Pop-up nicht mehr mit Status-Label vorbelegt',
 'Beim Öffnen eines Redaktionsplan-Posts im Aufgaben-Hub-Pop-up war das Notiz-Feld mit dem Status-Label vorbelegt (z.B. „Entwurf fertigstellen"). Speichern ohne Edit hätte diesen Anzeige-String fälschlich als Notiz gespeichert und die echte User-Notiz überschrieben. Der Modal-Init-Wert kommt jetzt direkt aus der Notiz-Spalte der Datenbank, nicht aus dem Card-Subtitle.',
 ARRAY['aufgaben','content']::text[],
 '423aa37',
 false);

-- Verifikation nach Insert: müssen 5 Rows zurückkommen
\echo '--- Verifikation: 5 neue v1.1-Rows? ---'
SELECT id, type, version, title, commit_sha, created_at
FROM public.changelog
WHERE commit_sha IN ('c4236d0','b9b5bd0','5df3437','3ab616e','423aa37')
ORDER BY created_at DESC;

COMMIT;

# Design-Doc: Trennung von Account-Verwaltung und Team-Verwaltung

**Status:** Entwurf — Diskussionsgrundlage
**Autor:** Claude (im Dialog mit Michael)
**Datum:** 2026-04-28
**Reviewer:** Julian Wolf
**Ziel:** Architektur-Entscheidung treffen, dann Phase-1-Migration planen

---

## 1. Problemstellung

Heute hängen zwei orthogonale Domänen zusammen am `teams`-Eintrag:

1. **Billing/Lizenzierung** (Leadesk-intern): Plan, Seats, Stripe-State, Trial-End, Whitelabel-Config
2. **Team-Mitgliedschaft** (User-facing): Wer arbeitet mit wem, wer ist Owner/Member, Einladungen

Die Vermischung erzeugt drei konkrete Probleme:

- **Schema-Drift Cloud↔Hetzner** (heute aufgetreten beim Live-Test 2026-04-28): Cloud-Prod hat `teams.plan` als Inline-Spalte, Hetzner hat `plan_id` als FK auf separate `plans`-Tabelle. App-Code crasht je nachdem welche DB läuft.
- **RLS-Komplexität**: Policies auf `teams` müssen sowohl Team-Mitgliedschaft (für Read) als auch Billing-Zugriff (für Plan-Änderungen) berücksichtigen.
- **Skalierungs-Limit**: Aktuelle Annahme „ein User → ein Team" passt nicht zu Freelancern, die für mehrere Kunden arbeiten.

## 2. Eckdaten (festgelegt im Vorgespräch)

| Frage | Entscheidung |
|---|---|
| Account ↔ Team | **N:N** — User kann zu Teams aus verschiedenen Accounts gehören |
| Account-Owner | **Beides möglich** — User mit Login ODER reine Billing-Adresse |
| Plan/Seats-Pflege | **Hybrid** — kleine Pläne self-service über Stripe, große von Leadesk gepflegt |

## 3. Vorgeschlagene Architektur

### 3.1 Drei klar getrennte Domänen

```
┌─────────────────────────────┐
│ ACCOUNT-DOMÄNE              │  ← Leadesk-intern, Billing
│ accounts, plans,            │
│ stripe_subscriptions        │
└──────────────┬──────────────┘
               │ (account_id FK)
               ▼
┌─────────────────────────────┐
│ TEAM-DOMÄNE                 │  ← User-facing, Collaboration
│ teams, team_members,        │
│ team_invites                │
└──────────────┬──────────────┘
               │ (team_id FK)
               ▼
┌─────────────────────────────┐
│ DATEN-DOMÄNE                │  ← Bestehender Multi-Tenant-Scope
│ leads, deals, pm_projects,  │
│ pm_tasks, ...               │
└─────────────────────────────┘
```

**Kernidee:** Daten gehören dem Team, Teams gehören dem Account, Account verwaltet Lizenz/Plan. Keine Vermischung.

### 3.2 Tabellen-Schema

#### `accounts` (NEU)

Leadesk-interne Verwaltung. Nur Leadesk-Mitarbeiter und der Account-Owner haben Zugriff.

```sql
CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identifikation
  name text NOT NULL,                    -- z.B. "Acme Corp"
  billing_email text NOT NULL,           -- Verrechnungs-Email (kann ≠ Owner sein)
  owner_user_id uuid REFERENCES auth.users(id),  -- nullable: kann reine Billing-Adresse sein
  
  -- Plan & Lizenzierung
  plan_id uuid REFERENCES plans(id) NOT NULL,
  seat_limit integer NOT NULL DEFAULT 1,
  plan_managed_by text NOT NULL DEFAULT 'stripe' 
    CHECK (plan_managed_by IN ('stripe','leadesk')),
  
  -- Stripe-Integration
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  trial_ends_at timestamptz,
  
  -- Lifecycle
  status text NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing','active','past_due','suspended','canceled')),
  
  -- Whitelabel & Feature-Flags
  settings jsonb DEFAULT '{}'::jsonb,
  
  -- Leadesk-internal nur
  notes_internal text,                   -- Vertriebsnotizen, NIE für Customer sichtbar
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

#### `teams` (REFAKTORIERT)

Reine Team-Identität. Plan/Stripe/Lizenz fliegt raus.

```sql
CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  
  name text NOT NULL,
  slug text UNIQUE,
  
  -- Team-spezifische Settings (NICHT Account-weit!)
  settings jsonb DEFAULT '{}'::jsonb,    -- z.B. Zeit-Tracking-Config, Default-Pipeline
  
  created_by_user_id uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

#### `team_members` (BEHALTEN, leicht erweitert)

```sql
CREATE TABLE team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner','admin','member','viewer')),
  invited_by_user_id uuid REFERENCES auth.users(id),
  joined_at timestamptz DEFAULT now(),
  UNIQUE (team_id, user_id)
);
```

#### `user_preferences` (NEU oder erweitert falls existent)

Notwendig wegen N:N — der User muss wissen welches Team aktuell aktiv ist.

```sql
CREATE TABLE user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  -- weitere User-Settings hier
  updated_at timestamptz DEFAULT now()
);
```

### 3.3 RLS-Patterns

#### `accounts` — sehr restriktiv

```sql
-- Owner kann seinen eigenen Account sehen
CREATE POLICY "accounts_owner_select" ON accounts FOR SELECT
USING (owner_user_id = auth.uid());

-- Owner kann seinen Account ändern, ABER nur self-service-Felder 
-- (siehe Trigger-basierten Schutz unten)
CREATE POLICY "accounts_owner_update" ON accounts FOR UPDATE
USING (owner_user_id = auth.uid());

-- Leadesk-Admins via separater Role-Check
CREATE POLICY "accounts_admin_all" ON accounts FOR ALL
USING (auth.jwt() ->> 'role' = 'leadesk_admin');

-- INSERT nur von Trigger/Service-Role (Stripe-Webhook oder Admin-Action)
-- Keine direkte INSERT-Policy für authenticated
```

**Wichtig:** Die `notes_internal`-Spalte braucht einen separaten Schutz — z.B. Column-Level-Security oder eine View ohne diese Spalte für den Account-Owner. Sonst kann der Owner via PostgREST darauf zugreifen.

#### `teams` — Team-Mitglieder können lesen

```sql
CREATE POLICY "teams_member_select" ON teams FOR SELECT
USING (
  id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
);

CREATE POLICY "teams_admin_update" ON teams FOR UPDATE
USING (
  id IN (
    SELECT team_id FROM team_members 
    WHERE user_id = auth.uid() AND role IN ('owner','admin')
  )
);

CREATE POLICY "teams_account_owner_create" ON teams FOR INSERT
WITH CHECK (
  account_id IN (SELECT id FROM accounts WHERE owner_user_id = auth.uid())
);
```

#### `team_members` — User sieht seine eigenen + alle in seinen Teams

```sql
CREATE POLICY "team_members_self_or_team" ON team_members FOR SELECT
USING (
  user_id = auth.uid() 
  OR team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
);
```

### 3.4 Plan-Änderungs-Schutz (Hybrid-Modell)

Self-Service vs. Leadesk-gepflegt unterscheidet sich technisch nicht in den Spalten, sondern in der **Quelle der Schreiboperation**:

- `accounts.plan_managed_by = 'stripe'` → nur Stripe-Webhook (service_role) darf `plan_id`/`seat_limit` ändern
- `accounts.plan_managed_by = 'leadesk'` → nur Leadesk-Admin darf ändern, Stripe-Webhook ignoriert

Implementiert via **Update-Trigger** mit Validierung:

```sql
CREATE FUNCTION enforce_plan_change_authority() RETURNS trigger AS $$
BEGIN
  IF OLD.plan_id IS DISTINCT FROM NEW.plan_id 
  OR OLD.seat_limit IS DISTINCT FROM NEW.seat_limit THEN
    -- Nur service_role oder leadesk_admin darf das ändern
    IF current_setting('role') NOT IN ('service_role', 'leadesk_admin') THEN
      RAISE EXCEPTION 'Plan-Änderung nicht erlaubt für Rolle %', current_setting('role');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## 4. Migrations-Strategie (in Phasen)

Wegen Daten-Bestand und Cloud↔Hetzner-Drift muss das in klar getrennten Phasen passieren:

### Phase 1: Schema-Setup (additiv, keine Breaking Changes)

- `accounts`-Tabelle anlegen
- `teams.account_id` als NULLABLE FK ergänzen
- `user_preferences` anlegen oder erweitern
- RLS-Policies auf `accounts` setzen
- **App-Code unverändert** — bestehender Pfad funktioniert weiter

**Risiko:** niedrig. Reine Additionen.

### Phase 2: Daten-Migration (einmalig per Script)

- Für jeden existierenden `teams`-Eintrag → einen `accounts`-Eintrag erzeugen
  - `accounts.owner_user_id = teams.owner_id` (1:1)
  - `accounts.plan_id = teams.plan_id` (rüberkopieren)
  - `accounts.seat_limit` aus heutigem `teams.max_seats` (oder sinnvolle Defaults)
  - `accounts.name = teams.name` (initialer Wert, später vom Owner änderbar)
  - `accounts.billing_email = (SELECT email FROM auth.users WHERE id = teams.owner_id)`
- `teams.account_id` befüllen
- Verifizieren: jedes Team hat einen Account, jeder Account hat min. 1 Team

**Risiko:** mittel. Bedarf Test auf Hetzner-Staging-Daten zuerst.

### Phase 3: Frontend-Cutover (Breaking Change, Big Bang oder Feature-Flag)

- `useTeam()` aufgesplittet in `useTeam()` + `useAccount()`
- `TeamContext` umgebaut: lädt jetzt alle Teams des Users + active-Team-Selection
- Settings-Page gesplittet:
  - „Team" (Members, Invites, Team-Settings)
  - „Konto & Abo" (Plan, Rechnungsadresse, Seats — nur Account-Owner sichtbar)
- Team-Switcher-Komponente (Dropdown oben oder in Sidebar)
- URL-Pattern: entweder `/teams/:slug/...` oder weiter Single-Active-Team via `user_preferences`

**Empfehlung:** URL-basiert (`/teams/:slug/...`) — robuster gegen Tab-Drift bei Multi-Team-Usern.

### Phase 4: Cleanup (Breaking Change)

- `teams.plan_id`, `teams.is_active`, `teams.owner_id` etc. droppen (nur noch in `accounts`)
- `teams.account_id` als NOT NULL setzen (jetzt sind alle Teams einem Account zugeordnet)
- Cloud↔Hetzner-Schema-Drift weggeräumt

### Phase 5: Admin-UI (separates Feature)

- Neuer Bereich `/admin/accounts` für Leadesk-Mitarbeiter
- Account-Liste, Plan-Pflege für Hybrid-Modell, Stripe-Status, Notes
- Eigene RLS via `leadesk_admin`-Role

## 5. Frontend-Implikationen

| Komponente | Änderung |
|---|---|
| `TeamContext.jsx` | Lädt jetzt alle Memberships, exportet `activeTeam`, `availableTeams`, `switchTeam()` |
| `AccountContext.jsx` (NEU) | Lädt nur den aktiven Account inkl. Plan/Seats/Status |
| `Layout.jsx` Sidebar | Team-Switcher oben (Dropdown mit allen Teams des Users) |
| `Settings.jsx` | Aufgesplittet: Team-Tab, Konto-Tab |
| `Settings/Konto.jsx` (NEU) | Plan-Übersicht, Stripe-Portal-Link, Seats-Verwaltung (lesend für customer-managed Pläne) |
| `Settings/Team.jsx` | Members, Invites — kein Plan-Bezug mehr |
| `useTeam()` | Returnt `{activeTeamId, activeTeam, members, switchTeam, availableTeams}` |
| `useAccount()` (NEU) | Returnt `{account, plan, seatLimit, isOwner, status}` |
| Alle Inserts mit `team_id` | Bleiben unverändert — `activeTeamId` aus `useTeam()` ist weiterhin der Multi-Tenant-Key |

## 6. Open Questions für die Diskussion

1. **`pm_external_users` (Phase 8 im Roadmap)**: Freelancer/Externe via awork-Connect — passt das ins N:N-Modell oder braucht es eine eigene Membership-Tabelle? Ein Freelancer sollte vermutlich kein voller `team_member` sein, sondern ein limitierter Gast.

2. **Migrations-Risiko bestehende Stripe-Subscriptions**: Aktuell hängt `stripe_subscriptions.team_id` an `teams`. Bei Phase 2 muss das auf `account_id` umgemappt werden. Wenn Customer mitten im Cutover Stripe-Webhook auslöst, muss das fehlerfrei laufen. Brauchen wir einen Maintenance-Modus?

3. **Active-Team-Selection in URL vs. Preference**: Bei Multi-Team-Usern (Freelancer) ist URL-basiert klarer. Bei Single-Team-Usern (95% der Customer) ist Preference einfacher. Wollen wir beides parallel — URL überschreibt Preference?

4. **Notes_internal Schutz**: Column-Level-Security oder separate View ohne diese Spalte? Postgres Column-Level-Security ist mächtig aber komplex. View ist simpler, aber jeder Reader-Code muss explizit die View nutzen.

5. **Whitelabel-Config**: Aktuell vermutlich auf `teams.settings`. Sollte das nach `accounts.settings` wandern (Whitelabel ist Account-Eigenschaft, nicht Team-Eigenschaft) oder bleibt es bei Team? Pro-Account macht für mich mehr Sinn (eine Marke = ein Account).

6. **Trial-Logik**: Aktuell vermutlich auf `teams`. Definitiv nach `accounts` — Trial gilt pro Account, nicht pro Team. Aber: Was ist mit Account-Owner ohne User-Login? Wer „löst Trial aus" wenn Account von Leadesk angelegt wird?

7. **Account ohne User-Owner — Use Case**: Gibt es realistisch Accounts ohne User mit Login? Z.B. Großkunde, der nur Rechnungen bezahlt aber selbst nie das Tool nutzt? Wenn ja: wer kann dann Team-Owner werden, der erste eingeladene User?

## 7. Was nicht in diesem Refactor steckt

Bewusst aus dem Scope:

- **awork-Connect / pm_external_users** — eigenes Phase-8-Thema
- **Multi-Account-Hierarchien** (Holdings) — kommt vielleicht später, würde `accounts.parent_id` brauchen
- **SSO/SAML** — orthogonal
- **Audit-Log für Account-Änderungen** — wäre nice-to-have, aber separater Sprint

## 8. Empfohlene nächste Schritte

1. **Diese Doku** mit Julian besprechen (1h Call). Open Questions klären, evtl. Eckdaten anpassen.
2. **Phase 1 als eigenständige Migration** schreiben — additiv, kein Breaking Change. Auf Hetzner-Staging deployen.
3. **Phase 2 Daten-Migration** als idempotentes Script, erst auf Hetzner testen, dann Cloud-Prod-Cutover-Plan integrieren.
4. **Frontend-Phase 3** als eigenes Sprint-Item, mit klarem Feature-Flag-Mechanismus zur Rollback-Option.
5. **Heute: Mini-Kompat-Migration** für Phase 1b weitermachen — der hier beschriebene Refactor blockt den Live-Test nicht.

---

## Anhang: Migration-Reihenfolge im Verhältnis zu anderen Themen

```
heute  Phase 1b Live-Test fertig (Mini-Kompat-Migration: plan/max_seats Inline-Spalten zurück)
   ↓
+1d    Multi-Provider-AI develop→main Release (war eh geplant)
   ↓  
+1w    Design-Doc-Review mit Julian, Open Questions klären
   ↓
+2w    Phase 1: accounts-Schema + RLS auf Hetzner deployen, App-Code unverändert
   ↓
+3w    Phase 2: Daten-Migration auf Hetzner-Staging testen
   ↓
+4w    Phase 3: Frontend-Refactor (TeamContext-Split, AccountContext, Settings-Split)
   ↓
+5w    Phase 4: Cleanup auf Hetzner-Staging
   ↓
+6w    Cloud-Prod-Cutover (kombiniert: Hetzner-Migration + neues Schema)
```

Cloud-Prod-Cutover wird damit zu einem **kombinierten Event**: Migration + Schema-Refactor in einem Aufwasch. Spart einen separaten Cutover, bündelt aber das Risiko.

Alternative: Cloud-Prod-Cutover **vor** dem Schema-Refactor — dann ist der Refactor auf Hetzner-Prod sauber durchführbar mit der neuen Architektur. Würde ich vermutlich bevorzugen, weil zwei kleinere Risiko-Events besser sind als eines großes.

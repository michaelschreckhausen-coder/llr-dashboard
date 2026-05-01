-- ================================================================
-- Leadesk: plans.id text → uuid Konvertierung
-- ================================================================
--
-- Hintergrund
-- -----------
-- Auf Hetzner-Staging wurde plans.id und der gesamte FK-Stack
-- (profiles.plan_id, subscriptions.plan_id, wix_plan_mapping.plan_id,
-- stripe_subscriptions.plan_id) zu einem unbestimmten Zeitpunkt von
-- text auf uuid migriert — diese Migration hat es nie ins Repo
-- geschafft (Out-of-band-Patch).
--
-- Folge: 20260428200000_accounts_phase1_additive.sql deklariert
-- accounts.plan_id als uuid mit FK auf plans.id. Auf Staging klappt
-- das, auf jeder anderen Hetzner-DB (insb. Hetzner-Prod beim Cutover)
-- crasht es am Type-Mismatch.
--
-- Diese Migration zieht den Schema-Stand nach. Idempotent: prüft
-- data_type von plans.id und überspringt, wenn schon uuid.
--
-- VORAUSSETZUNG: betroffene Tabellen sind leer (Cutover-Kontext nach
-- TRUNCATE). 'USING NULL::uuid' würde sonst alle plan_id-Werte killen.
-- KEIN Apply auf befüllten DBs ohne explizite Mapping-Strategie.
--
-- Side-Effect: text-Plan-Validierungen (CHECK-Constraints mit Listen
-- 'free'/'starter'/'pro'/'professional'/'business'/'enterprise') werden
-- entfernt. Das ist gewollt — nach dem Cast sind plan_id-Werte UUIDs,
-- semantische Validierung übernimmt das plan-modules-System
-- (`account_has_module()` + RLS-Lockdown). Plan-Naming aus früher
-- Cloud-Zeit ('professional', 'business') verliert seine Bedeutung.
--
-- Apply-Reihenfolge: VOR 20260428200000_accounts_phase1_additive.sql
-- ================================================================

DO $$
DECLARE
  current_type text;
BEGIN
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'plans'
    AND column_name  = 'id';

  IF current_type = 'text' THEN
    RAISE NOTICE 'plans.id ist text — konvertiere auf uuid';

    -- 1. FKs auf plans.id droppen
    ALTER TABLE public.profiles             DROP CONSTRAINT IF EXISTS profiles_plan_id_fkey;
    ALTER TABLE public.subscriptions        DROP CONSTRAINT IF EXISTS subscriptions_plan_id_fkey;
    ALTER TABLE public.wix_plan_mapping     DROP CONSTRAINT IF EXISTS wix_plan_mapping_plan_id_fkey;
    ALTER TABLE public.stripe_subscriptions DROP CONSTRAINT IF EXISTS stripe_subscriptions_plan_id_fkey;

    -- 1b. Defaults auf plan_id-Spalten droppen.
    --     Postgres würde sonst beim TYPE-Cast crashen mit
    --     "default for column ... cannot be cast automatically to type uuid".
    --     DROP DEFAULT ist no-op falls kein Default gesetzt ist → idempotent.
    ALTER TABLE public.plans                ALTER COLUMN id      DROP DEFAULT;
    ALTER TABLE public.profiles             ALTER COLUMN plan_id DROP DEFAULT;
    ALTER TABLE public.subscriptions        ALTER COLUMN plan_id DROP DEFAULT;
    ALTER TABLE public.wix_plan_mapping     ALTER COLUMN plan_id DROP DEFAULT;
    ALTER TABLE public.stripe_subscriptions ALTER COLUMN plan_id DROP DEFAULT;

    -- 1c. CHECK-Constraints auf plan_id-Spalten droppen.
    --     Diese vergleichen plan_id mit text-Literalen ('free','starter',
    --     'professional','business'), würden beim TYPE-Cast crashen mit
    --     "operator does not exist: uuid = text".
    --     IF EXISTS → idempotent (no-op auf Staging).
    ALTER TABLE public.profiles             DROP CONSTRAINT IF EXISTS profiles_plan_id_check;
    ALTER TABLE public.subscriptions        DROP CONSTRAINT IF EXISTS subscriptions_plan_id_check;
    ALTER TABLE public.wix_plan_mapping     DROP CONSTRAINT IF EXISTS wix_plan_mapping_plan_id_check;
    ALTER TABLE public.stripe_subscriptions DROP CONSTRAINT IF EXISTS stripe_subscriptions_plan_id_check;
    ALTER TABLE public.plans                DROP CONSTRAINT IF EXISTS plans_id_check;

    -- 2. Typen umstellen text → uuid (Tabellen leer, Cast trivial)
    ALTER TABLE public.plans                ALTER COLUMN id      TYPE uuid USING NULL::uuid;
    ALTER TABLE public.profiles             ALTER COLUMN plan_id TYPE uuid USING NULL::uuid;
    ALTER TABLE public.subscriptions        ALTER COLUMN plan_id TYPE uuid USING NULL::uuid;
    ALTER TABLE public.wix_plan_mapping     ALTER COLUMN plan_id TYPE uuid USING NULL::uuid;
    ALTER TABLE public.stripe_subscriptions ALTER COLUMN plan_id TYPE uuid USING NULL::uuid;

    -- 3. plans.id-Default auf gen_random_uuid()
    ALTER TABLE public.plans                ALTER COLUMN id SET DEFAULT gen_random_uuid();

    -- 4. FKs neu anlegen (auch stripe_subscriptions, das auf Staging FK ist)
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_plan_id_fkey
      FOREIGN KEY (plan_id) REFERENCES public.plans(id);
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_plan_id_fkey
      FOREIGN KEY (plan_id) REFERENCES public.plans(id);
    ALTER TABLE public.wix_plan_mapping
      ADD CONSTRAINT wix_plan_mapping_plan_id_fkey
      FOREIGN KEY (plan_id) REFERENCES public.plans(id);
    ALTER TABLE public.stripe_subscriptions
      ADD CONSTRAINT stripe_subscriptions_plan_id_fkey
      FOREIGN KEY (plan_id) REFERENCES public.plans(id);

    RAISE NOTICE 'plans.id Konvertierung abgeschlossen';
  ELSIF current_type = 'uuid' THEN
    RAISE NOTICE 'plans.id ist bereits uuid — Migration übersprungen';
  ELSE
    RAISE EXCEPTION 'Unerwarteter plans.id-Typ: % (erwartet: text oder uuid)', current_type;
  END IF;
END $$;

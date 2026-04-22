-- WS-2 Batch M1-SQL — Bootstrap provisioning + RLS gaps + NULLIF normalization
-- Datum: 2026-04-22
--
-- Rozsah (navazuje na Batch M1-A code refactor):
--
--   A) SECURITY DEFINER funkce pro pre-auth / bootstrap scénáře:
--        1. public.provision_workspace_v1       — workspace bootstrap (ensure-workspace.ts)
--        2. public.resolve_public_booking_v1    — public booking pre-auth lookup (public-booking/data.ts)
--        3. public.lookup_invite_metadata_v1    — invite metadata prefill (api/invite/metadata)
--      Všechny jsou SECURITY DEFINER (běží pod ownerem / postgres), takže uvnitř
--      bypass-ují RLS v controlled rozsahu. GRANT EXECUTE pouze na `aidvisora_app`
--      + `authenticated` + `anon` — anon je nutný pro pre-login endpointy.
--
--   B) Bootstrap RLS policies pro invitations:
--      - client_invitations_self_bootstrap_select (auth_user_id = app.user_id)
--      - staff_invitations_self_bootstrap_select  (auth_user_id = app.user_id)
--      Doplňují tenant-scoped policies z Batch 3 (core-tier loop nastavil tenant_select)
--      o možnost čtení vlastní pozvánky JEŠTĚ PŘED vyřešením tenantu (potřeba v
--      `findPendingClientPasswordChangeRedirect`, který dostane jen `app.user_id`).
--
--   C) RLS gap tables — dosud nepokryté v Batch 1–3:
--      - user_terms_acceptance      (append-only, self/tenant scoped)
--      - user_devices               (tenant + user scoped)
--      - unsubscribe_tokens         (join přes contacts.tenant_id)
--      - opportunity_stages         (tenant-scoped; provision_workspace_v1 target)
--      - partners                   (read-all: globální + own tenant; write: own tenant)
--      - products                   (read-all přes partners; write přes own-tenant partner)
--      - fund_add_requests          (tenant-scoped)
--      - dead_letter_items          (tenant-scoped)
--      - ai_generations             (tenant-scoped)
--      - ai_feedback                (join přes ai_generations.tenant_id)
--      - analysis_import_jobs       (tenant-scoped)
--      - analysis_versions          (join přes financial_analyses.tenant_id)
--
--   D) Core-tier NULLIF normalizace:
--      Existující policies z migrací rls-m3-m4 / tenant-id-schema-fixes / contracts fix /
--      add_assistant_conversations / rls-unify-guc používají křehký pattern
--        `(SELECT current_setting('app.tenant_id', true))::uuid`
--      který selže SQLSTATE, pokud GUC není nastavená (což je fail-open z pohledu
--      runtime, ale DDoS-like z pohledu operátora — každá chybějící GUC = 500).
--      Normalizujeme na robustní
--        `NULLIF(current_setting('app.tenant_id', true), '')::uuid`
--      + `IS NOT NULL` guard → fail-closed na 0 řádků / deny-all při write.
--
-- Idempotentní. Bezpečné re-run.
--
-- Tato migrace JE hard-blocker pro cutover na `aidvisora_app`. Bez ní:
--   - registrace nového workspace selže (ensure-workspace)
--   - public booking neprojde (resolve_public_booking_v1)
--   - invite prefill selže (lookup_invite_metadata_v1)
--   - user terms audit spadne na missing RLS policy
--   - partners/products query vrátí 0 rows (deny-all)

BEGIN;

-- =============================================================================
-- A) SECURITY DEFINER FUNKCE
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A.1  public.provision_workspace_v1(p_user_id, p_email, p_slug, p_trial_plan, p_trial_days)
-- -----------------------------------------------------------------------------
-- Atomicky vytvoří tenanta, 6 rolí, Admin membership, 6 výchozích opportunity stages.
-- Volá se z `provisionWorkspaceIfNeeded` po prvním přihlášení poradce.
--
-- Idempotence: pokud už membership pro p_user_id existuje, no-op (vrací existující
-- tenant_id). To chrání před double-call (double-click registrace, retry po síťové chybě).
CREATE OR REPLACE FUNCTION public.provision_workspace_v1(
  p_user_id    uuid,
  p_email      text,
  p_slug       text,
  p_trial_plan text,
  p_trial_days int
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_tenant_id uuid;
  v_admin_role_id uuid;
  v_existing_tenant_id uuid;
BEGIN
  -- Strictní validace vstupů
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'provision_workspace_v1: p_user_id must not be null';
  END IF;
  IF p_slug IS NULL OR length(p_slug) < 3 OR length(p_slug) > 64 THEN
    RAISE EXCEPTION 'provision_workspace_v1: p_slug must be 3..64 chars';
  END IF;
  IF p_slug !~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' THEN
    RAISE EXCEPTION 'provision_workspace_v1: p_slug must match [a-z0-9-]';
  END IF;
  IF p_trial_days IS NULL OR p_trial_days < 0 OR p_trial_days > 365 THEN
    RAISE EXCEPTION 'provision_workspace_v1: p_trial_days out of range (0..365)';
  END IF;

  -- Idempotence — existing membership wins
  SELECT m.tenant_id INTO v_existing_tenant_id
    FROM public.memberships m
   WHERE m.user_id = p_user_id::text
   LIMIT 1;
  IF v_existing_tenant_id IS NOT NULL THEN
    RETURN v_existing_tenant_id;
  END IF;

  -- Tenant
  INSERT INTO public.tenants (
    name, slug,
    trial_started_at, trial_ends_at, trial_plan_key
  ) VALUES (
    'Můj workspace',
    p_slug,
    now(),
    now() + make_interval(days => p_trial_days),
    NULLIF(p_trial_plan, '')
  )
  RETURNING id INTO v_tenant_id;

  -- Roles (Admin first, to získat admin role id pro membership)
  INSERT INTO public.roles (tenant_id, name) VALUES
    (v_tenant_id, 'Admin'),
    (v_tenant_id, 'Director'),
    (v_tenant_id, 'Manager'),
    (v_tenant_id, 'Advisor'),
    (v_tenant_id, 'Viewer'),
    (v_tenant_id, 'Client');

  SELECT id INTO v_admin_role_id
    FROM public.roles
   WHERE tenant_id = v_tenant_id AND name = 'Admin'
   LIMIT 1;

  -- Admin membership pro registrujícího se uživatele
  INSERT INTO public.memberships (tenant_id, user_id, role_id)
  VALUES (v_tenant_id, p_user_id::text, v_admin_role_id);

  -- Default pipeline fáze (shodné s ensureDefaultStages z pipeline.ts)
  INSERT INTO public.opportunity_stages (tenant_id, name, sort_order, probability) VALUES
    (v_tenant_id, 'Zahájeno',        0,   0),
    (v_tenant_id, 'Analýza potřeb',  1,  20),
    (v_tenant_id, 'Nabídka',         2,  40),
    (v_tenant_id, 'Před uzavřením', 3,  60),
    (v_tenant_id, 'Realizace',       4,  80),
    (v_tenant_id, 'Péče a servis',   5, 100);

  RETURN v_tenant_id;
END;
$fn$;

COMMENT ON FUNCTION public.provision_workspace_v1(uuid, text, text, text, int) IS
  'WS-2 M1-A bootstrap: atomicky vytvoří tenant+roles+admin membership+stages pro nově registrovaného poradce. Běží SECURITY DEFINER nad ownerskou identitou — obchází RLS, takže je volatelná i pod aidvisora_app před nastavením app.tenant_id.';

REVOKE ALL ON FUNCTION public.provision_workspace_v1(uuid, text, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_workspace_v1(uuid, text, text, text, int)
  TO aidvisora_app, authenticated;

-- -----------------------------------------------------------------------------
-- A.2  public.resolve_public_booking_v1(p_token)
-- -----------------------------------------------------------------------------
-- Bezpečný pre-auth lookup veřejného booking URL. Vrací minimum dat potřebných
-- pro zobrazení bookingu (neleakne ostatní advisor/tenant data).
--
-- Pokud token není platný, pokud booking není enabled, nebo pokud advisor nemá
-- availability — vrátí 0 řádků.
CREATE OR REPLACE FUNCTION public.resolve_public_booking_v1(p_token text)
RETURNS TABLE (
  tenant_id       uuid,
  user_id         text,
  tenant_name     text,
  advisor_name    text,
  slot_minutes    integer,
  buffer_minutes  integer,
  availability    jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $fn$
  SELECT
    ap.tenant_id,
    ap.user_id,
    t.name                         AS tenant_name,
    NULLIF(trim(up.full_name), '') AS advisor_name,
    ap.booking_slot_minutes,
    ap.booking_buffer_minutes,
    ap.booking_availability
  FROM public.advisor_preferences ap
  JOIN public.tenants        t  ON t.id = ap.tenant_id
  LEFT JOIN public.user_profiles up ON up.user_id = ap.user_id
  WHERE p_token IS NOT NULL
    AND length(p_token) BETWEEN 8 AND 80
    AND ap.public_booking_token = p_token
    AND ap.public_booking_enabled = true
  LIMIT 1;
$fn$;

COMMENT ON FUNCTION public.resolve_public_booking_v1(text) IS
  'WS-2 M1-A pre-auth: bezpečně rezoluje veřejný booking URL na (tenant,user,availability). SECURITY DEFINER; vrací 0 řádků pokud token neexistuje nebo booking není enabled.';

REVOKE ALL ON FUNCTION public.resolve_public_booking_v1(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_public_booking_v1(text)
  TO aidvisora_app, authenticated, anon;

-- -----------------------------------------------------------------------------
-- A.3  public.lookup_invite_metadata_v1(p_token, p_kind)
-- -----------------------------------------------------------------------------
-- Pre-auth lookup metadat pozvánky (client / staff) pro prefill `/prihlaseni`
-- formuláře. Vrací jen řádek, pokud je pozvánka platná — tj. not revoked,
-- not accepted, not expired. Nevrací autentizační tokeny ani citlivá data.
CREATE OR REPLACE FUNCTION public.lookup_invite_metadata_v1(
  p_token text,
  p_kind  text
) RETURNS TABLE (
  kind         text,
  email        text,
  expires_at   timestamptz,
  first_name   text,
  tenant_name  text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $fn$
  SELECT
    'client'::text                    AS kind,
    ci.email,
    ci.expires_at,
    NULLIF(trim(c.first_name), '')    AS first_name,
    NULL::text                        AS tenant_name
  FROM public.client_invitations ci
  LEFT JOIN public.contacts c ON c.id = ci.contact_id
  WHERE p_kind = 'client'
    AND p_token IS NOT NULL
    AND length(p_token) = 32
    AND ci.token = p_token
    AND ci.revoked_at IS NULL
    AND ci.accepted_at IS NULL
    AND ci.expires_at > now()
  UNION ALL
  SELECT
    'staff'::text                     AS kind,
    si.email,
    si.expires_at,
    NULL::text                        AS first_name,
    NULLIF(trim(t.name), '')          AS tenant_name
  FROM public.staff_invitations si
  LEFT JOIN public.tenants t ON t.id = si.tenant_id
  WHERE p_kind = 'staff'
    AND p_token IS NOT NULL
    AND length(p_token) = 32
    AND si.token = p_token
    AND si.revoked_at IS NULL
    AND si.accepted_at IS NULL
    AND si.expires_at > now()
  LIMIT 1;
$fn$;

COMMENT ON FUNCTION public.lookup_invite_metadata_v1(text, text) IS
  'WS-2 M1-A pre-auth: bezpečně rezoluje pozvánkový token na (email, expires_at, first_name|tenant_name). SECURITY DEFINER; vrací 0 řádků pokud token neplatný/revoked/accepted/expirovaný.';

REVOKE ALL ON FUNCTION public.lookup_invite_metadata_v1(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_invite_metadata_v1(text, text)
  TO aidvisora_app, authenticated, anon;

-- =============================================================================
-- B) BOOTSTRAP RLS POLICIES PRO INVITATIONS
-- =============================================================================
-- Batch 3 vytvořila tenant-scoped policies na client_invitations. Pro
-- `findPendingClientPasswordChangeRedirect` + `assertExistingAuthUserIsSafe`
-- potřebujeme navíc self-bootstrap select (přes `auth_user_id = app.user_id`).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='client_invitations') THEN
    EXECUTE 'DROP POLICY IF EXISTS client_invitations_self_bootstrap_select ON public.client_invitations';
    EXECUTE $p$
      CREATE POLICY client_invitations_self_bootstrap_select ON public.client_invitations
        FOR SELECT TO authenticated, aidvisora_app
        USING (
          (
            NULLIF(current_setting('app.user_id', true), '') IS NOT NULL
            AND auth_user_id = NULLIF(current_setting('app.user_id', true), '')
          )
          OR auth_user_id = (SELECT auth.uid())::text
        )
    $p$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='staff_invitations') THEN
    EXECUTE 'DROP POLICY IF EXISTS staff_invitations_self_bootstrap_select ON public.staff_invitations';
    EXECUTE $p$
      CREATE POLICY staff_invitations_self_bootstrap_select ON public.staff_invitations
        FOR SELECT TO authenticated, aidvisora_app
        USING (
          (
            NULLIF(current_setting('app.user_id', true), '') IS NOT NULL
            AND auth_user_id = NULLIF(current_setting('app.user_id', true), '')
          )
          OR auth_user_id = (SELECT auth.uid())::text
        )
    $p$;
  END IF;
END $$;

-- =============================================================================
-- C) RLS GAP TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- C.1 user_terms_acceptance — append-only audit
-- -----------------------------------------------------------------------------
-- INSERT povolen, pokud WITH CHECK matchne buď app.user_id = user_id, nebo
-- app.tenant_id = tenant_id (checkout / staff invite). Explicitní contact-only
-- cesta je povolená jen v app.user_id = null scénáři (legacy public booking flow).
-- SELECT / UPDATE / DELETE: UPDATE/DELETE navíc blokovaný triggerem
-- (user_terms_acceptance_block_update).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_terms_acceptance') THEN
    RAISE NOTICE 'user_terms_acceptance tabulka neexistuje — přeskakuji.';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS user_terms_acceptance_self_select  ON public.user_terms_acceptance';
  EXECUTE 'DROP POLICY IF EXISTS user_terms_acceptance_self_insert  ON public.user_terms_acceptance';
  EXECUTE 'DROP POLICY IF EXISTS user_terms_acceptance_tenant_select ON public.user_terms_acceptance';

  -- Self select (jen vlastní řádky přes app.user_id)
  EXECUTE $p$
    CREATE POLICY user_terms_acceptance_self_select ON public.user_terms_acceptance
      FOR SELECT TO authenticated, aidvisora_app
      USING (
        (
          NULLIF(current_setting('app.user_id', true), '') IS NOT NULL
          AND user_id = NULLIF(current_setting('app.user_id', true), '')
        )
        OR user_id = (SELECT auth.uid())::text
      )
  $p$;

  -- Tenant select (admin/compliance audit v rámci tenantu)
  EXECUTE $p$
    CREATE POLICY user_terms_acceptance_tenant_select ON public.user_terms_acceptance
      FOR SELECT TO authenticated, aidvisora_app
      USING (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
  $p$;

  -- INSERT — pouze self (přes app.user_id) nebo tenant-scoped (přes app.tenant_id).
  -- Legacy contact-only flow (public booking bez přihlášení) posílá `user_id IS NULL`
  -- — tam se insert děje v mimo-tenantové cestě, kterou mapujeme na `app.tenant_id`
  -- z kontaktu. Pro jistotu povolíme i kontakt-scope (contact_id z public.contacts
  -- v current tenantu), takže anonymní cesta má alespoň tenant-level ochranu.
  EXECUTE $p$
    CREATE POLICY user_terms_acceptance_self_insert ON public.user_terms_acceptance
      FOR INSERT TO authenticated, aidvisora_app
      WITH CHECK (
        (
          user_id IS NOT NULL
          AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL
          AND user_id = NULLIF(current_setting('app.user_id', true), '')
        )
        OR (
          tenant_id IS NOT NULL
          AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
          AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
  $p$;

  EXECUTE 'ALTER TABLE public.user_terms_acceptance ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.user_terms_acceptance FORCE ROW LEVEL SECURITY';
END $$;

-- -----------------------------------------------------------------------------
-- C.2 user_devices — tenant + user scope
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_devices') THEN
    RAISE NOTICE 'user_devices tabulka neexistuje — přeskakuji.';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS user_devices_tenant_select ON public.user_devices';
  EXECUTE 'DROP POLICY IF EXISTS user_devices_tenant_insert ON public.user_devices';
  EXECUTE 'DROP POLICY IF EXISTS user_devices_tenant_update ON public.user_devices';
  EXECUTE 'DROP POLICY IF EXISTS user_devices_tenant_delete ON public.user_devices';
  EXECUTE 'DROP POLICY IF EXISTS user_devices_self_select   ON public.user_devices';
  EXECUTE 'DROP POLICY IF EXISTS user_devices_self_upsert   ON public.user_devices';

  -- Tenant scope (admin / push fan-out)
  EXECUTE $p$
    CREATE POLICY user_devices_tenant_select ON public.user_devices
      FOR SELECT TO authenticated, aidvisora_app
      USING (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY user_devices_tenant_insert ON public.user_devices
      FOR INSERT TO authenticated, aidvisora_app
      WITH CHECK (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY user_devices_tenant_update ON public.user_devices
      FOR UPDATE TO authenticated, aidvisora_app
      USING (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
      WITH CHECK (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY user_devices_tenant_delete ON public.user_devices
      FOR DELETE TO authenticated, aidvisora_app
      USING (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
  $p$;

  EXECUTE 'ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.user_devices FORCE ROW LEVEL SECURITY';
END $$;

-- -----------------------------------------------------------------------------
-- C.3 unsubscribe_tokens — join přes contacts.tenant_id
-- -----------------------------------------------------------------------------
-- Lookup přes token je pre-auth; runtime path vede přes SECURITY DEFINER (nebo
-- service identity v Phase 3). Pro post-login audit / admin drill-down stačí
-- tenant-scoped read přes contact-join.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='unsubscribe_tokens') THEN
    RAISE NOTICE 'unsubscribe_tokens tabulka neexistuje — přeskakuji.';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS unsubscribe_tokens_via_contact_select ON public.unsubscribe_tokens';
  EXECUTE 'DROP POLICY IF EXISTS unsubscribe_tokens_via_contact_insert ON public.unsubscribe_tokens';
  EXECUTE 'DROP POLICY IF EXISTS unsubscribe_tokens_via_contact_update ON public.unsubscribe_tokens';
  EXECUTE 'DROP POLICY IF EXISTS unsubscribe_tokens_via_contact_delete ON public.unsubscribe_tokens';

  EXECUTE $p$
    CREATE POLICY unsubscribe_tokens_via_contact_select ON public.unsubscribe_tokens
      FOR SELECT TO authenticated, aidvisora_app
      USING (
        EXISTS (
          SELECT 1 FROM public.contacts c
          WHERE c.id = public.unsubscribe_tokens.contact_id
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND c.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY unsubscribe_tokens_via_contact_insert ON public.unsubscribe_tokens
      FOR INSERT TO authenticated, aidvisora_app
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.contacts c
          WHERE c.id = public.unsubscribe_tokens.contact_id
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND c.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY unsubscribe_tokens_via_contact_update ON public.unsubscribe_tokens
      FOR UPDATE TO authenticated, aidvisora_app
      USING (
        EXISTS (
          SELECT 1 FROM public.contacts c
          WHERE c.id = public.unsubscribe_tokens.contact_id
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND c.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.contacts c
          WHERE c.id = public.unsubscribe_tokens.contact_id
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND c.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY unsubscribe_tokens_via_contact_delete ON public.unsubscribe_tokens
      FOR DELETE TO authenticated, aidvisora_app
      USING (
        EXISTS (
          SELECT 1 FROM public.contacts c
          WHERE c.id = public.unsubscribe_tokens.contact_id
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND c.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
  $p$;

  EXECUTE 'ALTER TABLE public.unsubscribe_tokens ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.unsubscribe_tokens FORCE ROW LEVEL SECURITY';
END $$;

-- -----------------------------------------------------------------------------
-- C.4 opportunity_stages — přímé tenant scope
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='opportunity_stages') THEN
    RAISE NOTICE 'opportunity_stages tabulka neexistuje — přeskakuji.';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS opportunity_stages_tenant_select ON public.opportunity_stages';
  EXECUTE 'DROP POLICY IF EXISTS opportunity_stages_tenant_insert ON public.opportunity_stages';
  EXECUTE 'DROP POLICY IF EXISTS opportunity_stages_tenant_update ON public.opportunity_stages';
  EXECUTE 'DROP POLICY IF EXISTS opportunity_stages_tenant_delete ON public.opportunity_stages';

  EXECUTE $p$
    CREATE POLICY opportunity_stages_tenant_select ON public.opportunity_stages
      FOR SELECT TO authenticated, aidvisora_app
      USING (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY opportunity_stages_tenant_insert ON public.opportunity_stages
      FOR INSERT TO authenticated, aidvisora_app
      WITH CHECK (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY opportunity_stages_tenant_update ON public.opportunity_stages
      FOR UPDATE TO authenticated, aidvisora_app
      USING (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
      WITH CHECK (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY opportunity_stages_tenant_delete ON public.opportunity_stages
      FOR DELETE TO authenticated, aidvisora_app
      USING (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
  $p$;

  EXECUTE 'ALTER TABLE public.opportunity_stages ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.opportunity_stages FORCE ROW LEVEL SECURITY';
END $$;

-- -----------------------------------------------------------------------------
-- C.5 partners — globální katalog + per-tenant overrides (read-all, scoped write)
-- -----------------------------------------------------------------------------
-- partners.tenant_id nullable: NULL = globální katalog viditelný všem tenantům.
-- Per-tenant overrides jsou v plánu (zatím neexistují), takže WRITE je povolený
-- jen s tenant_id = app.tenant_id (zabrání mutaci globálního katalogu z runtime).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='partners') THEN
    RAISE NOTICE 'partners tabulka neexistuje — přeskakuji.';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS partners_read_all              ON public.partners';
  EXECUTE 'DROP POLICY IF EXISTS partners_tenant_insert         ON public.partners';
  EXECUTE 'DROP POLICY IF EXISTS partners_tenant_update         ON public.partners';
  EXECUTE 'DROP POLICY IF EXISTS partners_tenant_delete         ON public.partners';

  -- Read: globální řádky (tenant_id IS NULL) + vlastní tenantové řádky
  EXECUTE $p$
    CREATE POLICY partners_read_all ON public.partners
      FOR SELECT TO authenticated, aidvisora_app
      USING (
        tenant_id IS NULL
        OR (
          NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
          AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
  $p$;

  -- Write: jen tenant-scoped řádky (žádný runtime write nad globálním katalogem)
  EXECUTE $p$
    CREATE POLICY partners_tenant_insert ON public.partners
      FOR INSERT TO authenticated, aidvisora_app
      WITH CHECK (
        tenant_id IS NOT NULL
        AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY partners_tenant_update ON public.partners
      FOR UPDATE TO authenticated, aidvisora_app
      USING (
        tenant_id IS NOT NULL
        AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
      WITH CHECK (
        tenant_id IS NOT NULL
        AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY partners_tenant_delete ON public.partners
      FOR DELETE TO authenticated, aidvisora_app
      USING (
        tenant_id IS NOT NULL
        AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
  $p$;

  EXECUTE 'ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.partners FORCE ROW LEVEL SECURITY';
END $$;

-- -----------------------------------------------------------------------------
-- C.6 products — read-all přes partners, write jen u own-tenant partners
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='products') THEN
    RAISE NOTICE 'products tabulka neexistuje — přeskakuji.';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS products_read_all              ON public.products';
  EXECUTE 'DROP POLICY IF EXISTS products_tenant_insert         ON public.products';
  EXECUTE 'DROP POLICY IF EXISTS products_tenant_update         ON public.products';
  EXECUTE 'DROP POLICY IF EXISTS products_tenant_delete         ON public.products';

  EXECUTE $p$
    CREATE POLICY products_read_all ON public.products
      FOR SELECT TO authenticated, aidvisora_app
      USING (
        EXISTS (
          SELECT 1 FROM public.partners p
          WHERE p.id = public.products.partner_id
            AND (
              p.tenant_id IS NULL
              OR (
                NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
                AND p.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
              )
            )
        )
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY products_tenant_insert ON public.products
      FOR INSERT TO authenticated, aidvisora_app
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.partners p
          WHERE p.id = public.products.partner_id
            AND p.tenant_id IS NOT NULL
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND p.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY products_tenant_update ON public.products
      FOR UPDATE TO authenticated, aidvisora_app
      USING (
        EXISTS (
          SELECT 1 FROM public.partners p
          WHERE p.id = public.products.partner_id
            AND p.tenant_id IS NOT NULL
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND p.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.partners p
          WHERE p.id = public.products.partner_id
            AND p.tenant_id IS NOT NULL
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND p.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY products_tenant_delete ON public.products
      FOR DELETE TO authenticated, aidvisora_app
      USING (
        EXISTS (
          SELECT 1 FROM public.partners p
          WHERE p.id = public.products.partner_id
            AND p.tenant_id IS NOT NULL
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND p.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
  $p$;

  EXECUTE 'ALTER TABLE public.products ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.products FORCE ROW LEVEL SECURITY';
END $$;

-- -----------------------------------------------------------------------------
-- C.7 Generic tenant-scoped loop pro zbylé gap tables
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
  tenant_tables text[] := ARRAY[
    'fund_add_requests',
    'dead_letter_items',
    'ai_generations',
    'analysis_import_jobs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
      RAISE NOTICE 'rls-m8 skip %: table missing.', tbl;
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=tbl AND column_name='tenant_id') THEN
      RAISE NOTICE 'rls-m8 skip %: no tenant_id column.', tbl;
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_tenant_select', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_tenant_insert', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_tenant_update', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_tenant_delete', tbl);
    -- Legacy FOR ALL naming (rls-unify-guc / supabase-performance-advisor používaly `_tenant_isolation`)
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_tenant_isolation', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_tenant_all', tbl);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated, aidvisora_app ' ||
      'USING (NULLIF(current_setting(''app.tenant_id'', true), '''') IS NOT NULL ' ||
      'AND tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      tbl || '_tenant_select', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated, aidvisora_app ' ||
      'WITH CHECK (NULLIF(current_setting(''app.tenant_id'', true), '''') IS NOT NULL ' ||
      'AND tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      tbl || '_tenant_insert', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated, aidvisora_app ' ||
      'USING (NULLIF(current_setting(''app.tenant_id'', true), '''') IS NOT NULL ' ||
      'AND tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) ' ||
      'WITH CHECK (NULLIF(current_setting(''app.tenant_id'', true), '''') IS NOT NULL ' ||
      'AND tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      tbl || '_tenant_update', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated, aidvisora_app ' ||
      'USING (NULLIF(current_setting(''app.tenant_id'', true), '''') IS NOT NULL ' ||
      'AND tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      tbl || '_tenant_delete', tbl);

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- C.8 ai_feedback — join přes ai_generations.tenant_id
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ai_feedback') THEN
    RAISE NOTICE 'ai_feedback tabulka neexistuje — přeskakuji.';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS ai_feedback_via_generation_select ON public.ai_feedback';
  EXECUTE 'DROP POLICY IF EXISTS ai_feedback_via_generation_insert ON public.ai_feedback';
  EXECUTE 'DROP POLICY IF EXISTS ai_feedback_via_generation_update ON public.ai_feedback';
  EXECUTE 'DROP POLICY IF EXISTS ai_feedback_via_generation_delete ON public.ai_feedback';

  EXECUTE $p$
    CREATE POLICY ai_feedback_via_generation_select ON public.ai_feedback
      FOR SELECT TO authenticated, aidvisora_app
      USING (
        EXISTS (
          SELECT 1 FROM public.ai_generations g
          WHERE g.id = public.ai_feedback.generation_id
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND g.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY ai_feedback_via_generation_insert ON public.ai_feedback
      FOR INSERT TO authenticated, aidvisora_app
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.ai_generations g
          WHERE g.id = public.ai_feedback.generation_id
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND g.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY ai_feedback_via_generation_update ON public.ai_feedback
      FOR UPDATE TO authenticated, aidvisora_app
      USING (
        EXISTS (
          SELECT 1 FROM public.ai_generations g
          WHERE g.id = public.ai_feedback.generation_id
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND g.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.ai_generations g
          WHERE g.id = public.ai_feedback.generation_id
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND g.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY ai_feedback_via_generation_delete ON public.ai_feedback
      FOR DELETE TO authenticated, aidvisora_app
      USING (
        EXISTS (
          SELECT 1 FROM public.ai_generations g
          WHERE g.id = public.ai_feedback.generation_id
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND g.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
  $p$;

  EXECUTE 'ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.ai_feedback FORCE ROW LEVEL SECURITY';
END $$;

-- -----------------------------------------------------------------------------
-- C.9 analysis_versions — join přes financial_analyses.tenant_id
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='analysis_versions') THEN
    RAISE NOTICE 'analysis_versions tabulka neexistuje — přeskakuji.';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS analysis_versions_via_analysis_select ON public.analysis_versions';
  EXECUTE 'DROP POLICY IF EXISTS analysis_versions_via_analysis_insert ON public.analysis_versions';
  EXECUTE 'DROP POLICY IF EXISTS analysis_versions_via_analysis_update ON public.analysis_versions';
  EXECUTE 'DROP POLICY IF EXISTS analysis_versions_via_analysis_delete ON public.analysis_versions';

  EXECUTE $p$
    CREATE POLICY analysis_versions_via_analysis_select ON public.analysis_versions
      FOR SELECT TO authenticated, aidvisora_app
      USING (
        EXISTS (
          SELECT 1 FROM public.financial_analyses fa
          WHERE fa.id = public.analysis_versions.analysis_id
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND fa.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY analysis_versions_via_analysis_insert ON public.analysis_versions
      FOR INSERT TO authenticated, aidvisora_app
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.financial_analyses fa
          WHERE fa.id = public.analysis_versions.analysis_id
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND fa.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY analysis_versions_via_analysis_update ON public.analysis_versions
      FOR UPDATE TO authenticated, aidvisora_app
      USING (
        EXISTS (
          SELECT 1 FROM public.financial_analyses fa
          WHERE fa.id = public.analysis_versions.analysis_id
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND fa.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.financial_analyses fa
          WHERE fa.id = public.analysis_versions.analysis_id
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND fa.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY analysis_versions_via_analysis_delete ON public.analysis_versions
      FOR DELETE TO authenticated, aidvisora_app
      USING (
        EXISTS (
          SELECT 1 FROM public.financial_analyses fa
          WHERE fa.id = public.analysis_versions.analysis_id
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND fa.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
  $p$;

  EXECUTE 'ALTER TABLE public.analysis_versions ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.analysis_versions FORCE ROW LEVEL SECURITY';
END $$;

-- =============================================================================
-- D) CORE-TIER NULLIF NORMALIZACE
-- =============================================================================
-- Předchozí migrace (rls-m3-m4, tenant-id-schema-fixes, add_assistant_conversations,
-- rls-unify-guc, advisor-proposals, contracts fix) používají křehký pattern
--   (SELECT current_setting('app.tenant_id', true))::uuid
-- který na nenastavenou GUC hodí SQLSTATE 22P02 (invalid_text_representation)
-- místo 0 řádků / deny-all. To je fail-open z pohledu observability (každé
-- takové volání je 500) a zamlžuje roziltí RLS vs. chybějící context.
--
-- Normalizujeme na robustní NULLIF pattern, který fail-closed zachytí.

-- -----------------------------------------------------------------------------
-- D.1 Generic loop — tenant_id scope policies (select/insert/update/delete)
-- -----------------------------------------------------------------------------
-- Poznámka: `audit_log` je úmyslně OUT OF THIS LOOP — musí zůstat append-only
-- podle `audit-log-append-only-2026-04-20.sql` (jen SELECT + INSERT, REVOKE
-- UPDATE/DELETE). Je obsloužen zvlášť v D.1b níže.
-- `billing_audit_log` vynecháváme, protože používá non-GUC pattern
-- (`tenant_id IN (SELECT memberships ...)` vs. auth.uid()), který není
-- potřeba normalizovat.
-- Join-scoped tables (document_extraction_fields, message_attachments,
-- household_members, atd.) jsou normalizovány v D.4/D.6 pasážích níže
-- (přes parent table pattern).
DO $$
DECLARE
  tbl text;
  tables_to_normalize text[] := ARRAY[
    -- rls-m3-m4 core
    'contacts',
    'households',
    'documents', 'document_extractions',
    'contract_upload_reviews', 'contract_review_corrections',
    'contact_coverage',
    'tasks', 'opportunities',
    'financial_analyses', 'financial_shared_facts',
    'fa_plan_items', 'fa_sync_log',
    'consents', 'processing_purposes', 'aml_checklists',
    'exports',
    'activity_log',
    'communication_drafts',
    'reminders', 'meeting_notes',
    'portal_notifications',
    'tenant_settings',
    -- contracts fix + batch 3
    'contracts',
    -- messages (participant scope je separátně ošetřena níže)
    'messages',
    -- advisor-proposals (kromě client scope)
    'advisor_proposals',
    -- client_requests / client_request_files (tenant-id-schema-fixes)
    'client_requests', 'client_request_files'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_to_normalize LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
      RAISE NOTICE 'rls-m8 normalize skip %: table missing.', tbl;
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=tbl AND column_name='tenant_id') THEN
      RAISE NOTICE 'rls-m8 normalize skip %: no tenant_id column.', tbl;
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_tenant_select', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_tenant_insert', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_tenant_update', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_tenant_delete', tbl);
    -- Legacy FOR ALL naming (rls-unify-guc / supabase-performance-advisor používaly `_tenant_isolation`)
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_tenant_isolation', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_tenant_all', tbl);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated, aidvisora_app ' ||
      'USING (NULLIF(current_setting(''app.tenant_id'', true), '''') IS NOT NULL ' ||
      'AND tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      tbl || '_tenant_select', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated, aidvisora_app ' ||
      'WITH CHECK (NULLIF(current_setting(''app.tenant_id'', true), '''') IS NOT NULL ' ||
      'AND tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      tbl || '_tenant_insert', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated, aidvisora_app ' ||
      'USING (NULLIF(current_setting(''app.tenant_id'', true), '''') IS NOT NULL ' ||
      'AND tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) ' ||
      'WITH CHECK (NULLIF(current_setting(''app.tenant_id'', true), '''') IS NOT NULL ' ||
      'AND tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      tbl || '_tenant_update', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated, aidvisora_app ' ||
      'USING (NULLIF(current_setting(''app.tenant_id'', true), '''') IS NOT NULL ' ||
      'AND tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      tbl || '_tenant_delete', tbl);

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- D.1b audit_log — append-only normalizace (JEN SELECT + INSERT, ne UPDATE/DELETE)
-- -----------------------------------------------------------------------------
-- Chráníme append-only hardening z audit-log-append-only-2026-04-20.sql:
--   * tenant_update / tenant_delete policy se NESMÍ znovu vytvořit
--   * REVOKE UPDATE, DELETE zůstává (idempotentně obnoveno)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='audit_log') THEN
    RAISE NOTICE 'rls-m8: audit_log neexistuje — přeskakuji.';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS audit_log_tenant_select ON public.audit_log';
  EXECUTE 'DROP POLICY IF EXISTS audit_log_tenant_insert ON public.audit_log';
  -- tenant_update / tenant_delete NIKDY neobnovovat (append-only)
  EXECUTE 'DROP POLICY IF EXISTS audit_log_tenant_update ON public.audit_log';
  EXECUTE 'DROP POLICY IF EXISTS audit_log_tenant_delete ON public.audit_log';

  EXECUTE $p$
    CREATE POLICY audit_log_tenant_select ON public.audit_log
      FOR SELECT TO authenticated, aidvisora_app
      USING (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY audit_log_tenant_insert ON public.audit_log
      FOR INSERT TO authenticated, aidvisora_app
      WITH CHECK (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
  $p$;

  EXECUTE 'ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY';

  -- Obnovení append-only grant revoke (idempotent, viz audit-log-append-only-2026-04-20.sql)
  BEGIN EXECUTE 'REVOKE UPDATE, DELETE ON public.audit_log FROM PUBLIC';       EXCEPTION WHEN undefined_object OR undefined_table THEN NULL; END;
  BEGIN EXECUTE 'REVOKE UPDATE, DELETE ON public.audit_log FROM authenticated'; EXCEPTION WHEN undefined_object OR undefined_table THEN NULL; END;
  BEGIN EXECUTE 'REVOKE UPDATE, DELETE ON public.audit_log FROM anon';          EXCEPTION WHEN undefined_object OR undefined_table THEN NULL; END;
  BEGIN EXECUTE 'REVOKE UPDATE, DELETE ON public.audit_log FROM aidvisora_app'; EXCEPTION WHEN undefined_object OR undefined_table THEN NULL; END;
END $$;

-- -----------------------------------------------------------------------------
-- D.2 advisor_notifications — přidat `aidvisora_app` roli (Batch 3 core loop ji zahrnul,
--     ale migration advisor-notifications-realtime-rls.sql má starou policy jen pro
--     `authenticated` + `auth.uid()` match). Normalizujeme na tenant-scoped select.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='advisor_notifications') THEN
    RAISE NOTICE 'advisor_notifications missing, skip.';
    RETURN;
  END IF;

  -- Legacy single-user policy (Supabase Realtime use case, auth.uid-based)
  -- NECHÁVÁME, je potřeba pro realtime JWT cesty — ale přidáváme i tenant-scoped
  -- variantu pro Drizzle runtime pod `aidvisora_app`.
  EXECUTE 'DROP POLICY IF EXISTS advisor_notifications_tenant_select ON public.advisor_notifications';
  EXECUTE 'DROP POLICY IF EXISTS advisor_notifications_tenant_insert ON public.advisor_notifications';
  EXECUTE 'DROP POLICY IF EXISTS advisor_notifications_tenant_update ON public.advisor_notifications';
  EXECUTE 'DROP POLICY IF EXISTS advisor_notifications_tenant_delete ON public.advisor_notifications';

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='advisor_notifications' AND column_name='tenant_id') THEN
    EXECUTE $p$
      CREATE POLICY advisor_notifications_tenant_select ON public.advisor_notifications
        FOR SELECT TO authenticated, aidvisora_app
        USING (
          NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
          AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
    $p$;
    EXECUTE $p$
      CREATE POLICY advisor_notifications_tenant_insert ON public.advisor_notifications
        FOR INSERT TO authenticated, aidvisora_app
        WITH CHECK (
          NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
          AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
    $p$;
    EXECUTE $p$
      CREATE POLICY advisor_notifications_tenant_update ON public.advisor_notifications
        FOR UPDATE TO authenticated, aidvisora_app
        USING (
          NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
          AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
        WITH CHECK (
          NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
          AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
    $p$;
    EXECUTE $p$
      CREATE POLICY advisor_notifications_tenant_delete ON public.advisor_notifications
        FOR DELETE TO authenticated, aidvisora_app
        USING (
          NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
          AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
    $p$;
  END IF;

  EXECUTE 'ALTER TABLE public.advisor_notifications ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.advisor_notifications FORCE ROW LEVEL SECURITY';
END $$;

-- -----------------------------------------------------------------------------
-- D.3 messages — recreate participant select s NULLIF pattern (tenant select už normalizován výše)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  has_contact_auth_user_id boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='messages') THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = 'auth_user_id'
  ) INTO has_contact_auth_user_id;

  EXECUTE 'DROP POLICY IF EXISTS messages_participant_select ON public.messages';
  EXECUTE 'DROP POLICY IF EXISTS messages_participant_insert ON public.messages';

  IF has_contact_auth_user_id THEN
    EXECUTE $p$
      CREATE POLICY messages_participant_select ON public.messages
        FOR SELECT TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.contacts c
            WHERE c.id = messages.contact_id
              AND c.auth_user_id = (SELECT auth.uid())
          )
        )
    $p$;
    EXECUTE $p$
      CREATE POLICY messages_participant_insert ON public.messages
        FOR INSERT TO authenticated
        WITH CHECK (
          sender_type = 'client'
          AND EXISTS (
            SELECT 1 FROM public.contacts c
            WHERE c.id = messages.contact_id
              AND c.auth_user_id = (SELECT auth.uid())
              AND messages.tenant_id = c.tenant_id
          )
        )
    $p$;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- D.4 message_attachments — join přes messages.tenant_id, NULLIF-normalized
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='message_attachments') THEN
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS message_attachments_via_message_select ON public.message_attachments';
  EXECUTE 'DROP POLICY IF EXISTS message_attachments_via_message_insert ON public.message_attachments';
  EXECUTE 'DROP POLICY IF EXISTS message_attachments_via_message_delete ON public.message_attachments';

  EXECUTE $p$
    CREATE POLICY message_attachments_via_message_select ON public.message_attachments
      FOR SELECT TO authenticated, aidvisora_app
      USING (
        EXISTS (
          SELECT 1 FROM public.messages m
          WHERE m.id = message_attachments.message_id
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND m.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY message_attachments_via_message_insert ON public.message_attachments
      FOR INSERT TO authenticated, aidvisora_app
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.messages m
          WHERE m.id = message_attachments.message_id
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND m.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY message_attachments_via_message_delete ON public.message_attachments
      FOR DELETE TO authenticated, aidvisora_app
      USING (
        EXISTS (
          SELECT 1 FROM public.messages m
          WHERE m.id = message_attachments.message_id
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND m.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
  $p$;
END $$;

-- -----------------------------------------------------------------------------
-- D.5 assistant_conversations / assistant_messages — drop legacy FOR ALL policies
--     a replace NULLIF-normalized per-verb policies s aidvisora_app rolí.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='assistant_conversations') THEN
    EXECUTE 'DROP POLICY IF EXISTS assistant_conversations_tenant_isolation ON public.assistant_conversations';
    EXECUTE 'DROP POLICY IF EXISTS assistant_conversations_tenant_select    ON public.assistant_conversations';
    EXECUTE 'DROP POLICY IF EXISTS assistant_conversations_tenant_insert    ON public.assistant_conversations';
    EXECUTE 'DROP POLICY IF EXISTS assistant_conversations_tenant_update    ON public.assistant_conversations';
    EXECUTE 'DROP POLICY IF EXISTS assistant_conversations_tenant_delete    ON public.assistant_conversations';

    EXECUTE $p$
      CREATE POLICY assistant_conversations_tenant_select ON public.assistant_conversations
        FOR SELECT TO authenticated, aidvisora_app
        USING (
          NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
          AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
    $p$;
    EXECUTE $p$
      CREATE POLICY assistant_conversations_tenant_insert ON public.assistant_conversations
        FOR INSERT TO authenticated, aidvisora_app
        WITH CHECK (
          NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
          AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
    $p$;
    EXECUTE $p$
      CREATE POLICY assistant_conversations_tenant_update ON public.assistant_conversations
        FOR UPDATE TO authenticated, aidvisora_app
        USING (
          NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
          AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
        WITH CHECK (
          NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
          AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
    $p$;
    EXECUTE $p$
      CREATE POLICY assistant_conversations_tenant_delete ON public.assistant_conversations
        FOR DELETE TO authenticated, aidvisora_app
        USING (
          NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
          AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
    $p$;

    EXECUTE 'ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.assistant_conversations FORCE ROW LEVEL SECURITY';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='assistant_messages') THEN
    EXECUTE 'DROP POLICY IF EXISTS assistant_messages_tenant_isolation ON public.assistant_messages';
    EXECUTE 'DROP POLICY IF EXISTS assistant_messages_via_conv_select  ON public.assistant_messages';
    EXECUTE 'DROP POLICY IF EXISTS assistant_messages_via_conv_insert  ON public.assistant_messages';
    EXECUTE 'DROP POLICY IF EXISTS assistant_messages_via_conv_update  ON public.assistant_messages';
    EXECUTE 'DROP POLICY IF EXISTS assistant_messages_via_conv_delete  ON public.assistant_messages';

    EXECUTE $p$
      CREATE POLICY assistant_messages_via_conv_select ON public.assistant_messages
        FOR SELECT TO authenticated, aidvisora_app
        USING (
          EXISTS (
            SELECT 1 FROM public.assistant_conversations ac
            WHERE ac.id = public.assistant_messages.conversation_id
              AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
              AND ac.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
          )
        )
    $p$;
    EXECUTE $p$
      CREATE POLICY assistant_messages_via_conv_insert ON public.assistant_messages
        FOR INSERT TO authenticated, aidvisora_app
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.assistant_conversations ac
            WHERE ac.id = public.assistant_messages.conversation_id
              AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
              AND ac.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
          )
        )
    $p$;
    EXECUTE $p$
      CREATE POLICY assistant_messages_via_conv_update ON public.assistant_messages
        FOR UPDATE TO authenticated, aidvisora_app
        USING (
          EXISTS (
            SELECT 1 FROM public.assistant_conversations ac
            WHERE ac.id = public.assistant_messages.conversation_id
              AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
              AND ac.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.assistant_conversations ac
            WHERE ac.id = public.assistant_messages.conversation_id
              AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
              AND ac.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
          )
        )
    $p$;
    EXECUTE $p$
      CREATE POLICY assistant_messages_via_conv_delete ON public.assistant_messages
        FOR DELETE TO authenticated, aidvisora_app
        USING (
          EXISTS (
            SELECT 1 FROM public.assistant_conversations ac
            WHERE ac.id = public.assistant_messages.conversation_id
              AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
              AND ac.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
          )
        )
    $p$;

    EXECUTE 'ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.assistant_messages FORCE ROW LEVEL SECURITY';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- D.6 document_extraction_fields — join-scoped normalizace přes document_extractions
-- -----------------------------------------------------------------------------
-- Batch 3 section 4.3 vytvořila non-NULLIF join policy. Normalizujeme na NULLIF
-- pattern pro robustní fail-closed.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='document_extraction_fields') THEN
    RAISE NOTICE 'document_extraction_fields neexistuje — přeskakuji.';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS document_extraction_fields_via_extraction_select ON public.document_extraction_fields';
  EXECUTE 'DROP POLICY IF EXISTS document_extraction_fields_via_extraction_insert ON public.document_extraction_fields';
  EXECUTE 'DROP POLICY IF EXISTS document_extraction_fields_via_extraction_update ON public.document_extraction_fields';
  EXECUTE 'DROP POLICY IF EXISTS document_extraction_fields_via_extraction_delete ON public.document_extraction_fields';

  EXECUTE $p$
    CREATE POLICY document_extraction_fields_via_extraction_select ON public.document_extraction_fields
      FOR SELECT TO authenticated, aidvisora_app
      USING (
        EXISTS (
          SELECT 1 FROM public.document_extractions de
          WHERE de.id = public.document_extraction_fields.document_extraction_id
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND de.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY document_extraction_fields_via_extraction_insert ON public.document_extraction_fields
      FOR INSERT TO authenticated, aidvisora_app
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.document_extractions de
          WHERE de.id = public.document_extraction_fields.document_extraction_id
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND de.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY document_extraction_fields_via_extraction_update ON public.document_extraction_fields
      FOR UPDATE TO authenticated, aidvisora_app
      USING (
        EXISTS (
          SELECT 1 FROM public.document_extractions de
          WHERE de.id = public.document_extraction_fields.document_extraction_id
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND de.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.document_extractions de
          WHERE de.id = public.document_extraction_fields.document_extraction_id
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND de.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY document_extraction_fields_via_extraction_delete ON public.document_extraction_fields
      FOR DELETE TO authenticated, aidvisora_app
      USING (
        EXISTS (
          SELECT 1 FROM public.document_extractions de
          WHERE de.id = public.document_extraction_fields.document_extraction_id
            AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND de.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      )
  $p$;
END $$;

-- =============================================================================
-- E) SANITY VERIFIKACE
-- =============================================================================
DO $$
DECLARE
  v_fn_count integer;
  v_missing  text[];
  v_table    text;
  v_cnt      integer;
  v_required text[] := ARRAY[
    'provision_workspace_v1',
    'resolve_public_booking_v1',
    'lookup_invite_metadata_v1'
  ];
  v_fn text;
  v_gap_tables text[] := ARRAY[
    'user_terms_acceptance',
    'user_devices',
    'unsubscribe_tokens',
    'opportunity_stages',
    'partners',
    'products',
    'fund_add_requests',
    'dead_letter_items',
    'ai_generations',
    'ai_feedback',
    'analysis_import_jobs',
    'analysis_versions'
  ];
BEGIN
  -- E.1 Funkce existují + GRANT EXECUTE na aidvisora_app
  FOREACH v_fn IN ARRAY v_required LOOP
    SELECT count(*) INTO v_fn_count
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = v_fn
       AND p.prosecdef = true;
    IF v_fn_count = 0 THEN
      RAISE EXCEPTION 'rls-m8: SECURITY DEFINER funkce public.% chybí.', v_fn;
    END IF;

    SELECT count(*) INTO v_fn_count
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = v_fn
       AND has_function_privilege('aidvisora_app', p.oid, 'EXECUTE');
    IF v_fn_count = 0 THEN
      RAISE EXCEPTION 'rls-m8: aidvisora_app nemá EXECUTE na public.%().', v_fn;
    END IF;
  END LOOP;

  -- E.2 Každá gap tabulka musí mít minimálně 1 policy
  v_missing := ARRAY[]::text[];
  FOREACH v_table IN ARRAY v_gap_tables LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=v_table) THEN
      CONTINUE;
    END IF;
    SELECT count(*) INTO v_cnt
      FROM pg_policies
     WHERE schemaname='public' AND tablename = v_table;
    IF v_cnt = 0 THEN
      v_missing := array_append(v_missing, v_table);
    END IF;
  END LOOP;
  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'rls-m8: gap tabulky BEZ policy po migraci: %', array_to_string(v_missing, ', ');
  END IF;

  -- E.3 Bootstrap invitations policies musí mít obě roli (authenticated + aidvisora_app)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='client_invitations') THEN
    SELECT count(*) INTO v_cnt
      FROM pg_policies
     WHERE schemaname='public'
       AND tablename='client_invitations'
       AND policyname='client_invitations_self_bootstrap_select'
       AND 'aidvisora_app' = ANY(roles);
    IF v_cnt = 0 THEN
      RAISE EXCEPTION 'rls-m8: client_invitations_self_bootstrap_select nemá aidvisora_app v roles.';
    END IF;
  END IF;

  -- E.4 Každá policy na core tabulkách, která používá `current_setting('app.tenant_id', ...)`,
  --     musí zároveň obsahovat `NULLIF` guard. Jakákoli policy bez NULLIF je fail-open hazard
  --     (SQLSTATE 22P02 při chybějící GUC místo 0 řádků).
  DECLARE
    v_offending text;
  BEGIN
    SELECT string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename, policyname)
      INTO v_offending
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN (
         'contacts','households','documents','document_extractions',
         'document_extraction_fields','contract_upload_reviews',
         'contract_review_corrections','contact_coverage','tasks','opportunities',
         'financial_analyses','financial_shared_facts','fa_plan_items','fa_sync_log',
         'consents','processing_purposes','aml_checklists','exports',
         'audit_log','activity_log','communication_drafts','reminders',
         'meeting_notes','portal_notifications','tenant_settings','contracts',
         'messages','message_attachments','advisor_proposals','advisor_notifications',
         'assistant_conversations','assistant_messages',
         'client_requests','client_request_files',
         'user_terms_acceptance','user_devices','unsubscribe_tokens',
         'opportunity_stages','partners','products','fund_add_requests',
         'dead_letter_items','ai_generations','ai_feedback',
         'analysis_import_jobs','analysis_versions'
       )
       AND (
         (qual IS NOT NULL AND qual LIKE '%current_setting%app.tenant_id%' AND qual NOT LIKE '%NULLIF%')
         OR (with_check IS NOT NULL AND with_check LIKE '%current_setting%app.tenant_id%' AND with_check NOT LIKE '%NULLIF%')
       );
    IF v_offending IS NOT NULL THEN
      RAISE EXCEPTION 'rls-m8: non-NULLIF current_setting policies zůstávají: %', v_offending;
    END IF;
  END;

  -- E.5 FORCE RLS musí být aktivní na všech gap tabulkách
  FOREACH v_table IN ARRAY v_gap_tables LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=v_table) THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname='public'
        AND c.relname=v_table
        AND c.relforcerowsecurity = true
    ) THEN
      RAISE EXCEPTION 'rls-m8: FORCE RLS není aktivní na public.%.', v_table;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- POST-DEPLOY verify (ruční kontrola, nepouští se automaticky):
-- =============================================================================
-- 1) Test provision_workspace_v1 pod aidvisora_app:
--      SET LOCAL role aidvisora_app;
--      SELECT public.provision_workspace_v1(gen_random_uuid(), 'test@example.com', 'test-ws', 'pro', 14);
--      -- musí vrátit uuid
--
-- 2) Test resolve_public_booking_v1:
--      SELECT * FROM public.resolve_public_booking_v1('neplatny-token');
--      -- musí vrátit 0 rows
--
-- 3) Test lookup_invite_metadata_v1:
--      SELECT * FROM public.lookup_invite_metadata_v1('neplatny', 'client');
--      -- musí vrátit 0 rows
--
-- 4) NULLIF GUC guard — bez nastavené GUC musí policies vrátit 0 rows (fail-closed):
--      RESET role;
--      SET ROLE aidvisora_app;
--      SELECT count(*) FROM public.contacts;  -- očekáváno: 0
--
-- 5) Dep check — ensure-workspace.ts + public-booking/data.ts + api/invite/metadata
--    nesmí po deploy hodit "function does not exist".

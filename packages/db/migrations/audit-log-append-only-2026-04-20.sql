-- 2026-04-20 · WS-2/WS-3 (Batch 4 Slice 1): audit_log append-only hardening
--
-- Kontext:
--   rls-m3-m4-messages-and-core-tables-2026-04-19.sql nastavil na `audit_log`
--   čtyři tenant-scoped policies (SELECT/INSERT/UPDATE/DELETE). Pro compliance
--   audit (GDPR čl. 32, enterprise DD) ale potřebujeme, aby se audit řádky
--   **nedaly měnit ani mazat** ani v rámci vlastního tenantu. Vzor: viz
--   billing-audit-and-dunning-2026-04-20.sql (`billing_audit_log`).
--
-- Co dělá:
--   1) Drop `audit_log_tenant_update` a `audit_log_tenant_delete` policies.
--   2) REVOKE UPDATE, DELETE z `PUBLIC`, `authenticated`, `anon` i `aidvisora_app`.
--      Service-role (Supabase `service_role`) tím není dotčený — pro GDPR
--      "right to erasure" / retention job zůstává cesta přes server kód.
--   3) ALTER COLUMN `created_at` SET DEFAULT now() (pro jistotu idempotence).
--   4) COMMENT ON TABLE s hint, že tabulka je append-only.
--
-- Idempotence: celý soubor lze spouštět opakovaně bez chyby (všechno IF EXISTS
--              / EXCEPTION fallback na chybějící role v prostředích bez Supabase).

-- ─── 1) Drop update/delete policies (append-only) ────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_log' AND policyname = 'audit_log_tenant_update'
  ) THEN
    EXECUTE 'DROP POLICY audit_log_tenant_update ON public.audit_log';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_log' AND policyname = 'audit_log_tenant_delete'
  ) THEN
    EXECUTE 'DROP POLICY audit_log_tenant_delete ON public.audit_log';
  END IF;
END$$;

-- ─── 2) REVOKE UPDATE/DELETE na GRANT úrovni ─────────────────────────────────
-- I kdyby někdo v budoucnu omylem přidal UPDATE/DELETE policy zpět, bez
-- GRANT privilege to stejně neprojde.
DO $$
BEGIN
  EXECUTE 'REVOKE UPDATE, DELETE ON public.audit_log FROM PUBLIC';
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL;
END$$;

DO $$
BEGIN
  EXECUTE 'REVOKE UPDATE, DELETE ON public.audit_log FROM authenticated';
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL;
END$$;

DO $$
BEGIN
  EXECUTE 'REVOKE UPDATE, DELETE ON public.audit_log FROM anon';
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL;
END$$;

DO $$
BEGIN
  EXECUTE 'REVOKE UPDATE, DELETE ON public.audit_log FROM aidvisora_app';
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL;
END$$;

-- ─── 3) Default for created_at (safety) ─────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'created_at'
  ) THEN
    EXECUTE 'ALTER TABLE public.audit_log ALTER COLUMN created_at SET DEFAULT now()';
  END IF;
END$$;

-- ─── 4) COMMENT ─────────────────────────────────────────────────────────────
COMMENT ON TABLE public.audit_log IS
  'Append-only audit log (WS-2/WS-3). Zápisy povoleny jen přes tenant-scoped INSERT policy; UPDATE/DELETE jsou zakázané jak policy dropem, tak GRANT revoke. Retenci a případnou likvidaci (GDPR čl. 17) řeší backend (service_role).';

-- ─── Kontrola ───────────────────────────────────────────────────────────────
-- SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'audit_log'
--   ORDER BY policyname;
-- Očekávané: audit_log_tenant_select (SELECT), audit_log_tenant_insert (INSERT).
-- NEočekávané: *_tenant_update, *_tenant_delete.
--
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND table_name = 'audit_log'
--   ORDER BY grantee, privilege_type;
-- Očekávané: žádný UPDATE ani DELETE pro authenticated / anon / aidvisora_app / PUBLIC.

-- Supabase Performance Advisor (2026-04-01)
-- - Auth RLS initplan: wrap auth.* / current_* in (SELECT …) so Postgres evaluates once per statement.
-- - mindmap_maps: remove duplicate unique index on (tenant_id, entity_type, entity_id).
-- - Fewer permissive policies per table/action (merge OR conditions) for clients, contracts, client_requests.
--
-- Idempotent: DROP POLICY IF EXISTS před novými názvy (clients_*, contracts_*, client_requests_*),
-- aby šlo skript spustit znovu po částečném běhu (ERROR 42710 already exists).
-- Apply via Supabase SQL Editor or: psql "$DATABASE_URL" -f this file.

-- ---------------------------------------------------------------------------
-- 1) Duplicate unique index on mindmap_maps (Drizzle name vs constraint index)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'mindmap_maps' AND indexname = 'mindmap_maps_tenant_entity'
  ) AND EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'mindmap_maps' AND indexname = 'mindmap_maps_tenant_id_entity_type_entity_id_key'
  ) THEN
    DROP INDEX IF EXISTS public.mindmap_maps_tenant_entity;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) public.advisors — initplan-safe auth.uid()
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS advisors_own_all ON public.advisors;
CREATE POLICY advisors_own_all ON public.advisors
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- 3) public.clients — single policy per command (authenticated)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS clients_advisor_all ON public.clients;
DROP POLICY IF EXISTS clients_client_self ON public.clients;
DROP POLICY IF EXISTS clients_client_link ON public.clients;
-- Re-run safe: drop policies introduced by this migration (42710 if missing)
DROP POLICY IF EXISTS clients_select ON public.clients;
DROP POLICY IF EXISTS clients_insert ON public.clients;
DROP POLICY IF EXISTS clients_update ON public.clients;
DROP POLICY IF EXISTS clients_delete ON public.clients;

CREATE POLICY clients_select ON public.clients
  FOR SELECT TO authenticated
  USING (
    (advisor_id = (SELECT current_advisor_id()))
    OR (client_user_id = (SELECT auth.uid()))
  );

CREATE POLICY clients_insert ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (advisor_id = (SELECT current_advisor_id()));

CREATE POLICY clients_update ON public.clients
  FOR UPDATE TO authenticated
  USING (
    (advisor_id = (SELECT current_advisor_id()))
    OR (
      (lower(TRIM(BOTH FROM email)) = lower(TRIM(BOTH FROM ((SELECT auth.jwt()) ->> 'email'::text))))
      AND (client_user_id IS NULL)
    )
  )
  WITH CHECK (
    (advisor_id = (SELECT current_advisor_id()))
    OR (client_user_id = (SELECT auth.uid()))
  );

CREATE POLICY clients_delete ON public.clients
  FOR DELETE TO authenticated
  USING (advisor_id = (SELECT current_advisor_id()));

-- ---------------------------------------------------------------------------
-- 4) public.contracts — merged SELECT; split advisor ALL into I/U/D
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS contracts_advisor_all ON public.contracts;
DROP POLICY IF EXISTS contracts_client_select ON public.contracts;
DROP POLICY IF EXISTS contracts_select ON public.contracts;
DROP POLICY IF EXISTS contracts_insert ON public.contracts;
DROP POLICY IF EXISTS contracts_update ON public.contracts;
DROP POLICY IF EXISTS contracts_delete ON public.contracts;

CREATE POLICY contracts_select ON public.contracts
  FOR SELECT TO authenticated
  USING (
    (
      (SELECT c.advisor_id FROM public.clients c WHERE c.id = contracts.client_id)
      = (SELECT current_advisor_id())
    )
    OR (client_id = (SELECT current_client_id()))
  );

CREATE POLICY contracts_insert ON public.contracts
  FOR INSERT TO authenticated
  WITH CHECK (advisor_id = (SELECT current_advisor_id()));

CREATE POLICY contracts_update ON public.contracts
  FOR UPDATE TO authenticated
  USING (
    (SELECT c.advisor_id FROM public.clients c WHERE c.id = contracts.client_id)
    = (SELECT current_advisor_id())
  )
  WITH CHECK (advisor_id = (SELECT current_advisor_id()));

CREATE POLICY contracts_delete ON public.contracts
  FOR DELETE TO authenticated
  USING (
    (SELECT c.advisor_id FROM public.clients c WHERE c.id = contracts.client_id)
    = (SELECT current_advisor_id())
  );

-- ---------------------------------------------------------------------------
-- 5) public.client_requests — merged SELECT/INSERT; advisor IUD without overlap
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS client_requests_advisor ON public.client_requests;
DROP POLICY IF EXISTS client_requests_client ON public.client_requests;
DROP POLICY IF EXISTS client_requests_client_insert ON public.client_requests;
DROP POLICY IF EXISTS client_requests_select ON public.client_requests;
DROP POLICY IF EXISTS client_requests_insert ON public.client_requests;
DROP POLICY IF EXISTS client_requests_update ON public.client_requests;
DROP POLICY IF EXISTS client_requests_delete ON public.client_requests;

CREATE POLICY client_requests_select ON public.client_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clients cl
      WHERE cl.id = client_requests.client_id
        AND cl.advisor_id = (SELECT current_advisor_id())
    )
    OR (client_id = (SELECT current_client_id()))
  );

CREATE POLICY client_requests_insert ON public.client_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients cl
      WHERE cl.id = client_id
        AND cl.advisor_id = (SELECT current_advisor_id())
    )
    OR (client_id = (SELECT current_client_id()))
  );

CREATE POLICY client_requests_update ON public.client_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clients cl
      WHERE cl.id = client_requests.client_id
        AND cl.advisor_id = (SELECT current_advisor_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients cl
      WHERE cl.id = client_id
        AND cl.advisor_id = (SELECT current_advisor_id())
    )
  );

CREATE POLICY client_requests_delete ON public.client_requests
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clients cl
      WHERE cl.id = client_requests.client_id
        AND cl.advisor_id = (SELECT current_advisor_id())
    )
  );

-- ---------------------------------------------------------------------------
-- 6) public.client_request_files — initplan-safe helpers in one policy
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS client_request_files_via_request ON public.client_request_files;

CREATE POLICY client_request_files_via_request ON public.client_request_files
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.client_requests r
      JOIN public.clients cl ON cl.id = r.client_id
      WHERE r.id = client_request_files.request_id
        AND (
          cl.advisor_id = (SELECT current_advisor_id())
          OR cl.client_user_id = (SELECT auth.uid())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.client_requests r
      JOIN public.clients cl ON cl.id = r.client_id
      WHERE r.id = client_request_files.request_id
        AND cl.client_user_id = (SELECT auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 7) Google integrations — initplan-safe auth.uid()
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS user_google_calendar_integrations_select_own ON public.user_google_calendar_integrations;
DROP POLICY IF EXISTS user_google_calendar_integrations_insert_own ON public.user_google_calendar_integrations;
DROP POLICY IF EXISTS user_google_calendar_integrations_update_own ON public.user_google_calendar_integrations;
DROP POLICY IF EXISTS user_google_calendar_integrations_delete_own ON public.user_google_calendar_integrations;

CREATE POLICY user_google_calendar_integrations_select_own ON public.user_google_calendar_integrations
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid())::text = user_id);

CREATE POLICY user_google_calendar_integrations_insert_own ON public.user_google_calendar_integrations
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid())::text = user_id);

CREATE POLICY user_google_calendar_integrations_update_own ON public.user_google_calendar_integrations
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid())::text = user_id)
  WITH CHECK ((SELECT auth.uid())::text = user_id);

CREATE POLICY user_google_calendar_integrations_delete_own ON public.user_google_calendar_integrations
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid())::text = user_id);

DROP POLICY IF EXISTS user_google_drive_integrations_select_own ON public.user_google_drive_integrations;
DROP POLICY IF EXISTS user_google_drive_integrations_insert_own ON public.user_google_drive_integrations;
DROP POLICY IF EXISTS user_google_drive_integrations_update_own ON public.user_google_drive_integrations;
DROP POLICY IF EXISTS user_google_drive_integrations_delete_own ON public.user_google_drive_integrations;

CREATE POLICY user_google_drive_integrations_select_own ON public.user_google_drive_integrations
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid())::text = user_id);

CREATE POLICY user_google_drive_integrations_insert_own ON public.user_google_drive_integrations
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid())::text = user_id);

CREATE POLICY user_google_drive_integrations_update_own ON public.user_google_drive_integrations
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid())::text = user_id)
  WITH CHECK ((SELECT auth.uid())::text = user_id);

CREATE POLICY user_google_drive_integrations_delete_own ON public.user_google_drive_integrations
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid())::text = user_id);

DROP POLICY IF EXISTS user_google_gmail_integrations_select_own ON public.user_google_gmail_integrations;
DROP POLICY IF EXISTS user_google_gmail_integrations_insert_own ON public.user_google_gmail_integrations;
DROP POLICY IF EXISTS user_google_gmail_integrations_update_own ON public.user_google_gmail_integrations;
DROP POLICY IF EXISTS user_google_gmail_integrations_delete_own ON public.user_google_gmail_integrations;

CREATE POLICY user_google_gmail_integrations_select_own ON public.user_google_gmail_integrations
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid())::text = user_id);

CREATE POLICY user_google_gmail_integrations_insert_own ON public.user_google_gmail_integrations
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid())::text = user_id);

CREATE POLICY user_google_gmail_integrations_update_own ON public.user_google_gmail_integrations
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid())::text = user_id)
  WITH CHECK ((SELECT auth.uid())::text = user_id);

CREATE POLICY user_google_gmail_integrations_delete_own ON public.user_google_gmail_integrations
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid())::text = user_id);

-- ---------------------------------------------------------------------------
-- 8) FA tables (if present) — initplan-safe current_setting
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'fa_plan_items') THEN
    EXECUTE 'ALTER TABLE public.fa_plan_items ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS fa_plan_items_tenant_isolation ON public.fa_plan_items';
    EXECUTE $p$
      CREATE POLICY fa_plan_items_tenant_isolation ON public.fa_plan_items
        USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true))::uuid)
    $p$;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'fa_sync_log') THEN
    EXECUTE 'ALTER TABLE public.fa_sync_log ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS fa_sync_log_tenant_isolation ON public.fa_sync_log';
    EXECUTE $p$
      CREATE POLICY fa_sync_log_tenant_isolation ON public.fa_sync_log
        USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true))::uuid)
    $p$;
  END IF;
END $$;

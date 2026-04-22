-- Team Overview F1 — Canonical team_members entity + manual periods + career log
-- Datum: 2026-04-22
--
-- Rozsah (viz docs/team-overview-masterplan.md sekce 4, finální plán cockpit):
--
--   A) team_members: kanonická identita \u010dlov\u011bka v t\u00fdmov\u00e9 struktu\u0159e,
--      nez\u00e1visl\u00e1 na auth u\u017eivateli. auth_user_id nullable + unique per tenant.
--      Hierarchie p\u0159es parent_member_id. Stav active | paused | offboarded | planned.
--      member_kind internal_user | external_manual.
--      Kari\u00e9rn\u00ed pole (program/track/position) \u2014 source of truth je zde;
--      memberships zachov\u00e1 shadow copy dokud F4 neobr\u00e1t\u00ed sm\u011br.
--
--   B) team_member_manual_periods: obdobn\u00ed snapshoty manu\u00e1ln\u00edch \u010d\u00edsel
--      (units, produkce, contracts, meetings, activities + pool_units JSONB
--      pro BJ/BJS/PB units/CC conversions). Confidence manual_confirmed | manual_estimated.
--
--   C) team_member_career_log: auditn\u00ed historie kari\u00e9rn\u00edch zm\u011bn
--      (auto | manual_confirmed | manual_override).
--
--   D) Backfill: pro ka\u017ed\u00fd memberships \u0159\u00e1dek vytvo\u0159\u00edme internal_user team_member
--      s auth_user_id = memberships.user_id a parent_member_id odvozen\u00fd z parent map.
--
--   E) Shadow-copy trigger: AFTER INSERT/UPDATE ON memberships synchronizuje
--      z\u00e1kladn\u00ed pole (role/parent/career) do team_members po dobu migrace.
--      Fix career write path po F4 otoc\u00ed sm\u011br.
--
--   F) RLS: tenant-scoped select/write. Write op\u0159en o team_members:write
--      (enforce v app vrstv\u011b; DB povol\u00ed celou tenant m\u0161v).
--
-- Bezpe\u010dnost: \u017e\u00e1dn\u00e1 destrukce memberships; v\u0161e IF NOT EXISTS.

BEGIN;

-- ========================================================================
-- A) team_members
-- ========================================================================

CREATE TABLE IF NOT EXISTS public.team_members (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  auth_user_id         text,
  display_name         text,
  email                text,
  phone                text,
  parent_member_id     uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  status               text NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','paused','offboarded','planned')),
  member_kind          text NOT NULL DEFAULT 'internal_user'
                       CHECK (member_kind IN ('internal_user','external_manual')),
  career_program       text,
  career_track         text,
  career_position_code text,
  joined_at            timestamptz NOT NULL DEFAULT now(),
  ended_at             timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           text,
  updated_by           text
);

CREATE UNIQUE INDEX IF NOT EXISTS team_members_tenant_auth_user_uniq
  ON public.team_members (tenant_id, auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS team_members_tenant_idx
  ON public.team_members (tenant_id);

CREATE INDEX IF NOT EXISTS team_members_parent_idx
  ON public.team_members (parent_member_id);

CREATE INDEX IF NOT EXISTS team_members_auth_user_idx
  ON public.team_members (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

COMMENT ON TABLE public.team_members IS
  'Team Overview F1: canonical identity for a person in the team structure. auth_user_id nullable — allows external/manual members without auth accounts.';

-- ========================================================================
-- B) team_member_manual_periods
-- ========================================================================

CREATE TABLE IF NOT EXISTS public.team_member_manual_periods (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  team_member_id     uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  period             text NOT NULL CHECK (period IN ('week','month','quarter')),
  year               integer NOT NULL,
  period_index       integer NOT NULL,
  units_count        integer,
  production_amount  numeric(18,2),
  contracts_count    integer,
  meetings_count     integer,
  activities_count   integer,
  pool_units         jsonb,
  confidence         text NOT NULL DEFAULT 'manual_confirmed'
                     CHECK (confidence IN ('manual_confirmed','manual_estimated')),
  source_note        text,
  entered_by         text,
  entered_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS team_member_manual_periods_uniq
  ON public.team_member_manual_periods (tenant_id, team_member_id, period, year, period_index);

CREATE INDEX IF NOT EXISTS team_member_manual_periods_tenant_idx
  ON public.team_member_manual_periods (tenant_id);

CREATE INDEX IF NOT EXISTS team_member_manual_periods_member_idx
  ON public.team_member_manual_periods (team_member_id);

COMMENT ON TABLE public.team_member_manual_periods IS
  'Team Overview F1: manual period snapshots (units, production, contracts, meetings, activities + pool-specific BJ/BJS/PB/CC). Used for external members and manual data entry.';

-- ========================================================================
-- C) team_member_career_log
-- ========================================================================

CREATE TABLE IF NOT EXISTS public.team_member_career_log (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  team_member_id       uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  career_program       text,
  career_track         text,
  career_position_code text,
  change_kind          text NOT NULL
                       CHECK (change_kind IN ('auto','manual_confirmed','manual_override')),
  effective_from       timestamptz NOT NULL DEFAULT now(),
  source_note          text,
  actor_user_id        text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS team_member_career_log_member_idx
  ON public.team_member_career_log (team_member_id, effective_from DESC);

CREATE INDEX IF NOT EXISTS team_member_career_log_tenant_idx
  ON public.team_member_career_log (tenant_id);

COMMENT ON TABLE public.team_member_career_log IS
  'Team Overview F1: audit log for career changes (auto sync vs manual confirmation vs manual override).';

-- ========================================================================
-- D) Backfill z existing memberships
-- ========================================================================

-- Fáze 1: vložit internal_user řádky pro každý membership, který ještě nemá
-- odpovídající team_member (idempotentní).
INSERT INTO public.team_members (
  tenant_id, auth_user_id, display_name, email,
  status, member_kind,
  career_program, career_track, career_position_code,
  joined_at
)
SELECT
  m.tenant_id,
  m.user_id,
  COALESCE(NULLIF(TRIM(up.full_name), ''), NULLIF(up.email, '')) AS display_name,
  up.email,
  'active',
  'internal_user',
  m.career_program,
  m.career_track,
  m.career_position_code,
  COALESCE(m.joined_at, now())
FROM public.memberships m
LEFT JOIN public.user_profiles up ON up.user_id = m.user_id
LEFT JOIN public.team_members tm
  ON tm.tenant_id = m.tenant_id AND tm.auth_user_id = m.user_id
WHERE tm.id IS NULL;

-- Fáze 2: doplnit parent_member_id z memberships.parent_id
UPDATE public.team_members tm
SET parent_member_id = parent_tm.id
FROM public.memberships m
JOIN public.team_members parent_tm
  ON parent_tm.tenant_id = m.tenant_id
 AND parent_tm.auth_user_id = m.parent_id
WHERE tm.tenant_id = m.tenant_id
  AND tm.auth_user_id = m.user_id
  AND m.parent_id IS NOT NULL
  AND (tm.parent_member_id IS NULL OR tm.parent_member_id <> parent_tm.id);

-- ========================================================================
-- E) Shadow-copy trigger: memberships → team_members
-- ========================================================================
-- Při změně memberships (INSERT/UPDATE) synchronizujeme do team_members.
-- DELETE nesynchronizujeme — offboarding necháme na F4 explicit flow.
-- Důvod: zachovat backward compat pro F2 read adapter; po F4 (canonical write)
-- tento trigger otočíme / odstraníme.

CREATE OR REPLACE FUNCTION public.sync_team_member_from_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent_tm_id uuid;
  v_email text;
  v_full_name text;
BEGIN
  SELECT up.email, NULLIF(TRIM(up.full_name), '')
    INTO v_email, v_full_name
  FROM public.user_profiles up
  WHERE up.user_id = NEW.user_id
  LIMIT 1;

  IF NEW.parent_id IS NOT NULL THEN
    SELECT tm.id INTO v_parent_tm_id
    FROM public.team_members tm
    WHERE tm.tenant_id = NEW.tenant_id
      AND tm.auth_user_id = NEW.parent_id
    LIMIT 1;
  ELSE
    v_parent_tm_id := NULL;
  END IF;

  INSERT INTO public.team_members (
    tenant_id, auth_user_id, display_name, email,
    status, member_kind,
    career_program, career_track, career_position_code,
    parent_member_id, joined_at
  )
  VALUES (
    NEW.tenant_id, NEW.user_id,
    COALESCE(v_full_name, v_email),
    v_email,
    'active', 'internal_user',
    NEW.career_program, NEW.career_track, NEW.career_position_code,
    v_parent_tm_id, COALESCE(NEW.joined_at, now())
  )
  ON CONFLICT (tenant_id, auth_user_id) WHERE auth_user_id IS NOT NULL
  DO UPDATE SET
    career_program       = EXCLUDED.career_program,
    career_track         = EXCLUDED.career_track,
    career_position_code = EXCLUDED.career_position_code,
    parent_member_id     = EXCLUDED.parent_member_id,
    email                = COALESCE(EXCLUDED.email, public.team_members.email),
    display_name         = COALESCE(EXCLUDED.display_name, public.team_members.display_name),
    updated_at           = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_team_member_from_membership ON public.memberships;
CREATE TRIGGER trg_sync_team_member_from_membership
AFTER INSERT OR UPDATE OF parent_id, career_program, career_track, career_position_code
ON public.memberships
FOR EACH ROW EXECUTE FUNCTION public.sync_team_member_from_membership();

-- ========================================================================
-- F) RLS
-- ========================================================================

ALTER TABLE public.team_members              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_member_manual_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_member_career_log    ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'team_members'
      AND policyname = 'team_members_tenant_select'
  ) THEN
    CREATE POLICY team_members_tenant_select ON public.team_members
      FOR SELECT TO authenticated, aidvisora_app
      USING (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'team_members'
      AND policyname = 'team_members_tenant_insert'
  ) THEN
    CREATE POLICY team_members_tenant_insert ON public.team_members
      FOR INSERT TO authenticated, aidvisora_app
      WITH CHECK (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'team_members'
      AND policyname = 'team_members_tenant_update'
  ) THEN
    CREATE POLICY team_members_tenant_update ON public.team_members
      FOR UPDATE TO authenticated, aidvisora_app
      USING (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
      WITH CHECK (
        tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'team_members'
      AND policyname = 'team_members_tenant_delete'
  ) THEN
    CREATE POLICY team_members_tenant_delete ON public.team_members
      FOR DELETE TO authenticated, aidvisora_app
      USING (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      );
  END IF;

  -- manual periods
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='team_member_manual_periods'
      AND policyname='team_member_manual_periods_tenant_all'
  ) THEN
    CREATE POLICY team_member_manual_periods_tenant_all ON public.team_member_manual_periods
      FOR ALL TO authenticated, aidvisora_app
      USING (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
      WITH CHECK (
        tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      );
  END IF;

  -- career log
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='team_member_career_log'
      AND policyname='team_member_career_log_tenant_all'
  ) THEN
    CREATE POLICY team_member_career_log_tenant_all ON public.team_member_career_log
      FOR ALL TO authenticated, aidvisora_app
      USING (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
      WITH CHECK (
        tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      );
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members              TO aidvisora_app, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_member_manual_periods TO aidvisora_app, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_member_career_log    TO aidvisora_app, authenticated;

COMMIT;

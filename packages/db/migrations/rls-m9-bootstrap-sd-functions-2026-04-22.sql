-- WS-2 Batch M3-SQL — SECURITY DEFINER funkce pro pre-auth bootstrap flows
-- Datum: 2026-04-22
--
-- Rozsah (navazuje na M1-SQL / rls-m8):
--
--   A) public.accept_staff_invitation_v1(p_token, p_auth_user_id, p_email)
--      Staff invite acceptance — volá se z `finalizePendingStaffInvitation`
--      (apps/web/src/app/actions/team.ts) v /register/complete. Před cutoverem
--      to byl raw `db.*` flow (tenant ani user context neznáme, dokud token
--      neověříme). Funkce atomicky:
--        1. ověří token, expiraci, revoke, email match,
--        2. pokud už existuje membership do stejného tenantu → idempotentní no-op
--           (jen stampne accepted_at),
--        3. pokud user má membership v JINÉM tenantu → chyba (žádný multi-tenant),
--        4. jinak vloží novou membership a stampne accepted_at + auth_user_id.
--      Vrací strukturované `(ok boolean, error text)` — caller unwrapuje.
--
--   B) public.process_unsubscribe_by_token_v1(p_token)
--      One-click unsubscribe z public e-mail footeru. Volá se z
--      `unsubscribeByToken` (apps/web/src/app/actions/unsubscribe.ts) z
--      /client/unsubscribe?token=… Pre-auth (nikdo není přihlášený).
--      Funkce atomicky:
--        1. dohledá token + zkontroluje expiraci a used_at,
--        2. markne contact.notification_unsubscribed_at = now(),
--        3. markne token.used_at = now() (one-shot).
--      Vrací `(ok boolean, error text)`.
--
-- Obě funkce jsou SECURITY DEFINER (běží pod ownerem/postgres), takže bypass-ují
-- RLS v controlled rozsahu. GRANT EXECUTE pouze na `aidvisora_app` +
-- `authenticated` (+ `anon` pro unsubscribe, který je public token-based).
--
-- Idempotentní. Bezpečné re-run.
--
-- Tato migrace JE M3 dependency pro cutover na `aidvisora_app`. Bez ní:
--   - accept staff invite po cutoveru selže (staff_invitations čtení bez GUC)
--   - unsubscribe by token po cutoveru selže (unsubscribe_tokens čtení bez GUC)

BEGIN;

-- =============================================================================
-- A) public.accept_staff_invitation_v1
-- =============================================================================

CREATE OR REPLACE FUNCTION public.accept_staff_invitation_v1(
  p_token         text,
  p_auth_user_id  text,
  p_email         text
) RETURNS TABLE (
  ok               boolean,
  error_code       text,
  tenant_id        uuid,
  already_member   boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_token        text;
  v_email        text;
  v_now          timestamptz := now();
  v_inv_id       uuid;
  v_inv_tenant   uuid;
  v_inv_role     uuid;
  v_inv_email    text;
  v_inv_expires  timestamptz;
  v_inv_accepted timestamptz;
  v_inv_revoked  timestamptz;
  v_inv_invby    text;
  v_other_count  int;
  v_same_count   int;
BEGIN
  IF p_auth_user_id IS NULL OR length(trim(p_auth_user_id)) = 0 THEN
    RETURN QUERY SELECT false, 'not_authenticated'::text, NULL::uuid, false;
    RETURN;
  END IF;
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RETURN QUERY SELECT false, 'missing_email'::text, NULL::uuid, false;
    RETURN;
  END IF;

  v_token := lower(trim(coalesce(p_token, '')));
  v_email := lower(trim(p_email));

  IF length(v_token) <> 32 THEN
    RETURN QUERY SELECT false, 'invalid_token'::text, NULL::uuid, false;
    RETURN;
  END IF;

  -- Lookup invitation
  SELECT si.id, si.tenant_id, si.role_id, si.email, si.expires_at,
         si.accepted_at, si.revoked_at, si.invited_by_user_id
    INTO v_inv_id, v_inv_tenant, v_inv_role, v_inv_email,
         v_inv_expires, v_inv_accepted, v_inv_revoked, v_inv_invby
    FROM public.staff_invitations si
   WHERE si.token = v_token
   LIMIT 1;

  IF v_inv_id IS NULL THEN
    RETURN QUERY SELECT false, 'not_found'::text, NULL::uuid, false;
    RETURN;
  END IF;
  IF v_inv_revoked IS NOT NULL THEN
    RETURN QUERY SELECT false, 'revoked'::text, NULL::uuid, false;
    RETURN;
  END IF;
  IF v_inv_expires <= v_now THEN
    RETURN QUERY SELECT false, 'expired'::text, NULL::uuid, false;
    RETURN;
  END IF;
  IF lower(trim(v_inv_email)) <> v_email THEN
    RETURN QUERY SELECT false, 'email_mismatch'::text, NULL::uuid, false;
    RETURN;
  END IF;

  -- Spočítej memberships — máme rozlišit "už jsem v tomto tenantu" vs
  -- "jsem v jiném tenantu" (multi-tenant jediného auth účtu nepodporujeme).
  SELECT count(*)::int INTO v_same_count
    FROM public.memberships m
   WHERE m.user_id = p_auth_user_id
     AND m.tenant_id = v_inv_tenant;

  SELECT count(*)::int INTO v_other_count
    FROM public.memberships m
   WHERE m.user_id = p_auth_user_id
     AND m.tenant_id <> v_inv_tenant;

  IF v_same_count > 0 THEN
    -- idempotent — pokud invitation ještě nebyla stampnutá, stampni
    IF v_inv_accepted IS NULL THEN
      UPDATE public.staff_invitations
         SET accepted_at = v_now, auth_user_id = p_auth_user_id
       WHERE id = v_inv_id;
    END IF;
    RETURN QUERY SELECT true, NULL::text, v_inv_tenant, true;
    RETURN;
  END IF;

  IF v_other_count > 0 THEN
    RETURN QUERY SELECT false, 'already_in_other_workspace'::text, NULL::uuid, false;
    RETURN;
  END IF;

  -- Vlož novou membership + stampni invitation atomicky
  INSERT INTO public.memberships (tenant_id, user_id, role_id, invited_by)
  VALUES (v_inv_tenant, p_auth_user_id, v_inv_role, v_inv_invby);

  UPDATE public.staff_invitations
     SET accepted_at = v_now, auth_user_id = p_auth_user_id
   WHERE id = v_inv_id;

  RETURN QUERY SELECT true, NULL::text, v_inv_tenant, false;
  RETURN;
END;
$fn$;

COMMENT ON FUNCTION public.accept_staff_invitation_v1(text, text, text) IS
  'WS-2 M3 bootstrap: atomicky přijme staff invitation — ověří token/expiry/revoke/email match a vloží membership. SECURITY DEFINER; bezpečné volat PŘED nastavením app.tenant_id / app.user_id (user se teprve stává členem).';

REVOKE ALL ON FUNCTION public.accept_staff_invitation_v1(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_staff_invitation_v1(text, text, text)
  TO aidvisora_app, authenticated;

-- =============================================================================
-- B) public.process_unsubscribe_by_token_v1
-- =============================================================================

CREATE OR REPLACE FUNCTION public.process_unsubscribe_by_token_v1(p_token text)
RETURNS TABLE (
  ok           boolean,
  error_code   text,
  contact_id   uuid,
  tenant_id    uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_token       text;
  v_now         timestamptz := now();
  v_tok_id      uuid;
  v_tok_contact uuid;
  v_tok_used    timestamptz;
  v_tok_expires timestamptz;
  v_tenant      uuid;
BEGIN
  v_token := trim(coalesce(p_token, ''));
  IF length(v_token) = 0 THEN
    RETURN QUERY SELECT false, 'invalid_token'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  IF length(v_token) > 200 THEN
    RETURN QUERY SELECT false, 'invalid_token'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT ut.id, ut.contact_id, ut.used_at, ut.expires_at
    INTO v_tok_id, v_tok_contact, v_tok_used, v_tok_expires
    FROM public.unsubscribe_tokens ut
   WHERE ut.token = v_token
   LIMIT 1;

  IF v_tok_id IS NULL THEN
    RETURN QUERY SELECT false, 'not_found'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  IF v_tok_used IS NOT NULL THEN
    RETURN QUERY SELECT false, 'already_used'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  IF v_tok_expires <= v_now THEN
    RETURN QUERY SELECT false, 'expired'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- Dohledáme tenant_id pro návratovou hodnotu (caller si může nastavit GUC
  -- pro případný audit log, pokud chce).
  SELECT c.tenant_id INTO v_tenant
    FROM public.contacts c
   WHERE c.id = v_tok_contact
   LIMIT 1;

  UPDATE public.contacts
     SET notification_unsubscribed_at = v_now,
         updated_at = v_now
   WHERE id = v_tok_contact;

  UPDATE public.unsubscribe_tokens
     SET used_at = v_now
   WHERE id = v_tok_id;

  RETURN QUERY SELECT true, NULL::text, v_tok_contact, v_tenant;
  RETURN;
END;
$fn$;

COMMENT ON FUNCTION public.process_unsubscribe_by_token_v1(text) IS
  'WS-2 M3 pre-auth: one-click unsubscribe e-mailovým tokenem. Ověří token + expiraci + not-used, stampne contact.notification_unsubscribed_at + token.used_at. SECURITY DEFINER; volatelné z anon (footer e-mail link).';

REVOKE ALL ON FUNCTION public.process_unsubscribe_by_token_v1(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_unsubscribe_by_token_v1(text)
  TO aidvisora_app, authenticated, anon;

-- =============================================================================
-- C) Sanity checks
-- =============================================================================

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_has_grant int;
BEGIN
  -- 1) Obě funkce musí existovat
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'accept_staff_invitation_v1'
  ) THEN
    v_missing := array_append(v_missing, 'accept_staff_invitation_v1');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'process_unsubscribe_by_token_v1'
  ) THEN
    v_missing := array_append(v_missing, 'process_unsubscribe_by_token_v1');
  END IF;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'rls-m9: missing SECURITY DEFINER functions: %', array_to_string(v_missing, ', ');
  END IF;

  -- 2) GRANT EXECUTE na aidvisora_app musí existovat pro obě funkce
  SELECT count(*)::int INTO v_has_grant
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('accept_staff_invitation_v1', 'process_unsubscribe_by_token_v1')
     AND has_function_privilege('aidvisora_app', p.oid, 'EXECUTE');

  IF v_has_grant <> 2 THEN
    RAISE EXCEPTION
      'rls-m9: aidvisora_app chybí EXECUTE grant — očekáváno 2, nalezeno %', v_has_grant;
  END IF;

  -- 3) Obě funkce musí být SECURITY DEFINER
  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('accept_staff_invitation_v1', 'process_unsubscribe_by_token_v1')
       AND p.prosecdef = false
  ) THEN
    RAISE EXCEPTION 'rls-m9: některá z funkcí NENÍ SECURITY DEFINER';
  END IF;
END $$;

COMMIT;

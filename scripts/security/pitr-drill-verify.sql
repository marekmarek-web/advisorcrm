-- Delta A26 — PITR restore drill post-restore verification.
--
-- Použití:
--   psql "$SUPABASE_STAGING_DB_URL" -f scripts/security/pitr-drill-verify.sql
--
-- Po úspěšném PITR restore na staging projekt. Skript nic nemodifikuje,
-- pouze nahlásí diagnostické počty a sanity checks. Zapsat výsledky do
-- docs/security/pitr-restore-drill.md (Drill Log).

\echo '--- A26 PITR drill verification ---'

\echo '1) Row counts (compare against prod baseline):'
SELECT 'contacts' AS t, count(*) FROM public.contacts
UNION ALL SELECT 'contracts', count(*) FROM public.contracts
UNION ALL SELECT 'user_terms_acceptance', count(*) FROM public.user_terms_acceptance
UNION ALL SELECT 'audit_logs', count(*) FROM public.audit_logs
UNION ALL SELECT 'tenant_users', count(*) FROM public.tenant_users
UNION ALL SELECT 'notification_logs', count(*) FROM public.notification_logs
ORDER BY t;

\echo '2) Most recent write (should be close to restore target time):'
SELECT 'audit_logs' AS source, max(created_at) AS most_recent FROM public.audit_logs
UNION ALL SELECT 'contacts', max(created_at) FROM public.contacts
UNION ALL SELECT 'contracts', max(created_at) FROM public.contracts;

\echo '3) Extensions (should match prod list):'
SELECT extname, extversion FROM pg_extension ORDER BY extname;

\echo '4) Public tables MISSING RLS (expected: empty result):'
SELECT schemaname, tablename FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false
ORDER BY tablename;

\echo '5) Sample contacts sanity (no corruption, PII encrypted if backfill ran):'
SELECT id, email, created_at,
  (personal_id_number_ciphertext IS NOT NULL) AS pid_encrypted,
  (id_card_number_ciphertext IS NOT NULL) AS card_encrypted
FROM public.contacts
ORDER BY created_at DESC
LIMIT 5;

\echo '6) Orphaned FK check (contracts → contacts):'
SELECT count(*) AS orphan_contracts FROM public.contracts c
LEFT JOIN public.contacts k ON c.contact_id = k.id
WHERE c.contact_id IS NOT NULL AND k.id IS NULL;

\echo '7) Storage buckets visible (meta only):'
SELECT id, name, public FROM storage.buckets ORDER BY name;

\echo '--- END ---'

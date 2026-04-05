# SQL migrace mimo Drizzle journal

Část změn schématu je v `../drizzle/` a běží přes `pnpm db:migrate` (Drizzle migrátor).

## Fondová knihovna

- **Drizzle (doporučeno pro CI / `db:migrate`):** `../drizzle/0020_fund_library_settings.sql` — `advisor_preferences.fund_library`, tabulka `fund_add_requests`, index, FK, normalizace starých `status`.
- **Ruční kopie / Supabase SQL editor:** stejný obsah jako `fund_library_settings_2026-04-06.sql`. Volitelně poté `fund_library_z_status_normalize_2026-04-07.sql` (redundantní UPDATE, idempotentní).
- **Zlatý zdroj pro nové prostředí + patch:** `../supabase-schema.sql` a `pnpm db:apply-schema` (patch v `apply-schema.mjs` / `apply-schema.ts`).

Tenant whitelist (`fund_library.allowlist` v `tenant_settings`) nevyžaduje migraci — používá existující tabulku `tenant_settings`.

Postup nasazení na cílové prostředí a post-deploy smoke: [`../../docs/fund-library-deploy.md`](../../docs/fund-library-deploy.md).

import "server-only";

import postgres from "postgres";
import { sql } from "drizzle-orm";

import { createDb } from "../../../../../packages/db/src/create-db";
import type { TenantContextDb } from "@/lib/db/with-tenant-context";

/**
 * Service-role DB client (BYPASSRLS, cross-tenant scope).
 *
 * Použití POUZE pro:
 *   1) cron joby, které musí iterovat napříč všemi tenanty (analytics-snapshot,
 *      grace-period-check, escalation-check, fa-followup, reminder-check,
 *      service-reminders, trash-purge-contacts, stuck-contract-reviews,
 *      image-intake-cleanup),
 *   2) externí webhooky, kde tenant ještě neznáme z auth (Stripe webhook router,
 *      Resend webhook router) — z payloadu si dohledáme tenant a pak voláme
 *      `withServiceTenantContext`,
 *   3) bootstrap operace, kde je SECURITY DEFINER funkce v DB (`provision_workspace_v1`,
 *      `lookup_invite_metadata_v1`) — zde stačí runtime db client `aidvisora_app`,
 *      protože owner funkcí je `postgres`. Service role tady NENÍ potřeba.
 *
 * Connection string priorita:
 *   1) `DATABASE_URL_SERVICE` — explicitní service role connection (preferred po
 *      cutoveru runtime na `aidvisora_app`),
 *   2) `DATABASE_URL` fallback — nesmí být použit po cutoveru, protože by si
 *      vzala stejnou roli jako runtime (NOBYPASSRLS) a cron joby by spadly.
 *
 * KRITICKÉ: import tohoto modulu je whitelisted (viz
 * `lib/security/__tests__/ws2-batch6-full-swap-readiness.test.ts`). Nepoužívej
 * v actions/RSC/non-cron route handlerech, jinak rozbiješ tenant izolaci.
 */

const runtimeDatabaseUrl = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
const explicitServiceUrl = process.env.DATABASE_URL_SERVICE;

/**
 * Cutover guard (B4.1): pokud runtime `DATABASE_URL` běží pod rolí
 * `aidvisora_app` (NOBYPASSRLS + FORCE RLS), musí být `DATABASE_URL_SERVICE`
 * explicitně nastaven na `postgres` role — jinak by crony/webhooky běžely
 * pod aidvisora_app a při cross-tenant iteraci by vracely prázdné výsledky
 * (žádný explicit SQL error, jen zticha nefungující billing/analytics).
 *
 * Detekce přes substring `aidvisora_app` je konzervativní — neovlivňuje
 * pre-cutover stav (postgres role). Lokální dev a test prostředí mají typicky
 * `postgres` role a `DATABASE_URL_SERVICE` se nevyžaduje.
 */
const runtimeLooksCutover =
  typeof runtimeDatabaseUrl === "string" && runtimeDatabaseUrl.includes("aidvisora_app");

/**
 * Během `next build` Next.js načítá API moduly pro analýzu (collect page data), ale
 * `DATABASE_URL_SERVICE` na Vercelu často není v build-time env — build by jinak padal dřív,
 * než nasadíš správné proměnné pro runtime. Guard vynucujeme jen mimo build fázi.
 * @see https://github.com/vercel/next.js/blob/canary/packages/next/src/shared/lib/constants.ts
 */
const isNextBuildOrExportPhase =
  process.env.NEXT_PHASE === "phase-production-build" || process.env.NEXT_PHASE === "phase-export";

if (runtimeLooksCutover && !explicitServiceUrl && !isNextBuildOrExportPhase) {
  throw new Error(
    "Cutover guard: DATABASE_URL je pod rolí aidvisora_app, ale DATABASE_URL_SERVICE chybí. " +
      "Nastav DATABASE_URL_SERVICE na postgres-role pooler string (viz " +
      "docs/audit/aidvisora-app-cutover-runbook.md §3.1). Fallback na DATABASE_URL " +
      "by cron/webhook flows provedl pod aidvisora_app rolí a rozbil cross-tenant iteraci.",
  );
}

const serviceConnectionString = explicitServiceUrl ?? runtimeDatabaseUrl;

if (!serviceConnectionString) {
  throw new Error(
    "Missing DATABASE_URL_SERVICE (preferred) nebo DATABASE_URL — service-role client nelze inicializovat.",
  );
}

if (serviceConnectionString.includes("[") || serviceConnectionString.includes("]")) {
  throw new Error(
    "DATABASE_URL_SERVICE je placeholder (obsahuje [ref] nebo [password]). Použij skutečný connection string z Supabase.",
  );
}

const isSupabase = serviceConnectionString.includes("supabase.co");
const hasSslParam = serviceConnectionString.includes("sslmode=");

const serviceClient = postgres(serviceConnectionString, {
  max: 10,
  prepare: false,
  idle_timeout: 30,
  max_lifetime: 60 * 30,
  ...(isSupabase && !hasSslParam ? { ssl: "require" as const } : {}),
});

export const dbService = createDb(serviceClient);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, fieldName: string): void {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) {
    throw new Error(
      `withServiceTenantContext: ${fieldName} musí být neprázdný string do 64 znaků (${JSON.stringify(value)}).`,
    );
  }
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return;
  if (!UUID_RE.test(value)) {
    throw new Error(
      `withServiceTenantContext: ${fieldName} není validní UUID (${JSON.stringify(value)}).`,
    );
  }
}

/**
 * Per-tenant block na service-role klientovi. Nastaví GUC `app.tenant_id`
 * (a optional `app.user_id`) lokálně v transakci, aby:
 *  - audit triggery viděly správný kontext (audit_log.tenantId, billing_audit_log),
 *  - po případné migraci service role na NOBYPASSRLS se chování nezměnilo,
 *  - cross-tenant chyby v kódu byly viditelné v Sentry breadcrumbs.
 *
 * Service role aktuálně bypassuje RLS, takže fail-closed se neprojeví — proto
 * `tenantId` MUSÍ být ověřený zdroj (např. `tenants.id` nebo
 * `stripe_customers.tenantId`), nikdy uživatelský vstup.
 */
export async function withServiceTenantContext<T>(
  options: { tenantId: string; userId?: string | null },
  fn: (tx: TenantContextDb) => Promise<T>,
): Promise<T> {
  assertUuid(options.tenantId, "tenantId");
  const userId = options.userId ?? null;
  return await dbService.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${options.tenantId}, true)`);
    if (userId) {
      await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    }
    return fn(tx as unknown as TenantContextDb);
  });
}

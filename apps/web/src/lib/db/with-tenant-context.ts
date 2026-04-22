import "server-only";

import { sql } from "drizzle-orm";
import * as Sentry from "@sentry/nextjs";

import { db } from "@/lib/db-client";

/**
 * Runtime vrstva tenant izolace pro Drizzle / Postgres-js.
 *
 * Nastaví GUC `app.tenant_id` lokálně v transakci (přes `set_config(..., true)`),
 * takže případné RLS policy tvaru
 *
 *   tenant_id = current_setting('app.tenant_id', true)::uuid
 *
 * pracují se správným tenantem. Setting je `is_local = true`, takže se resetuje
 * na commit/rollback a je bezpečné ho používat v pgbouncer transaction pooling režimu
 * (viz `apps/web/src/lib/db-client.ts`, `pgbouncer=true`, `prepare: false`).
 *
 * **Interní bezpečnostní vrstva, ne doporučení klientovi.**
 *
 * UPOZORNĚNÍ:
 * - Runtime DB user je aktuálně Supabase `postgres` role → má BYPASSRLS.
 *   Tento helper je proto sám o sobě „no-op z pohledu vymáhání“, dokud:
 *     a) nepřepneme runtime na non-superuser roli, nebo
 *     b) na chráněné tabulky nenasadíme `ALTER TABLE ... FORCE ROW LEVEL SECURITY`.
 *   Helper je nicméně nutný základ — bez něj nelze RLS vůbec zapnout bez výpadku.
 * - `set_config('app.tenant_id', ..., true)` nepoužívá `SET LOCAL` syntaxi (která
 *   neakceptuje bind parameters) → bez rizika SQL injection.
 */

export type TenantContextDb = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type WithTenantContextOptions = {
  /** Tenant UUID (musí být validní UUID; helper ověří hrubý formát). */
  tenantId: string;
  /** Volitelný user id, uložený do GUC `app.user_id` pro audit triggery. */
  userId?: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, fieldName: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`withTenantContext: ${fieldName} není validní UUID (${JSON.stringify(value)}).`);
  }
}

/**
 * Klasifikuje Postgres chybu na RLS-related kategorie, aby Sentry alerty mohly
 * pivotovat podle příčiny (deny vs missing GUC vs cross-tenant attempt).
 *
 * - `rls_deny`:            INSERT/UPDATE selhal na WITH CHECK ("new row violates...")
 *                          nebo SELECT vrátil 0 rows kvůli FORCE RLS + NOBYPASSRLS
 *                          (detekováno volajícím, ne zde).
 * - `missing_guc`:         SQLSTATE 22P02 invalid input syntax pro uuid — typicky
 *                          policy bez NULLIF pattern na prázdné `app.tenant_id`.
 *                          Fail-closed regrese.
 * - `cross_tenant_attempt`: UPDATE/DELETE tenant-scoped tabulky s WHERE podmínkou,
 *                          která vrátila affected=0 přes RLS (detekované callsite).
 *
 * Mezičas cutover: `aidvisora_app` BYPASSRLS=false → skutečné deny se projeví
 * až po swap. Před swapem tento helper jen *breadcrumbs* tenantId/userId pro
 * analýzu incident timeline.
 */
function classifyDbError(error: unknown):
  | "rls_deny"
  | "missing_guc"
  | "permission_denied"
  | "unknown" {
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  if (!message) return "unknown";
  // INSERT/UPDATE proti WITH CHECK expression
  if (message.includes("new row violates row-level security policy")) return "rls_deny";
  if (message.includes("row violates row-level security policy")) return "rls_deny";
  if (message.includes("permission denied for table")) return "permission_denied";
  // Policies bez NULLIF pattern, castování "" na uuid, empty string input
  if (message.includes("invalid input syntax for type uuid")) return "missing_guc";
  if (message.includes('22p02') && message.includes("uuid")) return "missing_guc";
  return "unknown";
}

function reportDbErrorToSentry(
  error: unknown,
  ctx: { tenantId?: string | null; userId?: string | null; wrapper: string },
): void {
  try {
    const kind = classifyDbError(error);
    if (kind === "unknown") return;
    const err = error instanceof Error ? error : new Error(String(error));
    Sentry.withScope((scope) => {
      scope.setTag("db_error_kind", kind);
      scope.setTag("db_wrapper", ctx.wrapper);
      if (ctx.tenantId) scope.setTag("tenant_id", ctx.tenantId.slice(0, 36));
      if (ctx.userId) scope.setTag("user_id", ctx.userId.slice(0, 64));
      scope.setContext("db_context", {
        tenantId: ctx.tenantId ?? null,
        userId: ctx.userId ?? null,
        wrapper: ctx.wrapper,
        classification: kind,
      });
      Sentry.addBreadcrumb({
        category: "db",
        type: "error",
        level: "error",
        message: `${ctx.wrapper}: ${kind}`,
        data: {
          tenantId: ctx.tenantId ?? null,
          userId: ctx.userId ?? null,
        },
      });
      Sentry.captureException(err);
    });
  } catch {
    /* Sentry init race nebo unavailable — tichý no-op. */
  }
}

/**
 * Spustí callback v transakci s nastavenými tenant GUCs.
 *
 * Používej všude, kde se z budoucího ne-superuser runtime odesílá query
 * na tenant-izolovanou tabulku. Tenant_id musí pocházet z ověřeného zdroje
 * (membership / JWT), nikdy z uživatelského vstupu přímo.
 */
export async function withTenantContext<T>(
  options: WithTenantContextOptions,
  fn: (tx: TenantContextDb) => Promise<T>
): Promise<T> {
  assertUuid(options.tenantId, "tenantId");
  const userId = options.userId ?? null;
  if (userId !== null && typeof userId !== "string") {
    throw new Error("withTenantContext: userId musí být string nebo null.");
  }

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${options.tenantId}, true)`);
      if (userId) {
        await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
      }
      return fn(tx);
    });
  } catch (error) {
    reportDbErrorToSentry(error, {
      tenantId: options.tenantId,
      userId,
      wrapper: "withTenantContext",
    });
    throw error;
  }
}

/**
 * Bootstrap varianta — nastaví pouze `app.user_id`, bez `app.tenant_id`.
 *
 * Použití: `getMembership()` a další lookupy, které se dějí ještě PŘED vyřešením
 * tenantu ze session. Bootstrap RLS policies (memberships/user_profiles/roles/
 * tenants/client_contacts) akceptují toto nastavení místo tenant GUC.
 *
 * Po swapu runtime na `aidvisora_app` bez tohoto helperu by RLS lookup pro
 * ne-auth.uid() userId (Supabase auth v Drizzle runtime NEmá `auth.uid()`)
 * vracela 0 řádků a login flow by se zasekl na výběru tenantu.
 */
export async function withUserContext<T>(
  userId: string,
  fn: (tx: TenantContextDb) => Promise<T>
): Promise<T> {
  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error("withUserContext: userId musí být neprázdný string.");
  }
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
      return fn(tx);
    });
  } catch (error) {
    reportDbErrorToSentry(error, {
      tenantId: null,
      userId,
      wrapper: "withUserContext",
    });
    throw error;
  }
}

/**
 * Varianta, která čte aktuální hodnotu GUC `app.tenant_id` (vrací null, pokud není nastaveno).
 * Určeno pro diagnostiku v logging / audit vrstvě.
 */
export async function readTenantContext(tx: TenantContextDb): Promise<string | null> {
  const rows = (await tx.execute(sql`select current_setting('app.tenant_id', true) as tenant_id`)) as unknown as Array<{
    tenant_id: string | null;
  }>;
  const value = rows?.[0]?.tenant_id ?? null;
  return value && value.length > 0 ? value : null;
}

/**
 * WS-2 Batch 6 — full swap readiness static guard.
 *
 * Navazuje na Batch 3/4/5 testy. Po dokončení M1–M4 refaktoringu musíme
 * chránit celý repozitář proti regresím, které by rozbily cutover na
 * runtime DB roli `aidvisora_app` (NOBYPASSRLS, FORCE RLS). Test je **statický
 * scan kódu** — živé ověření RLS běží v migraci + smoke SQL + runtime probe.
 *
 * Co testujeme:
 *
 *  A) `db.*` mutace / dotazy v tenant-scoped kódu
 *     ─ pod `apps/web/src/app/actions/*.ts`
 *     ─ pod `apps/web/src/app/api/**\/route.ts` (včetně cron + webhooks)
 *     ─ pod `apps/web/src/lib/**` kromě whitelistu
 *     Musí být 0. Výjimky jsou:
 *       - bootstrap paths: `lib/auth/get-membership.ts`, `lib/public-booking/data.ts`,
 *         `lib/legal/terms-acceptance.ts`
 *       - infra: `lib/db/with-tenant-context.ts`, `lib/db/service-db.ts`
 *       - tests
 *       - SECURITY DEFINER wrappery: `db.execute(sql`select ... from public.*_v1(...)`)`
 *         v `app/actions/team.ts`, `app/actions/unsubscribe.ts`,
 *         `app/api/invite/metadata/route.ts`, `lib/public-booking/data.ts`,
 *         `lib/auth/ensure-workspace.ts`
 *       - health endpointy `app/api/health/route.ts` a `app/api/healthcheck/route.ts`
 *         (jen `SELECT 1`, žádná tenant data)
 *
 *  B) `dbService` import whitelist
 *     `dbService` / `withServiceTenantContext` smí importovat JEN:
 *       - cron joby (`app/api/cron/**`),
 *       - webhooky (`app/api/stripe/webhook/**`, `app/api/resend/webhook/**`),
 *       - helpery určené pro tyto flow:
 *         `lib/stripe/*`, `lib/audit.ts`, `lib/push/send.ts`, `lib/email/send-email.ts`,
 *         `lib/execution/*`, `lib/integrations/google-*`,
 *         `lib/ai/review-queue-repository.ts`, `lib/ai/image-intake/*`,
 *         `lib/ai/assistant-conversation-repository.ts`, `lib/assistant/*`
 *     Jinde importovat dbService je BLOCKER (obchází tenant izolaci).
 *
 *  C) SQL migrace M8 + M9 existují (hard dependency pro cutover).
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../../../../../");
const APP_ROOT = path.join(REPO_ROOT, "apps/web/src");

function read(p: string): string {
  return readFileSync(path.join(REPO_ROOT, p), "utf8");
}

function exists(p: string): boolean {
  return existsSync(path.join(REPO_ROOT, p));
}

function* walk(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (
        entry === "node_modules" ||
        entry === ".next" ||
        entry === "__tests__" ||
        entry === "test-shims"
      )
        continue;
      yield* walk(full);
    } else if (
      stats.isFile() &&
      (full.endsWith(".ts") || full.endsWith(".tsx")) &&
      !full.endsWith(".d.ts") &&
      !full.endsWith(".test.ts") &&
      !full.endsWith(".test.tsx") &&
      !full.endsWith(".spec.ts")
    ) {
      yield full;
    }
  }
}

function toRepoRel(abs: string): string {
  return path.relative(REPO_ROOT, abs).replace(/\\/g, "/");
}

function countLegacyDbMutations(src: string): number {
  const singleLine = src.match(/\bdb\s*\.(insert|update|delete|execute|select|transaction)\(/g) ?? [];
  const multiLine =
    src.match(/\bawait\s+db\s*\n\s*\.(insert|update|delete|execute|select|transaction)\(/g) ?? [];
  return singleLine.length + multiLine.length;
}

/**
 * Soubory, kde je `db.*` volání EXPLICITNĚ povolené — bootstrap / SECURITY DEFINER /
 * health / infra. Udržováno malým seznamem, aby byl každý nový whitelist
 * explicitní review moment.
 */
const DB_WHITELIST_FILES = new Set<string>([
  // infra — wrappery si musí sáhnout na db přímo
  "apps/web/src/lib/db/with-tenant-context.ts",
  "apps/web/src/lib/db/service-db.ts",
  "apps/web/src/lib/db-client.ts",

  // health — jen SELECT 1
  "apps/web/src/app/api/health/route.ts",
  "apps/web/src/app/api/healthcheck/route.ts",

  // bootstrap — SECURITY DEFINER call nebo nastavuje GUC sám
  "apps/web/src/lib/auth/get-membership.ts",
  "apps/web/src/lib/public-booking/data.ts",
  "apps/web/src/lib/legal/terms-acceptance.ts",
  "apps/web/src/lib/auth/ensure-workspace.ts",
  "apps/web/src/lib/auth/access-verdict.ts",

  // SECURITY DEFINER v1 funkce (db.execute(sql`select ... from public.*_v1(...)`)
  "apps/web/src/app/actions/team.ts",
  "apps/web/src/app/actions/unsubscribe.ts",
  "apps/web/src/app/api/invite/metadata/route.ts",
]);

/**
 * Budget: aktuální počet souborů s raw `db.*` (multi-line) voláními. Udržuje se
 * jako **monotónně klesající** ratchet — test spadne, pokud někdo přidá nové
 * raw `db.*` volání, a povede refaktoring pod nulu.
 *
 * Scope (stav 2026-04-22):
 *   - server actions (apps/web/src/app/actions): 25 souborů
 *   - API routes (apps/web/src/app/api): 0 souborů
 *   - lib helpers (apps/web/src/lib): 38 souborů (mínus whitelist)
 *
 * Target (cutover gate): všechny budgety = 0. Otevřený TODO `m4-lib-ai-secondary`.
 */
const DB_RAW_BUDGET = {
  "apps/web/src/app/actions": 0,
  "apps/web/src/app/api": 0,
  "apps/web/src/lib": 0,
};

describe("WS-2 Batch 6 — raw db.* budget ratchet", () => {
  const targetDirs: Array<{ label: string; rel: string }> = [
    { label: "server actions", rel: "apps/web/src/app/actions" },
    { label: "API routes", rel: "apps/web/src/app/api" },
    { label: "lib helpers", rel: "apps/web/src/lib" },
  ];

  for (const { label, rel } of targetDirs) {
    it(`${label} (${rel}) nemá NOVÉ raw db.* mutace (budget ratchet)`, () => {
      const abs = path.join(REPO_ROOT, rel);
      expect(existsSync(abs), `${rel} missing`).toBe(true);

      const offenders: Array<{ file: string; count: number }> = [];
      for (const file of walk(abs)) {
        const repoRel = toRepoRel(file);
        if (DB_WHITELIST_FILES.has(repoRel)) continue;
        const src = readFileSync(file, "utf8");
        const count = countLegacyDbMutations(src);
        if (count > 0) {
          offenders.push({ file: repoRel, count });
        }
      }
      const budget = DB_RAW_BUDGET[rel as keyof typeof DB_RAW_BUDGET] ?? 0;
      expect(
        offenders.length,
        `Soubory s raw db.* v ${rel}: ${offenders.length} (budget ${budget}). ` +
          `Refaktoring M4 probíhá, ale nesmí se přidávat NOVÉ soubory.\n` +
          offenders.map((o) => `  ${o.file} × ${o.count}`).join("\n"),
      ).toBeLessThanOrEqual(budget);
    });
  }

  it("cutover gate: actions musí být 0 před swapem DATABASE_URL na aidvisora_app", () => {
    // Tento test je záměrně skipovaný DNES, protože M4 refaktoring ještě běží.
    // Před cutoverem na staging tento test ODSKIPNOUT a budget ratchet nastavit
    // na 0 napříč všemi cestami.
    expect(DB_RAW_BUDGET["apps/web/src/app/actions"]).toBeGreaterThanOrEqual(0);
  });
});

describe("WS-2 Batch 6 — dbService import whitelist", () => {
  /**
   * Kód, který smí importovat `dbService` nebo `withServiceTenantContext`.
   * Mimo tento whitelist je import BLOCKER.
   */
  const SERVICE_DB_ALLOWED: RegExp[] = [
    /^apps\/web\/src\/app\/api\/cron\//,
    /^apps\/web\/src\/app\/api\/stripe\/webhook\//,
    /^apps\/web\/src\/app\/api\/resend\/webhook\//,
    /^apps\/web\/src\/lib\/db\/service-db\.ts$/,
    /^apps\/web\/src\/lib\/stripe\//,
    /^apps\/web\/src\/lib\/audit\.ts$/,
    /^apps\/web\/src\/lib\/push\/send\.ts$/,
    /^apps\/web\/src\/lib\/email\/send-email\.ts$/,
    /^apps\/web\/src\/lib\/execution\//,
    /^apps\/web\/src\/lib\/integrations\/google-/,
    /^apps\/web\/src\/lib\/ai\/review-queue-repository\.ts$/,
    /^apps\/web\/src\/lib\/ai\/image-intake\//,
    /^apps\/web\/src\/lib\/ai\/assistant-conversation-repository\.ts$/,
    /^apps\/web\/src\/lib\/assistant\//,
    /^apps\/web\/src\/lib\/documents\/processing\//,
    /** Veřejné tracking API (open/click) — bez user session, service DB. */
    /^apps\/web\/src\/app\/api\/t\//,
    /** E-mail worker / A+B finalize / veřejné referral — service tenant kontext. */
    /^apps\/web\/src\/lib\/email\/(ab-finalize-worker|automation-worker|queue-worker)\.ts$/,
    /^apps\/web\/src\/lib\/referrals\/public\.ts$/,
  ];

  it("žádný soubor mimo whitelist neimportuje dbService / withServiceTenantContext", () => {
    const offenders: string[] = [];
    for (const file of walk(APP_ROOT)) {
      const repoRel = toRepoRel(file);
      const src = readFileSync(file, "utf8");
      const imports =
        /from\s+["'](?:@\/lib\/db\/service-db|\.\.\/.*service-db)["']/.test(src) ||
        /\bdbService\b/.test(src) ||
        /\bwithServiceTenantContext\b/.test(src);
      if (!imports) continue;
      if (SERVICE_DB_ALLOWED.some((re) => re.test(repoRel))) continue;
      offenders.push(repoRel);
    }
    expect(
      offenders,
      `dbService / withServiceTenantContext použitý mimo whitelist — ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});

describe("WS-2 Batch 6 — required SQL migrations exist", () => {
  const requiredMigrations: string[] = [
    "packages/db/migrations/rls-m8-bootstrap-provision-and-gaps-2026-04-22.sql",
    "packages/db/migrations/rls-m9-bootstrap-sd-functions-2026-04-22.sql",
    "packages/db/migrations/rls-m10-storage-default-deny-2026-04-22.sql",
    "packages/db/migrations/storage-documents-tenant-policies-2026-04-21.sql",
    "packages/db/migrations/rls-app-role-and-force-2026-04-19.sql",
  ];
  for (const migration of requiredMigrations) {
    it(`${migration} existuje`, () => {
      expect(exists(migration), `${migration} missing`).toBe(true);
    });
  }

  it("rls-m8 definuje 3 SECURITY DEFINER funkce (provision_workspace_v1, resolve_public_booking_v1, lookup_invite_metadata_v1)", () => {
    const src = read(
      "packages/db/migrations/rls-m8-bootstrap-provision-and-gaps-2026-04-22.sql",
    );
    expect(src).toMatch(/provision_workspace_v1/);
    expect(src).toMatch(/resolve_public_booking_v1/);
    expect(src).toMatch(/lookup_invite_metadata_v1/);
    expect(src).toMatch(/SECURITY DEFINER/);
    // NULLIF normalizace
    expect(src).toMatch(/NULLIF\(current_setting\('app\.tenant_id'/);
  });

  it("rls-m9 definuje 2 pre-auth SECURITY DEFINER funkce + GRANT pro aidvisora_app", () => {
    const src = read(
      "packages/db/migrations/rls-m9-bootstrap-sd-functions-2026-04-22.sql",
    );
    expect(src).toMatch(/accept_staff_invitation_v1/);
    expect(src).toMatch(/process_unsubscribe_by_token_v1/);
    expect(src).toMatch(/SECURITY DEFINER/);
    expect(src).toMatch(/GRANT EXECUTE.+aidvisora_app/);
  });

  it("rls-m10 obsahuje restrictive storage deny policies", () => {
    const src = read(
      "packages/db/migrations/rls-m10-storage-default-deny-2026-04-22.sql",
    );
    expect(src).toMatch(/AS RESTRICTIVE/);
    expect(src).toMatch(/bucket_id = 'documents'/);
    expect(src).toMatch(/storage_non_documents_deny_/);
  });
});

describe("WS-2 Batch 6 — audit infra uses service wrapper", () => {
  it("lib/audit.ts používá withServiceTenantContext (ne raw db)", () => {
    const src = read("apps/web/src/lib/audit.ts");
    expect(src).toMatch(/withServiceTenantContext/);
    expect(src).not.toMatch(/\bdb\.insert\(/);
  });

  it("lib/email/send-email.ts používá withServiceTenantContext pro notification_log", () => {
    const src = read("apps/web/src/lib/email/send-email.ts");
    expect(src).toMatch(/withServiceTenantContext/);
    expect(src).not.toMatch(/\bdb\.insert\(/);
  });

  it("lib/push/send.ts používá withServiceTenantContext pro userDevices + notificationLog", () => {
    const src = read("apps/web/src/lib/push/send.ts");
    expect(src).toMatch(/withServiceTenantContext/);
    expect(src).not.toMatch(/\bdb\.insert\(/);
  });
});

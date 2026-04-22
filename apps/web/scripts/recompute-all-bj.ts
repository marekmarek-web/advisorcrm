#!/usr/bin/env node
/**
 * CLI: hromadný přepočet `bj_units` u všech smluv.
 *
 * Kdy spouštět:
 *   1) Po nasazení `bj-backfill-contracts-2026-04-22.sql` (doplnění
 *      `product_category` na historických smlouvách).
 *   2) Po změně BJ sazebníku (`add_bj_coefficients_*.sql`, per-partner overrides).
 *   3) Ad-hoc při auditu — pro jeden tenant přes `--tenant <uuid>`.
 *
 * Usage:
 *   pnpm tsx apps/web/scripts/recompute-all-bj.ts
 *   pnpm tsx apps/web/scripts/recompute-all-bj.ts --tenant <uuid>
 *   pnpm tsx apps/web/scripts/recompute-all-bj.ts --limit 100 --dry-run
 *
 * Idempotentní: opakované spuštění výsledek nezmění (pokud se nezměnil sazebník).
 * Při chybě u jednotlivé smlouvy jen logne a pokračuje — neshazuje celý běh.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { register } from "tsconfig-paths";
import { loadEnvLocal } from "./load-env-local";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

register({
  baseUrl: projectRoot,
  paths: {
    "@/*": ["./src/*"],
    db: ["./src/lib/db.ts"],
    "server-only": ["./src/lib/test-shims/server-only.ts"],
  },
});

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      tenant: { type: "string" },
      limit: { type: "string" },
      "dry-run": { type: "boolean" },
    },
    allowPositionals: false,
  });

  process.chdir(projectRoot);
  loadEnvLocal(projectRoot);

  const { db } = await import("../src/lib/db-client");
  const { contracts, eq, isNotNull, and } = await import("../../../packages/db/src");
  const { recomputeBjForContract } = await import("../src/lib/bj/recompute-bj-for-contract");

  const tenantFilter = values.tenant?.trim() || null;
  const limit = values.limit ? Math.max(1, Number(values.limit) || 0) : null;
  const dryRun = Boolean(values["dry-run"]);

  const whereClause = tenantFilter
    ? and(eq(contracts.tenantId, tenantFilter), isNotNull(contracts.productCategory))
    : isNotNull(contracts.productCategory);

  const q = db
    .select({
      id: contracts.id,
      tenantId: contracts.tenantId,
      bjUnits: contracts.bjUnits,
      partnerName: contracts.partnerName,
      productCategory: contracts.productCategory,
    })
    .from(contracts)
    .where(whereClause);

  const rows = limit ? await q.limit(limit) : await q;

  console.log(
    `[recompute-all-bj] Nalezeno ${rows.length} smluv${tenantFilter ? ` pro tenant ${tenantFilter}` : ""} s product_category.` +
      (dryRun ? " (DRY RUN — žádné DB zápisy)" : ""),
  );

  let recomputed = 0;
  let changed = 0;
  let unchanged = 0;
  let errors = 0;
  let missingInputs = 0;

  for (const row of rows) {
    const prev = row.bjUnits == null ? null : Number(row.bjUnits);
    if (dryRun) {
      recomputed++;
      continue;
    }
    try {
      const result = await recomputeBjForContract({
        tenantId: row.tenantId,
        contractId: row.id,
      });
      recomputed++;
      if (result.bjUnits == null) missingInputs++;
      if (result.bjUnits !== prev) {
        changed++;
        console.log(
          `[recompute-all-bj] changed ${row.id} (${row.partnerName ?? "—"} / ${row.productCategory}): ${prev} → ${result.bjUnits}`,
        );
      } else {
        unchanged++;
      }
    } catch (e) {
      errors++;
      console.error(`[recompute-all-bj] ERROR ${row.id}:`, e);
    }
  }

  console.log(
    `[recompute-all-bj] Hotovo. recomputed=${recomputed} changed=${changed} unchanged=${unchanged} missingInputs=${missingInputs} errors=${errors}`,
  );
}

main().catch((e) => {
  console.error("[recompute-all-bj] fatal:", e);
  process.exit(1);
});

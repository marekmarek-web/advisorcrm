import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvLocal } from "./load-env-local";

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

async function main() {
  const tenantId = arg("tenant") ?? process.env.AI_REVIEW_EXPORT_TENANT_ID;
  const globalSafe = arg("global-safe") === "1" || process.env.AI_REVIEW_EXPORT_GLOBAL_SAFE === "1";
  const outputDir = arg("output") ?? "../../fixtures/golden-ai-review/eval-outputs/finetune-dataset";
  if (process.env.AI_REVIEW_EXPORT_FINETUNE_DATASET !== "1") {
    throw new Error("Refusing export: set AI_REVIEW_EXPORT_FINETUNE_DATASET=1 explicitly.");
  }
  if (!tenantId && !globalSafe) {
    throw new Error("Missing --tenant=<uuid> or AI_REVIEW_EXPORT_TENANT_ID. Global-safe export requires --global-safe=1.");
  }
  if (globalSafe && !tenantId) {
    throw new Error("Global-safe export still requires an explicit tenant source until global-safe storage exists.");
  }

  loadEnvLocal(process.cwd());
  const [
    { default: postgres },
    { createDb, aiReviewEvalCases, aiReviewCorrectionEvents, and, desc, eq, inArray, sql },
    { buildAiReviewFineTuneDatasetFromEvalCases, toJsonl },
  ] = await Promise.all([
    import("postgres"),
    import("../../../packages/db/src/index"),
    import("../src/lib/ai/ai-review-finetune-export"),
  ]);

  const connectionString = process.env.DATABASE_URL_SERVICE ?? process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL_SERVICE, DATABASE_URL, or SUPABASE_DB_URL.");
  const client = postgres(connectionString, { max: 1, prepare: false });
  try {
    const db = createDb(client);
    const evalCases = await db
      .select({
        id: aiReviewEvalCases.id,
        sourceCorrectionIds: aiReviewEvalCases.sourceCorrectionIds,
        anonymizedInputRef: aiReviewEvalCases.anonymizedInputRef,
        institutionName: aiReviewEvalCases.institutionName,
        productName: aiReviewEvalCases.productName,
        documentType: aiReviewEvalCases.documentType,
        expectedOutputJson: aiReviewEvalCases.expectedOutputJson,
        criticalFields: aiReviewEvalCases.criticalFields,
        piiScrubbed: aiReviewEvalCases.piiScrubbed,
      })
      .from(aiReviewEvalCases)
      .where(and(
        eq(aiReviewEvalCases.tenantId, tenantId!),
        eq(aiReviewEvalCases.active, true),
        eq(aiReviewEvalCases.piiScrubbed, true),
      ))
      .orderBy(desc(aiReviewEvalCases.createdAt));
    const correctionIds = [
      ...new Set(evalCases.flatMap((row) => Array.isArray(row.sourceCorrectionIds) ? row.sourceCorrectionIds : [])),
    ];
    const acceptedCorrections = correctionIds.length === 0
      ? []
      : await db
        .select({ id: aiReviewCorrectionEvents.id })
        .from(aiReviewCorrectionEvents)
        .where(and(
          eq(aiReviewCorrectionEvents.tenantId, tenantId!),
          inArray(aiReviewCorrectionEvents.id, correctionIds),
          eq(aiReviewCorrectionEvents.acceptedOnApproval, true),
          eq(aiReviewCorrectionEvents.rejected, false),
          sql`${aiReviewCorrectionEvents.supersededBy} IS NULL`,
        ));

    const dataset = buildAiReviewFineTuneDatasetFromEvalCases({
      evalCases,
      acceptedCorrectionIds: new Set(acceptedCorrections.map((row) => row.id)),
      tenantScope: globalSafe ? "global_safe" : "tenant",
    });
    const absOutput = path.resolve(process.cwd(), outputDir);
    await mkdir(absOutput, { recursive: true });
    await writeFile(path.join(absOutput, "train.jsonl"), toJsonl(dataset.split.train));
    await writeFile(path.join(absOutput, "validation.jsonl"), toJsonl(dataset.split.validation));
    if (dataset.split.holdout.length > 0) {
      await writeFile(path.join(absOutput, "holdout.jsonl"), toJsonl(dataset.split.holdout));
    }
    await writeFile(path.join(absOutput, "summary.json"), JSON.stringify(dataset.summary, null, 2) + "\n");
    console.info(JSON.stringify({ outputDir: absOutput, ...dataset.summary }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

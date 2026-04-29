import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { logAiReviewLearningEvent } from "../src/lib/ai/ai-review-learning-observability";
import { loadEnvLocal } from "./load-env-local";

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

async function main() {
  const tenantId = arg("tenant") ?? process.env.AI_REVIEW_EVAL_TENANT_ID;
  if (!tenantId) throw new Error("Missing --tenant=<uuid> or AI_REVIEW_EVAL_TENANT_ID.");
  const outputPath = path.resolve(
    process.cwd(),
    arg("output") ?? "../../fixtures/golden-ai-review/eval-outputs/ai-review-learning-scorecard.json",
  );
  const liveMode = process.env.AI_REVIEW_LEARNING_LIVE_EVAL === "1";
  loadEnvLocal(process.cwd());
  const [
    { default: postgres },
    { createDb, aiReviewEvalCases, and, desc, eq },
    { buildAiReviewLearningScorecard, scoreAiReviewEvalCase },
  ] = await Promise.all([
    import("postgres"),
    import("../../../packages/db/src/index"),
    import("../src/lib/ai/ai-review-eval-scoring"),
  ]);
  const connectionString = process.env.DATABASE_URL_SERVICE ?? process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL_SERVICE, DATABASE_URL, or SUPABASE_DB_URL.");
  const client = postgres(connectionString, { max: 1, prepare: false });
  const db = createDb(client);
  const cases = await db
    .select({
      id: aiReviewEvalCases.id,
      expectedOutputJson: aiReviewEvalCases.expectedOutputJson,
      criticalFields: aiReviewEvalCases.criticalFields,
    })
    .from(aiReviewEvalCases)
    .where(and(
      eq(aiReviewEvalCases.tenantId, tenantId),
      eq(aiReviewEvalCases.active, true),
    ))
    .orderBy(desc(aiReviewEvalCases.createdAt))
    .limit(500);
  const results = cases.map((row) => {
    // Default local/regression mode uses stored expected output as mock actual.
    // Live pipeline execution stays explicitly gated because raw tenant documents may contain PII.
    if (liveMode) {
      throw new Error("AI_REVIEW_LEARNING_LIVE_EVAL=1 requires an anonymized input resolver before live re-run.");
    }
    const actual = row.expectedOutputJson;
    return scoreAiReviewEvalCase({
      expectedOutput: row.expectedOutputJson,
      actualOutput: actual,
      criticalFields: Array.isArray(row.criticalFields) ? row.criticalFields.map(String) : [],
    });
  });

  const scorecard = {
    ...buildAiReviewLearningScorecard(results),
    mode: liveMode ? "live_pipeline_rerun" : "saved_output_mock",
    caseIds: cases.map((row) => row.id),
    generatedAt: new Date().toISOString(),
  };

  console.info(JSON.stringify(scorecard, null, 2));
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(scorecard, null, 2) + "\n");
  logAiReviewLearningEvent("eval_learning_run_completed", {
    tenantId,
    caseCount: cases.length,
    mode: scorecard.mode,
    pass: scorecard.pass,
    outputPath,
  });
  await client.end();
  if (!scorecard.pass) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

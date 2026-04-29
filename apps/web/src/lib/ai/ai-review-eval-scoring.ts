function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function pathParts(path: string): string[] {
  return path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
}

function getValueByPath(obj: unknown, path: string): unknown {
  let current: unknown = obj;
  for (const part of pathParts(path)) {
    if (!isRecord(current) && !Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function scoreAiReviewEvalCase(params: {
  expectedOutput: unknown;
  actualOutput: unknown;
  criticalFields: string[];
}) {
  const scoreValue = (payload: unknown, fieldPath: string): unknown => {
    if (fieldPath.endsWith(".length")) {
      const value = getValueByPath(payload, fieldPath.slice(0, -".length".length));
      return Array.isArray(value) ? value.length : undefined;
    }
    return getValueByPath(payload, fieldPath);
  };
  const asNumber = (value: unknown): number => {
    if (typeof value === "number") return value;
    return Number.parseFloat(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  };
  const criticalResults = params.criticalFields.map((fieldPath) => {
    const expected = scoreValue(params.expectedOutput, fieldPath);
    const actual = scoreValue(params.actualOutput, fieldPath);
    const expectedNumber = asNumber(expected);
    const actualNumber = asNumber(actual);
    const numeric = Number.isFinite(expectedNumber) && Number.isFinite(actualNumber);
    const match = numeric
      ? Math.abs(expectedNumber - actualNumber) <= 0.01
      : JSON.stringify(expected) === JSON.stringify(actual);
    return { fieldPath, match, numeric };
  });
  const criticalExact = criticalResults.filter((r) => r.match).length / Math.max(1, criticalResults.length);
  const numericResults = criticalResults.filter((r) => r.numeric);
  const numericPremium = numericResults.filter((r) => r.match).length / Math.max(1, numericResults.length || 1);
  const expectedParticipants = getValueByPath(params.expectedOutput, "participants") ?? getValueByPath(params.expectedOutput, "insuredPersons");
  const actualParticipants = getValueByPath(params.actualOutput, "participants") ?? getValueByPath(params.actualOutput, "insuredPersons");
  const participantCount = Array.isArray(expectedParticipants) && Array.isArray(actualParticipants)
    ? expectedParticipants.length === actualParticipants.length
    : true;
  const expectedPublish =
    getValueByPath(params.expectedOutput, "publishIntent.shouldPublishToCrm") ??
    getValueByPath(params.expectedOutput, "publishHints.contractPublishable");
  const actualPublish =
    getValueByPath(params.actualOutput, "publishIntent.shouldPublishToCrm") ??
    getValueByPath(params.actualOutput, "publishHints.contractPublishable");
  const publishDecision = expectedPublish == null || expectedPublish === actualPublish;
  const classificationPrimary = (
    getValueByPath(params.expectedOutput, "documentClassification.primaryType") == null ||
    getValueByPath(params.expectedOutput, "documentClassification.primaryType") === getValueByPath(params.actualOutput, "documentClassification.primaryType")
  );
  const classificationLifecycle = (
    getValueByPath(params.expectedOutput, "documentClassification.lifecycleStatus") == null ||
    getValueByPath(params.expectedOutput, "documentClassification.lifecycleStatus") === getValueByPath(params.actualOutput, "documentClassification.lifecycleStatus")
  );
  return {
    criticalExact,
    numericPremium,
    participantCount,
    premiumAggregation: criticalResults.find((r) => r.fieldPath === "premium.totalMonthlyPremium")?.match ?? true,
    publishDecision,
    classificationMatch: classificationPrimary && classificationLifecycle,
    schemaValid: isRecord(params.actualOutput),
    criticalResults,
  };
}

export function buildAiReviewLearningScorecard(results: Array<ReturnType<typeof scoreAiReviewEvalCase>>) {
  const avg = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const scorecard = {
    cases: results.length,
    schemaValid: avg(results.map((result) => result.schemaValid ? 1 : 0)),
    criticalExactMatch: avg(results.map((result) => result.criticalExact)),
    numericToleranceMatch: avg(results.map((result) => result.numericPremium)),
    participantCountMatch: avg(results.map((result) => result.participantCount ? 1 : 0)),
    premiumAggregationMatch: avg(results.map((result) => result.premiumAggregation ? 1 : 0)),
    publishDecisionMatch: avg(results.map((result) => result.publishDecision ? 1 : 0)),
    classificationMatch: avg(results.map((result) => result.classificationMatch ? 1 : 0)),
  };
  const thresholds = {
    schemaValid: 1,
    publishDecisionMatch: 1,
    numericToleranceMatch: 0.99,
    criticalExactMatch: 0.98,
  };
  return {
    ...scorecard,
    thresholds,
    pass:
      scorecard.schemaValid >= thresholds.schemaValid &&
      scorecard.publishDecisionMatch >= thresholds.publishDecisionMatch &&
      scorecard.numericToleranceMatch >= thresholds.numericToleranceMatch &&
      scorecard.criticalExactMatch >= thresholds.criticalExactMatch,
  };
}

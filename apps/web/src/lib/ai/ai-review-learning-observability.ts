const PII_PATTERN = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d\s().-]{7,}|\b\d{6}\/?\d{3,4}\b/gi;

export function maskAiReviewLearningLogValue(value: unknown): unknown {
  if (typeof value === "string") return value.replace(PII_PATTERN, "[masked]");
  if (Array.isArray(value)) return value.map(maskAiReviewLearningLogValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        maskAiReviewLearningLogValue(entry),
      ]),
    );
  }
  return value;
}

export function logAiReviewLearningEvent(event: string, payload: Record<string, unknown>): void {
  console.info("[ai-review-learning]", {
    event,
    ...(maskAiReviewLearningLogValue(payload) as Record<string, unknown>),
  });
}

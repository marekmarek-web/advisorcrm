/**
 * Phase 3 — event → usage bucket mapping (documentation for Fáze 4 wiring).
 *
 * | Product surface | Record via | Counter / notes |
 * |-----------------|------------|-----------------|
 * | Assistant chat turn (basic / multi-step, CRM actions) | `recordAssistantUsage` | `assistantActionsUsed` (+ optional tokens) |
 * | Image intake pipeline completion (`image-intake/*`) | `recordImageIntakeUsage` | `imageIntakesUsed` |
 * | Contract / document AI review pages processed | `recordAiReviewUsage` | `aiReviewPagesUsed` (page count) |
 * | AI review export PDF | optional: same as review or `recordAssistantUsage` if billed as action | TBD product — prefer `recordAiReviewUsage({ pages: 1 })` if export counts as review surface |
 * | Token usage (any LLM call) | pass `inputTokens` / `outputTokens` on any `record*` | `inputTokensUsed` / `outputTokensUsed`; `estimatedCost` optional |
 *
 * Observability: existing Sentry / structured logs stay; this table is **authoritative monthly rollups** for billing.
 */

export const USAGE_EVENT_NOTE = {
  assistantChatMessage: "recordAssistantUsage — one user-visible assistant action",
  imageIntakePipeline: "recordImageIntakeUsage — completed image intake job",
  contractReviewPages: "recordAiReviewUsage — pages processed in AI review",
  tokenAttribution: "Add inputTokens/outputTokens/estimatedCost on the closest record* call",
} as const;

/**
 * Assistant eval scenarios (Plan 5D.4).
 * Tests grounding, security, tenant isolation, fallback, and permission boundaries.
 */
import { describe, it, expect, vi } from "vitest";

const chainable = () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn().mockImplementation(self);
  chain.from = vi.fn().mockImplementation(self);
  chain.where = vi.fn().mockImplementation(self);
  chain.leftJoin = vi.fn().mockImplementation(self);
  chain.orderBy = vi.fn().mockImplementation(self);
  chain.limit = vi.fn().mockResolvedValue([]);
  chain.execute = vi.fn().mockResolvedValue({ rows: [] });
  chain.insert = vi.fn().mockImplementation(self);
  chain.values = vi.fn().mockImplementation(self);
  return chain;
};
vi.mock("db", () => ({
  db: chainable(),
  eq: vi.fn(), and: vi.fn(), isNull: vi.fn(), sql: vi.fn(), asc: vi.fn(), desc: vi.fn(),
  tasks: { contactId: "c", id: "id", tenantId: "t", completedAt: "ca", dueDate: "dd", title: "ti" },
  contacts: { id: "id", tenantId: "t", firstName: "fn", lastName: "ln", nextServiceDue: "nsd", email: "e", phone: "p" },
  contracts: {}, opportunities: { id: "id", tenantId: "t", title: "ti", expectedCloseDate: "ecd", contactId: "c", closedAt: "ca" },
  opportunityStages: {},
  contractUploadReviews: { id: "id", tenantId: "t", fileName: "fn", processingStatus: "ps", confidence: "c", createdAt: "ca", reviewStatus: "rs", extractionTrace: "et", extractedPayload: "ep", detectedDocumentType: "dt", matchedClientId: "mc", matchedClientCandidates: "mcc" },
  clientPaymentSetups: { id: "id", tenantId: "t", needsHumanReview: "nhr", productName: "pn", providerName: "pvn", contactId: "cid" },
  contractReviewCorrections: {},
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/openai", () => ({
  createResponseSafe: vi.fn().mockResolvedValue({ ok: true, text: "Máte 0 urgentních položek." }),
  logOpenAICall: vi.fn(),
}));
vi.mock("@/lib/client-ai-context", () => ({
  getClientAiContext: vi.fn().mockResolvedValue(null),
}));

describe("Urgent summary generation correctness", () => {
  it("returns structured response with required fields", async () => {
    const { routeAssistantMessage } = await import("../assistant-tool-router");
    const { getOrCreateSession } = await import("../assistant-session");
    const session = getOrCreateSession(undefined, "t1", "u1");
    const response = await routeAssistantMessage("Co je dnes urgentní?", session);
    expect(response).toHaveProperty("message");
    expect(response).toHaveProperty("referencedEntities");
    expect(response).toHaveProperty("suggestedActions");
    expect(response).toHaveProperty("warnings");
    expect(response).toHaveProperty("confidence");
    expect(response).toHaveProperty("sessionId");
  });
});

describe("Blocked payment explanation grounding", () => {
  it("follow-up suggestions include reason codes for blocked payments", async () => {
    const { generateFollowUpSuggestions, clearDedupeStore } = await import("../followup-recommendations");
    clearDedupeStore();
    const suggestions = generateFollowUpSuggestions({
      pendingReviews: [],
      blockedPayments: [{ id: "p1", contactId: "c1", title: "ČSOB", reasons: ["MISSING_IBAN", "NEEDS_REVIEW"] }],
      clientsWithoutFollowup: [],
      changeDocuments: [],
      readyForApply: [],
    });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].reasonCodes).toContain("MISSING_IBAN");
    expect(suggestions[0].description).toContain("MISSING_IBAN");
  });
});

describe("Review follow-up suggestion validity", () => {
  it("suggests action for old pending review", async () => {
    const { generateFollowUpSuggestions, clearDedupeStore } = await import("../followup-recommendations");
    clearDedupeStore();
    const suggestions = generateFollowUpSuggestions({
      pendingReviews: [{ id: "r1", fileName: "old.pdf", createdAt: new Date(), daysOld: 8 }],
      blockedPayments: [],
      clientsWithoutFollowup: [],
      changeDocuments: [],
      readyForApply: [],
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].type).toBe("review_waiting_too_long");
    expect(suggestions[0].suggestedAction).toBeTruthy();
  });
});

describe("Client summary data accuracy", () => {
  it("builds client context without crash when DB returns empty", async () => {
    const { buildClientDetailContext } = await import("../assistant-context-builder");
    const ctx = await buildClientDetailContext("t1", "c-nonexistent");
    expect(ctx.summaryText).toBeTruthy();
    expect(ctx.structuredFacts.length).toBeGreaterThan(0);
  });
});

describe("Communication draft grounding", () => {
  it("does not hallucinate data -- uses provided context only", async () => {
    const { generateCommunicationDraft } = await import("../communication-copilot");
    const draft = await generateCommunicationDraft("request_missing_data_email", {
      tenantId: "t1",
      clientName: "Jan Novák",
      missingFields: ["IBAN"],
    });
    expect(draft.body).toContain("IBAN");
    expect(draft.subject).toContain("Jan Novák");
    expect(draft.body).not.toContain("undefined");
  });
});

describe("Tool orchestration correctness", () => {
  it("parseModelToolCalls extracts correct tool from response", async () => {
    const { parseModelToolCalls } = await import("../assistant-tool-router");
    const calls = parseModelToolCalls('[TOOL:getClientSummary {"contactId": "c1"}]');
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("getClientSummary");
    expect(calls[0].params.contactId).toBe("c1");
  });

  it("tool name lookup is correct", async () => {
    const { getToolByName } = await import("../assistant-tools");
    expect(getToolByName("getDashboardSummary")).toBeDefined();
    expect(getToolByName("listBlockedReviews")).toBeDefined();
    expect(getToolByName("createTaskDraft")?.requiredPermission).toBe("assistant:create_draft");
  });
});

describe("Tenant isolation", () => {
  it("action guard blocks cross-tenant review access", async () => {
    const { validateActionExecution } = await import("../action-guards");
    const { buildActionPayload } = await import("../action-catalog");
    const action = buildActionPayload("prepare_contract_apply", "review", "r1");
    const result = validateActionExecution(action, {
      tenantId: "t1",
      userId: "u1",
      roleName: "Advisor",
      reviewRow: {
        tenantId: "OTHER_TENANT",
        reviewStatus: "approved",
        matchedClientId: "c1",
        matchedClientCandidates: [],
        processingStatus: "extracted",
        confidence: 0.9,
      },
    });
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain("TENANT_MISMATCH");
  });
});

describe("Permission boundaries", () => {
  it("Viewer cannot create drafts", async () => {
    const { canPerformAssistantAction } = await import("../assistant-permissions");
    expect(canPerformAssistantAction("Viewer", "create_draft").allowed).toBe(false);
    expect(canPerformAssistantAction("Viewer", "chat").allowed).toBe(true);
  });

  it("Advisor can create drafts but not approve them", async () => {
    const { canPerformAssistantAction } = await import("../assistant-permissions");
    expect(canPerformAssistantAction("Advisor", "create_draft").allowed).toBe(true);
    expect(canPerformAssistantAction("Advisor", "approve_draft").allowed).toBe(false);
  });

  it("Manager can approve drafts and override quality gates", async () => {
    const { canPerformAssistantAction } = await import("../assistant-permissions");
    expect(canPerformAssistantAction("Manager", "approve_draft").allowed).toBe(true);
    expect(canPerformAssistantAction("Manager", "override_quality_gates").allowed).toBe(true);
  });

  it("Admin has full access", async () => {
    const { getAllowedActions } = await import("../assistant-permissions");
    const actions = getAllowedActions("Admin");
    expect(actions).toContain("debug");
    expect(actions).toContain("run_evals");
    expect(actions).toContain("view_audit");
  });
});

describe("Deterministic fallback", () => {
  it("buildDeterministicSummary works without LLM", async () => {
    const { buildDeterministicSummary } = await import("../priority-scoring");
    const summary = buildDeterministicSummary([
      {
        type: "task", entityId: "t1", score: 0.9, severity: "high",
        title: "Urgentní úkol", description: "Po termínu",
        recommendedAction: "Dokončit",
      },
    ]);
    expect(summary).toContain("urgentních");
    expect(summary).toContain("Dokončit");
  });
});

describe("Security -- no sensitive data leaks", () => {
  it("sanitizeContext scrubs IBAN from context payload", async () => {
    const { sanitizeContext } = await import("../assistant-context-builder");
    const result = sanitizeContext({
      summaryText: "IBAN: CZ6508000000192000145399",
      structuredFacts: [{ key: "iban", value: "CZ6508000000192000145399", category: "payment" }],
      warnings: [],
      suggestedQuestions: [],
      recommendedActions: [],
      sourceReferences: [],
    });
    expect(result.summaryText).not.toContain("192000145399");
    expect(result.structuredFacts[0].value).not.toContain("192000145399");
  });

  it("audit masks sensitive fields", async () => {
    const { maskSensitive } = await import("../assistant-audit");
    const masked = maskSensitive({ iban: "CZ6508000000192000145399", name: "safe" });
    const obj = masked as Record<string, unknown>;
    expect(String(obj.iban)).not.toContain("192000145399");
    expect(obj.name).toBe("safe");
  });

  it("guard blocks unapproved review apply with no client", async () => {
    const { validateActionExecution } = await import("../action-guards");
    const { buildActionPayload } = await import("../action-catalog");
    const action = buildActionPayload("prepare_contract_apply", "review", "r1");
    const result = validateActionExecution(action, {
      tenantId: "t1",
      userId: "u1",
      roleName: "Advisor",
      reviewRow: {
        tenantId: "t1",
        reviewStatus: "pending",
        matchedClientId: null,
        matchedClientCandidates: [],
        processingStatus: "extracted",
        confidence: 0.9,
      },
    });
    expect(result.blockedReasons).toContain("NO_CLIENT_MATCH");
  });
});

describe("Automation recommendations", () => {
  it("recommends payment apply draft after approved review", async () => {
    const { getAutomationRecommendations } = await import("../automation-recommendations");
    const recs = getAutomationRecommendations({
      approvedReviewsWithPayment: [{ id: "r1", fileName: "test.pdf", applyReadiness: "ready_for_apply" }],
      reviewsWithMissingFields: [],
      longPendingReviews: [],
      blockedPayments: [],
      correctionSpikes: [],
    });
    expect(recs).toHaveLength(1);
    expect(recs[0].automationType).toBe("prepare_payment_apply_after_approved");
    expect(recs[0].executionMode).toBe("draft_only");
  });

  it("flags correction spikes", async () => {
    const { getAutomationRecommendations } = await import("../automation-recommendations");
    const recs = getAutomationRecommendations({
      approvedReviewsWithPayment: [],
      reviewsWithMissingFields: [],
      longPendingReviews: [],
      blockedPayments: [],
      correctionSpikes: [{ documentType: "life_insurance", correctionCount: 15, threshold: 10 }],
    });
    expect(recs).toHaveLength(1);
    expect(recs[0].automationType).toBe("highlight_correction_spike");
    expect(recs[0].riskLevel).toBe("high");
  });
});

describe("Notification engine dedup", () => {
  it("deduplicates notifications from urgentItems and followUp", async () => {
    const { generateNotificationItems } = await import("../notification-engine");
    const urgentItems = [
      { type: "review", entityId: "r1", score: 0.8, severity: "high" as const, title: "Review", description: "Pending" },
    ];
    const followUps = [
      {
        type: "review_waiting_too_long" as const, severity: "high" as const, title: "Review čeká", description: "Pending",
        entityLinks: [{ type: "review", id: "r1" }], suggestedAction: "Open", reasonCodes: ["PENDING"],
      },
    ];
    const notifications = generateNotificationItems(urgentItems, followUps);
    const reviewNotifs = notifications.filter((n) =>
      n.entityLinks.some((e) => e.id === "r1")
    );
    expect(reviewNotifs.length).toBe(1);
  });
});

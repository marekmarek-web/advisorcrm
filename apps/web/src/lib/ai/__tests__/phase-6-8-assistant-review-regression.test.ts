/**
 * Phase 6 + 8 regression: assistant/review bridge, context safety, multi-client,
 * write safety, publish-hints gating, no debug leakage.
 *
 * All tests run without LLM / DB calls.
 * Run: pnpm test:ai (or pnpm vitest)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// DB mock (chainable builder pattern, returns empty arrays by default)
// ---------------------------------------------------------------------------
const { mockChainable } = vi.hoisted(() => {
  const chainable = () => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = vi.fn().mockImplementation(self);
    chain.from = vi.fn().mockImplementation(self);
    chain.where = vi.fn().mockImplementation(self);
    chain.limit = vi.fn().mockResolvedValue([]);
    chain.orderBy = vi.fn().mockImplementation(self);
    chain.insert = vi.fn().mockImplementation(self);
    chain.values = vi.fn().mockImplementation(self);
    return chain;
  };
  return { mockChainable: chainable };
});

vi.mock("db", () => ({
  db: mockChainable(),
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  desc: vi.fn(),
  sql: vi.fn(),
  contacts: {},
  opportunities: {},
  documents: {},
  contractUploadReviews: {},
  clientPaymentSetups: {},
  contractReviewCorrections: {},
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import {
  getOrCreateSession,
  updateSessionContext,
  lockAssistantClient,
  clearAssistantClientLock,
  lockAssistantReview,
} from "../assistant-session";
import {
  buildPostUploadReviewPlan,
  type PostUploadReviewPlanOptions,
} from "../assistant-execution-plan";
import { verifyWriteContextSafety, verifyTenantConsistency } from "../assistant-context-safety";
import { emptyEntityResolution } from "../assistant-entity-resolution";
import {
  sanitizeAssistantMessageForAdvisor,
  sanitizeWarningForAdvisor,
} from "../assistant-message-sanitizer";

const TENANT = "t1";
const USER = "u1";
const CLIENT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CLIENT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const REVIEW_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function resolutionWithClient(clientId = CLIENT_A) {
  return {
    ...emptyEntityResolution(),
    client: {
      entityType: "contact" as const,
      entityId: clientId,
      displayLabel: "Test Klient",
      confidence: 1.0,
      ambiguous: false,
      alternatives: [],
    },
  };
}

function resolutionAmbiguous() {
  return {
    ...emptyEntityResolution(),
    client: {
      entityType: "contact" as const,
      entityId: CLIENT_A,
      displayLabel: "Jan Novák",
      confidence: 0.6,
      ambiguous: true,
      alternatives: [{ id: CLIENT_B, label: "Jana Nováková" }],
    },
  };
}

function makeSession() {
  return getOrCreateSession(undefined, TENANT, USER);
}

// ---------------------------------------------------------------------------
// Scenario S01: Upload review → session picks up reviewId from activeContext
// ---------------------------------------------------------------------------
describe("S01 — review context wired via activeContext", () => {
  it("lockAssistantReview sets lockedReviewId on both session fields", () => {
    const s = makeSession();
    lockAssistantReview(s, REVIEW_ID);
    expect(s.activeReviewId).toBe(REVIEW_ID);
    expect(s.contextLock.lockedReviewId).toBe(REVIEW_ID);
  });

  it("updateSessionContext with reviewId sets activeReviewId", () => {
    const s = makeSession();
    updateSessionContext(s, { reviewId: REVIEW_ID });
    expect(s.activeReviewId).toBe(REVIEW_ID);
    expect(s.contextLock.lockedReviewId).toBe(REVIEW_ID);
  });
});

// ---------------------------------------------------------------------------
// Scenario S02: Post-upload plan with no publish hints → all steps ready
// ---------------------------------------------------------------------------
describe("S02 — post-upload plan: no publish hints → full approval plan", () => {
  it("creates 3 steps with requires_confirmation status", () => {
    const s = makeSession();
    const plan = buildPostUploadReviewPlan(s, REVIEW_ID);
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps.every((st) => st.status === "requires_confirmation" || st.status === "needs_input")).toBe(true);
  });

  it("tenantId is set on plan", () => {
    const s = makeSession();
    const plan = buildPostUploadReviewPlan(s, REVIEW_ID);
    expect(plan.tenantId).toBe(TENANT);
  });
});

// ---------------------------------------------------------------------------
// Scenario S03: Post-upload plan with contractPublishable=false
// ---------------------------------------------------------------------------
describe("S03 — post-upload plan: publishHints.contractPublishable=false → apply step needs_input", () => {
  const opts: PostUploadReviewPlanOptions = {
    publishHints: {
      contractPublishable: false,
      reasons: ["modelation_only"],
    },
  };

  it("apply step status is needs_input", () => {
    const s = makeSession();
    const plan = buildPostUploadReviewPlan(s, REVIEW_ID, opts);
    const applyStep = plan.steps.find((st) => st.action === "applyAiContractReviewToCrm");
    expect(applyStep?.status).toBe("needs_input");
  });

  it("approve and link steps remain requires_confirmation", () => {
    const s = makeSession();
    const plan = buildPostUploadReviewPlan(s, REVIEW_ID, opts);
    const applyStep = plan.steps.find((st) => st.action === "applyAiContractReviewToCrm");
    const approveStep = plan.steps.find((st) => st.action === "approveAiContractReview");
    const linkStep = plan.steps.find((st) => st.action === "linkAiContractReviewToDocuments");
    expect(approveStep?.status).toBe("requires_confirmation");
    expect(linkStep?.status).toBe("requires_confirmation");
    expect(applyStep?.status).toBe("needs_input");
  });

  it("apply step result carries blocked reason message", () => {
    const s = makeSession();
    const plan = buildPostUploadReviewPlan(s, REVIEW_ID, opts);
    const applyStep = plan.steps.find((st) => st.action === "applyAiContractReviewToCrm");
    const result = applyStep?.result as Record<string, unknown> | null;
    expect(result?.status).toBe("needs_input");
    expect(typeof result?.message).toBe("string");
    expect(String(result?.message)).toContain("modelation_only");
  });
});

// ---------------------------------------------------------------------------
// Scenario S04: sensitiveAttachmentOnly=true → apply blocked
// ---------------------------------------------------------------------------
describe("S04 — post-upload plan: sensitiveAttachmentOnly=true → apply needs_input", () => {
  it("apply step is needs_input when sensitiveAttachmentOnly", () => {
    const s = makeSession();
    const plan = buildPostUploadReviewPlan(s, REVIEW_ID, {
      publishHints: { sensitiveAttachmentOnly: true },
    });
    const applyStep = plan.steps.find((st) => st.action === "applyAiContractReviewToCrm");
    expect(applyStep?.status).toBe("needs_input");
  });
});

// ---------------------------------------------------------------------------
// Scenario S05: Multi-client — different client in activeContext clears lock
// ---------------------------------------------------------------------------
describe("S05 — multi-client: URL context switches clear lock + plan", () => {
  it("lock cleared and plan wiped when new clientId differs", () => {
    const s = makeSession();
    lockAssistantClient(s, CLIENT_A);
    s.lastExecutionPlan = buildPostUploadReviewPlan(s, REVIEW_ID);

    updateSessionContext(s, { clientId: CLIENT_B });
    expect(s.lockedClientId).toBeUndefined();
    expect(s.lastExecutionPlan).toBeUndefined();
    expect(s.activeClientId).toBe(CLIENT_B);
  });

  it("disambiguation flag is cleared when lock is cleared", () => {
    const s = makeSession();
    lockAssistantClient(s, CLIENT_A);
    s.pendingClientDisambiguation = true;
    clearAssistantClientLock(s);
    expect(s.pendingClientDisambiguation).toBe(false);
    expect(s.lockedClientId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Scenario S06: Multi-client — explicit lock-same-client does not warn
// ---------------------------------------------------------------------------
describe("S06 — multi-client: same client does not generate mismatch warning", () => {
  it("no warning when activeContext.clientId === lockedClientId", () => {
    const s = makeSession();
    lockAssistantClient(s, CLIENT_A);
    const warnings = updateSessionContext(s, { clientId: CLIENT_A });
    expect(warnings).toHaveLength(0);
    expect(s.lockedClientId).toBe(CLIENT_A);
  });
});

// ---------------------------------------------------------------------------
// Scenario S07: No client → write is blocked
// ---------------------------------------------------------------------------
describe("S07 — write safety: no client → NO_CLIENT_FOR_WRITE", () => {
  it("blocks write plan without resolved client", () => {
    const s = makeSession();
    const plan = buildPostUploadReviewPlan(s, REVIEW_ID);
    // Force a write step that requires a contact
    plan.steps.push({
      stepId: "step_extra",
      action: "createTask",
      params: { title: "Test task" },
      label: "Vytvořit úkol",
      requiresConfirmation: true,
      isReadOnly: false,
      dependsOn: [],
      status: "requires_confirmation",
      result: null,
    });

    const verdict = verifyWriteContextSafety(s, emptyEntityResolution(), plan);
    expect(verdict.safe).toBe(false);
    expect(verdict.blockedReason).toBe("NO_CLIENT_FOR_WRITE");
  });
});

// ---------------------------------------------------------------------------
// Scenario S08: Ambiguous client → write blocked
// ---------------------------------------------------------------------------
describe("S08 — write safety: ambiguous client → AMBIGUOUS_CLIENT", () => {
  it("blocks write when client is ambiguous", () => {
    const s = makeSession();
    const plan = buildPostUploadReviewPlan(s, REVIEW_ID);
    plan.steps.push({
      stepId: "step_write",
      action: "createNote",
      params: {},
      label: "Poznámka",
      requiresConfirmation: false,
      isReadOnly: false,
      dependsOn: [],
      status: "requires_confirmation",
      result: null,
    });

    const verdict = verifyWriteContextSafety(s, resolutionAmbiguous(), plan);
    expect(verdict.safe).toBe(false);
    expect(verdict.blockedReason).toBe("AMBIGUOUS_CLIENT");
  });
});

// ---------------------------------------------------------------------------
// Scenario S09: Review lock mismatch → REVIEW_LOCK_MISMATCH
// ---------------------------------------------------------------------------
describe("S09 — write safety: review lock mismatch → REVIEW_LOCK_MISMATCH", () => {
  it("blocks approve step targeting a different reviewId than locked", () => {
    const s = makeSession();
    lockAssistantReview(s, REVIEW_ID);
    const otherReviewId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    const plan = buildPostUploadReviewPlan(s, otherReviewId);

    const verdict = verifyWriteContextSafety(s, resolutionWithClient(), plan);
    expect(verdict.safe).toBe(false);
    expect(verdict.blockedReason).toBe("REVIEW_LOCK_MISMATCH");
  });
});

// ---------------------------------------------------------------------------
// Scenario S10: verifyWriteContextSafety propagates needs_input message to warnings
// ---------------------------------------------------------------------------
describe("S10 — write safety: publishHints blocked step propagates warning", () => {
  it("verifyWriteContextSafety adds publish-hint reason to warnings", () => {
    const s = makeSession();
    const plan = buildPostUploadReviewPlan(s, REVIEW_ID, {
      publishHints: { contractPublishable: false, reasons: ["draft_only"] },
    });

    const verdict = verifyWriteContextSafety(s, resolutionWithClient(), plan);
    expect(verdict.requiresConfirmation).toBe(true);
    expect(verdict.warnings.some((w) => w.includes("draft_only") || w.includes("publikovatel"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario S11: Tenant mismatch → plan rejected
// ---------------------------------------------------------------------------
describe("S11 — write safety: plan tenant mismatch → blocked", () => {
  it("rejects plan with different tenantId", () => {
    const s = makeSession(); // TENANT = "t1"
    const plan = buildPostUploadReviewPlan(s, REVIEW_ID);
    plan.tenantId = "other-tenant";

    const verdict = verifyTenantConsistency(s, plan);
    expect(verdict.safe).toBe(false);
    expect(verdict.blockedReason).toBe("PLAN_TENANT_MISMATCH");
  });
});

// ---------------------------------------------------------------------------
// Scenario S12: UI sanitizer strips Phase 2+3 canonical field debug lines
// ---------------------------------------------------------------------------
describe("S12 — sanitizer: strips Phase 2+3 debug lines from model output", () => {
  it("removes packetMeta: ... lines from response", () => {
    const raw = "Smlouva byla zpracována.\npacketMeta: { isBundle: true }\nMůžete pokračovat.";
    const clean = sanitizeAssistantMessageForAdvisor(raw);
    expect(clean).not.toContain("packetMeta:");
    expect(clean).toContain("Smlouva byla zpracována.");
    expect(clean).toContain("Můžete pokračovat.");
  });

  it("removes publishHints: ... lines", () => {
    const raw = "publishHints: { contractPublishable: false }\nSmlouva je modelace.";
    const clean = sanitizeAssistantMessageForAdvisor(raw);
    expect(clean).not.toContain("publishHints:");
    expect(clean).toContain("Smlouva je modelace.");
  });

  it("removes participants: ... lines", () => {
    const raw = "participants: [{fullName: 'Jan', role: 'policyholder'}]\nOsoba identifikována.";
    const clean = sanitizeAssistantMessageForAdvisor(raw);
    expect(clean).not.toContain("participants:");
  });

  it("removes insuredRisks: ... lines", () => {
    const raw = "insuredRisks: [{riskType: 'death', insuredAmount: 1000000}]\nRizika nalezena.";
    const clean = sanitizeAssistantMessageForAdvisor(raw);
    expect(clean).not.toContain("insuredRisks:");
  });

  it("strips raw UUID from response", () => {
    const raw = `Klient ${CLIENT_A} byl nalezen.`;
    const clean = sanitizeAssistantMessageForAdvisor(raw);
    expect(clean).not.toContain(CLIENT_A);
    expect(clean).toContain("Klient");
  });
});

// ---------------------------------------------------------------------------
// Scenario S13: Sanitizer strips inline UUID from warnings
// ---------------------------------------------------------------------------
describe("S13 — sanitizer: warning sanitizer strips UUIDs and bracket markers", () => {
  it("removes UUID from warning", () => {
    const w = sanitizeWarningForAdvisor(`Review ${REVIEW_ID} je blokované.`);
    expect(w).not.toContain(REVIEW_ID);
  });

  it("removes [client:uuid] entity refs", () => {
    const w = sanitizeWarningForAdvisor(`Klient [client:${CLIENT_A}] je nejednoznačný.`);
    expect(w).not.toContain(CLIENT_A);
    expect(w).toContain("Klient");
  });
});

// ---------------------------------------------------------------------------
// Scenario S14: clearAssistantClientLock resets all entity locks
// ---------------------------------------------------------------------------
describe("S14 — clearAssistantClientLock: full reset", () => {
  it("clears clientId, opportunityId, documentId, reviewId and disambiguation", () => {
    const s = makeSession();
    lockAssistantClient(s, CLIENT_A);
    lockAssistantReview(s, REVIEW_ID);
    s.lockedDocumentId = "doc-1";
    s.lockedOpportunityId = "opp-1";
    s.pendingClientDisambiguation = true;

    clearAssistantClientLock(s);

    expect(s.lockedClientId).toBeUndefined();
    expect(s.activeReviewId).toBeUndefined();
    expect(s.lockedDocumentId).toBeUndefined();
    expect(s.lockedOpportunityId).toBeUndefined();
    expect(s.pendingClientDisambiguation).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scenario S15: skipClientIdFromUi preserves lock + warns on conflict
// ---------------------------------------------------------------------------
describe("S15 — skipClientIdFromUi: explicit assistant lock respected", () => {
  it("keeps lock when skipClientIdFromUi=true, adds warning on conflict", () => {
    const s = makeSession();
    lockAssistantClient(s, CLIENT_A);
    const warnings = updateSessionContext(s, { clientId: CLIENT_B }, { skipClientIdFromUi: true });
    expect(s.lockedClientId).toBe(CLIENT_A);
    expect(warnings.some((w) => w.includes("zamčený"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario S16: Post-upload plan — review action steps carry reviewId param
// ---------------------------------------------------------------------------
describe("S16 — post-upload plan: reviewId param present on each review step", () => {
  it("all three steps carry the reviewId param", () => {
    const s = makeSession();
    const plan = buildPostUploadReviewPlan(s, REVIEW_ID);
    for (const step of plan.steps) {
      expect(step.params.reviewId).toBe(REVIEW_ID);
    }
  });
});

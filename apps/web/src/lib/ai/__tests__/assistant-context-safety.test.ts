/**
 * Phase 2B: unit tests for context safety guards.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/audit", () => ({ logAuditAction: vi.fn() }));

import { verifyWriteContextSafety, verifyTenantConsistency, hasActiveLock } from "../assistant-context-safety";
import {
  getOrCreateSession,
  lockAssistantClient,
  lockAssistantOpportunity,
  lockAssistantDocument,
  lockAssistantReview,
} from "../assistant-session";
import type { EntityResolutionResult } from "../assistant-entity-resolution";
import type { ExecutionPlan } from "../assistant-domain-model";

const TENANT = "t-1";
const USER = "u-1";
const CLIENT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CLIENT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const OPP_A = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const OPP_B = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const DOC_A = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const DOC_B = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const REV_A = "11111111-1111-1111-1111-111111111111";
const REV_B = "22222222-2222-2222-2222-222222222222";

function makePlan(contactId: string | null, hasWriteSteps = true): ExecutionPlan {
  return {
    planId: "plan_test",
    intentType: "create_task",
    productDomain: null,
    contactId,
    opportunityId: null,
    steps: hasWriteSteps ? [{
      stepId: "s1",
      action: "createTask",
      params: { contactId },
      label: "Vytvořit úkol",
      requiresConfirmation: true,
      isReadOnly: false,
      dependsOn: [],
      status: "requires_confirmation",
      result: null,
    }] : [],
    status: "awaiting_confirmation",
    createdAt: new Date(),
  };
}

function makeResolution(clientId?: string, ambiguous = false, confidence = 1.0): EntityResolutionResult {
  return {
    client: clientId ? {
      entityType: "contact",
      entityId: clientId,
      displayLabel: "Test",
      confidence,
      ambiguous,
      alternatives: ambiguous ? [{ id: "alt-1", label: "Alt klient" }] : [],
    } : null,
    opportunity: null,
    document: null,
    contract: null,
    warnings: [],
  };
}

describe("verifyWriteContextSafety", () => {
  it("is safe when client matches locked context", () => {
    const session = getOrCreateSession(undefined, TENANT, USER);
    lockAssistantClient(session, CLIENT_A);
    const verdict = verifyWriteContextSafety(session, makeResolution(CLIENT_A), makePlan(CLIENT_A));
    expect(verdict.safe).toBe(true);
    expect(verdict.blockedReason).toBeNull();
  });

  it("blocks when no client is resolved for write plan", () => {
    const session = getOrCreateSession(undefined, TENANT, USER);
    const verdict = verifyWriteContextSafety(session, makeResolution(), makePlan(null));
    expect(verdict.safe).toBe(false);
    expect(verdict.blockedReason).toBe("NO_CLIENT_FOR_WRITE");
  });

  it("blocks when client is ambiguous", () => {
    const session = getOrCreateSession(undefined, TENANT, USER);
    const verdict = verifyWriteContextSafety(session, makeResolution(CLIENT_A, true), makePlan(CLIENT_A));
    expect(verdict.safe).toBe(false);
    expect(verdict.blockedReason).toBe("AMBIGUOUS_CLIENT");
  });

  it("requires confirmation for cross-client mismatch", () => {
    const session = getOrCreateSession(undefined, TENANT, USER);
    lockAssistantClient(session, CLIENT_A);
    const verdict = verifyWriteContextSafety(session, makeResolution(CLIENT_B), makePlan(CLIENT_B));
    expect(verdict.safe).toBe(true);
    expect(verdict.requiresConfirmation).toBe(true);
    expect(verdict.warnings.some(w => w.includes("jiný klient"))).toBe(true);
  });

  it("requires confirmation for low-confidence client", () => {
    const session = getOrCreateSession(undefined, TENANT, USER);
    const verdict = verifyWriteContextSafety(session, makeResolution(CLIENT_A, false, 0.4), makePlan(CLIENT_A));
    expect(verdict.safe).toBe(true);
    expect(verdict.requiresConfirmation).toBe(true);
  });

  it("blocks when plan contactId mismatches resolved client", () => {
    const session = getOrCreateSession(undefined, TENANT, USER);
    const verdict = verifyWriteContextSafety(session, makeResolution(CLIENT_A), makePlan(CLIENT_B));
    expect(verdict.safe).toBe(false);
    expect(verdict.blockedReason).toBe("PLAN_CLIENT_MISMATCH");
  });

  it("blocks when plan opportunityId mismatches locked opportunity", () => {
    const session = getOrCreateSession(undefined, TENANT, USER);
    lockAssistantOpportunity(session, OPP_A);
    const plan = makePlan(CLIENT_A);
    plan.steps = [{
      stepId: "s1",
      action: "updateOpportunity",
      params: { opportunityId: OPP_B, contactId: CLIENT_A },
      label: "Update",
      requiresConfirmation: true,
      isReadOnly: false,
      dependsOn: [],
      status: "requires_confirmation",
      result: null,
    }];
    const verdict = verifyWriteContextSafety(session, makeResolution(CLIENT_A), plan);
    expect(verdict.safe).toBe(false);
    expect(verdict.blockedReason).toBe("OPPORTUNITY_LOCK_MISMATCH");
  });

  it("blocks when reviewId mismatches locked review", () => {
    const session = getOrCreateSession(undefined, TENANT, USER);
    lockAssistantReview(session, REV_A);
    const plan = makePlan(CLIENT_A);
    plan.steps = [{
      stepId: "s1",
      action: "applyAiContractReviewToCrm",
      params: { reviewId: REV_B, contactId: CLIENT_A },
      label: "Apply review",
      requiresConfirmation: true,
      isReadOnly: false,
      dependsOn: [],
      status: "requires_confirmation",
      result: null,
    }];
    const verdict = verifyWriteContextSafety(session, makeResolution(CLIENT_A), plan);
    expect(verdict.safe).toBe(false);
    expect(verdict.blockedReason).toBe("REVIEW_LOCK_MISMATCH");
  });

  it("blocks when documentId mismatches locked document", () => {
    const session = getOrCreateSession(undefined, TENANT, USER);
    lockAssistantDocument(session, DOC_A);
    const plan = makePlan(CLIENT_A);
    plan.steps = [{
      stepId: "s1",
      action: "classifyDocument",
      params: { documentId: DOC_B, contactId: CLIENT_A },
      label: "Classify",
      requiresConfirmation: true,
      isReadOnly: false,
      dependsOn: [],
      status: "requires_confirmation",
      result: null,
    }];
    const verdict = verifyWriteContextSafety(session, makeResolution(CLIENT_A), plan);
    expect(verdict.safe).toBe(false);
    expect(verdict.blockedReason).toBe("DOCUMENT_LOCK_MISMATCH");
  });
});

describe("verifyTenantConsistency", () => {
  it("allows legacy plans without tenantId", () => {
    const session = getOrCreateSession(undefined, TENANT, USER);
    const plan = makePlan(CLIENT_A);
    expect(verifyTenantConsistency(session, plan).safe).toBe(true);
  });

  it("blocks when plan.tenantId differs from session", () => {
    const session = getOrCreateSession(undefined, TENANT, USER);
    const plan = { ...makePlan(CLIENT_A), tenantId: "other-tenant" };
    const v = verifyTenantConsistency(session, plan);
    expect(v.safe).toBe(false);
    expect(v.blockedReason).toBe("PLAN_TENANT_MISMATCH");
  });

  it("passes when tenant matches", () => {
    const session = getOrCreateSession(undefined, TENANT, USER);
    const plan = { ...makePlan(CLIENT_A), tenantId: TENANT };
    expect(verifyTenantConsistency(session, plan).safe).toBe(true);
  });
});

describe("hasActiveLock", () => {
  it("returns true for locked client", () => {
    const session = getOrCreateSession(undefined, TENANT, USER);
    lockAssistantClient(session, CLIENT_A);
    expect(hasActiveLock(session, "client", CLIENT_A)).toBe(true);
    expect(hasActiveLock(session, "client", CLIENT_B)).toBe(false);
  });

  it("returns true for locked review (activeReviewId or contextLock)", () => {
    const session = getOrCreateSession(undefined, TENANT, USER);
    lockAssistantReview(session, REV_A);
    expect(hasActiveLock(session, "review", REV_A)).toBe(true);
    expect(hasActiveLock(session, "review", REV_B)).toBe(false);
  });
});

/**
 * H7: confirm must not run for wrong client; double-submit is serialized.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h7ConfirmHoisted = vi.hoisted(() => ({
  executePlanMock: vi.fn(),
  chainableDb: () => {
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
    chain.values = vi.fn().mockResolvedValue(undefined);
    return chain;
  },
}));

vi.mock("../assistant-execution-engine", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../assistant-execution-engine")>();
  return {
    ...mod,
    executePlan: (...args: Parameters<typeof mod.executePlan>) => h7ConfirmHoisted.executePlanMock(...args),
  };
});

vi.mock("../assistant-crm-writes", () => ({
  executeMortgageDealAndFollowUpTask: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/openai", () => ({
  createResponseSafe: vi.fn().mockResolvedValue({ ok: true, text: "" }),
  logOpenAICall: vi.fn(),
}));
vi.mock("@/lib/client-ai-context", () => ({
  getClientAiContext: vi.fn().mockResolvedValue(null),
}));
vi.mock("../assistant-intent-extract", () => ({
  extractAssistantIntent: vi.fn().mockResolvedValue({
    actions: ["general_chat"],
    switchClient: false,
    clientRef: null,
    amount: null,
    ltv: null,
    purpose: null,
    bank: null,
    rateGuess: null,
    noEmail: false,
    dueDateText: null,
  }),
  extractCanonicalIntent: vi.fn(),
}));
vi.mock("db", () => ({
  db: h7ConfirmHoisted.chainableDb(),
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  sql: vi.fn(),
  asc: vi.fn(),
  desc: vi.fn(),
  tasks: { contactId: "c", id: "id", tenantId: "t", completedAt: "ca", dueDate: "dd", title: "ti" },
  contacts: { id: "id", tenantId: "t", firstName: "fn", lastName: "ln", nextServiceDue: "nsd", email: "e", phone: "p" },
  contracts: {},
  opportunities: { id: "id", tenantId: "t", title: "ti", expectedCloseDate: "ecd", contactId: "c", closedAt: "ca" },
  opportunityStages: {},
  contractUploadReviews: {
    id: "id",
    tenantId: "t",
    fileName: "fn",
    processingStatus: "ps",
    confidence: "c",
    createdAt: "ca",
    reviewStatus: "rs",
    extractionTrace: "et",
    extractedPayload: "ep",
    detectedDocumentType: "dt",
    matchedClientId: "mc",
    matchedClientCandidates: "mcc",
  },
  clientPaymentSetups: { id: "id", tenantId: "t", needsHumanReview: "nhr", productName: "pn", providerName: "pvn" },
  contractReviewCorrections: {},
  documents: {},
  executionActions: {},
}));

import { handleAssistantAwaitingConfirmation } from "../assistant-tool-router";
import { getOrCreateSession, lockAssistantClient } from "../assistant-session";
import type { ExecutionPlan } from "../assistant-domain-model";

const CONTACT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CONTACT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function minimalAwaitingPlan(overrides: Partial<ExecutionPlan> = {}): ExecutionPlan {
  return {
    planId: "plan-h7",
    intentType: "general_chat",
    productDomain: null,
    contactId: CONTACT_A,
    opportunityId: null,
    steps: [
      {
        stepId: "step-1",
        action: "createTask",
        params: { contactId: CONTACT_A, taskTitle: "t" },
        label: "Úkol",
        requiresConfirmation: true,
        isReadOnly: false,
        dependsOn: [],
        status: "requires_confirmation",
        result: null,
      },
    ],
    status: "awaiting_confirmation",
    createdAt: new Date(),
    ...overrides,
  };
}

describe("H7 handleAssistantAwaitingConfirmation", () => {
  const ctx = { tenantId: "t1", userId: "u1", roleName: "Advisor" as const };

  beforeEach(() => {
    h7ConfirmHoisted.executePlanMock.mockReset();
    h7ConfirmHoisted.executePlanMock.mockImplementation(async (plan: ExecutionPlan) => ({
      ...plan,
      status: "completed" as const,
      steps: plan.steps.map((s) => ({
        ...s,
        status: "succeeded" as const,
        result: {
          ok: true,
          outcome: "executed" as const,
          entityId: "e1",
          entityType: "task",
          warnings: [],
          error: null,
        },
      })),
    }));
  });

  it("does not execute when plan.contactId mismatches locked client (H7.5)", async () => {
    const session = getOrCreateSession("sess-h7-mismatch", "t1", "u1");
    lockAssistantClient(session, CONTACT_B);
    session.lastExecutionPlan = minimalAwaitingPlan({ contactId: CONTACT_A });

    const out = await handleAssistantAwaitingConfirmation(session, { cancel: false }, ctx);

    expect(h7ConfirmHoisted.executePlanMock).not.toHaveBeenCalled();
    expect(session.lastExecutionPlan).toBeUndefined();
    expect(out?.message).toMatch(/jinému klientovi|bezpečnostních důvodů/i);
  });

  it("second concurrent confirm returns wait message and executePlan runs once (H7.8)", async () => {
    const session = getOrCreateSession("sess-h7-dup", "t1", "u1");
    lockAssistantClient(session, CONTACT_A);
    session.lastExecutionPlan = minimalAwaitingPlan();

    let release!: (value: ExecutionPlan) => void;
    const barrier = new Promise<ExecutionPlan>((resolve) => {
      release = resolve;
    });
    h7ConfirmHoisted.executePlanMock.mockReturnValueOnce(barrier);

    const first = handleAssistantAwaitingConfirmation(session, { cancel: false }, ctx);
    const second = await handleAssistantAwaitingConfirmation(session, { cancel: false }, ctx);

    expect(second?.message).toMatch(/Potvrzení se právě provádí/i);
    expect(h7ConfirmHoisted.executePlanMock).toHaveBeenCalledTimes(1);

    const done: ExecutionPlan = {
      ...minimalAwaitingPlan(),
      status: "completed",
      steps: minimalAwaitingPlan().steps.map((s) => ({
        ...s,
        status: "succeeded",
        result: {
          ok: true,
          outcome: "executed" as const,
          entityId: "e-done",
          entityType: "task",
          warnings: [],
          error: null,
        },
      })),
    };
    release(done);

    await first;
  });
});

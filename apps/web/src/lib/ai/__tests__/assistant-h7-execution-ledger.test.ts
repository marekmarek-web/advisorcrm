/**
 * H7: execution_actions ledger insert on success; graceful skip when table missing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../assistant-write-adapters", () => ({
  registerAssistantWriteAdapters: vi.fn(),
}));

const ledgerValuesSpy = vi.fn().mockResolvedValue(undefined);
let limitImpl: () => Promise<unknown> = () => Promise.resolve([]);

vi.mock("db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => limitImpl()),
    insert: vi.fn().mockReturnValue({ values: (...args: unknown[]) => ledgerValuesSpy(...args) }),
  },
  eq: vi.fn(),
  and: vi.fn(),
  executionActions: { tenantId: "t", actionType: "a", sourceId: "s", status: "st", resultPayload: "rp", id: "id" },
}));

import { db } from "db";
import {
  executePlan,
  registerWriteAdapter,
  resetExecutionActionsTableAvailabilityForTests,
} from "../assistant-execution-engine";
import type { ExecutionPlan } from "../assistant-domain-model";

const CONTACT = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function confirmedPlan(): ExecutionPlan {
  return {
    planId: "ledger-plan",
    intentType: "general_chat",
    productDomain: null,
    contactId: CONTACT,
    opportunityId: null,
    steps: [
      {
        stepId: "st-ledger-1",
        action: "createTask",
        params: { contactId: CONTACT, taskTitle: "H7" },
        label: "Úkol",
        requiresConfirmation: true,
        isReadOnly: false,
        dependsOn: [],
        status: "confirmed",
        result: null,
      },
    ],
    status: "executing",
    createdAt: new Date(),
  };
}

describe("H7 execution_actions ledger", () => {
  const ctx = { tenantId: "t-ledger", userId: "u-ledger", sessionId: "sess-ledger", roleName: "Advisor" };

  beforeEach(() => {
    resetExecutionActionsTableAvailabilityForTests();
    limitImpl = () => Promise.resolve([]);
    ledgerValuesSpy.mockClear();
    vi.mocked(db.select).mockClear();
    vi.mocked(db.insert).mockClear();
    registerWriteAdapter("createTask", async () => ({
      ok: true,
      outcome: "executed",
      entityId: "task-h7",
      entityType: "task",
      warnings: [],
      error: null,
    }));
  });

  it("calls db.insert into ledger when execution succeeds (H7.6)", async () => {
    const out = await executePlan(confirmedPlan(), ctx);
    expect(out.status).toBe("completed");
    expect(out.steps[0]?.status).toBe("succeeded");
    expect(ledgerValuesSpy).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
  });

  it("completes step when execution_actions relation is missing (degraded mode)", async () => {
    limitImpl = () =>
      Promise.reject(new Error('relation "execution_actions" does not exist'));

    const out = await executePlan(confirmedPlan(), ctx);
    expect(out.status).toBe("completed");
    expect(out.steps[0]?.status).toBe("succeeded");
    expect(out.steps[0]?.result?.ok).toBe(true);
  });
});

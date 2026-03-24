import { describe, it, expect } from "vitest";
import { validateActionExecution, type ActionGuardContext } from "../action-guards";
import { buildActionPayload } from "../action-catalog";

function baseCtx(overrides?: Partial<ActionGuardContext>): ActionGuardContext {
  return {
    tenantId: "t1",
    userId: "u1",
    roleName: "Advisor",
    ...overrides,
  };
}

describe("validateActionExecution", () => {
  it("allows simple open_review for Advisor", () => {
    const action = buildActionPayload("open_review", "review", "r1");
    const result = validateActionExecution(action, baseCtx());
    expect(result.allowed).toBe(true);
    expect(result.blockedReasons).toEqual([]);
  });

  it("blocks Viewer from creating drafts", () => {
    const action = buildActionPayload("create_task_draft", "task", "t1");
    const result = validateActionExecution(action, baseCtx({ roleName: "Viewer" }));
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain("INSUFFICIENT_PERMISSION");
  });

  it("blocks Client from apply actions", () => {
    const action = buildActionPayload("prepare_contract_apply", "review", "r1");
    const result = validateActionExecution(action, baseCtx({ roleName: "Client" }));
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain("INSUFFICIENT_PERMISSION");
  });

  it("blocks tenant mismatch", () => {
    const action = buildActionPayload("prepare_contract_apply", "review", "r1");
    const ctx = baseCtx({
      reviewRow: {
        tenantId: "OTHER_TENANT",
        reviewStatus: "approved",
        matchedClientId: "c1",
        matchedClientCandidates: [],
        processingStatus: "extracted",
        confidence: 0.9,
      },
    });
    const result = validateActionExecution(action, ctx);
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain("TENANT_MISMATCH");
  });

  it("blocks ambiguous client match", () => {
    const action = buildActionPayload("prepare_contract_apply", "review", "r1");
    const ctx = baseCtx({
      reviewRow: {
        tenantId: "t1",
        reviewStatus: "approved",
        matchedClientId: null,
        matchedClientCandidates: [{ id: "c1" }, { id: "c2" }],
        processingStatus: "extracted",
        confidence: 0.9,
      },
    });
    const result = validateActionExecution(action, ctx);
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain("AMBIGUOUS_CLIENT_MATCH");
    expect(result.requiredOverrides).toContain("select_client_candidate");
  });

  it("blocks no client match", () => {
    const action = buildActionPayload("prepare_contract_apply", "review", "r1");
    const ctx = baseCtx({
      reviewRow: {
        tenantId: "t1",
        reviewStatus: "approved",
        matchedClientId: null,
        matchedClientCandidates: [],
        processingStatus: "extracted",
        confidence: 0.9,
      },
    });
    const result = validateActionExecution(action, ctx);
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain("NO_CLIENT_MATCH");
  });

  it("blocks duplicate action", () => {
    const action = buildActionPayload("create_task_draft", "task", "t1", { _isDuplicate: true });
    const result = validateActionExecution(action, baseCtx());
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain("DUPLICATE_ACTION");
  });

  it("blocks auto_disabled execution mode", () => {
    const action = buildActionPayload("create_task_draft", "task", "t1", {}, {
      executionMode: "auto_disabled",
    });
    const result = validateActionExecution(action, baseCtx());
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain("AUTO_DISABLED");
  });

  it("allows Manager for apply actions", () => {
    const action = buildActionPayload("prepare_contract_apply", "review", "r1");
    const ctx = baseCtx({
      roleName: "Manager",
      reviewRow: {
        tenantId: "t1",
        reviewStatus: "approved",
        matchedClientId: "c1",
        matchedClientCandidates: [],
        processingStatus: "extracted",
        confidence: 0.9,
      },
    });
    const result = validateActionExecution(action, ctx);
    expect(result.allowed).toBe(true);
  });
});

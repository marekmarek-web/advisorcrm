import { describe, it, expect, beforeEach } from "vitest";
import { validateExecution, clearDedupStore, type GuardResult } from "../execution-guards";
import type { ExecutionAction, ExecutionContext } from "../execution-service";

function makeAction(overrides?: Partial<ExecutionAction>): ExecutionAction {
  return {
    executionId: "exec_1",
    sourceType: "user_action",
    sourceId: "src_1",
    actionType: "communication_send",
    executionMode: "manual_only",
    status: "executing",
    tenantId: "t1",
    riskLevel: "low",
    ...overrides,
  };
}

function makeCtx(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return { tenantId: "t1", userId: "u1", roleName: "Advisor", ...overrides };
}

beforeEach(() => clearDedupStore());

describe("validateExecution", () => {
  it("allows valid action", () => {
    const result = validateExecution(makeAction(), makeCtx());
    expect(result.allowed).toBe(true);
  });

  it("blocks tenant mismatch", () => {
    const result = validateExecution(makeAction({ tenantId: "other" }), makeCtx());
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain("TENANT_MISMATCH");
  });

  it("blocks Viewer from communication_send", () => {
    const result = validateExecution(makeAction(), makeCtx({ roleName: "Viewer" }));
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain("INSUFFICIENT_PERMISSION");
  });

  it("blocks non-Manager from escalation_emit", () => {
    const result = validateExecution(
      makeAction({ actionType: "escalation_emit" }),
      makeCtx({ roleName: "Advisor" }),
    );
    expect(result.allowed).toBe(false);
  });

  it("blocks quality gate failure for apply actions", () => {
    const result = validateExecution(
      makeAction({
        actionType: "portal_apply_execute",
        qualityGateSnapshot: { readiness: "blocked_for_apply", blockedReasons: ["LOW_CONFIDENCE"] },
      }),
      makeCtx(),
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain("LOW_CONFIDENCE");
  });

  it("blocks duplicate action within dedup window", () => {
    const action = makeAction({ sourceId: "dup_1" });
    validateExecution(action, makeCtx());
    const second = validateExecution(action, makeCtx());
    expect(second.allowed).toBe(false);
    expect(second.blockedReasons).toContain("DUPLICATE_ACTION");
  });

  it("blocks unsubscribed contact", () => {
    const result = validateExecution(
      makeAction({ metadata: { contactUnsubscribed: true } }),
      makeCtx(),
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain("CONTACT_UNSUBSCRIBED");
  });

  it("blocks missing email", () => {
    const result = validateExecution(
      makeAction({ metadata: { noEmail: true } }),
      makeCtx(),
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain("NO_EMAIL_ADDRESS");
  });

  it("blocks auto_disabled mode", () => {
    const result = validateExecution(
      makeAction({ executionMode: "auto_disabled" }),
      makeCtx(),
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain("AUTO_DISABLED");
  });
});

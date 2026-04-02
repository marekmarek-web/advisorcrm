import { describe, it, expect } from "vitest";
import {
  normalizeExecutionPlanFromDb,
  isResumableExecutionPlanStatus,
} from "../assistant-plan-snapshot";
import type { ExecutionPlan } from "../assistant-domain-model";

function minimalPlan(overrides: Partial<ExecutionPlan>): ExecutionPlan {
  return {
    planId: "plan-1",
    intentType: "create_task",
    productDomain: null,
    contactId: "00000000-0000-4000-8000-000000000001",
    opportunityId: null,
    steps: [],
    status: "awaiting_confirmation",
    createdAt: new Date("2026-01-15T10:00:00.000Z"),
    ...overrides,
  };
}

describe("assistant persistence helpers", () => {
  it("normalizeExecutionPlanFromDb parses ISO createdAt", () => {
    const raw = {
      planId: "p1",
      intentType: "create_task",
      productDomain: null,
      contactId: null,
      opportunityId: null,
      steps: [],
      status: "awaiting_confirmation",
      createdAt: "2026-01-15T10:00:00.000Z",
    };
    const p = normalizeExecutionPlanFromDb(raw);
    expect(p).not.toBeNull();
    expect(p!.createdAt).toBeInstanceOf(Date);
    expect(Number.isNaN(p!.createdAt.getTime())).toBe(false);
    expect(p!.status).toBe("awaiting_confirmation");
  });

  it("normalizeExecutionPlanFromDb returns null for invalid payload", () => {
    expect(normalizeExecutionPlanFromDb(null)).toBeNull();
    expect(normalizeExecutionPlanFromDb({})).toBeNull();
    expect(normalizeExecutionPlanFromDb({ planId: "x" })).toBeNull();
  });

  it("isResumableExecutionPlanStatus allows draft, awaiting_confirmation, executing", () => {
    expect(isResumableExecutionPlanStatus(minimalPlan({ status: "draft" }))).toBe(true);
    expect(isResumableExecutionPlanStatus(minimalPlan({ status: "awaiting_confirmation" }))).toBe(true);
    expect(isResumableExecutionPlanStatus(minimalPlan({ status: "executing" }))).toBe(true);
  });

  it("isResumableExecutionPlanStatus rejects terminal outcomes", () => {
    expect(isResumableExecutionPlanStatus(minimalPlan({ status: "completed" }))).toBe(false);
    expect(isResumableExecutionPlanStatus(minimalPlan({ status: "partial_failure" }))).toBe(false);
  });
});

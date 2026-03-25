import { describe, it, expect } from "vitest";
import {
  evaluateDueDatePolicy,
  createReminder,
  markDone,
  snoozeReminder,
  dismissReminder,
  convertToTask,
  reassignReminder,
  deduplicateReminders,
  DUE_DATE_POLICIES,
  type Reminder,
} from "../reminder-engine";

describe("evaluateDueDatePolicy", () => {
  it("returns null when below threshold", () => {
    expect(evaluateDueDatePolicy("pending_review", 10)).toBeNull();
  });

  it("triggers when above threshold", () => {
    const result = evaluateDueDatePolicy("pending_review", 80);
    expect(result).not.toBeNull();
    expect(result!.shouldCreate).toBe(true);
    expect(result!.severity).toBe("high");
  });

  it("has policies for all defined types", () => {
    expect(DUE_DATE_POLICIES.length).toBeGreaterThanOrEqual(7);
  });

  it("apply_ready_untouched triggers at 25h", () => {
    const r = evaluateDueDatePolicy("apply_ready_untouched", 25);
    expect(r?.severity).toBe("critical");
  });
});

function makeReminder(overrides?: Partial<Reminder>): Reminder {
  return {
    id: "rem_1",
    tenantId: "t1",
    reminderType: "pending_review",
    title: "Test",
    description: "Desc",
    dueAt: new Date(),
    severity: "medium",
    relatedEntityType: "review",
    relatedEntityId: "r1",
    suggestionOrigin: "rule",
    status: "pending",
    assignedTo: "u1",
    ...overrides,
  };
}

describe("reminder CRUD", () => {
  it("createReminder generates id and pending status", () => {
    const r = createReminder({
      tenantId: "t1",
      reminderType: "overdue_task",
      title: "Test",
      description: "D",
      dueAt: new Date(),
      severity: "high",
      relatedEntityType: "task",
      relatedEntityId: "task_1",
      assignedTo: "u1",
    });
    expect(r.id).toMatch(/^rem_/);
    expect(r.status).toBe("pending");
  });

  it("markDone sets status and resolvedAt", () => {
    const r = markDone(makeReminder());
    expect(r.status).toBe("done");
    expect(r.resolvedAt).toBeInstanceOf(Date);
  });

  it("snoozeReminder sets snoozedUntil", () => {
    const until = new Date(Date.now() + 86_400_000);
    const r = snoozeReminder(makeReminder(), until);
    expect(r.status).toBe("snoozed");
    expect(r.snoozedUntil).toBe(until);
  });

  it("dismissReminder sets dismissed", () => {
    const r = dismissReminder(makeReminder());
    expect(r.status).toBe("dismissed");
  });

  it("convertToTask returns converted reminder + task payload", () => {
    const { reminder, taskPayload } = convertToTask(makeReminder());
    expect(reminder.status).toBe("converted");
    expect(taskPayload.title).toBe("Test");
    expect(taskPayload.assignedTo).toBe("u1");
  });

  it("reassignReminder changes assignee", () => {
    const r = reassignReminder(makeReminder(), "u2");
    expect(r.assignedTo).toBe("u2");
  });
});

describe("deduplicateReminders", () => {
  it("removes duplicates by type+entityId", () => {
    const r1 = makeReminder({ id: "r1" });
    const r2 = makeReminder({ id: "r2" });
    const result = deduplicateReminders([r1, r2]);
    expect(result).toHaveLength(1);
  });

  it("keeps different types", () => {
    const r1 = makeReminder({ id: "r1", reminderType: "pending_review" });
    const r2 = makeReminder({ id: "r2", reminderType: "overdue_task" });
    const result = deduplicateReminders([r1, r2]);
    expect(result).toHaveLength(2);
  });
});

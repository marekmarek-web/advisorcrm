import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/email/send-email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ ok: true, messageId: "msg_123" }),
  logNotification: vi.fn(),
}));

const { sendEmailDraft } = await import("../email-delivery-adapter");
import type { ExecutionAction } from "../execution-service";

function makeAction(overrides?: Partial<ExecutionAction>): ExecutionAction {
  return {
    executionId: "exec_1",
    sourceType: "ai_draft",
    sourceId: "draft_1",
    actionType: "communication_send",
    executionMode: "approval_required",
    status: "executing",
    tenantId: "t1",
    riskLevel: "low",
    metadata: {
      recipientEmail: "jan@example.com",
      subject: "Test email",
      html: "<p>Hello</p>",
      contactId: "c1",
    },
    ...overrides,
  };
}

describe("sendEmailDraft", () => {
  it("sends email and returns success", async () => {
    const result = await sendEmailDraft(makeAction());
    expect(result.ok).toBe(true);
    expect(result.deliveryState).toBe("sent");
    expect(result.messageId).toBe("msg_123");
  });

  it("fails when no recipient email", async () => {
    const result = await sendEmailDraft(makeAction({ metadata: { subject: "Test", html: "<p>Hi</p>" } }));
    expect(result.ok).toBe(false);
    expect(result.error).toBe("NO_RECIPIENT_EMAIL");
  });

  it("fails when subject missing", async () => {
    const result = await sendEmailDraft(makeAction({ metadata: { recipientEmail: "a@b.com", html: "<p>Hi</p>" } }));
    expect(result.ok).toBe(false);
    expect(result.error).toBe("INCOMPLETE_DRAFT");
  });
});

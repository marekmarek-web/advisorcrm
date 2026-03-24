import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/openai", () => ({
  createResponseSafe: vi.fn().mockResolvedValue({ ok: false }),
}));

const { generateCommunicationDraft } = await import("../communication-copilot");
import type { CommunicationDraftType, DraftContext } from "../communication-copilot";

const baseCtx: DraftContext = {
  tenantId: "t1",
  contactId: "c1",
  clientName: "Jan Novák",
  advisorName: "Petr Poradce",
};

describe("generateCommunicationDraft", () => {
  const types: CommunicationDraftType[] = [
    "request_missing_data_email",
    "followup_after_upload",
    "followup_after_review",
    "payment_instruction_summary_email",
    "client_reminder_email",
    "contract_status_update_email",
    "internal_advisor_note",
    "internal_manager_summary",
  ];

  for (const type of types) {
    it(`generates draft for ${type}`, async () => {
      const draft = await generateCommunicationDraft(type, baseCtx);
      expect(draft.type).toBe(type);
      expect(draft.subject).toBeTruthy();
      expect(draft.body).toBeTruthy();
      expect(draft.draftId).toMatch(/^draft_/);
      expect(draft.status).toBe("draft");
      expect(draft.requiresHumanApproval).toBe(true);
    });
  }

  it("includes client name in subject", async () => {
    const draft = await generateCommunicationDraft("request_missing_data_email", baseCtx);
    expect(draft.subject).toContain("Jan Novák");
  });

  it("includes missing fields in body", async () => {
    const ctx: DraftContext = { ...baseCtx, missingFields: ["IBAN", "číslo smlouvy"] };
    const draft = await generateCommunicationDraft("request_missing_data_email", ctx);
    expect(draft.body).toContain("IBAN");
    expect(draft.body).toContain("číslo smlouvy");
  });

  it("includes review filename in body", async () => {
    const ctx: DraftContext = { ...baseCtx, reviewFileName: "smlouva_2025.pdf" };
    const draft = await generateCommunicationDraft("followup_after_upload", ctx);
    expect(draft.body).toContain("smlouva_2025.pdf");
  });

  it("includes blocked reasons in review followup", async () => {
    const ctx: DraftContext = { ...baseCtx, blockedReasons: ["LOW_CONFIDENCE"] };
    const draft = await generateCommunicationDraft("followup_after_review", ctx);
    expect(draft.body).toContain("LOW_CONFIDENCE");
  });

  it("references contact and review entities", async () => {
    const ctx: DraftContext = { ...baseCtx, reviewId: "rev1" };
    const draft = await generateCommunicationDraft("followup_after_review", ctx);
    expect(draft.referencedEntities).toContainEqual({ type: "client", id: "c1" });
    expect(draft.referencedEntities).toContainEqual({ type: "review", id: "rev1" });
  });

  it("uses template fallback when LLM unavailable", async () => {
    const draft = await generateCommunicationDraft("client_reminder_email", baseCtx);
    expect(draft.body).toContain("S pozdravem");
    expect(draft.body).toContain("Petr Poradce");
  });
});

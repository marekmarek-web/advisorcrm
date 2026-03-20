import { describe, it, expect, vi } from "vitest";
import { openReviewItem, createTaskDraft } from "../assistant-actions";

vi.mock("db", () => ({
  db: {},
  tasks: {},
  contacts: {},
  contracts: {},
  opportunities: {},
  opportunityStages: {},
  contractUploadReviews: {},
  companies: {},
  companyPersonLinks: {},
  eq: () => ({}),
  and: () => ({}),
  or: () => ({}),
  isNull: () => ({}),
  sql: () => ({}),
  asc: () => ({}),
  desc: () => ({}),
}));

vi.mock("../review-queue-repository", () => ({
  getContractReviewById: vi.fn(),
}));

describe("assistant-actions", () => {
  describe("openReviewItem", () => {
    it("returns error when review not found for tenant", async () => {
      const { getContractReviewById } = await import("../review-queue-repository");
      vi.mocked(getContractReviewById).mockResolvedValue(null);

      const result = await openReviewItem("review-id", "tenant-A");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("nenalezena");
    });

    it("returns href when review belongs to tenant", async () => {
      const { getContractReviewById } = await import("../review-queue-repository");
      vi.mocked(getContractReviewById).mockResolvedValue({
        id: "review-123",
        tenantId: "tenant-A",
        fileName: "x.pdf",
      } as any);

      const result = await openReviewItem("review-123", "tenant-A");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.href).toBe("/portal/contracts/review/review-123");
      }
    });
  });

  describe("createTaskDraft", () => {
    it("returns draft with trimmed title", () => {
      const draft = createTaskDraft({ title: "  Následný úkol  ", contactId: "c-1" });
      expect(draft.title).toBe("Následný úkol");
      expect(draft.contactId).toBe("c-1");
    });

    it("defaults title when empty or whitespace", () => {
      expect(createTaskDraft({ title: "" }).title).toBe("Úkol");
      expect(createTaskDraft({ title: "   " }).title).toBe("Úkol");
    });
  });
});

import { describe, it, expect, vi } from "vitest";

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
import { buildSuggestedActionsFromUrgent } from "../dashboard-priority";
import type { UrgentItem } from "../dashboard-types";

describe("dashboard-priority", () => {
  describe("buildSuggestedActionsFromUrgent", () => {
    it("builds open_review for review type", () => {
      const items: UrgentItem[] = [
        {
          type: "review",
          entityId: "r-1",
          score: 0.8,
          severity: "medium",
          title: "Smlouva.pdf",
          description: "Čeká na kontrolu",
          recommendedAction: "Otevřít review",
          source: "contract_upload_reviews",
        },
      ];
      const actions = buildSuggestedActionsFromUrgent(items);
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("open_review");
      expect(actions[0].payload.reviewId).toBe("r-1");
    });

    it("builds view_client and draft_email for client type", () => {
      const items: UrgentItem[] = [
        {
          type: "client",
          entityId: "c-1",
          score: 0.5,
          severity: "low",
          title: "Jan Novák",
          description: "Servis due",
          recommendedAction: "Kontaktovat",
          source: "contacts",
        },
      ];
      const actions = buildSuggestedActionsFromUrgent(items);
      expect(actions).toHaveLength(2);
      expect(actions[0].type).toBe("view_client");
      expect(actions[0].payload.clientId).toBe("c-1");
      expect(actions[1].type).toBe("draft_email");
      expect(actions[1].payload.clientId).toBe("c-1");
    });

    it("builds open_task for task type", () => {
      const items: UrgentItem[] = [
        {
          type: "task",
          entityId: "t-1",
          score: 1,
          severity: "high",
          title: "Dokončit smlouvu",
          description: "Po termínu",
          recommendedAction: "Dokončit úkol",
          source: "tasks",
        },
      ];
      const actions = buildSuggestedActionsFromUrgent(items);
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("open_task");
      expect(actions[0].payload.taskId).toBe("t-1");
    });

    it("deduplicates by type+entityId", () => {
      const items: UrgentItem[] = [
        {
          type: "review",
          entityId: "r-1",
          score: 0.9,
          severity: "high",
          title: "A",
          description: "",
          source: "contract_upload_reviews",
        },
        {
          type: "review",
          entityId: "r-1",
          score: 0.8,
          severity: "medium",
          title: "A again",
          description: "",
          source: "contract_upload_reviews",
        },
      ];
      const actions = buildSuggestedActionsFromUrgent(items);
      expect(actions.filter((a) => a.type === "open_review" && a.payload.reviewId === "r-1")).toHaveLength(1);
    });

    it("limits to 10 actions", () => {
      const items: UrgentItem[] = Array.from({ length: 15 }, (_, i) => ({
        type: "review",
        entityId: `r-${i}`,
        score: 0.5,
        severity: "low",
        title: `Review ${i}`,
        description: "",
        source: "contract_upload_reviews",
      }));
      const actions = buildSuggestedActionsFromUrgent(items);
      expect(actions.length).toBeLessThanOrEqual(10);
    });
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import {
  generateFollowUpSuggestions,
  dismissSuggestion,
  snoozeSuggestion,
  clearDedupeStore,
  type FollowUpDataSources,
} from "../followup-recommendations";

function emptyData(): FollowUpDataSources {
  return {
    pendingReviews: [],
    blockedPayments: [],
    clientsWithoutFollowup: [],
    changeDocuments: [],
    readyForApply: [],
  };
}

beforeEach(() => {
  clearDedupeStore();
});

describe("generateFollowUpSuggestions", () => {
  it("returns empty for no data", () => {
    expect(generateFollowUpSuggestions(emptyData())).toEqual([]);
  });

  it("suggests review waiting too long", () => {
    const data = emptyData();
    data.pendingReviews = [
      { id: "r1", fileName: "smlouva.pdf", createdAt: new Date(), daysOld: 5 },
    ];
    const suggestions = generateFollowUpSuggestions(data);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].type).toBe("review_waiting_too_long");
    expect(suggestions[0].severity).toBe("medium");
  });

  it("marks old review as high severity", () => {
    const data = emptyData();
    data.pendingReviews = [
      { id: "r2", fileName: "stará.pdf", createdAt: new Date(), daysOld: 10 },
    ];
    const suggestions = generateFollowUpSuggestions(data);
    expect(suggestions[0].severity).toBe("high");
  });

  it("suggests blocked payment", () => {
    const data = emptyData();
    data.blockedPayments = [
      { id: "p1", contactId: "c1", title: "ČSOB platba", reasons: ["NEEDS_HUMAN_REVIEW"] },
    ];
    const suggestions = generateFollowUpSuggestions(data);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].type).toBe("payment_setup_blocked");
  });

  it("suggests client without followup", () => {
    const data = emptyData();
    data.clientsWithoutFollowup = [
      { id: "c1", name: "Jan Novák", daysSinceContact: 20 },
    ];
    const suggestions = generateFollowUpSuggestions(data);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].type).toBe("client_no_followup");
  });

  it("suggests apply candidate", () => {
    const data = emptyData();
    data.readyForApply = [
      { id: "r3", fileName: "ready.pdf", readiness: "ready_for_apply" },
    ];
    const suggestions = generateFollowUpSuggestions(data);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].type).toBe("apply_candidate_ready");
  });

  it("deduplicates within same window", () => {
    const data = emptyData();
    data.pendingReviews = [
      { id: "r1", fileName: "same.pdf", createdAt: new Date(), daysOld: 5 },
    ];
    generateFollowUpSuggestions(data);
    const second = generateFollowUpSuggestions(data);
    expect(second).toHaveLength(0);
  });

  it("respects dismiss", () => {
    dismissSuggestion("review_waiting_too_long", "r1");
    const data = emptyData();
    data.pendingReviews = [
      { id: "r1", fileName: "dismissed.pdf", createdAt: new Date(), daysOld: 5 },
    ];
    expect(generateFollowUpSuggestions(data)).toHaveLength(0);
  });

  it("respects snooze", () => {
    snoozeSuggestion("payment_setup_blocked", "p1", 2);
    const data = emptyData();
    data.blockedPayments = [
      { id: "p1", contactId: "c1", title: "Snoozed", reasons: ["NEEDS_HUMAN_REVIEW"] },
    ];
    expect(generateFollowUpSuggestions(data)).toHaveLength(0);
  });

  it("sorts by severity", () => {
    const data = emptyData();
    data.readyForApply = [{ id: "r4", fileName: "low.pdf", readiness: "ready_for_apply" }];
    data.blockedPayments = [{ id: "p2", contactId: "c2", title: "High", reasons: ["BLOCKED"] }];
    const suggestions = generateFollowUpSuggestions(data);
    expect(suggestions[0].severity).toBe("high");
    expect(suggestions[1].severity).toBe("low");
  });
});

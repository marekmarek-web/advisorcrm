import { describe, it, expect } from "vitest";
import { formatAdvisorChatBundleForPrompt } from "../format-advisor-chat-bundle-prompt";
import type { AdvisorChatAiBundle } from "../advisor-chat-ai-types";

const baseBundle = (): AdvisorChatAiBundle => ({
  contactId: "c1",
  contactDisplayName: "Jan Novák",
  contactMetaLine: "",
  lastThreadActivityAt: null,
  messages: [],
  primaryOpportunity: null,
  openTasks: [],
  pendingMaterialRequests: [],
  crmCounts: {
    openTasksCount: 0,
    overdueTasksCount: 0,
    pendingMaterialRequestsCount: 0,
    openOpportunitiesCount: 0,
    opportunitiesReadable: true,
  },
  attachmentHints: [],
  terminationRequests: [],
});

describe("formatAdvisorChatBundleForPrompt", () => {
  it("includes termination request lines when present", () => {
    const out = formatAdvisorChatBundleForPrompt({
      ...baseBundle(),
      terminationRequests: [
        {
          id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          status: "intake",
          insurerName: "Test PV",
          updatedAt: "2026-04-07T10:00:00.000Z",
        },
      ],
    });
    expect(out).toContain("Žádosti o výpověď");
    expect(out).toContain("Test PV");
    expect(out).toContain("aaaaaaaa");
  });

  it("mentions empty termination list when none", () => {
    const out = formatAdvisorChatBundleForPrompt(baseBundle());
    expect(out).toContain("žádné v posledních záznamech");
  });
});

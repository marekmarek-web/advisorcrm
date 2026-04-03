import { describe, expect, it } from "vitest";
import { formatAdvisorAssistantConversationListLabel } from "../assistant-conversation-label";

const base = {
  updatedAtIso: "2026-04-03T15:52:00.000Z",
  channel: "web_drawer",
  lockedContactLabel: null as string | null,
  displayTitle: null as string | null,
};

describe("formatAdvisorAssistantConversationListLabel", () => {
  it("prioritizes displayTitle over client and channel", () => {
    const s = formatAdvisorAssistantConversationListLabel({
      ...base,
      displayTitle: "Hypotéka – follow-up",
      lockedContactLabel: "Jan Novák",
    });
    expect(s).toContain("Hypotéka – follow-up");
    expect(s).not.toContain("Jan Novák");
    expect(s).not.toContain("web drawer");
  });

  it("uses client name + time + channel when no displayTitle", () => {
    const s = formatAdvisorAssistantConversationListLabel({
      ...base,
      lockedContactLabel: "Jan Novák",
    });
    expect(s).toContain("Jan Novák");
    expect(s).toContain("web drawer");
  });

  it("falls back to time + channel when no client", () => {
    const s = formatAdvisorAssistantConversationListLabel({
      ...base,
      channel: "mobile",
    });
    expect(s).toMatch(/·/);
    expect(s).toContain("mobile");
    expect(s).not.toMatch(/Novák/);
  });

  it("trims displayTitle whitespace", () => {
    const s = formatAdvisorAssistantConversationListLabel({
      ...base,
      displayTitle: "  Úkol  ",
    });
    expect(s.startsWith("Úkol")).toBe(true);
  });
});

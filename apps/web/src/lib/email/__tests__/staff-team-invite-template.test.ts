import { describe, expect, it } from "vitest";
import { staffTeamInviteTemplate } from "@/lib/email/templates";

describe("staffTeamInviteTemplate", () => {
  const base = {
    loginUrl: "https://app.example/prihlaseni?staff_invite=abc",
    inviteeEmail: "new@example.com",
    roleLabel: "Poradce",
    expiresInDays: 7,
  };

  it("mentions Aidvisory and inviter, not workspace name", () => {
    const { html, subject } = staffTeamInviteTemplate({
      ...base,
      inviterDisplayName: "Jana Nováková",
    });
    expect(html).toContain("Aidvisory");
    expect(html).toContain("Jana Nováková");
    expect(html).toContain("Poradce");
    expect(html).not.toMatch(/workspace/i);
    expect(subject).toContain("Aidvisory");
    expect(subject).toContain("Jana Nováková");
    expect(subject).not.toMatch(/workspace/i);
  });
});

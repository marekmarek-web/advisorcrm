import { describe, expect, it } from "vitest";
import { clientPortalInviteTemplate } from "@/lib/email/templates";

describe("clientPortalInviteTemplate", () => {
  const base = {
    registerUrl: "https://app.example/prihlaseni?invite=1",
    contactFirstName: "Marek",
    loginEmail: "client@example.com",
    temporaryPassword: "Temp-1",
    expiresInDays: 7,
    gdprUrl: "https://app.example/gdpr",
    termsUrl: "https://app.example/terms",
  };

  it("uses advisor name instead of default workspace title", () => {
    const { html } = clientPortalInviteTemplate({
      ...base,
      advisorDisplayName: "Petr Novák",
      tenantName: "Můj workspace",
    });
    expect(html).toContain("Petr Novák");
    expect(html).not.toContain("Můj workspace");
  });

  it("falls back to váš poradce when workspace is still default and advisor unknown", () => {
    const { html } = clientPortalInviteTemplate({
      ...base,
      tenantName: "Můj workspace",
    });
    expect(html).toContain("váš poradce");
    expect(html).not.toContain("Můj workspace");
  });

  it("uses branded tenant name when advisor name is missing and tenant is customized", () => {
    const { html } = clientPortalInviteTemplate({
      ...base,
      tenantName: "Finanční partneři s.r.o.",
    });
    expect(html).toContain("Finanční partneři s.r.o.");
  });
});

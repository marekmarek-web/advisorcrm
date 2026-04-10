import { describe, expect, it } from "vitest";
import { clientPortalReminderTemplate } from "@/lib/email/templates";

describe("clientPortalReminderTemplate", () => {
  it("omits temporary password and points to login URL", () => {
    const { html, subject } = clientPortalReminderTemplate({
      loginUrl: "https://app.example/prihlaseni",
      contactFirstName: "Jan",
      tenantName: "Demo tenant",
      loginEmail: "jan@example.com",
      gdprUrl: "https://app.example/gdpr",
      termsUrl: "https://app.example/terms",
    });
    expect(subject).toContain("Připomínka");
    expect(html).toContain("https://app.example/prihlaseni");
    expect(html).toContain("jan@example.com");
    expect(html).not.toContain("Dočasné heslo");
    expect(html).toMatch(/heslem, které jste si nastavili/i);
  });

  it("prefers advisor name over default workspace title", () => {
    const { html } = clientPortalReminderTemplate({
      loginUrl: "https://app.example/prihlaseni",
      contactFirstName: "Jan",
      advisorDisplayName: "Eva Dvořáková",
      tenantName: "Můj workspace",
      loginEmail: "jan@example.com",
      gdprUrl: "https://app.example/gdpr",
      termsUrl: "https://app.example/terms",
    });
    expect(html).toContain("Eva Dvořáková");
    expect(html).not.toContain("Můj workspace");
  });
});

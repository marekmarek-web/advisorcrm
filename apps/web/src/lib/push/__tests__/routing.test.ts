import { describe, expect, it } from "vitest";
import { mapPushNotificationToRoute } from "../routing";

describe("mapPushNotificationToRoute", () => {
  it("maps NEW_LEAD with opportunity id", () => {
    const route = mapPushNotificationToRoute({
      id: "1",
      title: "Novy lead",
      body: "Test",
      data: { type: "NEW_LEAD", opportunityId: "abc123" },
    } as any);

    expect(route).toBe("/portal/pipeline/abc123");
  });

  it("maps NEW_DOCUMENT with contact id", () => {
    const route = mapPushNotificationToRoute({
      id: "1",
      title: "Novy dokument",
      body: "Test",
      data: { type: "NEW_DOCUMENT", contactId: "contact-1" },
    } as any);

    expect(route).toBe("/portal/contacts/contact-1");
  });

  it("falls back for invalid payload", () => {
    const route = mapPushNotificationToRoute({
      id: "1",
      title: "Fallback",
      body: "Test",
      data: { type: "UNKNOWN_TYPE" },
    } as any);

    expect(route).toBe("/portal/today");
  });
});

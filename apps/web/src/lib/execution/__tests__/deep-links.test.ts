import { describe, it, expect } from "vitest";
import { resolveDeepLink, buildActionCenterDeepLink, buildNotificationDeepLink } from "../deep-links";

describe("resolveDeepLink", () => {
  it("maps review to correct URL", () => {
    expect(resolveDeepLink("review", "abc-123")).toBe("/portal/contracts/review/abc-123");
  });

  it("maps client to contacts URL", () => {
    expect(resolveDeepLink("client", "c1")).toBe("/portal/contacts/c1");
  });

  it("maps contact to contacts URL", () => {
    expect(resolveDeepLink("contact", "c2")).toBe("/portal/contacts/c2");
  });

  it("maps payment with anchor", () => {
    expect(resolveDeepLink("payment", "p1")).toBe("/portal/contacts/p1#payments");
  });

  it("maps task to today", () => {
    expect(resolveDeepLink("task", "t1")).toBe("/portal/today");
  });

  it("maps draft to drafts URL", () => {
    expect(resolveDeepLink("draft", "d1")).toBe("/portal/drafts/d1");
  });

  it("maps escalation to team overview", () => {
    expect(resolveDeepLink("escalation", "e1")).toBe("/portal/team-overview");
  });

  it("maps opportunity to pipeline deal", () => {
    expect(resolveDeepLink("opportunity", "opp-1")).toBe("/portal/pipeline/opp-1");
  });

  it("maps termination_request to terminations detail", () => {
    expect(resolveDeepLink("termination_request", "tr-1")).toBe("/portal/terminations/tr-1");
  });

  it("falls back to /portal/today for unknown", () => {
    expect(resolveDeepLink("whatever", "x")).toBe("/portal/today");
  });

  it("encodes special characters", () => {
    expect(resolveDeepLink("review", "a b/c")).toBe("/portal/contracts/review/a%20b%2Fc");
  });
});

describe("utility links", () => {
  it("buildActionCenterDeepLink", () => {
    expect(buildActionCenterDeepLink()).toBe("/portal/action-center");
  });

  it("buildNotificationDeepLink", () => {
    expect(buildNotificationDeepLink("n1")).toContain("/portal/notifications/n1");
  });
});

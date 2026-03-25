import { describe, it, expect } from "vitest";
import {
  getEffectiveChannel,
  checkCommunicationConsent,
  resolveChannelWithFallback,
  type CommunicationPrefs,
} from "../communication-preferences";

describe("getEffectiveChannel", () => {
  it("returns email when preferred and available", () => {
    const ch = getEffectiveChannel({ email: "a@b.com", preferredChannel: "email" });
    expect(ch).toBe("email");
  });

  it("returns portal when preferred", () => {
    const ch = getEffectiveChannel({ preferredChannel: "portal" });
    expect(ch).toBe("portal");
  });

  it("falls back to email if available", () => {
    const ch = getEffectiveChannel({ email: "a@b.com" });
    expect(ch).toBe("email");
  });

  it("falls back to push if no email", () => {
    const ch = getEffectiveChannel({});
    expect(ch).toBe("push");
  });

  it("returns in_app if doNotPush is set and no email", () => {
    const ch = getEffectiveChannel({ doNotPush: true });
    expect(ch).toBe("in_app");
  });

  it("skips email if doNotEmail is set", () => {
    const ch = getEffectiveChannel({ email: "a@b.com", doNotEmail: true });
    expect(ch).toBe("push");
  });

  it("skips email if unsubscribed", () => {
    const ch = getEffectiveChannel({ email: "a@b.com", notificationUnsubscribedAt: new Date() });
    expect(ch).toBe("push");
  });
});

describe("checkCommunicationConsent", () => {
  it("allows email when available and consented", () => {
    const result = checkCommunicationConsent({ email: "a@b.com" }, "email");
    expect(result.allowed).toBe(true);
  });

  it("blocks email when no address", () => {
    const result = checkCommunicationConsent({}, "email");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("NO_EMAIL_ADDRESS");
  });

  it("blocks email when doNotEmail", () => {
    const result = checkCommunicationConsent({ email: "a@b.com", doNotEmail: true }, "email");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("DO_NOT_EMAIL");
  });

  it("blocks push when doNotPush", () => {
    const result = checkCommunicationConsent({ doNotPush: true }, "push");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("DO_NOT_PUSH");
  });

  it("always allows in_app", () => {
    const result = checkCommunicationConsent({}, "in_app");
    expect(result.allowed).toBe(true);
  });
});

describe("resolveChannelWithFallback", () => {
  it("returns email without fallback when consented", () => {
    const result = resolveChannelWithFallback({ email: "a@b.com" });
    expect(result.channel).toBe("email");
    expect(result.fallbackApplied).toBe(false);
  });

  it("falls back to in_app when email not consented", () => {
    const result = resolveChannelWithFallback({ email: "a@b.com", doNotEmail: true, doNotPush: true });
    expect(result.channel).toBe("in_app");
    expect(result.fallbackApplied).toBe(true);
  });
});

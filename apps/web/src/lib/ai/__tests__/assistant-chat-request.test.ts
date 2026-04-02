import { describe, it, expect } from "vitest";
import { buildAssistantChatRequestBody, parsePortalContactIdFromPathname } from "../assistant-chat-request";
import { getOrCreateSession, updateSessionContext } from "../assistant-session";

const SAMPLE_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

describe("parsePortalContactIdFromPathname", () => {
  it("parses contact id from portal contact detail path", () => {
    expect(parsePortalContactIdFromPathname(`/portal/contacts/${SAMPLE_UUID}`)).toBe(SAMPLE_UUID.toLowerCase());
  });

  it("parses from path with trailing segment", () => {
    expect(parsePortalContactIdFromPathname(`/portal/contacts/${SAMPLE_UUID}/edit`)).toBe(SAMPLE_UUID.toLowerCase());
  });

  it("returns undefined for unrelated paths", () => {
    expect(parsePortalContactIdFromPathname("/portal/ai")).toBeUndefined();
    expect(parsePortalContactIdFromPathname("/portal/contacts")).toBeUndefined();
    expect(parsePortalContactIdFromPathname(null)).toBeUndefined();
  });
});

describe("buildAssistantChatRequestBody", () => {
  it("includes message, sessionId, and activeContext with null client when not on contact", () => {
    const b = buildAssistantChatRequestBody("ahoj", { sessionId: "sess_1", routeContactId: null });
    expect(b).toEqual({
      message: "ahoj",
      sessionId: "sess_1",
      activeContext: { clientId: null },
    });
  });

  it("includes client id when on contact route", () => {
    const b = buildAssistantChatRequestBody("x", { routeContactId: SAMPLE_UUID });
    expect(b.activeContext).toEqual({ clientId: SAMPLE_UUID });
  });
});

describe("updateSessionContext clientId null", () => {
  it("clears activeClientId when clientId is null", () => {
    const s = getOrCreateSession(undefined, "t1", "u1");
    updateSessionContext(s, { clientId: SAMPLE_UUID });
    expect(s.activeClientId).toBe(SAMPLE_UUID);
    updateSessionContext(s, { clientId: null });
    expect(s.activeClientId).toBeUndefined();
  });
});

import { describe, it, expect } from "vitest";
import {
  buildAssistantChatRequestBody,
  parsePortalContactIdFromPathname,
  parsePortalOpportunityIdFromPathname,
} from "../assistant-chat-request";
import {
  getOrCreateSession,
  updateSessionContext,
  lockAssistantClient,
  clearAssistantClientLock,
} from "../assistant-session";

const SAMPLE_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const OPP_UUID = "11223344-5566-7788-99aa-bbccddeeff00";
const CLIENT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CLIENT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

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

describe("parsePortalOpportunityIdFromPathname", () => {
  it("parses opportunity id from pipeline detail path", () => {
    expect(parsePortalOpportunityIdFromPathname(`/portal/pipeline/${OPP_UUID}`)).toBe(OPP_UUID.toLowerCase());
  });

  it("parses from path with trailing segment", () => {
    expect(parsePortalOpportunityIdFromPathname(`/portal/pipeline/${OPP_UUID}/edit`)).toBe(OPP_UUID.toLowerCase());
  });

  it("returns undefined for unrelated paths", () => {
    expect(parsePortalOpportunityIdFromPathname("/portal/ai")).toBeUndefined();
    expect(parsePortalOpportunityIdFromPathname("/portal/pipeline")).toBeUndefined();
    expect(parsePortalOpportunityIdFromPathname(null)).toBeUndefined();
  });
});

describe("buildAssistantChatRequestBody", () => {
  it("includes message, sessionId, and activeContext with null client when not on contact", () => {
    const b = buildAssistantChatRequestBody("ahoj", { sessionId: "sess_1", routeContactId: null });
    expect(b).toEqual({
      message: "ahoj",
      sessionId: "sess_1",
      orchestration: "canonical",
      channel: "web_drawer",
      activeContext: { clientId: null, opportunityId: null, reviewId: null },
    });
  });

  it("includes client id when on contact route", () => {
    const b = buildAssistantChatRequestBody("x", { routeContactId: SAMPLE_UUID });
    expect(b.activeContext?.clientId).toBe(SAMPLE_UUID);
    expect(b.channel).toBe("contact_detail");
  });

  it("includes opportunityId when on pipeline route", () => {
    const b = buildAssistantChatRequestBody("x", {
      routeContactId: null,
      routeOpportunityId: OPP_UUID,
    });
    expect(b.activeContext?.opportunityId).toBe(OPP_UUID);
  });

  it("includes reviewId in activeContext when provided", () => {
    const rid = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const b = buildAssistantChatRequestBody("Tady je smlouva", {
      sessionId: "s",
      routeContactId: null,
      reviewId: rid,
    });
    expect(b.activeContext?.reviewId).toBe(rid);
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

describe("session context isolation on client switch", () => {
  it("clears lock and plan when incoming clientId differs from locked", () => {
    const s = getOrCreateSession(undefined, "t1", "u1");
    lockAssistantClient(s, CLIENT_A);
    s.lastExecutionPlan = {
      planId: "plan_old",
      intentType: "create_task",
      productDomain: null,
      contactId: CLIENT_A,
      opportunityId: null,
      steps: [],
      status: "awaiting_confirmation",
      createdAt: new Date(),
    };

    const warnings = updateSessionContext(s, { clientId: CLIENT_B });
    expect(s.lockedClientId).toBeUndefined();
    expect(s.lastExecutionPlan).toBeUndefined();
    expect(s.activeClientId).toBe(CLIENT_B);
    expect(warnings.some(w => w.includes("změnu klienta"))).toBe(true);
  });

  it("keeps lock when incoming client matches", () => {
    const s = getOrCreateSession(undefined, "t1", "u1");
    lockAssistantClient(s, CLIENT_A);
    const warnings = updateSessionContext(s, { clientId: CLIENT_A });
    expect(s.lockedClientId).toBe(CLIENT_A);
    expect(warnings).toHaveLength(0);
  });

  it("does not clear lock when skipClientIdFromUi is true (explicit assistant lock)", () => {
    const s = getOrCreateSession(undefined, "t1", "u1");
    lockAssistantClient(s, CLIENT_A);
    const warnings = updateSessionContext(s, { clientId: CLIENT_B }, { skipClientIdFromUi: true });
    expect(s.lockedClientId).toBe(CLIENT_A);
    expect(warnings.some(w => w.includes("zamčený"))).toBe(true);
  });
});

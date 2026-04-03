/**
 * H7: pendingClientDisambiguation must not short-circuit to locked client without fresh resolution.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h7EntityHoisted = vi.hoisted(() => {
  const searchMock = vi.fn();
  const limitRows: { id: string; firstName: string; lastName: string }[][] = [];
  const limitImpl = vi.fn(() => Promise.resolve(limitRows[0] ?? []));
  return { searchMock, limitRows, limitImpl };
});

vi.mock("../assistant-contact-search", () => ({
  searchContactsForAssistant: (...args: unknown[]) => h7EntityHoisted.searchMock(...args),
}));

vi.mock("db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: h7EntityHoisted.limitImpl,
  },
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  desc: vi.fn(),
  sql: vi.fn(),
  contacts: { id: "id", tenantId: "t", firstName: "fn", lastName: "ln" },
  opportunities: {},
  documents: {},
}));

import { resolveEntities } from "../assistant-entity-resolution";
import { getOrCreateSession, lockAssistantClient } from "../assistant-session";
import { emptyCanonicalIntent } from "../assistant-domain-model";

const LOCK_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

describe("H7 entity resolution / disambiguation", () => {
  beforeEach(() => {
    h7EntityHoisted.searchMock.mockReset();
    h7EntityHoisted.limitRows.length = 0;
    h7EntityHoisted.limitRows.push([{ id: LOCK_ID, firstName: "Locked", lastName: "User" }]);
    h7EntityHoisted.limitImpl.mockClear();
  });

  it("when pendingClientDisambiguation is true, does not use lockedClientId shortcut for name ref (H7.1)", async () => {
    const session = getOrCreateSession("h7-disamb", "tenant-h7", "user-h7");
    lockAssistantClient(session, LOCK_ID);
    session.pendingClientDisambiguation = true;

    h7EntityHoisted.searchMock.mockResolvedValue([
      { id: "match-a", displayName: "Jan A" },
      { id: "match-b", displayName: "Jan B" },
    ]);

    const intent = {
      ...emptyCanonicalIntent(),
      targetClient: { ref: "Jan Novák", resolved: false },
    };

    const res = await resolveEntities("tenant-h7", intent, session);

    expect(h7EntityHoisted.searchMock).toHaveBeenCalled();
    expect(res.client?.ambiguous).toBe(true);
    expect(res.client?.alternatives.length).toBeGreaterThan(0);
  });

  it("when pendingClientDisambiguation is false, uses locked client from DB without search", async () => {
    const session = getOrCreateSession("h7-locked", "tenant-h7", "user-h7");
    lockAssistantClient(session, LOCK_ID);
    session.pendingClientDisambiguation = false;

    const intent = {
      ...emptyCanonicalIntent(),
      targetClient: { ref: "ignored-name", resolved: false },
    };

    const res = await resolveEntities("tenant-h7", intent, session);

    expect(h7EntityHoisted.searchMock).not.toHaveBeenCalled();
    expect(res.client?.entityId).toBe(LOCK_ID);
    expect(res.client?.ambiguous).toBe(false);
  });

  it("when no targetClient ref, skips locked fallback if pendingClientDisambiguation", async () => {
    const session = getOrCreateSession("h7-no-ref", "tenant-h7", "user-h7");
    session.lockedClientId = LOCK_ID;
    session.pendingClientDisambiguation = true;

    const intent = emptyCanonicalIntent();

    const res = await resolveEntities("tenant-h7", intent, session);

    expect(res.client).toBeNull();
  });
});

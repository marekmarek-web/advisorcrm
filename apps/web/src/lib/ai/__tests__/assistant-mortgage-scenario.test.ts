const chainable = () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn().mockImplementation(self);
  chain.from = vi.fn().mockImplementation(self);
  chain.where = vi.fn().mockImplementation(self);
  chain.leftJoin = vi.fn().mockImplementation(self);
  chain.orderBy = vi.fn().mockImplementation(self);
  chain.limit = vi.fn().mockResolvedValue([]);
  chain.execute = vi.fn().mockResolvedValue({ rows: [] });
  chain.insert = vi.fn().mockImplementation(self);
  chain.values = vi.fn().mockImplementation(self);
  chain.returning = vi.fn().mockResolvedValue([]);
  chain.update = vi.fn().mockImplementation(self);
  chain.set = vi.fn().mockImplementation(self);
  return chain;
};
vi.mock("db", () => ({
  db: chainable(),
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  sql: vi.fn(),
  asc: vi.fn(),
  desc: vi.fn(),
  tasks: {},
  contacts: {},
  contracts: {},
  opportunities: {},
  opportunityStages: {},
  contractUploadReviews: {},
  clientPaymentSetups: {},
  contractReviewCorrections: {},
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));


import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/openai", () => ({
  createResponseStructured: vi.fn(),
  createResponseSafe: vi.fn().mockResolvedValue({ ok: true, text: "ok" }),
  logOpenAICall: vi.fn(),
}));

const execMock = vi.fn().mockResolvedValue({
  ok: true,
  dealId: "11111111-1111-1111-1111-111111111111",
  taskId: "22222222-2222-2222-2222-222222222222",
  idempotencyKey: "idem",
  dueDate: "2026-04-07",
  payloadHash: "ph",
});

vi.mock("../assistant-crm-writes", () => ({
  executeMortgageDealAndFollowUpTask: (...args: unknown[]) => execMock(...args),
}));

vi.mock("../assistant-contact-search", () => ({
  searchContactsForAssistant: vi.fn().mockResolvedValue([
    { id: "cccccccc-cccc-cccc-cccc-cccccccccccc", displayName: "Břetislav Mráz", hint: "…" },
  ]),
}));

vi.mock("../assistant-intent-extract", () => ({
  extractAssistantIntent: vi.fn().mockResolvedValue({
    actions: ["create_opportunity", "create_followup_task"],
    switchClient: false,
    clientRef: "Břetislav Mráz",
    amount: 4000000,
    ltv: 90,
    purpose: "koupě bytu + rekonstrukce",
    bank: "ČS",
    rateGuess: 4.99,
    noEmail: true,
    dueDateText: "příští úterý",
  }),
}));

describe("AI assistant mortgage + follow-up (bug scenario)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-02T12:00:00.000Z"));
    execMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes CRM via executeMortgageDealAndFollowUpTask and returns dealId + taskId; no email", async () => {
    const { routeAssistantMessage } = await import("../assistant-tool-router");
    const { getOrCreateSession } = await import("../assistant-session");
    const session = getOrCreateSession(undefined, "tenant-1", "user-1");

    const msg =
      "Břetislav Mráz, hypotéka 4 000 000 Kč, LTV 90 %, koupě bytu + rekonstrukce, nabídka ČS 4,99 %, čekáme potvrzení, vytvoř obchod + follow up na příští úterý, email neřeš.";

    const response = await routeAssistantMessage(msg, session, { clientId: null }, { roleName: "Advisor" });

    expect(execMock).toHaveBeenCalledTimes(1);
    const arg = execMock.mock.calls[0][0];
    expect(arg.contactId).toBe("cccccccc-cccc-cccc-cccc-cccccccccccc");
    expect(arg.intent.noEmail).toBe(true);

    // IDs are returned in referencedEntities, not in the message text
    const refs = response.referencedEntities ?? [];
    expect(refs.some((e: { id: string }) => e.id === "11111111-1111-1111-1111-111111111111")).toBe(true);
    expect(refs.some((e: { id: string }) => e.id === "22222222-2222-2222-2222-222222222222")).toBe(true);
    expect(response.message.toLowerCase()).not.toContain("dobrý den");
    expect(response.message.toLowerCase()).not.toContain("mailto:");
    expect(response.message).toMatch(/E-mail nebyl/);
  });
});

describe("parseModelToolCalls nested JSON", () => {
  it("parses nested objects in tool params", async () => {
    const { parseModelToolCalls } = await import("../assistant-tool-router");
    const text = '[TOOL:foo {"a":{"b":1},"x":2}]';
    const calls = parseModelToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("foo");
    expect((calls[0].params as { a: { b: number } }).a.b).toBe(1);
  });
});
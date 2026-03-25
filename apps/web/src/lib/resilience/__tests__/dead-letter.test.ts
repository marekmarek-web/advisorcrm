import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("db", () => ({
  db: { insert: vi.fn(), select: vi.fn(), update: vi.fn() },
  deadLetterItems: {
    id: "id",
    tenantId: "tenant_id",
    jobType: "job_type",
    payload: "payload",
    failureReason: "failure_reason",
    attempts: "attempts",
    status: "status",
    correlationId: "correlation_id",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  desc: vi.fn((a: unknown) => ({ desc: a })),
}));

import { db } from "db";
import {
  addToDeadLetter,
  listDeadLetterItems,
  retryDeadLetterItem,
  discardDeadLetterItem,
} from "../dead-letter";

const now = new Date();

describe("addToDeadLetter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: "dl-1" }]),
    });
  });

  it("inserts and returns id", async () => {
    const r = await addToDeadLetter({
      tenantId: "t1",
      jobType: "extract",
      payload: { foo: 1 },
    });
    expect(r.id).toBe("dl-1");
  });
});

describe("listDeadLetterItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const row = {
      id: "dl-1",
      tenantId: "t1",
      jobType: "j",
      payload: {},
      failureReason: null,
      attempts: 2,
      status: "pending",
      correlationId: null,
      createdAt: now,
      updatedAt: now,
    };
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([row]),
    });
  });

  it("maps rows", async () => {
    const items = await listDeadLetterItems("t1");
    expect(items).toHaveLength(1);
    expect(items[0].jobType).toBe("j");
  });
});

describe("retryDeadLetterItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const row = {
      id: "dl-1",
      tenantId: "t1",
      jobType: "j",
      payload: { x: 1 },
      failureReason: "err",
      attempts: 2,
      status: "pending",
      correlationId: "c1",
      createdAt: now,
      updatedAt: now,
    };
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([row]),
    });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("returns payload and increments attempts", async () => {
    const r = await retryDeadLetterItem("t1", "dl-1");
    expect(r.jobType).toBe("j");
    expect(r.attempts).toBe(3);
    expect(r.payload).toEqual({ x: 1 });
  });
});

describe("discardDeadLetterItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("updates without throw", async () => {
    await expect(discardDeadLetterItem("t1", "dl-1")).resolves.toBeUndefined();
  });
});

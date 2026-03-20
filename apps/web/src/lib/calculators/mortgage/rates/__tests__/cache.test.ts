import { describe, expect, it, vi } from "vitest";
import { getOrFetchWithCache } from "../cache";

describe("rates cache fallback", () => {
  it("returns last valid snapshot when provider fails", async () => {
    const key = `test-${Date.now()}`;
    const first = await getOrFetchWithCache(key, 1, async () => [{ rate: 4.5 }]);
    expect(first[0].rate).toBe(4.5);

    await new Promise((resolve) => setTimeout(resolve, 5));

    const failingFetcher = vi.fn(async () => {
      throw new Error("provider down");
    });
    const fallback = await getOrFetchWithCache(key, 1, failingFetcher);

    expect(fallback[0].rate).toBe(4.5);
    expect(failingFetcher).toHaveBeenCalledTimes(1);
  });
});

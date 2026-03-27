/** Simple in-memory rate limiter (per server instance). Mitigates brute force on public metadata endpoints. */
const buckets = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 40;

export function rateLimitByKey(key: string): { ok: true } | { ok: false } {
  const now = Date.now();
  const arr = buckets.get(key) ?? [];
  const pruned = arr.filter((t) => now - t < WINDOW_MS);
  if (pruned.length >= MAX_REQUESTS) {
    return { ok: false };
  }
  pruned.push(now);
  buckets.set(key, pruned);
  return { ok: true };
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}

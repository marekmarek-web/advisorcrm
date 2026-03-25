/**
 * Lightweight abuse signals (Plan 9B).
 * In-memory sliding-window counters per identity + abuse type.
 * For production scale, replace backing store with Redis / edge KV.
 */

export type AbuseType =
  | "rapid_requests"
  | "auth_failures"
  | "permission_denied_burst"
  | "export_spam"
  | "upload_spam"
  | "suspicious_scan_pattern";

export type AbuseCheckResult = {
  abusive: boolean;
  abuseType: AbuseType;
  count: number;
  windowMs: number;
  threshold: number;
  resetAt: number;
};

type WindowEntry = { timestamps: number[] };

const ABUSE_WINDOWS: Record<AbuseType, { windowMs: number; threshold: number }> = {
  rapid_requests: { windowMs: 10_000, threshold: 80 },
  auth_failures: { windowMs: 300_000, threshold: 15 },
  permission_denied_burst: { windowMs: 60_000, threshold: 25 },
  export_spam: { windowMs: 300_000, threshold: 8 },
  upload_spam: { windowMs: 300_000, threshold: 40 },
  suspicious_scan_pattern: { windowMs: 60_000, threshold: 50 },
};

const store = new Map<string, WindowEntry>();

function bucketKey(abuseType: AbuseType, identity: string): string {
  return `${abuseType}:${identity}`;
}

function prune(ts: number[], windowMs: number, nowMs: number): number[] {
  const cutoff = nowMs - windowMs;
  return ts.filter((t) => t > cutoff);
}

export function recordAbuseEvent(abuseType: AbuseType, identity: string): AbuseCheckResult {
  const cfg = ABUSE_WINDOWS[abuseType];
  const nowMs = Date.now();
  const key = bucketKey(abuseType, identity);
  const entry = store.get(key) ?? { timestamps: [] };
  entry.timestamps = prune(entry.timestamps, cfg.windowMs, nowMs);
  entry.timestamps.push(nowMs);
  store.set(key, entry);

  const count = entry.timestamps.length;
  const oldest = entry.timestamps[0] ?? nowMs;
  const resetAt = oldest + cfg.windowMs;

  return {
    abusive: count >= cfg.threshold,
    abuseType,
    count,
    windowMs: cfg.windowMs,
    threshold: cfg.threshold,
    resetAt,
  };
}

export function checkAbuse(abuseType: AbuseType, identity: string): AbuseCheckResult {
  const cfg = ABUSE_WINDOWS[abuseType];
  const nowMs = Date.now();
  const key = bucketKey(abuseType, identity);
  const entry = store.get(key);
  const timestamps = entry ? prune(entry.timestamps, cfg.windowMs, nowMs) : [];
  const count = timestamps.length;
  const oldest = timestamps[0] ?? nowMs;

  return {
    abusive: count >= cfg.threshold,
    abuseType,
    count,
    windowMs: cfg.windowMs,
    threshold: cfg.threshold,
    resetAt: oldest + cfg.windowMs,
  };
}

export type AbuseSignalSummary = {
  abuseType: AbuseType;
  identity: string;
  count: number;
  threshold: number;
  abusive: boolean;
};

export function getAbuseSignals(identity: string): AbuseSignalSummary[] {
  const types = Object.keys(ABUSE_WINDOWS) as AbuseType[];
  return types.map((abuseType) => {
    const r = checkAbuse(abuseType, identity);
    return {
      abuseType,
      identity,
      count: r.count,
      threshold: r.threshold,
      abusive: r.abusive,
    };
  });
}

export function resetAbuseCountersForTests(): void {
  store.clear();
}

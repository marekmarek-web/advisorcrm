/**
 * Route-level rate limit policies (Plan 9B).
 * Maps API path prefixes to window/max; used with checkRateLimit from rate-limit.ts.
 */

export type RateLimitTier = "anonymous" | "authenticated" | "sensitive" | "bulk" | "internal";

export type RateLimitPolicy = {
  tier: RateLimitTier;
  windowMs: number;
  maxRequests: number;
  description: string;
};

export const RATE_LIMIT_POLICIES: Record<RateLimitTier, RateLimitPolicy> = {
  anonymous: {
    tier: "anonymous",
    windowMs: 60_000,
    maxRequests: 60,
    description: "Unauthenticated or unknown clients",
  },
  authenticated: {
    tier: "authenticated",
    windowMs: 60_000,
    maxRequests: 300,
    description: "Signed-in users, default API usage",
  },
  sensitive: {
    tier: "sensitive",
    windowMs: 60_000,
    maxRequests: 30,
    description: "Payments, exports, admin mutations",
  },
  bulk: {
    tier: "bulk",
    windowMs: 300_000,
    maxRequests: 10,
    description: "Bulk operations and heavy reports",
  },
  internal: {
    tier: "internal",
    windowMs: 60_000,
    maxRequests: 120,
    description: "Cron / service-to-service (still subject to IP identity)",
  },
};

/** Longest prefix wins; first match in array order for overlapping prefixes. */
const ROUTE_POLICY_RULES: { prefix: string; tier: RateLimitTier }[] = [
  { prefix: "/api/cron/", tier: "internal" },
  { prefix: "/api/admin/", tier: "sensitive" },
  { prefix: "/api/stripe/", tier: "sensitive" },
  { prefix: "/api/reports/export", tier: "bulk" },
  { prefix: "/api/reports/", tier: "sensitive" },
  { prefix: "/api/analytics/", tier: "sensitive" },
  { prefix: "/api/documents/", tier: "sensitive" },
  { prefix: "/api/portal/payment", tier: "sensitive" },
  { prefix: "/api/webhooks/", tier: "internal" },
  { prefix: "/api/", tier: "authenticated" },
];

export function getRateLimitTierForRoute(pathname: string): RateLimitTier {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  for (const rule of ROUTE_POLICY_RULES) {
    if (path.startsWith(rule.prefix)) return rule.tier;
  }
  return "anonymous";
}

export function getRateLimitForRoute(pathname: string): RateLimitPolicy {
  const tier = getRateLimitTierForRoute(pathname);
  return RATE_LIMIT_POLICIES[tier];
}

export function getRateLimitOptions(pathname: string): { windowMs: number; maxRequests: number } {
  const p = getRateLimitForRoute(pathname);
  return { windowMs: p.windowMs, maxRequests: p.maxRequests };
}

/**
 * Delta A23 — Remote kill-switch / feature flags přes Vercel Edge Config.
 *
 * Proč:
 *   - `ENV` hodnoty se aktivují až po redeploy (minuty + audit trail je git).
 *   - Při incidentu potřebujeme vypnout funkci **bez deploye** (např.
 *     `AI_REVIEW_UPLOADS_DISABLED=true`, `MAINTENANCE_MODE=true`, `PUSH_DISABLED=true`).
 *   - Edge Config je read-from-edge KV storage s sub-10ms latencí, update přes Dashboard.
 *
 * Contract:
 *   - Klíče jsou case-sensitive, v `ALL_FLAG_KEYS` seznamu.
 *   - Pokud Edge Config není připojený (no `EDGE_CONFIG` env), fallback na `process.env.<KEY>`.
 *   - Pokud ani ENV neexistuje, fallback na `defaultValue` z call-site.
 *
 * Použití (server-only):
 *   import { getKillSwitch } from "@/lib/ops/kill-switch";
 *   if (await getKillSwitch("MAINTENANCE_MODE")) return maintenanceResponse();
 *
 * Dashboard setup:
 *   - Vercel Dashboard → Storage → Create Edge Config → `aidvisora-ops`.
 *   - Link Edge Config do projektu (auto-nastaví `EDGE_CONFIG` env var).
 *   - Přidat klíče z `ALL_FLAG_KEYS` jako boolean true/false.
 *   - Update: Dashboard UI nebo `vercel edge-config set MAINTENANCE_MODE true`.
 *
 * Caching:
 *   - Edge Config samo cachuje v edge runtime. My navíc držíme in-memory cache
 *     s 10s TTL, abychom nenabouchali rate-limit při burst traffic na serverless.
 */

import { get, has } from "@vercel/edge-config";

export type KillSwitchKey =
  | "MAINTENANCE_MODE"
  | "AI_REVIEW_UPLOADS_DISABLED"
  | "DOCUMENT_UPLOADS_DISABLED"
  | "PUSH_NOTIFICATIONS_DISABLED"
  | "EMAIL_SENDING_DISABLED"
  | "STRIPE_CHECKOUT_DISABLED"
  | "NEW_REGISTRATIONS_DISABLED"
  | "CLIENT_INVITES_DISABLED"
  | "AI_ASSISTANT_DISABLED";

export const ALL_FLAG_KEYS: KillSwitchKey[] = [
  "MAINTENANCE_MODE",
  "AI_REVIEW_UPLOADS_DISABLED",
  "DOCUMENT_UPLOADS_DISABLED",
  "PUSH_NOTIFICATIONS_DISABLED",
  "EMAIL_SENDING_DISABLED",
  "STRIPE_CHECKOUT_DISABLED",
  "NEW_REGISTRATIONS_DISABLED",
  "CLIENT_INVITES_DISABLED",
  "AI_ASSISTANT_DISABLED",
];

const CACHE_TTL_MS = 10_000;

type CacheEntry = { value: boolean; expires: number };
const cache = new Map<KillSwitchKey, CacheEntry>();

function edgeConfigAvailable(): boolean {
  return typeof process !== "undefined" && !!process.env.EDGE_CONFIG;
}

function parseBooleanish(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "on" || v === "yes") return true;
    if (v === "false" || v === "0" || v === "off" || v === "no") return false;
  }
  if (typeof raw === "number") return raw !== 0;
  return null;
}

/**
 * Vrátí true/false podle remote kill-switchi. `defaultValue` se použije, když
 * neexistuje žádný zdroj (Edge Config ani ENV). Chyby v Edge Config fetch jsou
 * tiché a fallbackují na ENV.
 */
export async function getKillSwitch(
  key: KillSwitchKey,
  defaultValue = false,
): Promise<boolean> {
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.value;
  }

  let resolved: boolean | null = null;

  if (edgeConfigAvailable()) {
    try {
      const exists = await has(key);
      if (exists) {
        const raw = await get(key);
        const parsed = parseBooleanish(raw);
        if (parsed !== null) resolved = parsed;
      }
    } catch {
      // Edge Config unavailable → fallback na ENV.
    }
  }

  if (resolved === null) {
    const envRaw = process.env[key];
    const parsed = parseBooleanish(envRaw);
    if (parsed !== null) resolved = parsed;
  }

  if (resolved === null) resolved = defaultValue;

  cache.set(key, { value: resolved, expires: Date.now() + CACHE_TTL_MS });
  return resolved;
}

/** Debug / admin — načte všechny kill-switche najednou. */
export async function getAllKillSwitches(): Promise<Record<KillSwitchKey, boolean>> {
  const entries = await Promise.all(
    ALL_FLAG_KEYS.map(async (k) => [k, await getKillSwitch(k)] as const),
  );
  return Object.fromEntries(entries) as Record<KillSwitchKey, boolean>;
}

/** Test-only — vymaže in-memory cache. */
export function __resetKillSwitchCache(): void {
  cache.clear();
}

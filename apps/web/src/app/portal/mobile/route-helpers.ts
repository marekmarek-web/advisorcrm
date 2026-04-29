/**
 * Pure routing helpers used by the mobile portal shell.
 *
 * Extracted from `MobilePortalClient.tsx` so they can be unit-tested in
 * isolation without mounting the full React tree. No React imports, no DOM
 * access — every function is deterministic given its string input.
 */

export type TabId = "home" | "tasks" | "clients" | "pipeline" | "none";

/** Strip query/hash and trailing slash (except `/`). */
export function normalizePortalPathname(pathname: string): string {
  let p = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

/** True when `pathname` is exactly `base` or a nested path under `base`. */
export function portalPathStartsWith(pathname: string, base: string): boolean {
  if (pathname === base) return true;
  return pathname.startsWith(`${base}/`);
}

/**
 * Routes that are intentionally web / desktop first in the mobile shell.
 * Checked before the generic “handled shell” prefix list — order matters for
 * overlapping prefixes (longest / most specific rules should appear first).
 */
export const WEB_ONLY_MOBILE_PORTAL_ROUTES: readonly {
  prefix: string;
  title: string;
  description: string;
}[] = [
  {
    prefix: "/portal/email-campaigns",
    title: "E‑mail kampaně",
    description:
      "Editor kampaní, segmentace a hromadné rozesílky jsou optimalizované pro velký displej. Otevřete tuto sekci v webové verzi Aidvisory na počítači.",
  },
  {
    prefix: "/portal/admin",
    title: "Administrace workspace",
    description:
      "Správcovské funkce (kill switch, AI kvalita, …) vyžadují šířší rozhraní. Použijte webový portál.",
  },
  {
    prefix: "/portal/settings",
    title: "Účet a rozšířené nastavení",
    description:
      "Fakturační údaje, auditní log oznámení a související správu účtu otevřete v prohlížeči na počítači.",
  },
  {
    prefix: "/portal/share",
    title: "Import a export dat",
    description:
      "Hromadné importy a exporty adresářů se spouští z desktopového CRM kvůli rozsahu a kontrole průběhu.",
  },
  {
    prefix: "/portal/team-overview",
    title: "Týmový přehled",
    description:
      "Manažerské přehledy, srovnání týmu a detailní KPI jsou dostupné v desktopové verzi aplikace.",
  },
  {
    prefix: "/portal/calculators",
    title: "Kalkulačky",
    description:
      "Investiční a provizní kalkulačky s více vstupy a grafy jsme v mobilní aplikaci nenahradili celoplošnou obrazovkou — použijte webové CRM.",
  },
];

/**
 * Prefixes backed by explicit branches inside `MobilePortalClient.resolveActiveScreen`.
 * Must NOT contain a naked `/portal` entry (everything would match). `/portal`
 * alone is handled separately in classification.
 *
 * Keep in sync when adding new advisor mobile shells.
 */
export const HANDLED_MOBILE_SHELL_ROUTE_PREFIXES: readonly string[] = [
  "/portal/today",
  "/portal/tasks",
  "/portal/contacts",
  "/portal/pipeline",
  "/portal/households",
  "/portal/mindmap",
  "/portal/messages",
  "/portal/notes",
  "/portal/board",
  "/portal/cold-contacts",
  "/portal/contracts",
  "/portal/analyses",
  "/portal/business-plan",
  "/portal/production",
  "/portal/notifications",
  "/portal/setup",
  "/portal/calendar",
  "/portal/ai",
  "/portal/documents",
  "/portal/scan",
  "/portal/tools",
];

export type MobilePortalRouteClassification =
  | { kind: "shell_resolver" }
  | { kind: "web_only"; title: string; description: string; openPath: string }
  | { kind: "unsupported"; path: string };

/**
 * Classifies a portal path before the imperative screen resolver runs.
 *
 * — `shell_resolver`: continue with the existing nested `resolveActiveScreen` chain.
 * — `web_only`: show `MobileWebOnlyRoutePlaceholder`.
 * — `unsupported`: unknown `/portal/**` slug — must not silently fall through to Dashboard.
 */
export function classifyMobilePortalRoute(normalizedPath: string): MobilePortalRouteClassification {
  const p = normalizedPath;

  for (const rule of WEB_ONLY_MOBILE_PORTAL_ROUTES) {
    if (portalPathStartsWith(p, rule.prefix)) {
      return {
        kind: "web_only",
        title: rule.title,
        description: rule.description,
        openPath: p,
      };
    }
  }

  if (p === "/portal") {
    return { kind: "shell_resolver" };
  }

  for (const prefix of HANDLED_MOBILE_SHELL_ROUTE_PREFIXES) {
    if (portalPathStartsWith(p, prefix)) {
      return { kind: "shell_resolver" };
    }
  }

  if (portalPathStartsWith(p, "/portal")) {
    return { kind: "unsupported", path: p };
  }

  /* Outside `/portal/**` — should not normally mount inside advisor mobile shell */
  return { kind: "unsupported", path: p };
}

/** Bottom navigation highlight only for primary tabs; other routes use "none". */
export function pathnameToBottomTab(pathname: string): TabId {
  const p = normalizePortalPathname(pathname);
  if (p === "/portal") return "home";
  if (p.startsWith("/portal/today")) return "home";
  if (p.startsWith("/portal/tasks")) return "tasks";
  if (p.startsWith("/portal/contacts")) return "clients";
  if (p.startsWith("/portal/pipeline")) return "pipeline";
  return "none";
}

/**
 * Primary bottom-tab hub routes where the **screen title** belongs in scrollable
 * content (mock direction: clean top chrome with menu + actions only).
 * Detail routes (dynamic segment) keep titles in `MobileHeader`.
 */
export function isPrimaryTabHubPath(pathname: string): boolean {
  const p = normalizePortalPathname(pathname);
  if (p === "/portal" || p === "/portal/today" || p.startsWith("/portal/today/")) return true;
  if (p === "/portal/tasks") return true;
  if (p === "/portal/contacts") return true;
  if (p === "/portal/pipeline") return true;
  return false;
}

/** True for routes with a dynamic segment (show back arrow, not hamburger). */
export function isDetailRoute(pathname: string): boolean {
  if (/^\/portal\/contacts\/[^/]+$/.test(pathname) && !pathname.endsWith("/new")) return true;
  if (/^\/portal\/households\/[^/]+$/.test(pathname)) return true;
  if (/^\/portal\/pipeline\/[^/]+$/.test(pathname)) return true;
  if (/^\/portal\/mindmap\/[^/]+$/.test(pathname)) return true;
  if (/^\/portal\/contracts\/review\/[^/]+$/.test(pathname)) return true;
  if (/^\/portal\/calculators\/[^/]+$/.test(pathname)) return true;
  if (pathname.startsWith("/portal/analyses/financial")) return true;
  if (pathname.startsWith("/portal/scan")) return true;
  return false;
}

/** Resolve the logical parent route for the back button (fallback only). */
export function resolveParentRoute(pathname: string): string {
  if (pathname.startsWith("/portal/analyses/financial")) return "/portal/analyses";
  if (/^\/portal\/contacts\/[^/]+/.test(pathname)) return "/portal/contacts";
  if (/^\/portal\/households\/[^/]+/.test(pathname)) return "/portal/households";
  if (/^\/portal\/pipeline\/[^/]+/.test(pathname)) return "/portal/pipeline";
  if (/^\/portal\/mindmap\/[^/]+/.test(pathname)) return "/portal/mindmap";
  if (/^\/portal\/contracts\/review\/[^/]+/.test(pathname)) return "/portal/contracts/review";
  if (/^\/portal\/calculators\/[^/]+/.test(pathname)) return "/portal/calculators";
  if (pathname.startsWith("/portal/scan")) return "/portal/documents";
  return "/portal/today";
}

export function parseContactIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/portal\/contacts\/([^/]+)/);
  return m?.[1] ?? null;
}

export function parseOpportunityIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/portal\/pipeline\/([^/]+)/);
  return m?.[1] ?? null;
}

export function parseHouseholdIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/portal\/households\/([^/]+)/);
  return m?.[1] ?? null;
}

/**
 * Decide whether a header "back" press should pop router history or replace
 * to a logical parent. Extracted so we can test the decision in isolation
 * without mocking `window.history` and `router`.
 *
 * @returns "back" when there's a prior entry we can pop, "replace" when we
 *   must replace the current entry with the parent route (cold-start /
 *   deep-link entry), with the target path included.
 */
export function decideHeaderBackAction(params: {
  pathname: string;
  historyLength: number;
}): { kind: "back" } | { kind: "replace"; target: string } {
  if (params.historyLength > 1) return { kind: "back" };
  const target = isDetailRoute(params.pathname)
    ? resolveParentRoute(params.pathname)
    : "/portal/today";
  return { kind: "replace", target };
}

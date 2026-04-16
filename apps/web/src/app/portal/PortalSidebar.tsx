"use client";

import { useState, useEffect, useRef, useCallback, useMemo, type ComponentType } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Home,
  LayoutGrid,
  Users,
  UsersRound,
  Building2,
  Briefcase,
  BarChart3,
  Calculator,
  CheckSquare,
  TrendingUp,
  Calendar,
  StickyNote,
  Bell,
  Palette,
  Sun,
  Moon,
  Monitor,
  Settings,
  Network,
  ChevronLeft,
  ChevronRight,
  Search,
  MessageCircle,
  Zap,
  GripVertical,
  MoreVertical,
  FileText,
  Target,
  User,
  Command,
  FileX2,
  Megaphone,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { usePortalBadgeCounts } from "@/app/portal/PortalBadgeCountsContext";
import clsx from "clsx";
import { displayNameFromUserMetadata, getUserMenuInitials } from "@/lib/user-initials";
import { AiAssistantBrandIcon } from "@/app/components/AiAssistantBrandIcon";
import { isTerminationsModuleEnabled } from "@/lib/terminations/terminations-feature-flag";

/** Zarovnáno s main banner txt (expanded 300px, collapsed 88px). */
export const PORTAL_SIDEBAR_WIDTH_PX = 300;
export const PORTAL_SIDEBAR_COLLAPSED_PX = 88;

/** Bump when default section order changes so users get the new layout (e.g. Nástroje pod Přehled). */
const SIDEBAR_ORDER_KEY = "portal-sidebar-order-v2";

interface NavItemConfig {
  href: string;
  label: string;
  Icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  badgeKey?: "tasks" | "messages" | null;
  isAi?: boolean;
  isHighlighted?: boolean;
  hoverAnim?: string;
  /** Aktivní stav i na podcestách (např. detail žádosti). */
  activePathPrefix?: string;
  /** Nepovažovat za aktivní na této přesné cestě (např. registr vedle průvodce). */
  activePathPrefixExclude?: string;
}

interface SectionConfig {
  id: string;
  section: string;
  specialBg?: boolean;
  items: NavItemConfig[];
}

function GoogleDriveLogo({ size = 18, className }: { size?: number; className?: string; strokeWidth?: number }) {
  return (
    <span className={className} style={{ width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <img
        src="/logos/google-drive.png"
        alt="Google Disk"
        style={{ maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", objectFit: "contain" }}
      />
    </span>
  );
}

function GmailLogo({ size = 18, className }: { size?: number; className?: string; strokeWidth?: number }) {
  return (
    <span className={className} style={{ width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <img
        src="/logos/gmail.png"
        alt="Gmail"
        style={{ maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", objectFit: "contain" }}
      />
    </span>
  );
}

const DEFAULT_SECTIONS: SectionConfig[] = [
  {
    id: "sec-prehled",
    section: "Přehled",
    items: [
      { href: "/portal/today", label: "Nástěnka", Icon: Home, isHighlighted: true, hoverAnim: "group-hover:-translate-y-1 group-hover:scale-110" },
      { href: "/portal/tasks", label: "Úkoly", Icon: CheckSquare, badgeKey: "tasks", hoverAnim: "group-hover:rotate-12 group-hover:scale-110" },
      { href: "/portal/messages", label: "Zprávy", Icon: MessageCircle, badgeKey: "messages", hoverAnim: "group-hover:rotate-[20deg] origin-top" },
      { href: "/portal/calendar", label: "Kalendář", Icon: Calendar, isHighlighted: true, hoverAnim: "group-hover:-translate-y-1 group-hover:scale-110" },
      { href: "/portal/notes", label: "Zápisky", Icon: FileText, hoverAnim: "group-hover:translate-x-1" },
    ],
  },
  {
    id: "sec-nastroje",
    section: "Nástroje poradce",
    specialBg: true,
    items: [
      { href: "/portal/contracts/review", label: "AI Review smluv", Icon: AiAssistantBrandIcon, isAi: true },
      {
        href: "/portal/terminations/new",
        label: "Výpověď smlouvy",
        Icon: FileX2,
        activePathPrefix: "/portal/terminations",
        activePathPrefixExclude: "/portal/terminations/registry",
        hoverAnim: "group-hover:-translate-y-0.5 group-hover:scale-110",
      },
      { href: "/portal/analyses", label: "Finanční analýzy", Icon: BarChart3, isHighlighted: true, hoverAnim: "group-hover:scale-110 group-hover:rotate-6" },
      { href: "/portal/calculators", label: "Kalkulačky", Icon: Calculator, hoverAnim: "group-hover:rotate-12 group-hover:scale-110" },
      { href: "/portal/mindmap", label: "Mindmap", Icon: Network, hoverAnim: "group-hover:-translate-y-1" },
      { href: "/portal/tools/drive", label: "Google Disk", Icon: GoogleDriveLogo, hoverAnim: "group-hover:scale-110" },
      { href: "/portal/tools/gmail", label: "Gmail", Icon: GmailLogo, hoverAnim: "group-hover:scale-110" },
    ],
  },
  {
    id: "sec-databaze",
    section: "Klientská databáze",
    items: [
      { href: "/portal/contacts", label: "Klienti", Icon: Users, hoverAnim: "group-hover:scale-110" },
      { href: "/portal/households", label: "Domácnosti", Icon: Building2, hoverAnim: "group-hover:-translate-y-1" },
      { href: "/portal/email-campaigns", label: "E-mail kampaně", Icon: Megaphone, hoverAnim: "group-hover:scale-110" },
    ],
  },
  {
    id: "sec-byznys",
    section: "Obchod a Byznys",
    items: [
      { href: "/portal/pipeline", label: "Obchody", Icon: Briefcase, hoverAnim: "group-hover:rotate-[-12deg] group-hover:scale-110" },
      { href: "/portal/board", label: "Board", Icon: LayoutGrid, hoverAnim: "group-hover:scale-110" },
      { href: "/portal/production", label: "Produkce", Icon: TrendingUp, hoverAnim: "group-hover:translate-x-1 group-hover:-translate-y-1" },
      { href: "/portal/business-plan", label: "Business plán", Icon: Target, hoverAnim: "group-hover:scale-110" },
    ],
  },
  {
    id: "sec-vedeni",
    section: "Vedení týmu",
    items: [
      { href: "/portal/team-overview", label: "Týmový přehled", Icon: UsersRound, hoverAnim: "group-hover:scale-110" },
    ],
  },
  {
    id: "sec-system",
    section: "Systém",
    items: [
      { href: "/portal/notifications", label: "Klientské požadavky", Icon: Bell },
      { href: "/portal/setup", label: "Nastavení", Icon: Settings, hoverAnim: "group-hover:rotate-90 duration-500" },
    ],
  },
];

function loadOrderFromStorage(): { sectionId: string; hrefs: string[] }[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SIDEBAR_ORDER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { sectionId: string; hrefs: string[] }[];
  } catch {
    return null;
  }
}

function applyOrderToSections(
  sections: SectionConfig[],
  order: { sectionId: string; hrefs: string[] }[] | null
): SectionConfig[] {
  if (!order?.length) return sections;
  const allHrefs = new Set(sections.flatMap((s) => s.items.map((i) => i.href)));
  const orderedHrefs = order.flatMap((o) => o.hrefs).filter((h) => allHrefs.has(h));
  const hrefToItem = new Map<string, NavItemConfig>();
  sections.forEach((sec) => sec.items.forEach((it) => hrefToItem.set(it.href, it)));
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const result: SectionConfig[] = [];
  const used = new Set<string>();
  for (const { sectionId, hrefs } of order) {
    const sec = sectionById.get(sectionId);
    if (!sec) continue;
    const items: NavItemConfig[] = [];
    for (const href of hrefs) {
      const item = hrefToItem.get(href) as NavItemConfig | undefined;
      if (item && !used.has(href)) {
        items.push(item);
        used.add(href);
      }
    }
    const newItems = sec.items.filter((i) => !used.has(i.href));
    newItems.forEach((i) => { items.push(i); used.add(i.href); });
    if (items.length > 0) result.push({ ...sec, items });
  }
  sections.forEach((sec) => {
    if (result.some((r) => r.id === sec.id)) return;
    const rest = sec.items.filter((i) => !used.has(i.href));
    if (rest.length > 0) result.push({ ...sec, items: rest });
  });
  return result.length ? result : sections;
}

function getOrderFromSections(sections: SectionConfig[]): { sectionId: string; hrefs: string[] }[] {
  return sections.map((s) => ({ sectionId: s.id, hrefs: s.items.map((i) => i.href) }));
}

function isItemActive(
  pathname: string,
  item: Pick<NavItemConfig, "href" | "activePathPrefix" | "activePathPrefixExclude">
): boolean {
  if (item.activePathPrefix) {
    const ex = item.activePathPrefixExclude;
    if (!ex || pathname !== ex) {
      const p = item.activePathPrefix;
      if (pathname === p || pathname.startsWith(`${p}/`)) return true;
    }
  }
  const href = item.href;
  const hrefPath = href.split("?")[0]?.split("#")[0] ?? href;
  if (pathname === hrefPath) return true;
  if (hrefPath === "/portal/today") return false;
  return pathname.startsWith(`${hrefPath}/`);
}

interface PortalSidebarProps {
  showTeamOverview?: boolean;
  /** Profilová fotka poradce (z layoutu / advisor_preferences). */
  advisorAvatarUrl?: string | null;
  width?: number;
  collapsed?: boolean;
  /** Desktop 768–1099px: menu je překrývací drawer (hamburger), ne docked sidebar. */
  narrowDesktopOverlay?: boolean;
  onResize?: (width: number) => void;
  onCollapsedChange?: (collapsed: boolean) => void;
  onMount?: () => void;
  mobileDrawerOpen?: boolean;
  onMobileDrawerClose?: () => void;
  /** Myš/trackpad: při opuštění panelu zavřít sliding drawer (mobil / úzký desktop). */
  slidingNavCloseOnPointerLeave?: boolean;
}

function filterSectionsByRole(sections: SectionConfig[], showTeamOverview: boolean | undefined): SectionConfig[] {
  if (showTeamOverview === false) return sections.filter((sec) => sec.id !== "sec-vedeni");
  return sections;
}

function filterTerminationNavItem(sections: SectionConfig[], terminationsEnabled: boolean): SectionConfig[] {
  if (terminationsEnabled) return sections;
  const termHrefs = new Set(["/portal/terminations/new"]);
  return sections.map((sec) =>
    sec.id === "sec-nastroje"
      ? { ...sec, items: sec.items.filter((i) => !termHrefs.has(i.href)) }
      : sec
  );
}

export function PortalSidebar({
  showTeamOverview,
  advisorAvatarUrl = null,
  width = PORTAL_SIDEBAR_WIDTH_PX,
  collapsed = false,
  narrowDesktopOverlay = false,
  onResize,
  onCollapsedChange,
  onMount,
  mobileDrawerOpen = false,
  onMobileDrawerClose,
  slidingNavCloseOnPointerLeave = false,
}: PortalSidebarProps = {}) {
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState("");
  const baseSections = useMemo(
    () =>
      filterTerminationNavItem(
        filterSectionsByRole(DEFAULT_SECTIONS, showTeamOverview),
        isTerminationsModuleEnabled()
      ),
    [showTeamOverview]
  );
  const [menuSections, setMenuSections] = useState<SectionConfig[]>(baseSections);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sunSpinKey, setSunSpinKey] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";
  const sunActive = theme === "light" || (theme === "system" && resolvedTheme === "light");
  const moonActive = theme === "dark" || (theme === "system" && resolvedTheme === "dark");
  const systemActive = theme === "system";

  useEffect(() => {
    const order = loadOrderFromStorage();
    setMenuSections(order?.length ? applyOrderToSections(baseSections, order) : baseSections);
  }, [baseSections]);
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  const [isMobileState, setIsMobileState] = useState(false);
  const dragItemRef = useRef<{ groupIdx: number; itemIdx: number } | null>(null);
  const dragOverRef = useRef<{ groupIdx: number; itemIdx: number } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)"); /* mobile: below md (768px) */
    const update = () => setIsMobileState(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const isControlled = onMobileDrawerClose != null;
  const isSlidingNav = isMobileState || narrowDesktopOverlay;
  const navDrawerOpen = isControlled ? mobileDrawerOpen : internalMobileOpen;
  const navOpen = isSlidingNav && navDrawerOpen;
  const contentCollapsed = narrowDesktopOverlay && navOpen ? false : collapsed;

  const setMobileOpen = useCallback(
    (open: boolean) => {
      if (isControlled) {
        if (!open) onMobileDrawerClose?.();
      } else {
        setInternalMobileOpen(open);
      }
    },
    [isControlled, onMobileDrawerClose]
  );

  const handleSlidingNavAsidePointerLeave = useCallback(() => {
    if (!slidingNavCloseOnPointerLeave || !isSlidingNav || !navDrawerOpen || paletteOpen) return;
    setMobileOpen(false);
  }, [slidingNavCloseOnPointerLeave, isSlidingNav, navDrawerOpen, paletteOpen, setMobileOpen]);

  const { openTasks: openTasksCount, unreadConversations: unreadMessagesCount } = usePortalBadgeCounts();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [isLocalhost, setIsLocalhost] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hostname === "localhost") setIsLocalhost(true);
  }, []);

  useEffect(() => { onMount?.(); }, [onMount]);

  /** Parent often passes an inline `() => setOpen(false)`; must not be a hook dep or every re-render closes the drawer. */
  const onMobileDrawerCloseRef = useRef(onMobileDrawerClose);
  onMobileDrawerCloseRef.current = onMobileDrawerClose;

  useEffect(() => {
    if (isControlled) onMobileDrawerCloseRef.current?.();
    else setInternalMobileOpen(false);
  }, [pathname, isControlled]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email ?? null);
      const fromMeta = displayNameFromUserMetadata(user?.user_metadata as Record<string, unknown> | undefined);
      if (fromMeta) setUserName(fromMeta);
    });
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen, setMobileOpen]);

  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  const handleDragStart = useCallback((e: React.DragEvent, groupIdx: number, itemIdx: number) => {
    dragItemRef.current = { groupIdx, itemIdx };
    setTimeout(() => {
      (e.target as HTMLElement).classList.add("opacity-40", "scale-[0.98]", "bg-[color:var(--wp-surface-muted)]");
    }, 0);
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.target as HTMLElement).classList.remove("opacity-40", "scale-[0.98]", "bg-[color:var(--wp-surface-muted)]");
    const from = dragItemRef.current;
    const to = dragOverRef.current;
    dragItemRef.current = null;
    dragOverRef.current = null;
    if (!from || !to || (from.groupIdx === to.groupIdx && from.itemIdx === to.itemIdx)) return;
    setMenuSections((prev) => {
      const next = prev.map((sec, i) => ({ ...sec, items: [...sec.items] }));
      const [moved] = next[from.groupIdx].items.splice(from.itemIdx, 1);
      next[to.groupIdx].items.splice(to.itemIdx, 0, moved);
      try {
        localStorage.setItem(SIDEBAR_ORDER_KEY, JSON.stringify(getOrderFromSections(next)));
      } catch {}
      return next;
    });
  }, []);

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return menuSections;
    return menuSections
      .map((sec) => ({
        ...sec,
        items: sec.items.filter(
          (item) => sec.section.toLowerCase().includes(q) || item.label.toLowerCase().includes(q)
        ),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [menuSections, searchQuery]);

  const effectiveWidthPx = contentCollapsed ? PORTAL_SIDEBAR_COLLAPSED_PX : width;

  const asidePositionClasses = isSlidingNav
    ? isMobileState
      ? "left-0 top-0 bottom-0 border-r border-[color:var(--wp-sidebar-card-border)] shadow-[4px_0_24px_-12px_rgba(0,0,0,0.12)]"
      : "left-5 top-5 bottom-5 h-auto rounded-[32px] border border-[color:var(--wp-sidebar-card-border)] shadow-[var(--wp-sidebar-card-shadow)]"
    : [
        "max-md:left-0 max-md:top-0 max-md:bottom-0 max-md:border-r max-md:border-[color:var(--wp-sidebar-card-border)] max-md:shadow-[4px_0_24px_-12px_rgba(0,0,0,0.12)]",
        "md:left-5 md:top-5 md:bottom-5 md:h-auto md:rounded-[32px] md:border md:border-[color:var(--wp-sidebar-card-border)] md:shadow-[var(--wp-sidebar-card-shadow)]",
      ].join(" ");

  const asideTransformClasses = isSlidingNav
    ? navOpen
      ? "translate-x-0 pointer-events-auto"
      : "-translate-x-full pointer-events-none"
    : [
        "translate-x-0 pointer-events-auto max-md:-translate-x-full max-md:pointer-events-none",
        "md:z-20 md:translate-x-0",
      ].join(" ");

  return (
    <>
      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow { animation: spin-slow 8s linear infinite; }
        @keyframes pulse-glow {
          0%, 100% { opacity: 1; filter: drop-shadow(0 0 4px rgba(217, 70, 239, 0.4)); }
          50% { opacity: 0.7; filter: drop-shadow(0 0 10px rgba(217, 70, 239, 0.8)); }
        }
        .animate-pulse-glow { animation: pulse-glow 2.5s ease-in-out infinite; }
      `}</style>

      {navOpen && isSlidingNav && (
        <div
          className="fixed inset-0 z-drawer-overlay bg-black/40"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={[
          "fixed z-drawer-panel flex flex-col shrink-0 transition-[width,transform] duration-500 ease-\\[cubic-bezier(0.16,1,0.3,1)\\]",
          "font-[family-name:var(--font-jakarta),ui-sans-serif,system-ui,sans-serif]",
          "bg-[color:var(--wp-sidebar-card-bg)] backdrop-blur-3xl",
          asidePositionClasses,
          asideTransformClasses,
        ].join(" ")}
        style={{
          width: isSlidingNav ? "min(85vw, 300px)" : `${effectiveWidthPx}px`,
        }}
        onMouseLeave={slidingNavCloseOnPointerLeave ? handleSlidingNavAsidePointerLeave : undefined}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent opacity-80"
          aria-hidden
        />
        {/* Header – collapsed: mark; expanded: full logo → public/logos */}
        <div
          className={[
            "flex h-20 min-h-[5rem] items-center justify-between flex-shrink-0 border-b px-4 md:h-[4.5rem] md:min-h-[4.5rem] md:px-5",
            isDark ? "border-white/5" : "border-[color:var(--wp-surface-card-border)]/50",
          ].join(" ")}
        >
          <Link
            href="/portal"
            prefetch={false}
            className={`flex items-center overflow-hidden ${contentCollapsed ? "justify-center w-full" : "min-w-0"}`}
            aria-label="Aidvisora – přejít na nástěnku"
          >
            {contentCollapsed ? (
              <img
                key="logo-a"
                src="/logos/Aidvisora%20logo%20new%20fav.png"
                alt="Aidvisora"
                className="h-10 w-10 object-contain object-center flex-shrink-0"
                style={isDark ? { filter: "brightness(0) invert(1)" } : undefined}
              />
            ) : (
              <img
                key="logo-big"
                src="/logos/Aidvisora%20logo%20new.png"
                alt="Aidvisora"
                className="h-14 max-h-14 w-auto max-w-full object-contain object-left flex-shrink-0"
                style={isDark ? { filter: "brightness(0) invert(1)" } : undefined}
              />
            )}
          </Link>
          <div className="flex items-center shrink-0">
            {((onCollapsedChange && !narrowDesktopOverlay) || (narrowDesktopOverlay && navOpen)) && (
              <button
                type="button"
                onClick={() => {
                  if (narrowDesktopOverlay && navOpen && onMobileDrawerClose) {
                    onMobileDrawerClose();
                  } else if (onCollapsedChange) {
                    onCollapsedChange(!collapsed);
                  }
                }}
                className={[
                  "hidden md:flex h-8 w-8 shrink-0 items-center justify-center transition-all",
                  contentCollapsed
                    ? "absolute -right-4 top-7 z-50 rounded-full bg-indigo-600 text-white shadow-lg hover:scale-110"
                    : [
                        "rounded-full border border-transparent",
                        isDark
                          ? "text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-card)]/10 hover:text-white"
                          : "text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-card)]/10 hover:text-[color:var(--wp-text)]",
                      ].join(" "),
                ].join(" ")}
                aria-label={
                  narrowDesktopOverlay && navOpen
                    ? "Zavřít menu"
                    : contentCollapsed
                      ? "Rozbalit panel"
                      : "Sbalit panel"
                }
              >
                {contentCollapsed ? <ChevronRight size={14} strokeWidth={3} /> : <ChevronLeft size={16} />}
              </button>
            )}
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className={clsx(
                "p-2 rounded-lg min-h-[44px] min-w-[44px] items-center justify-center transition-colors",
                isDark ? "text-white hover:bg-[color:var(--wp-surface-card)]/10" : "text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]",
                !(navOpen && isSlidingNav) && "hidden",
                navOpen && isSlidingNav && (isMobileState ? "flex md:hidden" : "flex"),
              )}
              aria-label="Zavřít menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search – main banner txt: py-5, rounded-[16px], Command + K */}
        {!contentCollapsed && (
          <div className="relative z-10 flex-shrink-0 px-4 py-3 transition-all duration-300 md:px-5 md:py-3.5">
            <div className="relative">
              <Search
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 z-[1] -translate-y-1/2 text-[color:var(--wp-sidebar-search-text)] opacity-60"
                aria-hidden
              />
              <input
                type="text"
                placeholder="Hledat v menu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="min-h-[44px] w-full rounded-2xl border border-[color:var(--wp-sidebar-search-border)] bg-[color:var(--wp-sidebar-search-bg)] py-2.5 pl-11 pr-16 text-sm font-semibold text-[color:var(--wp-sidebar-search-text)] outline-none transition-all placeholder:font-medium placeholder:text-[color:var(--wp-sidebar-search-placeholder)] focus:border-[color:var(--wp-sidebar-search-focus-border)] focus:bg-[color:var(--wp-sidebar-search-focus-bg)] focus:ring-4 focus:ring-[color:var(--wp-sidebar-search-focus-ring)]"
                aria-label="Hledat v menu"
              />
              <div className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 opacity-50">
                <Command size={12} className="text-[color:var(--wp-sidebar-search-text)]" aria-hidden />
                <span className="text-[10px] font-bold text-[color:var(--wp-sidebar-search-text)]">K</span>
              </div>
            </div>
          </div>
        )}

        {/* Nav – sekce, specialBg, AI položka, D&D */}
        <nav className="flex-1 space-y-4 overflow-y-auto pb-5 pt-2 hide-scrollbar md:space-y-5">
          {filteredSections.map((group, groupIdx) => (
            <div
              key={group.id}
              className={[
                "relative transition-all duration-300",
                groupIdx === 0 && contentCollapsed ? "mt-4" : "",
                group.specialBg && !contentCollapsed
                  ? isDark
                    ? "mx-3 rounded-2xl border border-fuchsia-500/20 bg-gradient-to-b from-fuchsia-500/10 to-indigo-500/5 p-3 shadow-inner"
                    : "mx-3 rounded-2xl border border-purple-100/50 bg-gradient-to-b from-purple-50/50 to-indigo-50/30 p-3 shadow-inner"
                  : "px-3",
                group.specialBg && contentCollapsed ? (isDark ? "mx-2 rounded-2xl bg-[color:var(--wp-surface-card)]/10 py-2" : "mx-2 rounded-2xl bg-fuchsia-50/40 py-2") : "",
              ].join(" ")}
            >
              {!contentCollapsed && (
                <div className="relative z-10 mb-3 ml-3 flex items-center pt-1">
                  <h4
                    className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] ${
                      group.specialBg ? (isDark ? "text-fuchsia-400" : "text-purple-600") : isDark ? "text-[color:var(--wp-text-tertiary)]" : "text-[color:var(--wp-text-tertiary)]"
                    }`}
                  >
                    {group.specialBg && <Zap size={12} className="shrink-0 fill-amber-500/20 text-amber-500" />}
                    {group.section}
                  </h4>
                </div>
              )}
              {contentCollapsed && groupIdx !== 0 && !group.specialBg && (
                <div className={`mx-auto mb-4 mt-2 h-px w-8 ${isDark ? "bg-[color:var(--wp-surface-card)]/10" : "bg-[color:var(--wp-surface-card-border)]"}`} aria-hidden />
              )}
              <ul className="relative z-10 space-y-1.5">
                {group.items.map((item, itemIdx) => {
                  const isActive = isItemActive(pathname, item);
                  const Icon = item.Icon;
                  const badge =
                    item.badgeKey === "tasks" && openTasksCount != null && openTasksCount > 0
                      ? openTasksCount
                      : item.badgeKey === "messages" && unreadMessagesCount != null && unreadMessagesCount > 0
                        ? unreadMessagesCount
                        : null;

                  if (item.isAi) {
                    return (
                      <li
                        key={item.href}
                        draggable={!contentCollapsed && !isSlidingNav}
                        onDragStart={(e) => handleDragStart(e, groupIdx, itemIdx)}
                        onDragEnter={() => { dragOverRef.current = { groupIdx, itemIdx }; }}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => e.preventDefault()}
                        className="group relative rounded-xl"
                      >
                        <Link
                          href={item.href}
                          prefetch={false}
                          className={`w-full flex items-center relative overflow-hidden transition-all duration-300
                            ${contentCollapsed ? "min-h-[44px] justify-center rounded-2xl p-3" : "min-h-[44px] justify-between rounded-[14px] px-4 py-3"}
                            ${isDark
                              ? isActive
                                ? "border border-[color:var(--wp-nav-active-border)] bg-[color:var(--wp-nav-active-bg)] text-[color:var(--wp-nav-active-text)] shadow-[var(--wp-nav-active-shadow)]"
                                : "border border-transparent text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-card)]/5 hover:text-white"
                              : isActive
                                ? "border border-transparent bg-gradient-to-r from-fuchsia-600 to-indigo-600 font-bold text-white shadow-lg shadow-fuchsia-900/20"
                                : "border border-transparent text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]/60 hover:text-[color:var(--wp-text)]"}
                          `}
                          title={contentCollapsed ? item.label : undefined}
                        >
                          <AiAssistantBrandIcon size={22} className="shrink-0" />
                          {!contentCollapsed && (
                            <span className={`ml-3 flex-1 text-left text-sm font-black tracking-wide ${isActive ? "text-white" : isDark ? "text-white" : "text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-600 to-indigo-600"}`}>
                              {item.label}
                            </span>
                          )}
                          {!contentCollapsed && (
                            <GripVertical size={14} className={`hidden md:block ${isDark ? "text-white/30" : "text-fuchsia-200"} opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing shrink-0`} />
                          )}
                        </Link>
                      </li>
                    );
                  }

                  return (
                    <li
                      key={item.href}
                      draggable={!contentCollapsed && !isSlidingNav}
                      onDragStart={(e) => handleDragStart(e, groupIdx, itemIdx)}
                      onDragEnter={() => { dragOverRef.current = { groupIdx, itemIdx }; }}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      className="group relative rounded-xl"
                    >
                      <Link
                        href={item.href}
                        prefetch={false}
                        className={`w-full flex items-center relative overflow-hidden transition-all duration-300
                          ${contentCollapsed ? "min-h-[44px] justify-center rounded-2xl p-3" : "min-h-[44px] rounded-[14px] px-4 py-3"}
                          ${isDark
                            ? isActive
                              ? "border border-[color:var(--wp-nav-active-border)] bg-[color:var(--wp-nav-active-bg)] text-[color:var(--wp-nav-active-text)] shadow-[var(--wp-nav-active-shadow)]"
                              : "border border-transparent text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-card)]/5 hover:text-white"
                            : isActive
                              ? "border border-[color:var(--wp-nav-active-border)] bg-[color:var(--wp-nav-active-bg)] font-bold text-[color:var(--wp-nav-active-text)] shadow-[var(--wp-nav-active-shadow)]"
                              : item.isHighlighted
                                ? "border border-transparent font-bold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]/60 hover:text-[color:var(--wp-text)]"
                                : "border border-transparent font-medium text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]/60 hover:text-[color:var(--wp-text)]"}
                        `}
                        title={contentCollapsed ? item.label : undefined}
                      >
                        {contentCollapsed && isActive && (
                          <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 rounded-r-full ${isDark ? "bg-white/60" : "bg-indigo-400"}`} aria-hidden />
                        )}
                        <div className={`relative flex items-center justify-center shrink-0 transition-all duration-300 ${!isActive && item.hoverAnim ? item.hoverAnim : ""}`}>
                          <Icon
                            size={18}
                            className={`transition-colors ${
                              isActive
                                ? "text-[color:var(--wp-nav-active-text)]"
                                : isDark
                                  ? "text-white"
                                  : "text-[color:var(--wp-text-secondary)] group-hover:text-indigo-600"
                            }`}
                            strokeWidth={isActive || item.isHighlighted ? 2.5 : 2}
                          />
                        </div>
                        {!contentCollapsed && (
                          <span
                            className={`ml-3 flex-1 text-left text-sm whitespace-nowrap tracking-wide ${
                              isActive
                                ? "font-bold text-[color:var(--wp-nav-active-text)]"
                                : isDark
                                  ? "font-semibold text-white"
                                  : item.isHighlighted
                                    ? "font-bold text-[color:var(--wp-text)]"
                                    : "font-semibold text-[color:var(--wp-text-secondary)]"
                            }`}
                          >
                            {item.label}
                          </span>
                        )}
                        {!contentCollapsed && badge != null && (
                          <span
                            className={`text-[10px] font-black px-2 py-0.5 rounded-full transition-colors mr-2 shrink-0 ${
                              isDark
                                ? "bg-white/15 text-white ring-1 ring-white/25"
                                : isActive
                                  ? "bg-[color:var(--wp-nav-active-text)]/12 text-[color:var(--wp-nav-active-text)] ring-1 ring-[color:var(--wp-nav-active-border)]/40"
                                  : "bg-amber-100 text-amber-700 group-hover:bg-amber-200"
                            }`}
                          >
                            {badge > 99 ? "99+" : badge}
                          </span>
                        )}
                        {!contentCollapsed && (
                          <GripVertical size={14} className={`hidden md:block ${isDark ? "text-white/30" : "text-[color:var(--wp-text-tertiary)]"} opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing shrink-0 ${badge == null ? "ml-auto" : ""}`} />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {isLocalhost && (
            <div className={`px-3 mt-4 pt-4 border-t ${isDark ? "border-white/10" : "border-[color:var(--wp-surface-card-border)]"}`}>
              <Link
                href="/klientska-zona"
                prefetch={false}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl min-h-[44px] transition-colors ${
                  isDark
                    ? "text-white/90 hover:bg-[color:var(--wp-surface-card)]/10"
                    : "text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
                }`}
                title="Přihlásit se jako klient (localhost)"
              >
                <User size={18} className="shrink-0" />
                {!contentCollapsed && <span className="text-sm font-semibold">Klientská zóna</span>}
              </Link>
            </div>
          )}
          {filteredSections.length === 0 && (
            <p className="px-3 py-4 text-sm text-[color:var(--wp-text-muted)]">Žádné položky nevyhovují hledání.</p>
          )}
        </nav>

        {/* Spodní blok – profil + přepínač palety; konzistentní šířka a zarovnání (90°) */}
        <div className="flex-shrink-0 border-t border-[color:var(--wp-sidebar-card-border)]">
          {/* Footer – profil */}
          <div className="w-full px-5 py-4">
            <Link
              href="/portal/setup?tab=profil"
              prefetch={false}
              className={`flex items-center group cursor-pointer p-2 -m-2 rounded-xl transition-colors w-full max-w-full ${contentCollapsed ? "justify-center" : "justify-between"} ${isDark ? "hover:bg-[color:var(--wp-surface-card)]/10" : "hover:bg-[color:var(--wp-surface-card)]"}`}
              title={contentCollapsed ? (userName ?? userEmail ?? "Profil") : undefined}
            >
              <div className="flex items-center gap-3 overflow-hidden min-w-0">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-aidv-dashboard-cta to-aidv-accent-purple flex items-center justify-center text-white font-black text-sm shrink-0 shadow-inner overflow-hidden">
                  {advisorAvatarUrl ? (
                    <Image
                      src={advisorAvatarUrl}
                      alt=""
                      width={40}
                      height={40}
                      className="h-full w-full object-cover"
                      unoptimized
                    />
                  ) : (
                    getUserMenuInitials({ displayName: userName, email: userEmail })
                  )}
                </div>
                {!contentCollapsed && (
                  <div className="min-w-0">
                    <p className={`text-sm font-black truncate ${isDark ? "text-white" : "text-[color:var(--wp-text)]"}`}>{userName ?? userEmail ?? "Profil"}</p>
                    <p className={`text-[10px] font-bold uppercase tracking-widest truncate ${isDark ? "text-white/60" : "text-[color:var(--wp-text-tertiary)]"}`}>AIDVISORA CRM V2.0</p>
                  </div>
                )}
              </div>
              {!contentCollapsed && (
                <MoreVertical size={16} className={`shrink-0 ${isDark ? "text-white/70 group-hover:text-white" : "text-[color:var(--wp-text-tertiary)] group-hover:text-[color:var(--wp-text-secondary)]"}`} />
              )}
            </Link>
          </div>

          <div className="relative z-[60] w-full px-5 pb-4 flex justify-center">
            {paletteOpen && (
              <div
                className="fixed inset-0 z-[30] bg-black/25 backdrop-blur-[2px] md:bg-black/20 pointer-events-auto"
                aria-hidden
                onClick={() => {
                  setPaletteOpen(false);
                }}
              />
            )}
            <div
              className={`relative z-[50] flex w-full max-w-[280px] justify-center rounded-[20px] p-1.5 shadow-lg ${
                isDark ? "bg-[#060918]/80 backdrop-blur-md border border-white/10" : "bg-wp-surface-muted border border-wp-surface-card-border"
              }`}
            >
              <div className="relative flex min-w-0 w-full max-w-[140px] justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setPaletteOpen((o) => !o);
                  }}
                  className={`p-2.5 rounded-[14px] transition-colors duration-300 min-h-[44px] min-w-[44px] w-full flex flex-1 items-center justify-center ${
                    paletteOpen
                      ? isDark
                        ? "bg-[color:var(--wp-surface-card)]/20 text-white shadow-sm"
                        : "bg-wp-surface-raised text-wp-text shadow-sm"
                      : isDark
                        ? "text-white hover:bg-[color:var(--wp-surface-card)]/10"
                        : "text-wp-text-tertiary hover:bg-wp-surface-raised"
                  }`}
                  title="Motiv"
                  aria-label="Motiv aplikace: světlý, tmavý nebo systém"
                  aria-expanded={paletteOpen}
                >
                  <Palette size={20} strokeWidth={2} />
                </button>
                {paletteOpen && (
                  <div
                    role="menu"
                    className="absolute bottom-full left-1/2 z-[100] mb-2 min-w-[min(100vw-2rem,280px)] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-[24px] border border-[color:var(--wp-theme-popover-border)] bg-[color:var(--wp-theme-popover-bg)] p-2 shadow-2xl backdrop-blur-2xl pointer-events-auto"
                  >
                    <p
                      className={clsx(
                        "px-2 pb-1.5 text-[9px] font-black uppercase tracking-widest",
                        isDark ? "text-white/50" : "text-[color:var(--wp-text-tertiary)]",
                      )}
                    >
                      Motiv
                    </p>
                    <div
                      className={clsx(
                        "flex w-full gap-0.5 rounded-full p-1",
                        isDark ? "bg-black/25" : "bg-[color:var(--wp-surface-card-border)]/80",
                      )}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setTheme("light");
                          setSunSpinKey((k) => k + 1);
                          setPaletteOpen(false);
                        }}
                        className={clsx(
                          "flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full px-2 py-2 text-[9px] font-bold uppercase tracking-widest transition-all duration-300",
                          sunActive
                            ? isDark
                              ? "bg-[color:var(--wp-surface-card)]/20 text-white shadow-sm ring-1 ring-white/15"
                              : "bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text)] shadow-md"
                            : isDark
                              ? "text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-card)]/10 hover:text-white"
                              : "text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-card)]/60 hover:text-[color:var(--wp-text)]",
                        )}
                      >
                        <Sun
                          key={sunSpinKey}
                          size={18}
                          className={sunSpinKey > 0 ? "animate-theme-sun-spin" : undefined}
                          aria-hidden
                        />
                        Světlý
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setTheme("dark");
                          setPaletteOpen(false);
                        }}
                        className={clsx(
                          "flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full px-2 py-2 text-[9px] font-bold uppercase tracking-widest transition-all duration-300",
                          moonActive
                            ? isDark
                              ? "bg-[color:var(--wp-surface-card)]/20 text-white shadow-sm ring-1 ring-white/15"
                              : "bg-[color:var(--wp-text)] text-[color:var(--wp-link-active)] shadow-md"
                            : isDark
                              ? "text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-card)]/10 hover:text-white"
                              : "text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-card)]/60 hover:text-[color:var(--wp-text)]",
                        )}
                      >
                        <Moon size={18} aria-hidden />
                        Tmavý
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setTheme("system");
                          setPaletteOpen(false);
                        }}
                        className={clsx(
                          "flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full px-2 py-2 text-[9px] font-bold uppercase tracking-widest transition-all duration-300",
                          systemActive
                            ? isDark
                              ? "bg-[color:var(--wp-surface-card)]/20 text-white shadow-sm ring-1 ring-white/15"
                              : "bg-[color:var(--wp-text)] text-[color:var(--wp-link-active)] shadow-md"
                            : isDark
                              ? "text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-card)]/10 hover:text-white"
                              : "text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-card)]/60 hover:text-[color:var(--wp-text)]",
                        )}
                      >
                        <Monitor size={18} aria-hidden />
                        Systém
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {onResize && !contentCollapsed && !isSlidingNav && (
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hidden md:block hover:bg-[color:var(--wp-surface-card-border)] active:bg-[color:var(--wp-surface-card-border)] transition-colors dark:hover:bg-[color:var(--wp-surface-card)]/15 dark:active:bg-[color:var(--wp-surface-card)]/25"
            onMouseDown={(e) => {
              e.preventDefault();
              if (!onResize) return;
              const startX = e.clientX;
              const startW = width;
              const onMove = (ev: MouseEvent) => {
                const newW = Math.max(240, Math.min(320, startW + (ev.clientX - startX)));
                onResize(newW);
              };
              const onUp = () => {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
              };
              document.addEventListener("mousemove", onMove);
              document.addEventListener("mouseup", onUp);
            }}
            aria-hidden
          />
        )}
      </aside>
    </>
  );
}

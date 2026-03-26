"use client";

import { useState, useEffect, useRef, useCallback, useMemo, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  Settings,
  Network,
  ChevronLeft,
  ChevronRight,
  Search,
  MessageCircle,
  Sparkles,
  Zap,
  GripVertical,
  MoreVertical,
  FileText,
  Target,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getOpenTasksCount } from "@/app/actions/tasks";
import { getUnreadConversationsCount } from "@/app/actions/messages";

export const PORTAL_SIDEBAR_WIDTH_PX = 280;
export const PORTAL_SIDEBAR_COLLAPSED_PX = 80;

const SIDEBAR_ORDER_KEY = "portal-sidebar-order";
const SIDEBAR_THEME_KEY = "portal-sidebar-theme";
type SidebarTheme = "white" | "gradient";

function loadSidebarTheme(): SidebarTheme {
  if (typeof window === "undefined") return "white";
  try {
    const v = localStorage.getItem(SIDEBAR_THEME_KEY);
    if (v === "white" || v === "gradient") return v;
  } catch {}
  return "white";
}

interface NavItemConfig {
  href: string;
  label: string;
  Icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  badgeKey?: "tasks" | "messages" | null;
  isAi?: boolean;
  isHighlighted?: boolean;
  hoverAnim?: string;
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
      { href: "/portal/action-center", label: "Akční centrum", Icon: Zap, hoverAnim: "group-hover:scale-110" },
    ],
  },
  {
    id: "sec-databaze",
    section: "Klientská databáze",
    items: [
      { href: "/portal/contacts", label: "Klienti", Icon: Users, hoverAnim: "group-hover:scale-110" },
      { href: "/portal/households", label: "Domácnosti", Icon: Building2, hoverAnim: "group-hover:-translate-y-1" },
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
    id: "sec-nastroje",
    section: "Nástroje poradce",
    specialBg: true,
    items: [
      { href: "/portal/contracts/review", label: "AI Review smluv", Icon: Sparkles, isAi: true },
      { href: "/portal/analyses", label: "Finanční analýzy", Icon: BarChart3, isHighlighted: true, hoverAnim: "group-hover:scale-110 group-hover:rotate-6" },
      { href: "/portal/calculators", label: "Kalkulačky", Icon: Calculator, hoverAnim: "group-hover:rotate-12 group-hover:scale-110" },
      { href: "/portal/mindmap", label: "Mindmap", Icon: Network, hoverAnim: "group-hover:-translate-y-1" },
      { href: "/portal/tools/drive", label: "Google Disk", Icon: GoogleDriveLogo, hoverAnim: "group-hover:scale-110" },
      { href: "/portal/tools/gmail", label: "Gmail", Icon: GmailLogo, hoverAnim: "group-hover:scale-110" },
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
      { href: "/portal/notifications", label: "Notifikace", Icon: Bell },
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

function getInitials(email: string | undefined): string {
  if (!email) return "?";
  const part = email.split("@")[0];
  const parts = part.split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  return part.slice(0, 2).toUpperCase();
}

function isItemActive(pathname: string, href: string): boolean {
  const hrefPath = href.split("?")[0]?.split("#")[0] ?? href;
  if (pathname === hrefPath) return true;
  if (hrefPath === "/portal/today") return false;
  return pathname.startsWith(hrefPath + "/");
}

interface PortalSidebarProps {
  showTeamOverview?: boolean;
  width?: number;
  collapsed?: boolean;
  onResize?: (width: number) => void;
  onCollapsedChange?: (collapsed: boolean) => void;
  onMount?: () => void;
  mobileDrawerOpen?: boolean;
  onMobileDrawerClose?: () => void;
}

function filterSectionsByRole(sections: SectionConfig[], showTeamOverview: boolean | undefined): SectionConfig[] {
  if (showTeamOverview === false) return sections.filter((sec) => sec.id !== "sec-vedeni");
  return sections;
}

export function PortalSidebar({
  showTeamOverview,
  width = PORTAL_SIDEBAR_WIDTH_PX,
  collapsed = false,
  onResize,
  onCollapsedChange,
  onMount,
  mobileDrawerOpen = false,
  onMobileDrawerClose,
}: PortalSidebarProps = {}) {
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState("");
  const baseSections = useMemo(() => filterSectionsByRole(DEFAULT_SECTIONS, showTeamOverview), [showTeamOverview]);
  const [menuSections, setMenuSections] = useState<SectionConfig[]>(baseSections);
  const [sidebarTheme, setSidebarTheme] = useState<SidebarTheme>("white");

  useEffect(() => {
    setSidebarTheme(loadSidebarTheme());
  }, []);
  const setTheme = useCallback((theme: SidebarTheme) => {
    setSidebarTheme(theme);
    try {
      localStorage.setItem(SIDEBAR_THEME_KEY, theme);
    } catch {}
  }, []);

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
  const mobileOpen = isMobileState && (isControlled ? mobileDrawerOpen : internalMobileOpen);
  const setMobileOpen = useCallback(
    (open: boolean) => {
      if (isControlled) onMobileDrawerClose?.();
      else setInternalMobileOpen(open);
    },
    [isControlled, onMobileDrawerClose]
  );

  const [openTasksCount, setOpenTasksCount] = useState<number | null>(null);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<number | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [isLocalhost, setIsLocalhost] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hostname === "localhost") setIsLocalhost(true);
  }, []);

  useEffect(() => { onMount?.(); }, [onMount]);
  useEffect(() => {
    if (isControlled) onMobileDrawerClose?.();
    else setInternalMobileOpen(false);
  }, [pathname, isControlled, onMobileDrawerClose]);

  useEffect(() => {
    getOpenTasksCount().then(setOpenTasksCount).catch(() => setOpenTasksCount(0));
  }, [pathname]);
  useEffect(() => {
    getUnreadConversationsCount().then(setUnreadMessagesCount).catch(() => setUnreadMessagesCount(0));
  }, [pathname]);
  useEffect(() => {
    const onRefresh = () => {
      getUnreadConversationsCount().then(setUnreadMessagesCount).catch(() => setUnreadMessagesCount(0));
    };
    window.addEventListener("portal-messages-badge-refresh", onRefresh);
    return () => window.removeEventListener("portal-messages-badge-refresh", onRefresh);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email ?? null);
      const meta = user?.user_metadata;
      const fullName = meta?.full_name || meta?.name || [meta?.first_name, meta?.last_name].filter(Boolean).join(" ");
      if (fullName) setUserName(fullName);
    });
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, setMobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mobileOpen]);

  const handleDragStart = useCallback((e: React.DragEvent, groupIdx: number, itemIdx: number) => {
    dragItemRef.current = { groupIdx, itemIdx };
    setTimeout(() => {
      (e.target as HTMLElement).classList.add("opacity-40", "scale-[0.98]", "bg-slate-100");
    }, 0);
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.target as HTMLElement).classList.remove("opacity-40", "scale-[0.98]", "bg-slate-100");
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

  const effectiveWidth = collapsed ? PORTAL_SIDEBAR_COLLAPSED_PX : width;

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

      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-drawer-overlay bg-black/40"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={[
          "fixed left-0 top-0 bottom-0 flex flex-col shrink-0 transition-[width,transform] duration-300 ease-in-out",
          "md:z-20 md:translate-x-0",
          mobileOpen ? "translate-x-0 z-drawer-panel pointer-events-auto" : "-translate-x-full z-drawer-panel pointer-events-none md:pointer-events-auto",
          sidebarTheme === "gradient"
            ? "bg-gradient-to-br from-aidv-surface-dark via-aidv-surface-elevated to-[#101630] border-r border-[color:var(--aidv-border-on-dark)] shadow-[4px_0_24px_-12px_rgba(0,0,0,0.35)]"
            : "bg-white border-r border-slate-100 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.05)]",
        ].join(" ")}
        style={{
          width: isMobileState ? "min(85vw, 280px)" : `${effectiveWidth}px`,
        }}
      >
        {/* Header – collapsed: symbol A; expanded: logos/Aidvisora logo.png → public/logos */}
        <div
          className={[
            "h-20 flex items-center justify-between px-5 flex-shrink-0",
            sidebarTheme === "gradient" ? "border-b border-white/10" : "border-b border-slate-50",
          ].join(" ")}
        >
          <Link
            href="/portal"
            className={`flex items-center overflow-hidden ${collapsed ? "justify-center w-full" : "min-w-0"}`}
            aria-label="Aidvisora – přejít na nástěnku"
          >
            {collapsed ? (
              <img
                key="logo-a"
                src="/Aidvisora logo A.png"
                alt="Aidvisora"
                className="h-10 w-10 object-contain object-center flex-shrink-0"
                style={sidebarTheme === "gradient" ? { filter: "brightness(0) invert(1)" } : undefined}
              />
            ) : (
              <img
                key="logo-big"
                src="/logos/Aidvisora%20logo.png"
                alt="Aidvisora"
                className="h-16 max-h-16 w-auto max-w-full object-contain object-left flex-shrink-0"
                style={sidebarTheme === "gradient" ? { filter: "brightness(0) invert(1)" } : undefined}
              />
            )}
          </Link>
          <div className="flex items-center shrink-0">
            {onCollapsedChange && (
              <button
                type="button"
                onClick={() => onCollapsedChange(!collapsed)}
                className={`hidden md:flex w-7 h-7 items-center justify-center rounded-lg transition-colors
                  ${sidebarTheme === "gradient" ? "text-white hover:bg-white/10" : "text-slate-400 hover:bg-slate-100"}
                  ${collapsed ? "absolute -right-3.5 top-6 bg-white border border-slate-200 shadow-sm z-50" : ""}`}
                aria-label={collapsed ? "Rozbalit panel" : "Sbalit panel"}
              >
                {collapsed ? <ChevronRight size={14} strokeWidth={3} /> : <ChevronLeft size={16} />}
              </button>
            )}
            <button
              onClick={() => setMobileOpen(false)}
              className={`md:hidden p-2 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors ${sidebarTheme === "gradient" ? "text-white hover:bg-white/10" : "text-slate-500 hover:bg-slate-100"}`}
              aria-label="Zavřít menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search – v2 */}
        {!collapsed && (
          <div className="px-5 py-4 flex-shrink-0">
            <div className="relative group">
              <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${sidebarTheme === "gradient" ? "text-white" : "text-slate-400"}`} />
              <input
                type="text"
                placeholder="Hledat v menu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs font-bold outline-none transition-all min-h-[44px] ${
                  sidebarTheme === "gradient"
                    ? "bg-white/10 border border-white/20 text-white placeholder:text-white/90 focus:bg-white/20 focus:ring-2 focus:ring-white/30 focus:border-white/40"
                    : "bg-slate-50 border border-slate-100 text-slate-700 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
                }`}
                aria-label="Hledat v menu"
              />
            </div>
          </div>
        )}

        {/* Nav – sekce, specialBg, AI položka, D&D */}
        <nav className="flex-1 overflow-y-auto pb-6 pt-2 hide-scrollbar">
          {filteredSections.map((group, groupIdx) => (
            <div
              key={group.id}
              className={`
                ${groupIdx !== 0 ? "mt-2" : collapsed ? "mt-4" : ""}
                ${group.specialBg && !collapsed
                  ? sidebarTheme === "gradient"
                    ? "bg-white/10 mx-3 py-3 rounded-2xl border border-white/10"
                    : "bg-gradient-to-b from-fuchsia-50/40 to-indigo-50/40 mx-3 py-3 rounded-2xl border border-indigo-100/50 shadow-sm"
                  : "px-3"}
                ${group.specialBg && collapsed ? (sidebarTheme === "gradient" ? "bg-white/10 mx-2 py-2 rounded-2xl" : "bg-fuchsia-50/40 mx-2 py-2 rounded-2xl") : ""}
              `}
            >
              {!collapsed && (
                <div className="flex items-center px-3 mb-2 pt-1">
                  <h4 className={`text-[10px] font-black uppercase tracking-[0.15em] flex items-center gap-1.5 ${
                    group.specialBg ? (sidebarTheme === "gradient" ? "text-white" : "text-indigo-500") : sidebarTheme === "gradient" ? "text-white" : "text-slate-400"
                  }`}>
                    {group.specialBg && <Zap size={10} className={sidebarTheme === "gradient" ? "text-white shrink-0" : "text-amber-500 shrink-0"} />}
                    {group.section}
                  </h4>
                </div>
              )}
              {collapsed && groupIdx !== 0 && !group.specialBg && (
                <div className={`w-8 h-px mx-auto mb-4 mt-2 ${sidebarTheme === "gradient" ? "bg-white/20" : "bg-slate-100"}`} aria-hidden />
              )}
              <ul className="space-y-1">
                {group.items.map((item, itemIdx) => {
                  const isActive = isItemActive(pathname, item.href);
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
                        draggable={!collapsed && !isMobileState}
                        onDragStart={(e) => handleDragStart(e, groupIdx, itemIdx)}
                        onDragEnter={() => { dragOverRef.current = { groupIdx, itemIdx }; }}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => e.preventDefault()}
                        className="group relative rounded-xl"
                      >
                        <Link
                          href={item.href}
                          className={`w-full flex items-center relative transition-all duration-300
                            ${collapsed ? "justify-center p-3 rounded-2xl min-h-[44px]" : "px-3 py-2.5 rounded-xl min-h-[44px]"}
                            ${sidebarTheme === "gradient"
                              ? isActive
                                ? "bg-white/20 text-white shadow-lg"
                                : "text-white hover:bg-white/10 border border-transparent hover:border-white/20"
                              : isActive
                                ? "bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white shadow-lg shadow-fuchsia-900/20"
                                : "text-slate-700 hover:bg-white hover:shadow-md border border-transparent hover:border-fuchsia-100"}
                          `}
                          title={collapsed ? item.label : undefined}
                        >
                          <div className="relative flex items-center justify-center shrink-0">
                            <Icon
                              size={18}
                              className={`transition-colors ${isActive ? "text-white animate-spin-slow" : sidebarTheme === "gradient" ? "text-white animate-pulse-glow" : "text-fuchsia-500 animate-pulse-glow group-hover:text-fuchsia-600"}`}
                              strokeWidth={isActive ? 2.5 : 2}
                            />
                          </div>
                          {!collapsed && (
                            <span className={`ml-3 flex-1 text-left text-sm font-black tracking-wide ${isActive ? "text-white" : sidebarTheme === "gradient" ? "text-white" : "text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-600 to-indigo-600"}`}>
                              {item.label}
                            </span>
                          )}
                          {!collapsed && (
                            <GripVertical size={14} className={`hidden md:block ${sidebarTheme === "gradient" ? "text-white/30" : "text-fuchsia-200"} opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing shrink-0`} />
                          )}
                        </Link>
                      </li>
                    );
                  }

                  return (
                    <li
                      key={item.href}
                      draggable={!collapsed && !isMobileState}
                      onDragStart={(e) => handleDragStart(e, groupIdx, itemIdx)}
                      onDragEnter={() => { dragOverRef.current = { groupIdx, itemIdx }; }}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      className="group relative rounded-xl"
                    >
                      <Link
                        href={item.href}
                        className={`w-full flex items-center relative transition-all duration-200
                          ${collapsed ? "justify-center p-3 rounded-2xl min-h-[44px]" : "px-3 py-2.5 rounded-xl min-h-[44px]"}
                          ${sidebarTheme === "gradient"
                            ? isActive
                              ? "bg-white/20 text-white shadow-md"
                              : "text-white hover:bg-white/10"
                            : isActive
                              ? "bg-[#0f172a] text-white shadow-md"
                              : item.isHighlighted
                                ? "text-slate-700 hover:bg-slate-100/80 font-bold"
                                : "text-slate-600 hover:bg-slate-50"}
                        `}
                        title={collapsed ? item.label : undefined}
                      >
                        {collapsed && isActive && (
                          <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 rounded-r-full ${sidebarTheme === "gradient" ? "bg-white/60" : "bg-indigo-400"}`} aria-hidden />
                        )}
                        <div className={`relative flex items-center justify-center shrink-0 transition-all duration-300 ${!isActive && item.hoverAnim ? item.hoverAnim : ""}`}>
                          <Icon
                            size={18}
                            className={`transition-colors ${isActive ? "text-white" : sidebarTheme === "gradient" ? "text-white" : "text-slate-500 group-hover:text-indigo-600"}`}
                            strokeWidth={isActive || item.isHighlighted ? 2.5 : 2}
                          />
                        </div>
                        {!collapsed && (
                          <span className={`ml-3 flex-1 text-left text-sm whitespace-nowrap tracking-wide ${
                            isActive ? "text-white font-bold" : sidebarTheme === "gradient" ? "text-white font-semibold" : item.isHighlighted ? "font-bold text-slate-800" : "font-semibold"
                          }`}>
                            {item.label}
                          </span>
                        )}
                        {!collapsed && badge != null && (
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full transition-colors mr-2 shrink-0 ${
                            sidebarTheme === "gradient" ? "bg-white/20 text-white" : isActive ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700 group-hover:bg-amber-200"
                          }`}>
                            {badge > 99 ? "99+" : badge}
                          </span>
                        )}
                        {!collapsed && (
                          <GripVertical size={14} className={`hidden md:block ${sidebarTheme === "gradient" ? "text-white/30" : "text-slate-300"} opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing shrink-0 ${badge == null ? "ml-auto" : ""}`} />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {isLocalhost && (
            <div className={`px-3 mt-4 pt-4 border-t ${sidebarTheme === "gradient" ? "border-white/10" : "border-slate-100"}`}>
              <Link
                href="/klientska-zona"
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl min-h-[44px] transition-colors ${
                  sidebarTheme === "gradient"
                    ? "text-white/90 hover:bg-white/10"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
                title="Přihlásit se jako klient (localhost)"
              >
                <User size={18} className="shrink-0" />
                {!collapsed && <span className="text-sm font-semibold">Klientská zóna</span>}
              </Link>
            </div>
          )}
          {filteredSections.length === 0 && (
            <p className="px-3 py-4 text-sm text-slate-500">Žádné položky nevyhovují hledání.</p>
          )}
        </nav>

        {/* Spodní blok – profil + přepínač palety; konzistentní šířka a zarovnání (90°) */}
        <div
          className={`flex-shrink-0 border-t ${sidebarTheme === "gradient" ? "border-white/10 bg-white/5" : "border-slate-100 bg-slate-50/50"}`}
        >
          {/* Footer – profil */}
          <div className="w-full px-5 py-4">
            <Link
              href="/portal/setup?tab=profil"
              className={`flex items-center group cursor-pointer p-2 -m-2 rounded-xl transition-colors w-full max-w-full ${collapsed ? "justify-center" : "justify-between"} ${sidebarTheme === "gradient" ? "hover:bg-white/10" : "hover:bg-white"}`}
              title={collapsed ? (userName ?? userEmail ?? "Profil") : undefined}
            >
              <div className="flex items-center gap-3 overflow-hidden min-w-0">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-aidv-dashboard-cta to-aidv-accent-purple flex items-center justify-center text-white font-black text-sm shrink-0 shadow-inner">
                  {getInitials(userName ?? userEmail ?? undefined)}
                </div>
                {!collapsed && (
                  <div className="min-w-0">
                    <p className={`text-sm font-black truncate ${sidebarTheme === "gradient" ? "text-white" : "text-slate-900"}`}>{userName ?? userEmail ?? "Profil"}</p>
                    <p className={`text-[10px] font-bold uppercase tracking-widest truncate ${sidebarTheme === "gradient" ? "text-white" : "text-slate-400"}`}>AIDVISORA CRM V2.0</p>
                  </div>
                )}
              </div>
              {!collapsed && <MoreVertical size={16} className={`shrink-0 ${sidebarTheme === "gradient" ? "text-white" : "text-slate-400 group-hover:text-slate-700"}`} />}
            </Link>
          </div>

          {/* Přepínač palety – w-full, obsah vycentrovaný, bez scale na hover */}
          <div className="w-full px-5 pb-4 flex justify-center">
            <div
              className={`inline-flex gap-0.5 rounded-full p-1.5 shadow-lg ${
                sidebarTheme === "gradient"
                  ? "bg-black/20 backdrop-blur-md border border-white/10"
                  : "bg-slate-100 border border-slate-200"
              }`}
            >
              <button
                type="button"
                onClick={() => setTheme("white")}
                className={`p-2.5 rounded-full transition-colors duration-300 min-h-[44px] min-w-[44px] flex items-center justify-center ${
                  sidebarTheme === "white"
                    ? "bg-slate-200 text-slate-800 shadow-sm"
                    : sidebarTheme === "gradient"
                      ? "text-white hover:text-white hover:bg-white/10"
                      : "text-slate-500 hover:bg-slate-200"
                }`}
                title="Bílá"
                aria-label="Bílé pozadí"
              >
                <Palette size={20} strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => setTheme("gradient")}
                className={`p-2.5 rounded-full transition-colors duration-300 min-h-[44px] min-w-[44px] flex items-center justify-center ${
                  sidebarTheme === "gradient"
                    ? "bg-white/20 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-200"
                }`}
                title="Barevný"
                aria-label="Barevný gradient"
              >
                <Zap size={20} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>

        {onResize && !collapsed && (
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hidden md:block hover:bg-slate-200 active:bg-slate-300 transition-colors"
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

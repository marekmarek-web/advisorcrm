"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  LayoutGrid,
  Users,
  Building,
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
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getOpenTasksCount } from "@/app/actions/tasks";
import { getUnreadConversationsCount } from "@/app/actions/messages";

export const PORTAL_SIDEBAR_WIDTH_PX = 260;
export const PORTAL_SIDEBAR_COLLAPSED_PX = 48;

interface PortalSidebarProps {
  width?: number;
  collapsed?: boolean;
  onResize?: (width: number) => void;
  onCollapsedChange?: (collapsed: boolean) => void;
  onMount?: () => void;
  mobileDrawerOpen?: boolean;
  onMobileDrawerClose?: () => void;
}

type NavItem = { href: string; label: string; Icon: LucideIcon; badgeKey?: "tasks" | "messages" | null };

const SECTIONS: { section: string; items: NavItem[] }[] = [
  {
    section: "Přehled",
    items: [
      { href: "/portal/today", label: "Nástěnka", Icon: Home },
      { href: "/portal/tasks", label: "Úkoly", Icon: CheckSquare, badgeKey: "tasks" },
      { href: "/portal/messages", label: "Zprávy", Icon: MessageCircle, badgeKey: "messages" },
      { href: "/portal/calendar", label: "Kalendář", Icon: Calendar },
      { href: "/portal/notes", label: "Zápisky", Icon: StickyNote },
    ],
  },
  {
    section: "Klientská databáze",
    items: [
      { href: "/portal/contacts", label: "Kontakty", Icon: Users },
      { href: "/portal/households", label: "Domácnosti", Icon: Building },
    ],
  },
  {
    section: "Obchod a Byznys",
    items: [
      { href: "/portal/pipeline", label: "Obchody", Icon: Briefcase },
      { href: "/portal/board", label: "Board", Icon: LayoutGrid },
      { href: "/portal/production", label: "Produkce", Icon: TrendingUp },
    ],
  },
  {
    section: "Nástroje",
    items: [
      { href: "/portal/contracts/review", label: "AI asistent", Icon: Sparkles },
      { href: "/portal/analyses", label: "Finanční analýzy", Icon: BarChart3 },
      { href: "/portal/calculators", label: "Kalkulačky", Icon: Calculator },
      { href: "/portal/mindmap", label: "Mindmap", Icon: Network },
    ],
  },
  {
    section: "Systém",
    items: [
      { href: "/portal/notifications", label: "Notifikace", Icon: Bell },
      { href: "/portal/ui-demo", label: "UI komponenty", Icon: Palette },
      { href: "/portal/setup", label: "Nastavení", Icon: Settings },
    ],
  },
];

function getInitials(email: string | undefined): string {
  if (!email) return "?";
  const part = email.split("@")[0];
  const parts = part.split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  return part.slice(0, 2).toUpperCase();
}

function isItemActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/portal/today") return false;
  return pathname.startsWith(href + "/");
}

export function PortalSidebar({
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
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  const [isMobileState, setIsMobileState] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobileState(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const isControlled = onMobileDrawerClose != null;
  const mobileOpen = isMobileState && (isControlled ? mobileDrawerOpen : internalMobileOpen);
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
  const [openTasksCount, setOpenTasksCount] = useState<number | null>(null);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<number | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    onMount?.();
  }, [onMount]);

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
    });
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, setMobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (collapsed || !onResize) return;
      resizeRef.current = { startX: e.clientX, startW: width };
      const onMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;
        const newW = Math.max(200, Math.min(400, resizeRef.current.startW + (ev.clientX - resizeRef.current.startX)));
        onResize(newW);
      };
      const onUp = () => {
        resizeRef.current = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [collapsed, width, onResize]
  );

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.map(({ section, items }) => {
      const sectionMatch = section.toLowerCase().includes(q);
      const filteredItems = items.filter(
        (item) => sectionMatch || item.label.toLowerCase().includes(q)
      );
      return { section, items: filteredItems };
    }).filter(({ items }) => items.length > 0);
  }, [searchQuery]);

  const effectiveWidth = collapsed ? PORTAL_SIDEBAR_COLLAPSED_PX : width;

  return (
    <>
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40"
          style={{ zIndex: "var(--z-drawer-overlay, 100)" }}
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={[
          "fixed left-0 top-0 bottom-0 flex flex-col shrink-0 bg-white border-r border-slate-200 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.06)]",
          "transition-[transform,width] duration-200 ease-in-out",
          "md:z-20 md:translate-x-0",
          mobileOpen ? "translate-x-0 z-[101]" : "-translate-x-full z-[101]",
        ].join(" ")}
        style={{
          width: isMobileState ? "min(85vw, 280px)" : `${effectiveWidth}px`,
        }}
      >
        {/* Header: Aidvisora logo + collapse */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100 flex-shrink-0">
          <Link
            href="/portal"
            className={`flex items-center overflow-hidden min-w-0 ${collapsed ? "justify-center w-full" : ""}`}
            aria-label="Aidvisora – přejít na nástěnku"
          >
            <img
              src="/aidvisora-logo.png"
              alt="Aidvisora"
              className={`object-contain object-left shrink-0 ${collapsed ? "h-9 w-9" : "h-12 max-w-[220px]"}`}
              width={220}
              height={48}
            />
          </Link>
          <div className="flex items-center gap-1 shrink-0">
            {onCollapsedChange && (
              <button
                type="button"
                onClick={() => onCollapsedChange(!collapsed)}
                className={`hidden md:flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors min-h-[44px] min-w-[44px]
                  ${collapsed ? "absolute -right-3.5 top-5 bg-white border border-slate-200 shadow-sm z-50" : ""}`}
                aria-label={collapsed ? "Rozbalit panel" : "Sbalit panel"}
                title={collapsed ? "Rozbalit panel" : "Sbalit panel"}
              >
                {collapsed ? <ChevronRight size={16} strokeWidth={2.5} /> : <ChevronLeft size={18} strokeWidth={2} />}
              </button>
            )}
            <button
              onClick={() => setMobileOpen(false)}
              className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Zavřít menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search (only when expanded) */}
        {!collapsed && (
          <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Hledat v menu…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium text-slate-700 placeholder:text-slate-400 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-200 transition-all"
                aria-label="Hledat v menu"
              />
            </div>
          </div>
        )}

        {/* Nav: sectioned, scrollable */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 hide-scrollbar">
          {filteredSections.map(({ section, items }, idx) => (
            <div key={section} className={idx > 0 ? (collapsed ? "mt-2" : "mt-6") : (collapsed ? "mt-2" : "")}>
              {!collapsed && (
                <h4 className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {section}
                </h4>
              )}
              {collapsed && idx > 0 && <div className="w-8 h-px bg-slate-100 mx-auto my-3" aria-hidden />}
              <ul className="space-y-1">
                {items.map((item) => {
                  const isActive = isItemActive(pathname, item.href);
                  const Icon = item.Icon;
                  const badge =
                    item.badgeKey === "tasks" && openTasksCount != null && openTasksCount > 0
                      ? openTasksCount
                      : item.badgeKey === "messages" && unreadMessagesCount != null && unreadMessagesCount > 0
                        ? unreadMessagesCount
                        : null;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`
                          w-full flex items-center relative transition-all duration-200 min-h-[44px]
                          ${collapsed ? "justify-center p-3 rounded-xl" : "px-3 py-2.5 rounded-xl gap-3"}
                          ${isActive
                            ? "bg-slate-900 text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}
                        `}
                        title={collapsed ? item.label : undefined}
                      >
                        {collapsed && isActive && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-indigo-400 rounded-r-full" aria-hidden />
                        )}
                        <span className="relative flex items-center justify-center shrink-0">
                          <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} className={isActive ? "text-white" : ""} />
                        </span>
                        {!collapsed && (
                          <>
                            <span className="flex-1 text-sm font-semibold truncate">{item.label}</span>
                            {badge != null && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${isActive ? "bg-white/20 text-white" : "bg-indigo-50 text-indigo-600"}`}>
                                {badge > 99 ? "99+" : badge}
                              </span>
                            )}
                          </>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {filteredSections.length === 0 && (
            <p className="px-3 py-4 text-sm text-slate-500">Žádné položky nevyhovují hledání.</p>
          )}
        </nav>

        {/* Footer: user + version */}
        <div className="p-4 border-t border-slate-100 flex-shrink-0 bg-slate-50/50">
          <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} min-h-[44px]`}>
            <Link
              href="/portal/setup?tab=profil"
              className={`flex items-center overflow-hidden rounded-xl hover:bg-white/80 transition-colors p-2 -m-2 ${collapsed ? "justify-center" : "gap-3 flex-1 min-w-0"}`}
              title={collapsed ? (userEmail ?? "Profil") : undefined}
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-inner">
                {getInitials(userEmail ?? undefined)}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 truncate">{userEmail ?? "Profil"}</p>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider truncate">Aidvisora CRM v2.0</p>
                </div>
              )}
            </Link>
          </div>
        </div>

        {onResize && !collapsed && (
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hidden md:block hover:bg-slate-200 active:bg-slate-300 transition-colors"
            onMouseDown={handleResizeStart}
            aria-hidden
          />
        )}
      </aside>
    </>
  );
}

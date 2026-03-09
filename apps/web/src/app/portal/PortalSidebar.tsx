"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  PhoneCall,
  Bell,
  Palette,
  Settings,
  Network,
  type LucideIcon,
} from "lucide-react";

export const PORTAL_SIDEBAR_WIDTH_PX = 260;
export const PORTAL_SIDEBAR_COLLAPSED_PX = 48;

interface PortalSidebarProps {
  width?: number;
  collapsed?: boolean;
  onResize?: (width: number) => void;
  onCollapsedChange?: (collapsed: boolean) => void;
  onMount?: () => void;
}

const VIEWS: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: "/portal/today", label: "Nástěnka", Icon: Home },
  { href: "/portal/board", label: "Board", Icon: LayoutGrid },
  { href: "/portal/contacts", label: "Kontakty", Icon: Users },
  { href: "/portal/households", label: "Domácnosti", Icon: Building },
  { href: "/portal/pipeline", label: "Obchody", Icon: Briefcase },
  { href: "/portal/analyses", label: "Finanční analýzy", Icon: BarChart3 },
  { href: "/portal/calculators", label: "Kalkulačky", Icon: Calculator },
  { href: "/portal/tasks", label: "Úkoly", Icon: CheckSquare },
  { href: "/portal/mindmap", label: "Mindmap", Icon: Network },
  { href: "/portal/production", label: "Produkce", Icon: TrendingUp },
  { href: "/portal/calendar", label: "Kalendář", Icon: Calendar },
  { href: "/portal/notes", label: "Zápisky", Icon: StickyNote },
  { href: "/portal/cold-contacts", label: "Studené kontakty", Icon: PhoneCall },
  { href: "/portal/notifications", label: "Notifikace", Icon: Bell },
  { href: "/portal/ui-demo", label: "UI komponenty", Icon: Palette },
  { href: "/portal/setup", label: "Nastavení", Icon: Settings },
];

export function PortalSidebar({
  width = PORTAL_SIDEBAR_WIDTH_PX,
  collapsed = false,
  onResize,
  onCollapsedChange,
  onMount,
}: PortalSidebarProps = {}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    onMount?.();
  }, [onMount]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
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

  const navLinks = VIEWS.map((v) => {
    const isActive =
      pathname === v.href ||
      (v.href !== "/portal/today" && pathname.startsWith(v.href + "/")) ||
      (v.href !== "/portal/today" && pathname === v.href);
    return (
      <Link
        key={v.href}
        href={v.href}
        className={`wp-sidebar-link ${isActive ? "active" : ""}`}
        title={collapsed ? v.label : undefined}
      >
        <v.Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} className="shrink-0" />
        {!collapsed && <span>{v.label}</span>}
      </Link>
    );
  });

  const effectiveWidth = collapsed ? PORTAL_SIDEBAR_COLLAPSED_PX : width;

  return (
    <>
      <div className="md:hidden fixed left-0 top-0 bottom-0 z-20 w-12 wp-sidebar flex flex-col items-center pt-3 gap-2" style={{ background: "var(--wp-surface)", borderRight: "1px solid var(--wp-border)" }}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm">
          W
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100"
          aria-label="Otevřít menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24">
            <path d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={[
          "wp-sidebar fixed left-0 top-0 bottom-0 flex flex-col shrink-0",
          "transition-[width] duration-200 ease-in-out",
          "md:z-20 md:translate-x-0",
          mobileOpen ? "z-40 translate-x-0" : "z-40 -translate-x-full",
        ].join(" ")}
        style={{ width: effectiveWidth }}
      >
        <div className="p-3 border-b flex items-center justify-between min-h-[52px]" style={{ borderColor: "var(--wp-border)" }}>
          <Link href="/portal" className={`flex items-center gap-2.5 px-2 py-1.5 min-w-0 ${collapsed ? "justify-center" : ""}`}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-sm shrink-0" style={{ background: "var(--wp-primary)" }}>
              W
            </div>
            {!collapsed && <span className="font-bold text-sm truncate" style={{ color: "var(--wp-text)" }}>WePlan</span>}
          </Link>
          <div className="flex items-center gap-1 shrink-0">
            {onCollapsedChange && (
              <button
                type="button"
                onClick={() => onCollapsedChange(!collapsed)}
                className="hidden md:flex p-1.5 rounded-md wp-btn-ghost"
                style={{ color: "var(--wp-text-muted)" }}
                aria-label={collapsed ? "Rozbalit panel" : "Sbalit panel"}
                title={collapsed ? "Rozbalit panel" : "Sbalit panel"}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  {collapsed ? <path d="M9 18l6-6-6-6" /> : <path d="M15 18l-6-6 6-6" />}
                </svg>
              </button>
            )}
            <button
              onClick={() => setMobileOpen(false)}
              className="md:hidden p-1 rounded-md wp-btn-ghost"
              style={{ color: "var(--wp-text-muted)" }}
              aria-label="Zavřít menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">{navLinks}</nav>
        {!collapsed && (
          <div className="p-3 border-t" style={{ borderColor: "var(--wp-border)" }}>
            <div className="flex items-center gap-2 px-2 text-xs" style={{ color: "var(--wp-text-muted)" }}>
              <span>WePlan CRM</span>
              <span className="ml-auto">v2.0</span>
            </div>
          </div>
        )}
        {onResize && !collapsed && (
          <div
            className="wp-sidebar-resize absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hidden md:block"
            onMouseDown={handleResizeStart}
            aria-hidden
          />
        )}
      </aside>
    </>
  );
}

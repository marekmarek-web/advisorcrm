"use client";

import { useState, useCallback, useMemo, useEffect, useRef, Suspense } from "react";
import { PortalSidebar, PORTAL_SIDEBAR_COLLAPSED_PX } from "./PortalSidebar";
import { PortalHeaderSearch, type PortalHeaderSearchHandle } from "./PortalHeaderSearch";
import { QuickNewMenu } from "./QuickNewMenu";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "@/app/components/UserMenu";
import { ToastProvider } from "@/app/components/Toast";

const MOBILE_BREAKPOINT = 768;

const SIDEBAR_STORAGE_KEY = "portal-sidebar";
const SIDEBAR_CONTENT_GAP_PX = 24;
const SIDEBAR_WIDTH_MIN = 200;
const SIDEBAR_WIDTH_MAX = 400;
const SIDEBAR_WIDTH_DEFAULT = 260;

function getStoredSidebarState() {
  if (typeof window === "undefined") return { width: SIDEBAR_WIDTH_DEFAULT, collapsed: false };
  try {
    const raw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (!raw) return { width: SIDEBAR_WIDTH_DEFAULT, collapsed: false };
    const parsed = JSON.parse(raw) as { width?: number; collapsed?: boolean };
    const width = Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, parsed.width ?? SIDEBAR_WIDTH_DEFAULT));
    return { width, collapsed: !!parsed.collapsed };
  } catch {
    return { width: SIDEBAR_WIDTH_DEFAULT, collapsed: false };
  }
}

export function PortalShell({ children }: { children: React.ReactNode }) {
  const headerSearchRef = useRef<PortalHeaderSearchHandle>(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_WIDTH_DEFAULT);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarStateInitialized, setSidebarStateInitialized] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${MOBILE_BREAKPOINT}px)`);
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const initSidebarState = useCallback(() => {
    if (sidebarStateInitialized) return;
    const { width, collapsed } = getStoredSidebarState();
    setSidebarWidth(width);
    setSidebarCollapsed(collapsed);
    setSidebarStateInitialized(true);
  }, [sidebarStateInitialized]);

  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);

  const mainMarginPx = useMemo(() => {
    if (!isDesktop) return 0;
    const sidebarPx = sidebarCollapsed ? PORTAL_SIDEBAR_COLLAPSED_PX : sidebarWidth;
    return sidebarPx + SIDEBAR_CONTENT_GAP_PX;
  }, [isDesktop, sidebarCollapsed, sidebarWidth]);

  const handleSidebarResize = useCallback((w: number) => {
    const clamped = Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, w));
    setSidebarWidth(clamped);
    try {
      const raw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      const prev = raw ? JSON.parse(raw) : {};
      localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify({ ...prev, width: clamped }));
    } catch {}
  }, []);

  const handleSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    try {
      const raw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      const prev = raw ? JSON.parse(raw) : {};
      localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify({ ...prev, collapsed }));
    } catch {}
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        headerSearchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <ToastProvider>
      <div className="wp-app-container monday-board-wrap flex min-h-screen">
        <PortalSidebar
          width={sidebarWidth}
          collapsed={sidebarCollapsed}
          onResize={handleSidebarResize}
          onCollapsedChange={handleSidebarCollapsed}
          onMount={initSidebarState}
          mobileDrawerOpen={sidebarDrawerOpen}
          onMobileDrawerClose={() => setSidebarDrawerOpen(false)}
        />
        <div className="flex flex-col flex-1 min-w-0" style={{ marginLeft: mainMarginPx, transition: "margin-left 200ms ease-in-out" }}>
          <header className="wp-app-header shrink-0 flex flex-wrap items-center gap-2 sm:gap-4 md:gap-6 bg-white/90 backdrop-blur-md border-b border-slate-100 shadow-sm sticky top-0 z-50 px-4 sm:px-6 md:px-8 py-4">
            <button
              type="button"
              onClick={() => setSidebarDrawerOpen(true)}
              className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Otevřít menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24">
                <path d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
              </svg>
            </button>
            <div className="flex-1 min-w-0 max-w-md md:max-w-2xl">
              <Suspense fallback={<div className="h-9 w-48 bg-slate-100 rounded animate-pulse" aria-hidden />}>
                <PortalHeaderSearch ref={headerSearchRef} />
              </Suspense>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <QuickNewMenu />
              <NotificationBell />
              <UserMenu />
            </div>
          </header>
          <div className="flex-1 flex min-h-0 wp-app-content">
            <div className="wp-app-content-inner">
              {children}
            </div>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}

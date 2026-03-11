"use client";

import { useState, useCallback, useMemo, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { PortalSidebar, PORTAL_SIDEBAR_COLLAPSED_PX } from "./PortalSidebar";
import { PortalHeaderSearch } from "./PortalHeaderSearch";
import { QuickNewMenu } from "./QuickNewMenu";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "@/app/components/UserMenu";
import { GlobalSearch, type GlobalSearchHandle } from "@/app/components/GlobalSearch";
import { ToastProvider } from "@/app/components/Toast";
import { AiSearchBar } from "@/app/components/AiSearchBar";

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
  const globalSearchRef = useRef<GlobalSearchHandle>(null);
  const [aiSearchOpen, setAiSearchOpen] = useState(false);
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

  const handleAiSubmit = useCallback((_value: string) => {
    setAiSearchOpen(false);
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
          <header className="wp-app-header shrink-0 flex flex-wrap items-center gap-2 sm:gap-4 md:gap-6">
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
            <Link href="/portal" className="shrink-0 flex items-center" aria-label="Aidvisora – úvod">
              <img src="/logo.png" alt="Aidvisora" className="h-8 w-auto max-w-[140px] object-contain" />
            </Link>
            <div className="flex-1 min-w-0 max-w-md">
              <Suspense fallback={<div className="h-9 w-48 bg-slate-100 rounded animate-pulse" aria-hidden />}>
                <PortalHeaderSearch onOpenGlobalSearch={() => globalSearchRef.current?.open()} />
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
        <GlobalSearch ref={globalSearchRef} />

        {/* Aidvisora – fixed with safe area, below drawer z-index */}
        <div
          className="fixed flex flex-col items-end gap-2"
          style={{
            bottom: "max(1rem, env(safe-area-inset-bottom, 1rem))",
            right: "max(1rem, env(safe-area-inset-right, 1rem))",
            zIndex: "var(--z-ai-widget, 40)",
          }}
        >
          {aiSearchOpen ? (
            <div className="flex items-center gap-2 w-full max-w-[420px]">
              <AiSearchBar
                placeholder="Ask WeAI"
                onSubmit={handleAiSubmit}
                onClose={() => setAiSearchOpen(false)}
                className="flex-1 min-w-0"
              />
              <button
                type="button"
                onClick={() => setAiSearchOpen(false)}
                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Zavřít Aidvisora"
              >
                <span className="text-lg leading-none">×</span>
              </button>
            </div>
          ) : (
            <AiSearchBar
              variant="trigger"
              triggerLabel="Aidvisora"
              onTriggerClick={() => setAiSearchOpen(true)}
            />
          )}
        </div>
      </div>
    </ToastProvider>
  );
}

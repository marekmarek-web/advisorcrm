"use client";

import { useState, useCallback, useMemo, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { PortalSidebar, PORTAL_SIDEBAR_COLLAPSED_PX } from "./PortalSidebar";
import { PortalHeaderSearch } from "./PortalHeaderSearch";
import { UserMenu } from "@/app/components/UserMenu";
import { GlobalSearch, type GlobalSearchHandle } from "@/app/components/GlobalSearch";
import { ToastProvider } from "@/app/components/Toast";
import { AiSearchBar } from "@/app/components/AiSearchBar";

const MOBILE_BREAKPOINT = 768;
const MOBILE_SIDEBAR_MARGIN = 48;

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

  const mainMarginPx = useMemo(() => {
    if (!isDesktop) return MOBILE_SIDEBAR_MARGIN;
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
        />
        <div className="flex flex-col flex-1 min-w-0 ml-12 md:ml-0" style={{ marginLeft: mainMarginPx, transition: "margin-left 200ms ease-in-out" }}>
          <header className="wp-app-header shrink-0 gap-2">
            <div className="flex items-center gap-8 flex-1 min-w-0">
              <span className="font-bold text-xl shrink-0" style={{ color: "var(--wp-text)" }}>Aidvisora</span>
              <Suspense fallback={<div className="h-9 w-48 bg-slate-100 rounded animate-pulse" aria-hidden />}>
                <PortalHeaderSearch onOpenGlobalSearch={() => globalSearchRef.current?.open()} />
              </Suspense>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Link href="/portal/cold-contacts" className="wp-btn wp-btn-ghost shrink-0" style={{ borderColor: "transparent" }} title="Import kontaktů pomocí AI">
                <span aria-hidden>✨</span>
                AI Import
              </Link>
              <button type="button" className="wp-icon-btn" title="Nová aktivita (schůzka, úkol, poznámka)" aria-label="Nová aktivita">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
              <Link href="/portal/notifications" className="wp-icon-btn-ghost" title="Oznámení – zprávy od klientů, kalendář, úkoly, poznámky" aria-label="Oznámení">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
              </Link>
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

        {/* AI asistent – fixed dole v pravém rohu obrazovky, stejné styly jako AI Search Bar */}
        <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
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
                aria-label="Zavřít AI asistenta"
              >
                <span className="text-lg leading-none">×</span>
              </button>
            </div>
          ) : (
            <AiSearchBar
              variant="trigger"
              triggerLabel="AI asistent"
              onTriggerClick={() => setAiSearchOpen(true)}
            />
          )}
        </div>
      </div>
    </ToastProvider>
  );
}

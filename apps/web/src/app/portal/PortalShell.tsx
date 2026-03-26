"use client";

import { useState, useCallback, useMemo, useEffect, useRef, Suspense } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles, Search, MoreVertical, ScanLine } from "lucide-react";
import Link from "next/link";
import { PortalSidebar, PORTAL_SIDEBAR_COLLAPSED_PX } from "./PortalSidebar";
import { PortalHeaderSearch, type PortalHeaderSearchHandle } from "./PortalHeaderSearch";
import { QuickNewMenu } from "./QuickNewMenu";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "@/app/components/UserMenu";
import { ToastProvider } from "@/app/components/Toast";
import { AiAssistantDrawerProvider, useAiAssistantDrawer } from "./AiAssistantDrawerContext";
import { AiAssistantDrawer } from "./AiAssistantDrawer";
import { PortalFeedbackLauncher } from "./PortalFeedbackLauncher";
import { useShareIntent } from "@/lib/share/useShareIntent";
import { usePushNotifications } from "@/lib/push/usePushNotifications";
import { mapPushNotificationToRoute } from "@/lib/push/routing";
import { useCaptureCapabilities } from "@/lib/device/useCaptureCapabilities";

const MOBILE_BREAKPOINT = 768;

const SIDEBAR_STORAGE_KEY = "portal-sidebar";
const SIDEBAR_CONTENT_GAP_PX = 14;
const SIDEBAR_WIDTH_MIN = 240;
const SIDEBAR_WIDTH_MAX = 320;
const SIDEBAR_WIDTH_DEFAULT = 280;

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

export function PortalShell({ children, showTeamOverview }: { children: React.ReactNode; showTeamOverview?: boolean }) {
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
      <AiAssistantDrawerProvider>
        <PortalShellInner showTeamOverview={showTeamOverview} isDesktop={isDesktop} headerSearchRef={headerSearchRef} mainMarginPx={mainMarginPx} sidebarDrawerOpen={sidebarDrawerOpen} setSidebarDrawerOpen={setSidebarDrawerOpen} initSidebarState={initSidebarState} sidebarWidth={sidebarWidth} sidebarCollapsed={sidebarCollapsed} handleSidebarResize={handleSidebarResize} handleSidebarCollapsed={handleSidebarCollapsed}>
          {children}
        </PortalShellInner>
      </AiAssistantDrawerProvider>
    </ToastProvider>
  );
}

function PortalShellInner({
  showTeamOverview,
  isDesktop,
  headerSearchRef,
  mainMarginPx,
  sidebarDrawerOpen,
  setSidebarDrawerOpen,
  initSidebarState,
  sidebarWidth,
  sidebarCollapsed,
  handleSidebarResize,
  handleSidebarCollapsed,
  children,
}: {
  showTeamOverview?: boolean;
  isDesktop: boolean;
  headerSearchRef: React.RefObject<PortalHeaderSearchHandle | null>;
  mainMarginPx: number;
  sidebarDrawerOpen: boolean;
  setSidebarDrawerOpen: (v: boolean) => void;
  initSidebarState: () => void;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  handleSidebarResize: (w: number) => void;
  handleSidebarCollapsed: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const isMobile = !isDesktop;
  const router = useRouter();
  const pathname = usePathname();
  const { hasSharedFiles } = useShareIntent();
  const { shouldShowSoftPrompt, requestSystemPermission, markSoftPromptSeen } = usePushNotifications({
    onPushNotificationActionPerformed: (action) => {
      const nextRoute = mapPushNotificationToRoute(action.notification);
      if (pathname !== nextRoute) {
        router.push(nextRoute);
      }
    },
  });
  const { open: aiDrawerOpen, setOpen: setAiDrawerOpen } = useAiAssistantDrawer();
  const { showScanInQuickMenu } = useCaptureCapabilities();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setMobileSearchOpen(true);
        headerSearchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (isMobile && mobileSearchOpen) {
      const t = setTimeout(() => headerSearchRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isMobile, mobileSearchOpen]);

  useEffect(() => {
    if (!hasSharedFiles) return;
    if (pathname === "/portal/share/import") return;
    router.push("/portal/share/import");
  }, [hasSharedFiles, pathname, router]);

  return (
    <div className="wp-app-container monday-board-wrap flex min-h-screen">
      <PortalSidebar
          showTeamOverview={showTeamOverview}
          width={sidebarWidth}
          collapsed={sidebarCollapsed}
          onResize={handleSidebarResize}
          onCollapsedChange={handleSidebarCollapsed}
          onMount={initSidebarState}
          mobileDrawerOpen={sidebarDrawerOpen}
          onMobileDrawerClose={() => setSidebarDrawerOpen(false)}
        />
        <div className="flex flex-col flex-1 min-w-0" style={{ marginLeft: mainMarginPx, transition: "margin-left 200ms ease-in-out" }}>
          <header className="wp-app-header shrink-0 flex flex-wrap items-center gap-2 sm:gap-3 md:gap-6 sticky top-0 z-sticky-header px-3 sm:px-6 md:px-8 pb-1.5 md:pb-4 pt-[calc(var(--safe-area-top)+0.25rem)] sm:pt-[calc(var(--safe-area-top)+0.5rem)] md:pt-[calc(var(--safe-area-top)+1rem)]">
            <button
              type="button"
              onClick={() => setSidebarDrawerOpen(true)}
              className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
              aria-label="Otevřít menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24">
                <path d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
              </svg>
            </button>
            {/* Desktop: inline search. Mobile: icon → opens overlay with search */}
            <div className="flex-1 min-w-0 min-h-[40px] flex items-center max-w-md md:max-w-2xl">
              {isDesktop && (
                <Suspense fallback={<div className="h-9 w-48 bg-slate-100 rounded animate-pulse" aria-hidden />}>
                  <PortalHeaderSearch ref={headerSearchRef} />
                </Suspense>
              )}
              {isMobile && (
                <button
                  type="button"
                  onClick={() => setMobileSearchOpen(true)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10 shrink-0"
                  aria-label="Hledat"
                >
                  <Search size={22} />
                </button>
              )}
            </div>
            {/* sm+: bell + user beside Nový. Below sm: Nový + optional Sken + ⋮ so nothing is only under overflow */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <QuickNewMenu />
              {showScanInQuickMenu ? (
                <Link
                  href="/portal/scan"
                  className="sm:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 active:scale-[0.98] transition-transform"
                  aria-label="Skenovat dokument"
                >
                  <ScanLine size={22} aria-hidden />
                </Link>
              ) : null}
              <div className="hidden sm:flex items-center gap-2">
                <NotificationBell />
                <UserMenu />
              </div>
              <div className="relative sm:hidden">
                <button
                  type="button"
                  onClick={() => setOverflowOpen((o) => !o)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
                  aria-label="Další akce"
                  aria-expanded={overflowOpen}
                >
                  <MoreVertical size={22} />
                </button>
                {overflowOpen && (
                  <>
                    <div className="fixed inset-0 z-overlay" aria-hidden onClick={() => setOverflowOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-dropdown w-56 py-1 bg-wp-surface border border-wp-border rounded-xl shadow-xl dark:shadow-black/40">
                      <div className="px-3 py-2 border-b border-wp-border">
                        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Další</span>
                      </div>
                      <div className="py-1" onClick={() => setOverflowOpen(false)}>
                        <div className="flex items-center gap-2 px-3 py-2">
                          <NotificationBell />
                        </div>
                        <div className="px-2">
                          <UserMenu />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>
          <div className="flex-1 flex min-h-0 wp-app-content pb-[var(--safe-area-bottom)]">
            <div className="wp-app-content-inner !flex !flex-col !min-h-0 !p-0 !pt-0">
              <div className="wp-app-main-surface flex flex-1 flex-col min-h-0">
                {/* Odpovídá dřívějšímu wp-app-content-inner padding (16/20/12 px pod breakpointem). */}
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 pb-5 pt-4 md:px-5 md:pb-6 lg:px-4 lg:pb-5 lg:pt-3">
                  {children}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile search overlay: full-screen (search gets ref when open) */}
        {isMobile && mobileSearchOpen && (
          <div className="fixed inset-0 z-modal bg-wp-bg flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-wp-border shrink-0 min-h-[44px]">
              <div className="flex-1 min-w-0">
                <Suspense fallback={<div className="h-9 flex-1 bg-slate-100 rounded animate-pulse" />}>
                  <PortalHeaderSearch ref={headerSearchRef} />
                </Suspense>
              </div>
              <button
                type="button"
                onClick={() => setMobileSearchOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
                aria-label="Zavřít vyhledávání"
              >
                ×
              </button>
            </div>
          </div>
        )}

        <PortalFeedbackLauncher variant="desktop" />

        {/* Floating AI assistant button – pouze když je panel zavřený (shared state s AiAssistantDrawer) */}
        {!aiDrawerOpen && (
          <button
            type="button"
            onClick={() => setAiDrawerOpen(true)}
            title="AI asistent"
            className="fixed right-4 bottom-4 md:right-6 md:bottom-6 z-floating-ai min-w-[48px] min-h-[48px] rounded-full flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-200 hover:shadow-indigo-300/50 hover:scale-105 active:scale-95 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 pb-[env(safe-area-inset-bottom,0)]"
            aria-label="Otevřít AI asistenta"
          >
            <Sparkles size={24} />
          </button>
        )}

        <AiAssistantDrawer />

        {shouldShowSoftPrompt ? (
          <div className="fixed inset-x-3 bottom-[calc(var(--safe-area-bottom)+0.75rem)] z-modal sm:inset-x-auto sm:right-4 sm:w-[360px] rounded-2xl border border-slate-200 bg-white shadow-xl p-4">
            <p className="text-sm font-semibold text-slate-900">Povolit push notifikace?</p>
            <p className="mt-1 text-sm text-slate-600">
              Dostanete upozornění na nové zprávy, dokumenty a důležité změny.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void requestSystemPermission();
                }}
                className="min-h-[44px] rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Povolit
              </button>
              <button
                type="button"
                onClick={markSoftPromptSeen}
                className="min-h-[44px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Teď ne
              </button>
            </div>
          </div>
        ) : null}
      </div>
  );
}

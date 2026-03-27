"use client";

import { useState, useCallback, useMemo, useEffect, useRef, Suspense } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, MoreVertical, ScanLine } from "lucide-react";
import { AiAssistantBrandIcon } from "@/app/components/AiAssistantBrandIcon";
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
import clsx from "clsx";
import { portalPrimaryButtonClassName } from "@/lib/ui/create-action-button-styles";

const MOBILE_BREAKPOINT = 768;

const SIDEBAR_STORAGE_KEY = "portal-sidebar";
/** Odsazení plovoucího sidebaru od levého okraje (Tailwind left-5). */
const PORTAL_SIDEBAR_FLOAT_INSET_PX = 20;
/** Mezera mezi sidebar kartou a hlavním panelem. */
const PORTAL_SIDEBAR_MAIN_GAP_PX = 16;
const SIDEBAR_WIDTH_MIN = 240;
const SIDEBAR_WIDTH_MAX = 320;
const SIDEBAR_WIDTH_DEFAULT = 300;

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
    return PORTAL_SIDEBAR_FLOAT_INSET_PX + sidebarPx + PORTAL_SIDEBAR_MAIN_GAP_PX;
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
    <div className="wp-portal-canvas relative flex h-[100dvh] min-h-0 flex-row overflow-hidden">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <div
          className="wp-portal-blob absolute left-[5%] top-[10%] h-[min(800px,90vw)] w-[min(800px,90vw)] bg-[var(--wp-portal-blob-1)] transition-colors duration-700 ease-out"
        />
        <div
          className="wp-portal-blob absolute bottom-[-10%] right-[10%] h-[min(600px,70vw)] w-[min(600px,70vw)] bg-[var(--wp-portal-blob-2)] transition-colors duration-700 ease-out"
        />
        <div className="wp-portal-canvas-dots" />
      </div>
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
        <div
          className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col pb-[var(--safe-area-bottom)] max-md:min-h-0 md:my-5 md:mr-5"
          style={{ marginLeft: mainMarginPx, transition: "margin-left 200ms ease-in-out" }}
        >
          <div className="wp-portal-main-panel flex min-h-0 flex-1 flex-col">
            <header className="wp-portal-top-header">
            <button
              type="button"
              onClick={() => setSidebarDrawerOpen(true)}
              className="md:hidden p-2 rounded-lg text-[color:var(--wp-text-muted)] hover:bg-[color:var(--wp-link-hover-bg)] min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
              aria-label="Otevřít menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24">
                <path d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
              </svg>
            </button>
            {/* Desktop: inline search. Mobile: icon → opens overlay with search */}
            <div className="flex min-h-[48px] min-w-0 flex-1 items-center md:max-w-md">
              {isDesktop && (
                <Suspense fallback={<div className="h-12 w-48 rounded-2xl bg-[color:var(--wp-header-input-bg)] animate-pulse" aria-hidden />}>
                  <PortalHeaderSearch ref={headerSearchRef} variant="header" />
                </Suspense>
              )}
              {isMobile && (
                <button
                  type="button"
                  onClick={() => setMobileSearchOpen(true)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[color:var(--wp-text-muted)] hover:bg-[color:var(--wp-link-hover-bg)] shrink-0"
                  aria-label="Hledat"
                >
                  <Search size={22} />
                </button>
              )}
            </div>
            <div className="wp-portal-top-header-actions flex items-center gap-2 sm:gap-3 shrink-0 md:gap-5">
              <QuickNewMenu />
              {showScanInQuickMenu ? (
                <Link
                  href="/portal/scan"
                  className="sm:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] text-[color:var(--wp-text-muted)] hover:bg-[color:var(--wp-link-hover-bg)] active:scale-[0.98] transition-transform"
                  aria-label="Skenovat dokument"
                >
                  <ScanLine size={22} aria-hidden />
                </Link>
              ) : null}
              <div className="hidden sm:flex items-center gap-2 md:gap-5">
                <NotificationBell />
                <UserMenu variant="portalHeader" />
              </div>
              <div className="relative sm:hidden">
                <button
                  type="button"
                  onClick={() => setOverflowOpen((o) => !o)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[color:var(--wp-text-muted)] hover:bg-[color:var(--wp-link-hover-bg)]"
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
                        <span className="text-xs font-semibold text-[color:var(--wp-text-muted)] uppercase tracking-wider">Další</span>
                      </div>
                      <div className="py-1" onClick={() => setOverflowOpen(false)}>
                        <div className="flex items-center gap-2 px-3 py-2">
                          <NotificationBell />
                        </div>
                        <div className="px-2">
                          <UserMenu variant="portalHeader" />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>
            <div className="wp-portal-main-scroll px-4 pb-5 pt-4 md:px-5 md:pb-6 lg:px-4 lg:pb-5 lg:pt-3">
              {children}
            </div>
          </div>
        </div>

        {/* Mobile search overlay: full-screen (search gets ref when open) */}
        {isMobile && mobileSearchOpen && (
          <div className="fixed inset-0 z-modal bg-wp-bg flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-wp-border shrink-0 min-h-[44px]">
              <div className="flex-1 min-w-0">
                <Suspense fallback={<div className="h-12 flex-1 rounded-2xl bg-[color:var(--wp-header-input-bg)] animate-pulse" />}>
                  <PortalHeaderSearch ref={headerSearchRef} variant="header" />
                </Suspense>
              </div>
              <button
                type="button"
                onClick={() => setMobileSearchOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-muted)]"
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
            className="fixed bottom-[max(1rem,env(safe-area-inset-bottom,0px))] right-[max(1rem,env(safe-area-inset-right,0px))] z-floating-ai flex min-h-[48px] min-w-[48px] items-center justify-center rounded-full border-2 border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text)] shadow-md shadow-black/10 transition-all duration-200 hover:bg-[color:var(--wp-surface-muted)] hover:border-[color:var(--wp-border-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--wp-text-tertiary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--wp-main-scroll-bg)] active:scale-95 dark:border-slate-200/90 dark:bg-white dark:shadow-black/25 dark:hover:border-slate-300 dark:hover:bg-slate-50 dark:focus-visible:ring-offset-white md:bottom-[max(1.5rem,env(safe-area-inset-bottom,0px))] md:right-[max(1.5rem,env(safe-area-inset-right,0px))]"
            aria-label="Otevřít AI asistenta"
          >
            <AiAssistantBrandIcon size={26} variant="blendOnly" className="max-h-full max-w-full" />
          </button>
        )}

        <AiAssistantDrawer />

        {shouldShowSoftPrompt ? (
          <div className="fixed inset-x-3 bottom-[calc(var(--safe-area-bottom)+0.75rem)] z-modal sm:inset-x-auto sm:right-4 sm:w-[360px] rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-xl p-4">
            <p className="text-sm font-semibold text-[color:var(--wp-text)]">Povolit push notifikace?</p>
            <p className="mt-1 text-sm text-[color:var(--wp-text-secondary)]">
              Dostanete upozornění na nové zprávy, dokumenty a důležité změny.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void requestSystemPermission();
                }}
                className={clsx(portalPrimaryButtonClassName, "px-3 py-2 text-sm font-medium")}
              >
                Povolit
              </button>
              <button
                type="button"
                onClick={markSoftPromptSeen}
                className="min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 py-2 text-sm font-medium text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
              >
                Teď ne
              </button>
            </div>
          </div>
        ) : null}
      </div>
  );
}

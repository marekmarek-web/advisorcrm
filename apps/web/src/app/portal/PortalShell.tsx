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
import { AdvisorInAppNotificationsProvider } from "./AdvisorInAppNotificationsContext";
import { AdvisorClientRequestToastStack } from "./AdvisorClientRequestToastStack";
import { AiAssistantDrawerProvider, useAiAssistantDrawer } from "./AiAssistantDrawerContext";
import { AiAssistantDrawer } from "./AiAssistantDrawer";
import { PortalFeedbackLauncher } from "./PortalFeedbackLauncher";
import { PortalBadgeCountsProvider } from "./PortalBadgeCountsContext";
import { useShareIntent } from "@/lib/share/useShareIntent";
import { usePushNotifications } from "@/lib/push/usePushNotifications";
import { mapPushNotificationToRoute } from "@/lib/push/routing";
import { useCaptureCapabilities } from "@/lib/device/useCaptureCapabilities";
import clsx from "clsx";
import { portalPrimaryButtonClassName } from "@/lib/ui/create-action-button-styles";
import type { QuickActionsConfig } from "@/lib/quick-actions";

const MOBILE_BREAKPOINT = 768;
/** Viewport threshold: below this width desktop uses overlay drawer + full-width main (no docked sidebar). */
const SIDEBAR_NARROW_DESKTOP_THRESHOLD = 1100;

const SIDEBAR_STORAGE_KEY = "portal-sidebar";
/** Odsazení plovoucího sidebaru od levého okraje (Tailwind left-5). */
const PORTAL_SIDEBAR_FLOAT_INSET_PX = 20;
/** Mezera mezi sidebar kartou a hlavním panelem. */
const PORTAL_SIDEBAR_MAIN_GAP_PX = 16;
/** Levý „peek“ pruh pro otevření draweru myší na mobilu (sliding nav). */
const PORTAL_SIDEBAR_EDGE_PEEK_PX = 14;
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

export function PortalShell({
  children,
  showTeamOverview,
  initialQuickActions,
  initialAdvisorAvatarUrl,
}: {
  children: React.ReactNode;
  showTeamOverview?: boolean;
  initialQuickActions?: QuickActionsConfig;
  initialAdvisorAvatarUrl?: string | null;
}) {
  const headerSearchRef = useRef<PortalHeaderSearchHandle>(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_WIDTH_DEFAULT);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarStateInitialized, setSidebarStateInitialized] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isNarrowDesktop, setIsNarrowDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${MOBILE_BREAKPOINT}px)`);
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${SIDEBAR_NARROW_DESKTOP_THRESHOLD - 1}px)`);
    const update = () => setIsNarrowDesktop(mq.matches);
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

  const narrowDesktopOverlay = isDesktop && isNarrowDesktop;

  const mainMarginPx = useMemo(() => {
    if (!isDesktop) return 0;
    if (narrowDesktopOverlay) {
      return PORTAL_SIDEBAR_FLOAT_INSET_PX + PORTAL_SIDEBAR_MAIN_GAP_PX;
    }
    const sidebarPx = sidebarCollapsed ? PORTAL_SIDEBAR_COLLAPSED_PX : sidebarWidth;
    return PORTAL_SIDEBAR_FLOAT_INSET_PX + sidebarPx + PORTAL_SIDEBAR_MAIN_GAP_PX;
  }, [isDesktop, narrowDesktopOverlay, sidebarCollapsed, sidebarWidth]);

  const prevNarrowOverlayRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevNarrowOverlayRef.current === true && narrowDesktopOverlay === false && isDesktop) {
      setSidebarDrawerOpen(false);
    }
    prevNarrowOverlayRef.current = narrowDesktopOverlay;
  }, [narrowDesktopOverlay, isDesktop]);

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
      <AdvisorInAppNotificationsProvider>
      <AdvisorClientRequestToastStack />
      <PortalBadgeCountsProvider>
      <AiAssistantDrawerProvider>
        <PortalShellInner
          showTeamOverview={showTeamOverview}
          initialQuickActions={initialQuickActions}
          initialAdvisorAvatarUrl={initialAdvisorAvatarUrl}
          isDesktop={isDesktop}
          isNarrowDesktop={isNarrowDesktop}
          headerSearchRef={headerSearchRef}
          mainMarginPx={mainMarginPx}
          sidebarDrawerOpen={sidebarDrawerOpen}
          setSidebarDrawerOpen={setSidebarDrawerOpen}
          initSidebarState={initSidebarState}
          sidebarWidth={sidebarWidth}
          sidebarCollapsed={sidebarCollapsed}
          narrowDesktopOverlay={narrowDesktopOverlay}
          handleSidebarResize={handleSidebarResize}
          handleSidebarCollapsed={handleSidebarCollapsed}
        >
          {children}
        </PortalShellInner>
      </AiAssistantDrawerProvider>
      </PortalBadgeCountsProvider>
      </AdvisorInAppNotificationsProvider>
    </ToastProvider>
  );
}

function PortalShellInner({
  showTeamOverview,
  initialQuickActions,
  initialAdvisorAvatarUrl,
  isDesktop,
  isNarrowDesktop,
  headerSearchRef,
  mainMarginPx,
  sidebarDrawerOpen,
  setSidebarDrawerOpen,
  initSidebarState,
  sidebarWidth,
  sidebarCollapsed,
  narrowDesktopOverlay,
  handleSidebarResize,
  handleSidebarCollapsed,
  children,
}: {
  showTeamOverview?: boolean;
  initialQuickActions?: QuickActionsConfig;
  initialAdvisorAvatarUrl?: string | null;
  isDesktop: boolean;
  isNarrowDesktop: boolean;
  headerSearchRef: React.RefObject<PortalHeaderSearchHandle | null>;
  mainMarginPx: number;
  sidebarDrawerOpen: boolean;
  setSidebarDrawerOpen: (v: boolean) => void;
  initSidebarState: () => void;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  narrowDesktopOverlay: boolean;
  handleSidebarResize: (w: number) => void;
  handleSidebarCollapsed: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const isMobile = !isDesktop;
  const router = useRouter();
  const pathname = usePathname();
  /** AI Review workspace (list + detail) — dedicated workspace without portal chrome (header, search, +Nový). */
  const isAiReviewWorkspace =
    pathname === "/portal/contracts/review" ||
    pathname === "/portal/contracts/review/" ||
    /^\/portal\/contracts\/review\/[^/]+\/?$/.test(pathname);
  /** Seznam Review smluv — celostránkový scroll v hlavní oblasti (detail zůstává overflow-hidden). */
  const isAiReviewListPage =
    pathname === "/portal/contracts/review" || pathname === "/portal/contracts/review/";
  /** Kalendář — vlastní workspace bez globálního top baru (search, +Nový, profil). */
  const isCalendarWorkspace =
    pathname === "/portal/calendar" || pathname.startsWith("/portal/calendar/");
  /** Board — stejně jako pipeline víc místa na tabulku, bez globálního top baru. */
  const isBoardWorkspace = pathname === "/portal/board" || pathname.startsWith("/portal/board/");
  const hidePortalTopHeader =
    pathname === "/portal/pipeline" || isCalendarWorkspace || isBoardWorkspace;
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

  const closeMobileSidebarDrawer = useCallback(() => {
    setSidebarDrawerOpen(false);
  }, [setSidebarDrawerOpen]);

  const [pointerFineHover, setPointerFineHover] = useState(false);
  useEffect(() => {
    const mqHover = window.matchMedia("(hover: hover)");
    const mqFine = window.matchMedia("(pointer: fine)");
    const update = () => setPointerFineHover(mqHover.matches && mqFine.matches);
    update();
    mqHover.addEventListener("change", update);
    mqFine.addEventListener("change", update);
    return () => {
      mqHover.removeEventListener("change", update);
      mqFine.removeEventListener("change", update);
    };
  }, []);

  const slidingNavMode = !isDesktop || narrowDesktopOverlay;
  const sidebarEdgePeekWidthPx = narrowDesktopOverlay ? mainMarginPx : PORTAL_SIDEBAR_EDGE_PEEK_PX;

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
          advisorAvatarUrl={initialAdvisorAvatarUrl}
          width={sidebarWidth}
          collapsed={sidebarCollapsed}
          narrowDesktopOverlay={narrowDesktopOverlay}
          onResize={handleSidebarResize}
          onCollapsedChange={handleSidebarCollapsed}
          onMount={initSidebarState}
          mobileDrawerOpen={sidebarDrawerOpen}
          onMobileDrawerClose={closeMobileSidebarDrawer}
        />
        {slidingNavMode && !sidebarDrawerOpen && pointerFineHover ? (
          <div
            className="fixed left-0 top-0 bottom-0 z-overlay pointer-events-auto"
            style={{ width: sidebarEdgePeekWidthPx }}
            aria-hidden
            onMouseEnter={() => setSidebarDrawerOpen(true)}
          />
        ) : null}
        <div
          className={clsx(
            "relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col pb-[var(--safe-area-bottom)] max-md:min-h-0",
            isCalendarWorkspace ? "md:mt-5 md:mb-5 md:mr-0" : "md:my-5 md:mr-5",
          )}
          style={{ marginLeft: mainMarginPx, transition: "margin-left 200ms ease-in-out" }}
        >
          <div className="wp-portal-main-panel flex min-h-0 flex-1 flex-col">
            {!isAiReviewWorkspace && !hidePortalTopHeader && (
            <header className="wp-portal-top-header">
            <button
              type="button"
              onClick={() => setSidebarDrawerOpen(true)}
              className={clsx(
                "p-2 rounded-lg text-[color:var(--wp-text-muted)] hover:bg-[color:var(--wp-link-hover-bg)] min-h-[44px] min-w-[44px] items-center justify-center shrink-0",
                isDesktop && !isNarrowDesktop ? "hidden" : "flex",
              )}
              aria-label="Otevřít menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24">
                <path d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
              </svg>
            </button>
            {/* Desktop: inline search. Mobile: icon → opens overlay with search */}
            <div className="flex min-h-[var(--wp-portal-header-search-min-h,48px)] min-w-0 flex-1 items-center md:max-w-md">
              {isDesktop && (
                <Suspense fallback={<div className="h-[var(--wp-portal-header-search-min-h,48px)] w-48 rounded-2xl bg-[color:var(--wp-header-input-bg)] animate-pulse" aria-hidden />}>
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
              <QuickNewMenu initialQuickActions={initialQuickActions} />
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
                <UserMenu variant="portalHeader" advisorAvatarUrl={initialAdvisorAvatarUrl} />
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
                          <UserMenu variant="portalHeader" advisorAvatarUrl={initialAdvisorAvatarUrl} />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>
            )}
            {isAiReviewWorkspace && isMobile && (
              <div className="shrink-0 flex items-center px-2 py-1 border-b border-[color:var(--wp-surface-card-border)]">
                <button
                  type="button"
                  onClick={() => setSidebarDrawerOpen(true)}
                  className="p-2 rounded-lg text-[color:var(--wp-text-muted)] hover:bg-[color:var(--wp-link-hover-bg)] min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Otevřít menu"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24">
                    <path d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
                  </svg>
                </button>
              </div>
            )}
            {hidePortalTopHeader && isMobile && !isAiReviewWorkspace && (
              <div className="shrink-0 flex items-center px-2 py-1 border-b border-[color:var(--wp-surface-card-border)]">
                <button
                  type="button"
                  onClick={() => setSidebarDrawerOpen(true)}
                  className="p-2 rounded-lg text-[color:var(--wp-text-muted)] hover:bg-[color:var(--wp-link-hover-bg)] min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Otevřít menu"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24">
                    <path d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
                  </svg>
                </button>
              </div>
            )}
            <div className={clsx(
              "wp-portal-main-scroll",
              isAiReviewWorkspace
                ? isAiReviewListPage
                  ? "flex flex-col flex-1 min-h-0 overflow-y-auto"
                  : "flex flex-col flex-1 min-h-0 overflow-hidden"
                : hidePortalTopHeader
                  ? isCalendarWorkspace
                    ? "flex flex-col flex-1 min-h-0 overflow-hidden p-0 m-0"
                    : "flex flex-col flex-1 min-h-0 overflow-hidden px-4 pb-2 pt-2 md:px-5 md:pb-2 lg:px-4 lg:pb-2 lg:pt-2"
                  : "px-4 pb-4 pt-4 md:px-5 md:pb-4 lg:px-4 lg:pb-3 lg:pt-3",
            )}>
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
            className="fixed bottom-[max(1rem,env(safe-area-inset-bottom,0px))] right-[max(1rem,env(safe-area-inset-right,0px))] z-floating-ai flex min-h-[48px] min-w-[48px] items-center justify-center rounded-full border-2 border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text)] shadow-md shadow-black/10 transition-all duration-200 hover:bg-[color:var(--wp-surface-muted)] hover:border-[color:var(--wp-border-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--wp-text-tertiary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--wp-main-scroll-bg)] active:scale-95 dark:border-[color:var(--wp-surface-card-border)]/90 dark:bg-white dark:shadow-black/25 dark:hover:border-[color:var(--wp-surface-card-border)] dark:hover:bg-[color:var(--wp-main-scroll-bg)] dark:focus-visible:ring-offset-white md:bottom-[max(1.5rem,env(safe-area-inset-bottom,0px))] md:right-[max(1.5rem,env(safe-area-inset-right,0px))]"
            aria-label="Otevřít AI asistenta"
          >
            <AiAssistantBrandIcon size={26} variant="colorOnWhite" className="max-h-full max-w-full" />
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

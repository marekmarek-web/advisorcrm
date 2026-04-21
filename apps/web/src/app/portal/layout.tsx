import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import Script from "next/script";
import { requireAuth } from "@/lib/auth/require-auth";
import { resolveAdvisorMfaEnforcement } from "@/lib/auth/mfa-enforcement";
import { resolveDunningBanner, type DunningBanner } from "@/lib/billing/dunning";
import { PortalDunningBanner } from "@/app/components/billing/PortalDunningBanner";
import { MaintenanceBanner } from "@/app/components/MaintenanceBanner";
import { getAdvisorAvatarUrl } from "@/app/actions/preferences";
import { getContactsCount } from "@/app/actions/contacts";
import { PortalShell } from "./PortalShell";
import { PortalAppProviders } from "./PortalAppProviders";
import { MobilePortalApp } from "./mobile/MobilePortalApp";
import { PortalThemeProvider } from "./PortalThemeProvider";
import { PORTAL_THEME_STORAGE_PREFLIGHT } from "./theme-storage-preflight";
import { isMobileUiV1EnabledForRequest } from "@/app/shared/mobile-ui/feature-flag";
import { shouldOmitPortalMobilePageTree } from "@/app/shared/mobile-ui/omit-portal-mobile-page-tree";
import "@/styles/aidvisora-monday.css";
import "@/styles/board.css";
import "@/styles/monday.css";
import "@/styles/aidvisora-calendar.css";

/** Portal je vždy dynamický – vyžaduje auth a DB, neprerenderovat při buildu. */
export const dynamic = "force-dynamic";

function isRedirectError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { digest?: string }).digest === "NEXT_REDIRECT";
}

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let auth;
  try {
    auth = await requireAuth();
  } catch (e) {
    if (isRedirectError(e)) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    const isDbError =
      msg.includes("connect") ||
      msg.includes("ENOTFOUND") ||
      msg.includes("authentication") ||
      msg.includes("MaxClients") ||
      msg.includes("max clients") ||
      msg.toLowerCase().includes("pool");
    const safe = isDbError ? "database_error" : "auth_error";
    redirect(`/prihlaseni?error=${encodeURIComponent(safe)}`);
  }
  if (auth.roleName === "Client") {
    redirect("/client");
  }
  const headerList = await headers();
  if (auth.roleName === "Advisor") {
    const pathname =
      headerList.get("x-pathname") ??
      headerList.get("next-url") ??
      (headerList.get("referer")
        ? (() => {
            try {
              return new URL(headerList.get("referer")!).pathname;
            } catch {
              return "";
            }
          })()
        : "");
    let contactsCount = -1;
    try {
      contactsCount = await getContactsCount();
    } catch {
      contactsCount = -1;
    }
    const onSetupPage = pathname.startsWith("/portal/setup");
    if (!onSetupPage && contactsCount === 0) {
      redirect("/portal/setup");
    }
  }

  // FL-2.2 — vynucení MFA po grace period pro role Admin/Director/Manager/Advisor.
  // Kontrola běží jen mimo `/portal/setup` (kde je enrollment UI v SetupView).
  // Flag je default OFF → aktivace přes `MFA_ENFORCE_ADVISORS=true` v prod env.
  if (
    auth.roleName === "Admin" ||
    auth.roleName === "Director" ||
    auth.roleName === "Manager" ||
    auth.roleName === "Advisor"
  ) {
    const pathname =
      headerList.get("x-pathname") ??
      headerList.get("next-url") ??
      "";
    const onSetupPage = pathname.startsWith("/portal/setup");
    if (!onSetupPage) {
      try {
        const decision = await resolveAdvisorMfaEnforcement({
          userId: auth.userId,
          tenantId: auth.tenantId,
          roleName: auth.roleName,
        });
        if (decision.kind === "enforce") {
          redirect("/portal/setup?tab=osobni&mfa_required=1#mfa");
        }
      } catch (e) {
        if (isRedirectError(e)) throw e;
        // Fail-open — raději neenforceme při selhání Supabase/DB, než sestřelit
        // portál. Výjimka půjde do Sentry jako unhandled (layout má error.tsx).
      }
    }
  }
  const showTeamOverview = auth.roleName === "Admin" || auth.roleName === "Director" || auth.roleName === "Manager" || auth.roleName === "Advisor";

  // FL-3.2 — dunning stav. Necháváme to mimo AI Review / mobile shell — tam
  // je limitovaný prostor a uživatel tam většinou nepotřebuje zareagovat na
  // billing. Banner se tím pádem zobrazí jen v desktop portal layoutu.
  let dunningState: DunningBanner = { kind: "none" };
  try {
    dunningState = await resolveDunningBanner(auth.tenantId);
  } catch {
    dunningState = { kind: "none" };
  }

  let initialAdvisorAvatarUrl: string | null = null;
  try {
    initialAdvisorAvatarUrl = await getAdvisorAvatarUrl();
  } catch {
    initialAdvisorAvatarUrl = null;
  }
  const cookieStore = await cookies();
  const mobileUiEnabled = isMobileUiV1EnabledForRequest({
    userAgent: headerList.get("user-agent"),
    cookieStore,
  });
  const pathnameForMobileSlot = headerList.get("x-pathname");
  const omitMobilePageTree = mobileUiEnabled && shouldOmitPortalMobilePageTree(pathnameForMobileSlot);

  // FL-1: AI Review detail běží bezhlavičkově (vlastní kompaktní status strip v `review/[id]/layout.tsx`).
  // Uvolní plnou výšku viewportu pro PDF + extrahovaný panel a zamezí dvojité hlavičce.
  const isAIReviewDetail =
    !!pathnameForMobileSlot && /^\/portal\/contracts\/review\/[^/]+$/.test(pathnameForMobileSlot);
  /** Quick actions načte klient (`useQuickActionsItems` v QuickNewMenu) — šetří DB round-trip v layoutu. */
  const initialQuickActions = undefined;
  if (mobileUiEnabled) {
    return (
      <>
        <Script id="portal-theme-storage-preflight" strategy="beforeInteractive">
          {PORTAL_THEME_STORAGE_PREFLIGHT}
        </Script>
        <PortalThemeProvider>
          <PortalAppProviders>
            <MobilePortalApp showTeamOverview={showTeamOverview} />
            {/* Nepřimountovávat `page.tsx` pod mobile shellem — duplicitní client stromy (FA, Setup, …) padají. */}
            {!omitMobilePageTree ? (
              <div className="sr-only" aria-hidden data-portal-mobile-rsc-slot>
                {children}
              </div>
            ) : null}
          </PortalAppProviders>
        </PortalThemeProvider>
      </>
    );
  }
  if (isAIReviewDetail) {
    return (
      <>
        <Script id="portal-theme-storage-preflight" strategy="beforeInteractive">
          {PORTAL_THEME_STORAGE_PREFLIGHT}
        </Script>
        <PortalThemeProvider>
          <PortalAppProviders>
            {children}
          </PortalAppProviders>
        </PortalThemeProvider>
      </>
    );
  }
  return (
    <>
      <Script id="portal-theme-storage-preflight" strategy="beforeInteractive">
        {PORTAL_THEME_STORAGE_PREFLIGHT}
      </Script>
      <PortalThemeProvider>
        <PortalAppProviders>
          {/* Delta A23 — maintenance banner čte Edge Config kill-switch. */}
          <MaintenanceBanner />
          <PortalDunningBanner state={dunningState} />
          <PortalShell
            showTeamOverview={showTeamOverview}
            initialQuickActions={initialQuickActions}
            initialAdvisorAvatarUrl={initialAdvisorAvatarUrl}
          >
            {children}
          </PortalShell>
        </PortalAppProviders>
      </PortalThemeProvider>
    </>
  );
}

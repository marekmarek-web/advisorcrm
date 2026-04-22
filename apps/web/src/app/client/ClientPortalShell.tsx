import { ClientSidebar } from "./ClientSidebar";
import { ClientPortalTopbar } from "./ClientPortalTopbar";
import { ClientMaterialRequestToastStack } from "./ClientMaterialRequestToastStack";

export type PortalFeatures = {
  messagingEnabled: boolean;
  serviceRequestsEnabled: boolean;
};

type ClientPortalShellProps = {
  children: React.ReactNode;
  unreadNotificationsCount: number;
  unreadMessagesCount: number;
  activeProposalsCount?: number;
  fullName: string;
  advisor: { fullName: string; email?: string | null; initials: string } | null;
  portalFeatures?: PortalFeatures;
  /** Signalizuje, že alespoň jeden fetch layoutu selhal — UI zobrazí warning banner. */
  shellLoadFailed?: boolean;
};

export function ClientPortalShell({
  children,
  unreadNotificationsCount,
  unreadMessagesCount,
  activeProposalsCount = 0,
  fullName,
  advisor,
  portalFeatures,
  shellLoadFailed = false,
}: ClientPortalShellProps) {
  return (
    <div className="client-portal-root flex min-h-screen bg-[color:var(--wp-main-scroll-bg)] text-[color:var(--wp-text)]">
      <ClientSidebar
        unreadNotificationsCount={unreadNotificationsCount}
        unreadMessagesCount={unreadMessagesCount}
        activeProposalsCount={activeProposalsCount}
        advisor={advisor}
        portalFeatures={portalFeatures}
      />
      <div className="flex flex-col flex-1 min-w-0 ml-12 md:ml-[280px]">
        <ClientPortalTopbar
          unreadNotificationsCount={unreadNotificationsCount}
          fullName={fullName}
        />
        {shellLoadFailed && (
          <div
            role="alert"
            className="mx-4 sm:mx-5 lg:mx-6 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-800 flex items-start gap-2"
          >
            <span aria-hidden className="mt-0.5">⚠️</span>
            <div>
              <strong className="font-bold">Některé údaje se nepodařilo načíst.</strong>{" "}
              Počty oznámení nebo zpráv v menu mohou být neaktuální. Zkuste stránku obnovit nebo se
              vrátit později.
            </div>
          </div>
        )}
        <main className="flex-1 min-h-0 client-dot-grid client-custom-scrollbar overflow-y-auto">
          <div className="relative z-10 p-4 sm:p-5 lg:p-6 max-w-[1400px] mx-auto w-full flex flex-col min-h-[calc(100dvh-theme(spacing.16))]">{children}</div>
          <ClientMaterialRequestToastStack />
        </main>
      </div>
    </div>
  );
}

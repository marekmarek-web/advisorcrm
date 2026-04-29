"use client";

import { useRouter } from "next/navigation";
import { Briefcase, CheckSquare, CalendarPlus, ScanLine, UserPlus } from "lucide-react";
import { BottomSheet } from "@/app/shared/mobile-ui/primitives";

const rowClass =
  "w-full flex items-center gap-3 px-3 py-3 min-h-[48px] text-left text-sm font-bold text-[color:var(--wp-text)] rounded-xl transition-transform active:scale-[0.99] hover:bg-[color:var(--wp-surface-muted)]";

/**
 * Centrální „+“ z mobilní spodní lišty — jednotný seznam bez fake mutací.
 * Každá položka routuje nebo otevře existující sheet v MobilePortalClient.
 */
export function QuickNewMobileSheet({
  open,
  onClose,
  onNewTask,
  onNewClient,
  onNewOpportunity,
  showScanShortcut,
}: {
  open: boolean;
  onClose: () => void;
  onNewTask: () => void;
  onNewClient: () => void;
  onNewOpportunity: () => void;
  /** True — `/portal/scan`; jinak fallback `/portal/documents`. */
  showScanShortcut: boolean;
}) {
  const router = useRouter();

  function goUploadContract() {
    onClose();
    router.push(showScanShortcut ? "/portal/scan" : "/portal/documents");
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Rychlé akce" reserveMobileBottomNav>
      <p className="text-xs font-medium leading-snug text-[color:var(--wp-text-secondary)] mb-3">
        Založte záznam v CRM nebo pokračujte v existujícím průvodci — žádné ukládání bez napojení na server.
      </p>
      <div className="space-y-1">
        <button
          type="button"
          className={rowClass}
          onClick={() => {
            onClose();
            onNewTask();
          }}
        >
          <CheckSquare className="size-5 shrink-0 text-[color:var(--wp-text-secondary)]" aria-hidden />
          Nový úkol
        </button>
        <button
          type="button"
          className={rowClass}
          onClick={() => {
            onClose();
            router.push("/portal/calendar?new=1");
          }}
        >
          <CalendarPlus className="size-5 shrink-0 text-[color:var(--wp-text-secondary)]" aria-hidden />
          Nová aktivita
        </button>
        <button
          type="button"
          className={rowClass}
          onClick={() => {
            onClose();
            onNewClient();
          }}
        >
          <UserPlus className="size-5 shrink-0 text-[color:var(--wp-text-secondary)]" aria-hidden />
          Nový klient
        </button>
        <button
          type="button"
          className={rowClass}
          onClick={() => {
            onClose();
            onNewOpportunity();
          }}
        >
          <Briefcase className="size-5 shrink-0 text-[color:var(--wp-text-secondary)]" aria-hidden />
          Nový obchod
        </button>
        <button type="button" className={rowClass} onClick={goUploadContract}>
          <ScanLine className="size-5 shrink-0 text-[color:var(--wp-text-secondary)]" aria-hidden />
          Nahrát smlouvu
        </button>
      </div>
      {!showScanShortcut ? (
        <p className="mt-3 text-[11px] text-[color:var(--wp-text-tertiary)] leading-snug">
          Otevře se sekce dokumentů. Vícestránkový sken v aplikaci vyžaduje oprávnění a zapnutou funkci workspace.
        </p>
      ) : null}
    </BottomSheet>
  );
}

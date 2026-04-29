"use client";

import type { ReactNode } from "react";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/**
 * Jednotný vnitřní wrapper pro obsah screenu (bez scrollu — ten drží `MobileScreen`).
 * Viz `docs/mobile-redesign/mobile-chrome-contract.md` — na primárních tab hubách
 * je hlavní H1 v obsahu, ne ve `MobileHeader` (`isPrimaryTabHubPath`).
 */
export function MobilePage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("w-full min-w-0", className)}>{children}</div>;
}

/**
 * Consistent horizontal padding and max-width per device class.
 * Use inside MobileScreen / MobileAppShell to constrain content width on tablet.
 * Aligns with premium mobile canvas (narrow phones ~390–430px readable column).
 */
export function MobilePageLayout({
  children,
  deviceClass = "phone",
  className,
}: {
  children: ReactNode;
  deviceClass?: DeviceClass;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "mx-auto w-full",
        deviceClass === "phone" && "max-w-lg px-0 sm:max-w-xl",
        deviceClass === "tablet" && "max-w-3xl px-2",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Master-detail layout:
 * - phone: shows master OR detail based on showDetail flag
 * - tablet: shows master (fixed width sidebar) + detail side by side
 */
export function MasterDetailLayout({
  master,
  detail,
  showDetail,
  deviceClass = "phone",
}: {
  master: ReactNode;
  detail: ReactNode | null;
  showDetail: boolean;
  deviceClass?: DeviceClass;
}) {
  if (deviceClass === "phone") {
    return <>{showDetail ? detail : master}</>;
  }

  return (
    <div className="flex h-full min-h-0">
      <div
        className={cx(
          "overflow-y-auto border-r border-[color:var(--wp-border)] flex-shrink-0",
          showDetail ? "w-[320px]" : "flex-1"
        )}
      >
        {master}
      </div>
      {showDetail && detail ? (
        <div className="flex-1 overflow-y-auto">{detail}</div>
      ) : null}
    </div>
  );
}

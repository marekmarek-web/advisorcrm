"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";

// B2.10: Page titles pokrývají i návrhy/unsubscribe/requests/new a detail
// pozadavky-poradce. Bez toho topbar spadne na generické „Klientská zóna“.
const PAGE_TITLES: Record<string, string> = {
  "/client": "Můj přehled",
  "/client/portfolio": "Moje portfolio",
  "/client/contracts": "Moje portfolio",
  "/client/investments": "Moje portfolio",
  "/client/payments": "Platby a příkazy",
  "/client/calculators": "Kalkulačky",
  "/client/requests": "Moje požadavky",
  "/client/requests/new": "Nový požadavek",
  "/client/messages": "Zprávy poradci",
  "/client/documents": "Trezor dokumentů",
  "/client/profile": "Můj profil",
  "/client/notifications": "Oznámení",
  "/client/pozadavky-poradce": "Požadavky od poradce",
  "/client/navrhy": "Návrhy od poradce",
  "/client/unsubscribe": "Odběr oznámení",
};

type ClientPortalTopbarProps = {
  unreadNotificationsCount: number;
  fullName: string;
};

export function ClientPortalTopbar({
  unreadNotificationsCount,
  fullName,
}: ClientPortalTopbarProps) {
  const pathname = usePathname();

  const pageTitle = useMemo(() => {
    if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
    const matched = Object.keys(PAGE_TITLES).find((route) => pathname.startsWith(route + "/"));
    return matched ? PAGE_TITLES[matched] : "Klientská zóna";
  }, [pathname]);

  const initials = useMemo(() => {
    const parts = fullName.split(" ").filter(Boolean).slice(0, 2);
    return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "K";
  }, [fullName]);

  return (
    <header className="sticky top-0 z-20 bg-white/85 backdrop-blur-md border-b border-[color:var(--wp-surface-card-border)] px-4 sm:px-5 lg:px-6 py-3 sm:py-3 shadow-sm">
      <div className="mx-auto w-full max-w-[1400px] flex items-center justify-between gap-3 sm:gap-4">
        <h1 className="text-lg sm:text-xl font-display font-black text-[color:var(--wp-text)] tracking-tight">
          {pageTitle}
        </h1>
        <div className="flex items-center gap-3">
          <Link
            href="/client/notifications"
            aria-label="Otevřít oznámení"
            className="relative p-2 rounded-xl text-[color:var(--wp-text-secondary)] hover:text-indigo-600 hover:bg-[color:var(--wp-main-scroll-bg)] transition-colors"
          >
            <Bell size={20} />
            {unreadNotificationsCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[14px] h-[14px] px-1 rounded-full text-[9px] font-black bg-rose-500 text-white flex items-center justify-center">
                {unreadNotificationsCount > 99 ? "99+" : unreadNotificationsCount}
              </span>
            )}
          </Link>
          <Link
            href="/client/profile"
            className="flex items-center gap-2 cursor-pointer hover:bg-[color:var(--wp-main-scroll-bg)] p-1.5 pr-3 rounded-full border border-[color:var(--wp-surface-card-border)] transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-black">
              {initials}
            </div>
            <span className="text-sm font-bold text-[color:var(--wp-text)] hidden sm:block max-w-44 truncate">
              {fullName}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}

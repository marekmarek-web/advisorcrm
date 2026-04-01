"use client";

import Link from "next/link";
import { usePortalBadgeCounts } from "@/app/portal/PortalBadgeCountsContext";

export function NotificationBell() {
  const { notifications: count } = usePortalBadgeCounts();

  return (
    <Link
      href="/portal/notifications"
      className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-2.5 text-[color:var(--wp-text-muted)] transition-colors hover:bg-[color:var(--wp-link-hover-bg)] hover:text-[color:var(--wp-text)] dark:hover:bg-white/10 dark:hover:text-white/90"
      title="Oznámení – zprávy od klientů, kalendář, úkoly, poznámky"
      aria-label={count != null && count > 0 ? `Oznámení, ${count > 99 ? "99+" : count} nepřečtených` : "Oznámení"}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {count != null && count > 0 && (
        <>
          <span
            className="absolute top-2 right-2.5 h-2 w-2 rounded-full border-2 border-[color:var(--wp-portal-header-bg)] bg-rose-500 dark:border-[color:var(--wp-portal-header-bg)]"
            aria-hidden
          />
          <span className="sr-only">{count > 99 ? "99+" : count} nepřečtených</span>
        </>
      )}
    </Link>
  );
}

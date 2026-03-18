"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/app/components/SignOutButton";

export const CLIENT_SIDEBAR_WIDTH_PX = 200;
export const CLIENT_SIDEBAR_COLLAPSED_PX = 48;

const VIEWS: { href: string; label: string; showBadge?: boolean }[] = [
  { href: "/client", label: "Přehled" },
  { href: "/client/contracts", label: "Smlouvy" },
  { href: "/client/payments", label: "Platby" },
  { href: "/client/investments", label: "Investice" },
  { href: "/client/documents", label: "Dokumenty" },
  { href: "/client/messages", label: "Zprávy" },
  { href: "/client/requests", label: "Moje požadavky" },
  { href: "/client/notifications", label: "Oznámení", showBadge: true },
  { href: "/client/profile", label: "Profil" },
];

export function ClientSidebar({
  unreadNotificationsCount = 0,
}: {
  unreadNotificationsCount?: number;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const navLinks = VIEWS.map((v) => {
    const isActive =
      pathname === v.href ||
      (v.href !== "/client" && pathname.startsWith(v.href + "/"));
    const showBadge = v.showBadge && unreadNotificationsCount > 0;
    return (
      <Link
        key={v.href}
        href={v.href}
        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-[6px] text-[13px] hover:bg-monday-row-hover transition-colors min-h-[44px] ${
          isActive
            ? "text-monday-blue font-medium bg-monday-row-hover"
            : "text-monday-text"
        }`}
      >
        <span>{v.label}</span>
        {showBadge && (
          <span className="shrink-0 rounded-full bg-monday-blue text-white text-xs font-medium min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unreadNotificationsCount > 99 ? "99+" : unreadNotificationsCount}
          </span>
        )}
      </Link>
    );
  });

  return (
    <>
      {/* Collapsed narrow bar – visible only on mobile */}
      <div className="md:hidden fixed left-0 top-0 bottom-0 z-20 w-12 bg-monday-surface border-r border-monday-border flex flex-col items-center pt-3 gap-2">
        <div className="w-7 h-7 rounded-md bg-monday-blue flex items-center justify-center text-white text-xs font-semibold shrink-0">
          W
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-monday-text-muted hover:bg-monday-row-hover"
          aria-label="Otevřít menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24">
            <path d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
          </svg>
        </button>
      </div>

      {/* Backdrop overlay – mobile only */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Full sidebar */}
      <aside
        className={[
          "fixed left-0 top-0 bottom-0 flex flex-col bg-monday-surface border-r border-monday-border",
          "transition-transform duration-200 ease-in-out",
          "md:z-20 md:translate-x-0",
          mobileOpen ? "z-40 translate-x-0" : "z-40 -translate-x-full",
        ].join(" ")}
        style={{ width: CLIENT_SIDEBAR_WIDTH_PX }}
      >
        <div className="p-3 border-b border-monday-border">
          <div className="flex items-center justify-between">
            <Link href="/client" className="flex items-center gap-2 px-2 py-1.5">
              <div className="w-7 h-7 rounded-md bg-monday-blue flex items-center justify-center text-white text-xs font-semibold">
                W
              </div>
              <span className="text-monday-text font-semibold text-sm">Client Zone</span>
            </Link>
            <button
              onClick={() => setMobileOpen(false)}
              className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-monday-text-muted hover:bg-monday-row-hover"
              aria-label="Zavřít menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">{navLinks}</nav>

        <div className="p-3 border-t border-monday-border">
          <SignOutButton />
        </div>
      </aside>
    </>
  );
}

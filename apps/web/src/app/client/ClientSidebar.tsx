"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  Calculator,
  CreditCard,
  FolderOpen,
  LayoutDashboard,
  Menu,
  MessageSquare,
  User,
  X,
  ListTodo,
  Bell,
} from "lucide-react";
import { SignOutButton } from "@/app/components/SignOutButton";

export const CLIENT_SIDEBAR_WIDTH_PX = 280;
export const CLIENT_SIDEBAR_COLLAPSED_PX = 48;

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  match?: string[];
  showBadge?: boolean;
};

const VIEWS: NavItem[] = [
  { href: "/client", label: "Můj přehled", icon: LayoutDashboard },
  {
    href: "/client/portfolio",
    label: "Moje portfolio",
    icon: Briefcase,
    match: ["/client/contracts"],
  },
  { href: "/client/payments", label: "Platby a příkazy", icon: CreditCard },
  { href: "/client/calculators", label: "Kalkulačky", icon: Calculator },
  { href: "/client/requests", label: "Moje požadavky", icon: ListTodo },
  { href: "/client/messages", label: "Zprávy poradci", icon: MessageSquare },
  { href: "/client/documents", label: "Trezor dokumentů", icon: FolderOpen },
  {
    href: "/client/notifications",
    label: "Oznámení",
    icon: Bell,
    showBadge: true,
  },
  { href: "/client/profile", label: "Můj profil", icon: User },
];

export function ClientSidebar({
  unreadNotificationsCount = 0,
  advisor,
}: {
  unreadNotificationsCount?: number;
  advisor?: { fullName: string; email?: string | null; initials: string } | null;
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
    const isMatchAlias = v.match?.some((prefix) => pathname.startsWith(prefix));
    const isActive =
      v.href === "/client"
        ? pathname === "/client"
        : pathname === v.href || pathname.startsWith(v.href + "/") || isMatchAlias;
    const showBadge = v.showBadge && unreadNotificationsCount > 0;
    const Icon = v.icon;

    return (
      <Link
        key={v.href}
        href={v.href}
        className={`group flex items-center justify-between gap-3 px-3 py-3 rounded-xl text-[13px] transition-all min-h-[44px] ${
          isActive
            ? "bg-slate-900 text-white shadow-md"
            : "text-slate-500 hover:bg-slate-100/80 hover:text-slate-900"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon
            size={18}
            className={isActive ? "text-emerald-400" : "text-slate-400 group-hover:text-emerald-500"}
          />
          <span className="font-bold tracking-wide truncate">{v.label}</span>
        </div>
        {showBadge && (
          <span
            className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full ${
              isActive ? "bg-white/20 text-white" : "bg-rose-100 text-rose-700"
            }`}
          >
            {unreadNotificationsCount > 99 ? "99+" : unreadNotificationsCount}
          </span>
        )}
      </Link>
    );
  });

  return (
    <>
      <div className="md:hidden fixed left-0 top-0 bottom-0 z-20 w-12 bg-white border-r border-slate-200 flex flex-col items-center pt-3 gap-2">
        <div className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-500 to-emerald-400 flex items-center justify-center text-white text-xs font-semibold shrink-0">
          C
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          aria-label="Otevřít menu"
        >
          <Menu size={20} />
        </button>
      </div>

      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={[
          "fixed left-0 top-0 bottom-0 flex flex-col bg-white border-r border-slate-200 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)]",
          "transition-transform duration-200 ease-in-out",
          "md:z-20 md:translate-x-0",
          mobileOpen ? "z-40 translate-x-0" : "z-40 -translate-x-full",
        ].join(" ")}
        style={{ width: CLIENT_SIDEBAR_WIDTH_PX }}
      >
        <div className="h-20 flex items-center justify-between px-6 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <Link href="/client" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-400 flex items-center justify-center text-white font-black shadow-lg shadow-emerald-500/20">
                C
              </div>
              <span className="text-slate-900 font-black text-xl tracking-tight">
                Klientská<span className="text-emerald-500">Zóna</span>
              </span>
            </Link>
            <button
              onClick={() => setMobileOpen(false)}
              className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 ml-2"
              aria-label="Zavřít menu"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <div className="px-2 pb-1">
            <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
              Menu
            </h4>
          </div>
          {navLinks}
        </nav>

        <div className="p-4 border-t border-slate-100 bg-slate-50/60 space-y-3">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
              Váš osobní poradce
            </h4>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-sm">
                {advisor?.initials ?? "VP"}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-900 truncate">
                  {advisor?.fullName ?? "Váš poradce"}
                </p>
                <p className="text-[11px] font-bold text-slate-500 truncate">
                  {advisor?.email ?? "Podpora klientské zóny"}
                </p>
              </div>
            </div>
            <Link
              href="/client/messages"
              className="w-full py-2 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-600 hover:text-white transition-colors"
            >
              <MessageSquare size={14} />
              Napsat zprávu
            </Link>
          </div>
          <SignOutButton />
        </div>
      </aside>
    </>
  );
}

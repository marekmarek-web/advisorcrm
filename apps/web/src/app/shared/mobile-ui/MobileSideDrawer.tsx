"use client";

import { useEffect, useMemo, type ComponentType, type ReactNode } from "react";
import {
  Home,
  LayoutGrid,
  Users,
  Building2,
  Briefcase,
  BarChart3,
  Calculator,
  CheckSquare,
  TrendingUp,
  Calendar,
  Bell,
  Settings,
  Network,
  MessageCircle,
  Sparkles,
  X,
  FileText,
  Target,
  UsersRound,
  UserPlus,
  Zap,
} from "lucide-react";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";
import { hasPermission, type RoleName } from "@/shared/rolePermissions";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function GoogleDriveLogo({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <span className={className} style={{ width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logos/google-drive.png" alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
    </span>
  );
}

function GmailLogo({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <span className={className} style={{ width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logos/gmail.png" alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
    </span>
  );
}

export type DrawerNavItem = {
  href: string;
  label: string;
  Icon: ComponentType<{ size?: number; className?: string }>;
  badge?: number;
};

export type DrawerSection = { id: string; title: string; items: DrawerNavItem[] };

function filterSections(sections: DrawerSection[], showTeamOverview: boolean): DrawerSection[] {
  if (showTeamOverview) return sections;
  return sections.filter((s) => s.id !== "sec-vedeni");
}

/** Mirrors web `DEFAULT_SECTIONS` in PortalSidebar.tsx, plus mobile-only extras (Dokumenty, Studené kontakty). Items filtered by `hasPermission`. */
function buildSections(showTeamOverview: boolean, roleName: RoleName): DrawerSection[] {
  const prehled: DrawerNavItem[] = [
    { href: "/portal/today", label: "Nástěnka", Icon: Home },
    { href: "/portal/tasks", label: "Úkoly", Icon: CheckSquare },
    { href: "/portal/messages", label: "Zprávy", Icon: MessageCircle },
    { href: "/portal/calendar", label: "Kalendář", Icon: Calendar },
    { href: "/portal/notes", label: "Zápisky", Icon: FileText },
    { href: "/portal/action-center", label: "Akční centrum", Icon: Zap },
  ];

  const databaze: DrawerNavItem[] = [
    { href: "/portal/contacts", label: "Klienti", Icon: Users },
    { href: "/portal/households", label: "Domácnosti", Icon: Building2 },
    ...(hasPermission(roleName, "contacts:read")
      ? [{ href: "/portal/cold-contacts", label: "Studené kontakty", Icon: UserPlus } as DrawerNavItem]
      : []),
  ];

  const byznys: DrawerNavItem[] = [
    { href: "/portal/pipeline", label: "Obchody", Icon: Briefcase },
    { href: "/portal/board", label: "Board", Icon: LayoutGrid },
    { href: "/portal/production", label: "Produkce", Icon: TrendingUp },
    { href: "/portal/business-plan", label: "Business plán", Icon: Target },
  ];

  const nastroje: DrawerNavItem[] = [
    ...(hasPermission(roleName, "documents:read")
      ? [{ href: "/portal/contracts/review", label: "AI Review smluv", Icon: Sparkles } as DrawerNavItem]
      : []),
    ...(hasPermission(roleName, "documents:read")
      ? [{ href: "/portal/documents", label: "Dokumenty", Icon: FileText } as DrawerNavItem]
      : []),
    ...(hasPermission(roleName, "contacts:write")
      ? [{ href: "/portal/analyses", label: "Finanční analýzy", Icon: BarChart3 } as DrawerNavItem]
      : []),
    { href: "/portal/calculators", label: "Kalkulačky", Icon: Calculator },
    { href: "/portal/mindmap", label: "Mindmap", Icon: Network },
    { href: "/portal/tools/drive", label: "Google Disk", Icon: GoogleDriveLogo },
    { href: "/portal/tools/gmail", label: "Gmail", Icon: GmailLogo },
  ];

  const all: DrawerSection[] = [
    { id: "sec-prehled", title: "Přehled", items: prehled },
    { id: "sec-databaze", title: "Klientská databáze", items: databaze },
    { id: "sec-byznys", title: "Obchod a Byznys", items: byznys },
    { id: "sec-nastroje", title: "Nástroje poradce", items: nastroje },
    {
      id: "sec-vedeni",
      title: "Vedení týmu",
      items: [{ href: "/portal/team-overview", label: "Týmový přehled", Icon: UsersRound }],
    },
    {
      id: "sec-system",
      title: "Systém",
      items: [
        { href: "/portal/notifications", label: "Notifikace", Icon: Bell },
        { href: "/portal/setup", label: "Nastavení", Icon: Settings },
      ],
    },
  ];
  return filterSections(all, showTeamOverview).filter((s) => s.items.length > 0);
}

function isPathActive(pathname: string, href: string): boolean {
  const base = href.split("?")[0]?.split("#")[0] ?? href;
  if (pathname === base) return true;
  if (base === "/portal/today") return pathname === "/portal/today";
  return pathname.startsWith(base + "/") || pathname.startsWith(base + "?");
}

export function MobileSideDrawer({
  open,
  onClose,
  pathname,
  onNavigate,
  showTeamOverview,
  advisorName,
  deviceClass,
  tasksBadge,
  messagesBadge,
  searchSlot,
  onOpenAi,
  roleName,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
  onNavigate: (href: string) => void;
  showTeamOverview: boolean;
  advisorName: string;
  deviceClass: DeviceClass;
  tasksBadge?: number;
  messagesBadge?: number;
  searchSlot?: ReactNode;
  onOpenAi: () => void;
  /** Advisor role from server membership (client-safe, no db import). */
  roleName: RoleName;
}) {
  const sections = useMemo(
    () => buildSections(showTeamOverview, roleName),
    [showTeamOverview, roleName]
  );

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const widthClass = deviceClass === "tablet" ? "w-[320px]" : "w-[min(85vw,320px)]";

  return (
    <div className="fixed inset-0 z-[100] flex flex-row" role="dialog" aria-modal="true" aria-label="Menu">
      <aside
        className={cx(
          "h-full bg-white shadow-xl flex flex-col border-r border-slate-100 animate-in slide-in-from-left duration-300 ease-out shrink-0",
          widthClass
        )}
      >
        <div className="pt-[calc(var(--safe-area-top)+0.75rem)] px-4 pb-3 border-b border-slate-100 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-500">Přihlášen</p>
            <p className="text-sm font-black text-slate-900 truncate">{advisorName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 grid place-items-center shrink-0 active:scale-95 transition-transform"
            aria-label="Zavřít"
          >
            <X size={18} />
          </button>
        </div>

        {searchSlot ? <div className="px-3 py-2 border-b border-slate-100">{searchSlot}</div> : null}

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
          {sections.map((sec) => (
            <div key={sec.id}>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2 mb-2">{sec.title}</p>
              <ul className="space-y-0.5">
                {sec.items.map((item) => {
                  const Icon = item.Icon;
                  const active = isPathActive(pathname, item.href);
                  let badge: number | undefined;
                  if (item.href === "/portal/tasks" && tasksBadge && tasksBadge > 0) badge = tasksBadge;
                  if (item.href === "/portal/messages" && messagesBadge && messagesBadge > 0) badge = messagesBadge;
                  return (
                    <li key={item.href}>
                      <button
                        type="button"
                        onClick={() => onNavigate(item.href)}
                        className={cx(
                          "w-full flex items-center gap-3 min-h-[44px] px-3 rounded-xl text-left text-sm font-bold transition-colors active:scale-[0.99]",
                          active ? "bg-indigo-50 text-indigo-800" : "text-slate-800 hover:bg-slate-50"
                        )}
                      >
                        <span className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                          <Icon size={16} className="text-indigo-600" />
                        </span>
                        <span className="flex-1 truncate">{item.label}</span>
                        {badge ? (
                          <span className="text-[10px] font-black bg-rose-500 text-white min-w-[20px] h-5 px-1 rounded-full grid place-items-center">
                            {badge > 9 ? "9+" : badge}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-100 pb-[max(0.75rem,var(--safe-area-bottom))]">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAi();
            }}
            className="w-full min-h-[48px] rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-black flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition-transform"
          >
            <Sparkles size={18} />
            Zeptejte se AI
          </button>
        </div>
      </aside>
      <button
        type="button"
        className="flex-1 min-w-0 bg-black/40 animate-in fade-in duration-200"
        aria-label="Zavřít menu"
        onClick={onClose}
      />
    </div>
  );
}

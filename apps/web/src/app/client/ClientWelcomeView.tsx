"use client";

import Link from "next/link";
import {
  FolderOpen,
  MessageSquare,
  ListTodo,
  User,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

type ClientWelcomeViewProps = {
  firstName: string;
  advisorName?: string | null;
  advisorEmail?: string | null;
  advisorInitials?: string | null;
};

const QUICK_ACTIONS = [
  {
    href: "/client/documents",
    label: "Trezor dokumentů",
    description: "Smlouvy, analýzy a důležité soubory",
    icon: FolderOpen,
    color: "text-amber-600 bg-amber-50 border-amber-100",
    hoverBorder: "hover:border-amber-200",
  },
  {
    href: "/client/messages",
    label: "Zprávy poradci",
    description: "Komunikace s vaším poradcem",
    icon: MessageSquare,
    color: "text-indigo-600 bg-indigo-50 border-indigo-100",
    hoverBorder: "hover:border-indigo-200",
  },
  {
    href: "/client/requests",
    label: "Moje požadavky",
    description: "Zadejte nový požadavek nebo sledujte stav",
    icon: ListTodo,
    color: "text-emerald-600 bg-emerald-50 border-emerald-100",
    hoverBorder: "hover:border-emerald-200",
  },
  {
    href: "/client/profile",
    label: "Můj profil",
    description: "Osobní údaje a nastavení účtu",
    icon: User,
    color: "text-violet-600 bg-violet-50 border-violet-100",
    hoverBorder: "hover:border-violet-200",
  },
];

export function ClientWelcomeView({
  firstName,
  advisorName,
  advisorEmail,
  advisorInitials,
}: ClientWelcomeViewProps) {
  return (
    <div className="space-y-8 client-fade-in max-w-3xl">
      <div className="rounded-[24px] bg-gradient-to-br from-slate-900 to-slate-800 p-8 sm:p-10 text-white relative overflow-hidden border border-slate-700/50">
        <div className="absolute -top-16 -right-16 w-56 h-56 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-10 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2.5 mb-4">
            <CheckCircle2 size={22} className="text-emerald-400" />
            <span className="text-xs font-black uppercase tracking-widest text-emerald-400">
              Přístup aktivní
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-display font-black tracking-tight mb-3">
            Vítejte, {firstName}
          </h2>
          <p className="text-[color:var(--wp-text-tertiary)] text-base font-medium leading-relaxed max-w-lg">
            Vaše klientská zóna je připravená. Najdete tu dokumenty, smlouvy a přímou komunikaci
            s&nbsp;vaším poradcem — vše na jednom místě.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={`group bg-white rounded-2xl border border-[color:var(--wp-surface-card-border)] ${action.hoverBorder} hover:shadow-md p-5 flex items-start gap-4 transition-all`}
          >
            <div
              className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center ${action.color} group-hover:scale-105 transition-transform border`}
            >
              <action.icon size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-black text-[color:var(--wp-text)]">{action.label}</h3>
                <ArrowRight
                  size={16}
                  className="text-[color:var(--wp-text-tertiary)] group-hover:text-[color:var(--wp-text-secondary)] group-hover:translate-x-0.5 transition-all shrink-0"
                />
              </div>
              <p className="text-xs text-[color:var(--wp-text-secondary)] font-medium mt-0.5 leading-relaxed">
                {action.description}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {advisorName && (
        <div className="bg-white rounded-2xl border border-[color:var(--wp-surface-card-border)] p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-sm shrink-0">
            {advisorInitials ?? "VP"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-0.5">
              Váš poradce
            </p>
            <p className="text-sm font-bold text-[color:var(--wp-text)] truncate">{advisorName}</p>
            {advisorEmail && (
              <p className="text-xs text-[color:var(--wp-text-secondary)] truncate">{advisorEmail}</p>
            )}
          </div>
          <Link
            href="/client/messages"
            className="shrink-0 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-colors min-h-[40px] flex items-center gap-2"
          >
            <MessageSquare size={14} />
            Napsat
          </Link>
        </div>
      )}

      <p className="text-xs text-[color:var(--wp-text-tertiary)] font-medium leading-relaxed">
        Jakmile váš poradce přidá smlouvy a dokumenty, zobrazí se automaticky v příslušných sekcích.
        Celý přehled najdete v menu vlevo.
      </p>
    </div>
  );
}

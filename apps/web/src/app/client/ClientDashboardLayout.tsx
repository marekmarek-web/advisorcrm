"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Bell,
  Briefcase,
  Calculator,
  CreditCard,
  FolderOpen,
  PieChart,
  Plus,
  Shield,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { ClientRequestItem } from "@/app/lib/client-portal/request-types";
import { ClientZoneExportButton } from "./ClientZoneExportButton";
import { NewRequestModal } from "./NewRequestModal";
import { AiSupportButton } from "./AiSupportButton";

type QuickStats = {
  assetsUnderManagement: number;
  monthlyInvestments: number;
  riskCoveragePercent: number;
};

/** Serializable slice from `getClientFinancialSummaryForContact` for the client dashboard. */
export type ClientPortalFinancialSummary = {
  scope: "contact" | "household";
  householdName: string | null;
  income: number;
  expenses: number;
  surplus: number;
  assets: number;
  liabilities: number;
  netWorth: number;
  reserveOk: boolean;
  priorities: string[];
  gaps: string[];
  goalsCount: number;
};

type ClientDashboardLayoutProps = {
  contact: { firstName: string; lastName: string; email: string | null } | undefined;
  isUnsubscribed: boolean;
  authContactId: string;
  quickStats: QuickStats;
  openRequests: ClientRequestItem[];
  contractsCount: number;
  paymentInstructionsCount: number;
  documentsCount: number;
  latestNotification: { title: string; body: string | null } | null;
  financialSummary: ClientPortalFinancialSummary | null;
};

function formatMoney(value: number): string {
  return `${value.toLocaleString("cs-CZ")} Kč`;
}

export function ClientDashboardLayout({
  contact,
  isUnsubscribed,
  authContactId,
  quickStats,
  openRequests,
  contractsCount,
  paymentInstructionsCount,
  documentsCount,
  latestNotification,
  financialSummary,
}: ClientDashboardLayoutProps) {
  const [requestModalOpen, setRequestModalOpen] = useState(false);

  const firstName = contact?.firstName || "Kliente";
  const highlightedRequest = openRequests[0] ?? null;

  return (
    <div className="space-y-8 client-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div>
          <h2 className="text-3xl md:text-4xl font-display font-black text-slate-900 tracking-tight mb-2">
            Dobrý den, {firstName}
          </h2>
          <p className="text-slate-500 font-medium">
            Vítejte ve svém osobním finančním portálu.
          </p>
        </div>
        <button
          onClick={() => setRequestModalOpen(true)}
          className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-black shadow-lg shadow-emerald-500/20 transition-all active:scale-95 inline-flex items-center gap-2 min-h-[44px]"
        >
          <Plus size={18} />
          Nový požadavek
        </button>
      </div>

      {contractsCount === 0 && (
        <div className="rounded-[24px] border border-indigo-100 bg-indigo-50/90 p-6 sm:p-8 shadow-sm">
          <h3 className="text-lg font-black text-slate-900 mb-2">Vítejte v klientské zóně</h3>
          <p className="text-sm text-slate-600 font-medium leading-relaxed max-w-2xl">
            Váš poradce zatím nepřidal žádné smlouvy do portfolia. Jakmile je zaznamená, uvidíte je v
            sekci Moje portfolio.
          </p>
          <Link
            href="/client/portfolio"
            className="mt-4 inline-flex min-h-[44px] items-center text-sm font-bold text-indigo-600 hover:underline"
          >
            Přejít na portfolio
          </Link>
        </div>
      )}

      {financialSummary && (
        <div className="bg-white rounded-[24px] p-6 sm:p-8 border border-slate-100 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600">
                <Wallet size={22} />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">
                  Finanční přehled
                </h3>
                <p className="text-xs font-bold text-slate-500 mt-0.5">
                  {financialSummary.scope === "household" && financialSummary.householdName
                    ? `Domácnost: ${financialSummary.householdName}`
                    : "Z poslední finanční analýzy"}
                </p>
              </div>
            </div>
            <span
              className={`self-start px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide border ${
                financialSummary.reserveOk
                  ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                  : "bg-amber-50 text-amber-800 border-amber-100"
              }`}
            >
              {financialSummary.reserveOk ? "Rezerva v pořádku" : "Zkontrolujte rezervu"}
            </span>
          </div>

          <div className="mb-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
              Čisté jmění
            </p>
            <p className="text-3xl font-display font-black text-slate-900">
              {formatMoney(financialSummary.netWorth)}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { label: "Aktiva", value: financialSummary.assets },
              { label: "Závazky", value: financialSummary.liabilities },
              { label: "Příjmy", value: financialSummary.income },
              { label: "Výdaje", value: financialSummary.expenses },
              {
                label: "Bilance",
                value: financialSummary.surplus,
                emphasize: true,
              },
            ].map((row) => (
              <div key={row.label} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  {row.label}
                </span>
                <span
                  className={`text-sm font-black tabular-nums ${
                    row.emphasize && financialSummary.surplus < 0
                      ? "text-rose-600"
                      : "text-slate-900"
                  }`}
                >
                  {formatMoney(row.value)}
                </span>
              </div>
            ))}
          </div>

          {financialSummary.goalsCount > 0 && (
            <p className="mt-4 text-xs font-bold text-slate-500">
              Cíle v analýze: {financialSummary.goalsCount}
            </p>
          )}

          {financialSummary.priorities.length > 0 && (
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-black text-slate-800">Priority: </span>
              {financialSummary.priorities.join(" · ")}
            </p>
          )}

          {financialSummary.gaps.length > 0 && (
            <ul className="mt-3 text-xs text-slate-500 font-medium space-y-1 list-disc list-inside">
              {financialSummary.gaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all">
          <div className="flex items-center gap-2 mb-2 text-indigo-600">
            <PieChart size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">
              Spravovaný majetek
            </span>
          </div>
          <div className="text-3xl font-display font-black text-slate-900">
            {formatMoney(quickStats.assetsUnderManagement)}
          </div>
        </div>
        <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all">
          <div className="flex items-center gap-2 mb-2 text-emerald-600">
            <TrendingUp size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">
              Měsíční investice
            </span>
          </div>
          <div className="text-3xl font-display font-black text-slate-900">
            {formatMoney(quickStats.monthlyInvestments)}
          </div>
        </div>
        <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm hover:shadow-md hover:border-amber-200 transition-all">
          <div className="flex items-center gap-2 mb-2 text-amber-500">
            <Shield size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">
              Krytí rizik
            </span>
          </div>
          <div className="flex items-end gap-3">
            <div className="text-3xl font-display font-black text-slate-900">
              {quickStats.riskCoveragePercent}%
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full mb-2 overflow-hidden">
              <div
                className="h-full bg-amber-400"
                style={{ width: `${quickStats.riskCoveragePercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-[#1a1c2e] to-[#0f172a] rounded-[32px] p-8 text-white shadow-xl relative overflow-hidden border border-slate-800">
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-indigo-300 backdrop-blur-sm border border-white/10">
                <Bell size={20} />
              </div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-200">
                Aktuálně k řešení
              </h3>
            </div>
            <p className="text-2xl font-display font-bold text-white mb-6 leading-tight max-w-xl">
              {latestNotification?.title ??
                highlightedRequest?.title ??
                "Vše je aktuálně v pořádku. Pokud něco potřebujete, pošlete nový požadavek."}
            </p>
            {(latestNotification?.body || highlightedRequest?.description) && (
              <p className="text-indigo-100 text-sm mb-6">
                {latestNotification?.body ?? highlightedRequest?.description}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Link
                href="/client/requests"
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 transition-colors rounded-xl text-sm font-bold tracking-wide shadow-lg shadow-indigo-500/30"
              >
                Otevřít požadavky
              </Link>
              <Link
                href="/client/messages"
                className="px-6 py-3 bg-white/10 hover:bg-white/20 transition-colors rounded-xl text-sm font-bold tracking-wide backdrop-blur-sm border border-white/10"
              >
                Napsat zprávu
              </Link>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[32px] border border-slate-100 p-8 shadow-sm grid grid-cols-2 gap-4">
          {[
            {
              href: "/client/portfolio",
              label: "Moje portfolio",
              icon: Briefcase,
              color: "text-indigo-600 bg-indigo-50",
              value: `${contractsCount} položek`,
            },
            {
              href: "/client/payments",
              label: "Platby a QR",
              icon: CreditCard,
              color: "text-emerald-600 bg-emerald-50",
              value: `${paymentInstructionsCount} instrukcí`,
            },
            {
              href: "/client/documents",
              label: "Trezor dokumentů",
              icon: FolderOpen,
              color: "text-amber-600 bg-amber-50",
              value: `${documentsCount} dokumentů`,
            },
            {
              href: "/client/calculators",
              label: "Kalkulačky",
              icon: Calculator,
              color: "text-blue-600 bg-blue-50",
              value: "2 nástroje",
            },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="p-5 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all flex flex-col items-center justify-center text-center gap-2 group min-h-[132px]"
            >
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center ${item.color} group-hover:scale-110 transition-transform`}
              >
                <item.icon size={24} />
              </div>
              <span className="font-bold text-sm text-slate-700">{item.label}</span>
              <span className="text-xs text-slate-400 font-bold">{item.value}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-2">
          E-mailová oznámení
        </h3>
        <p className="text-sm text-slate-600 mb-2">
          {isUnsubscribed
            ? "E-mailové notifikace jsou aktuálně vypnuté."
            : "Dostáváte servisní upozornění, nové dokumenty a změny ve vašich požadavcích."}
        </p>
        {!isUnsubscribed && (
          <Link
            href={`/client/unsubscribe?contactId=${authContactId}`}
            className="text-sm text-rose-600 font-bold hover:underline"
          >
            Odhlásit se z notifikací
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <ClientZoneExportButton />
        <Link href="/gdpr" className="text-sm text-indigo-600 font-bold hover:underline">
          Ochrana osobních údajů (GDPR)
        </Link>
      </div>

      <AiSupportButton />
      <NewRequestModal
        open={requestModalOpen}
        onClose={() => setRequestModalOpen(false)}
      />
    </div>
  );
}

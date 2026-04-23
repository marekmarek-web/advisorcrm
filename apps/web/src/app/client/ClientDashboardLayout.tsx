"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { getPortalNotificationDeepLink } from "@/lib/client-portal/portal-notification-routing";
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
  ArrowRight,
} from "lucide-react";
import type { ClientRequestItem } from "@/app/lib/client-portal/request-types";
import type { MaterialRequestListItem } from "@/lib/advisor-material-requests/display";
import type { ClientAdvisorProposal } from "@/app/actions/advisor-proposals-client";
import { ClientZoneExportButton } from "./ClientZoneExportButton";
import { NewRequestModal } from "./NewRequestModal";
import { AiSupportButton } from "./AiSupportButton";
import { AdvisorProposalsHighlightCard } from "./AdvisorProposalsHighlightCard";
import { isClientPortalAiDisabled } from "@/lib/client-portal/feature-flags";

type QuickStats = {
  assetsUnderManagement: number;
  monthlyInvestments: number;
  monthlyInsurancePremiums: number;
  activeContractCount: number;
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
  /** True, pokud se platby nepodařilo načíst z backendu — zabrání falešnému „0 instrukcí“. */
  paymentsLoadFailed?: boolean;
  /** True, pokud dashboard metriky (AUM, měsíční splátky…) selhaly — zabrání falešným nulám. */
  quickStatsLoadFailed?: boolean;
  documentsCount: number;
  latestNotification: {
    title: string;
    body: string | null;
    /** 5F: notification type for smart deep-link CTA in dashboard card */
    type?: string;
    relatedEntityId?: string;
  } | null;
  financialSummary: ClientPortalFinancialSummary | null;
  advisorMaterialRequests: MaterialRequestListItem[];
  advisorProposals: ClientAdvisorProposal[];
  /** B2.4: Když je tenant flag vypnutý, dashboard skryje CTA „Nový požadavek“ i modal. */
  serviceRequestsEnabled?: boolean;
  /** Blok pokrytí produktů (stejný model jako u poradce, read-only). */
  coverageSection?: ReactNode;
};

function formatMoney(value: number): string {
  return `${value.toLocaleString("cs-CZ")} Kč`;
}

function getNotificationCtaLabel(type?: string): string {
  if (type === "new_message") return "Otevřít zprávy";
  if (type === "new_document") return "Zobrazit dokumenty";
  if (type === "advisor_material_request") return "Otevřít požadavek";
  if (type === "request_status_change") return "Moje požadavky";
  if (type === "important_date") return "Moje portfolio";
  return "Otevřít požadavky";
}

export function ClientDashboardLayout({
  contact,
  isUnsubscribed,
  authContactId,
  quickStats,
  openRequests,
  contractsCount,
  paymentInstructionsCount,
  paymentsLoadFailed = false,
  quickStatsLoadFailed = false,
  documentsCount,
  latestNotification,
  financialSummary,
  advisorMaterialRequests,
  advisorProposals,
  serviceRequestsEnabled = true,
  coverageSection,
}: ClientDashboardLayoutProps) {
  const [requestModalOpen, setRequestModalOpen] = useState(false);

  const firstName = contact?.firstName || "Kliente";
  const highlightedRequest = openRequests[0] ?? null;

  return (
    <div className="space-y-8 client-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div>
          <h2 className="text-3xl md:text-4xl font-display font-black text-[color:var(--wp-text)] tracking-tight mb-2">
            Dobrý den, {firstName}
          </h2>
          <p className="text-[color:var(--wp-text-secondary)] font-medium">
            Vítejte ve svém osobním finančním portálu.
          </p>
        </div>
        {serviceRequestsEnabled && (
          <button
            onClick={() => setRequestModalOpen(true)}
            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-black shadow-lg shadow-emerald-500/20 transition-all active:scale-95 inline-flex items-center gap-2 min-h-[44px]"
          >
            <Plus size={18} />
            Nový požadavek
          </button>
        )}
      </div>

      <AdvisorProposalsHighlightCard proposals={advisorProposals} />

      {contractsCount === 0 && (
        <div className="rounded-[24px] border border-indigo-100 bg-indigo-50/90 p-6 sm:p-8 shadow-sm">
          <h3 className="text-lg font-black text-[color:var(--wp-text)] mb-2">Vítejte v klientské zóně</h3>
          <p className="text-sm text-[color:var(--wp-text-secondary)] font-medium leading-relaxed max-w-2xl">
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
        <div className="bg-white rounded-[24px] p-6 sm:p-8 border border-[color:var(--wp-surface-card-border)] shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600">
                <Wallet size={22} />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                  Finanční přehled
                </h3>
                <p className="text-xs font-bold text-[color:var(--wp-text-secondary)] mt-0.5">
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
            <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">
              Čisté jmění
            </p>
            <p className="text-3xl font-display font-black text-[color:var(--wp-text)]">
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
              <div key={row.label} className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)]/50 p-4">
                <span className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">
                  {row.label}
                </span>
                <span
                  className={`text-sm font-black tabular-nums ${
                    row.emphasize && financialSummary.surplus < 0
                      ? "text-rose-600"
                      : "text-[color:var(--wp-text)]"
                  }`}
                >
                  {formatMoney(row.value)}
                </span>
              </div>
            ))}
          </div>

          {financialSummary.goalsCount > 0 && (
            <p className="mt-4 text-xs font-bold text-[color:var(--wp-text-secondary)]">
              Cíle v analýze: {financialSummary.goalsCount}
            </p>
          )}

          {financialSummary.priorities.length > 0 && (
            <p className="mt-2 text-sm text-[color:var(--wp-text-secondary)]">
              <span className="font-black text-[color:var(--wp-text)]">Priority: </span>
              {financialSummary.priorities.join(" · ")}
            </p>
          )}

          {financialSummary.gaps.length > 0 && (
            <ul className="mt-3 text-xs text-[color:var(--wp-text-secondary)] font-medium space-y-1 list-disc list-inside">
              {financialSummary.gaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {advisorMaterialRequests.length > 0 && (
        <div className="rounded-[24px] border border-amber-200 bg-amber-50/90 p-6 shadow-sm">
          <h3 className="text-lg font-black text-[color:var(--wp-text)] mb-2">Požadavky od poradce</h3>
          <p className="text-sm text-[color:var(--wp-text-secondary)] mb-4">
            Máte nové úkoly — nahrajte podklady nebo odpovězte přímo v detailu.
          </p>
          <ul className="space-y-2">
            {advisorMaterialRequests.slice(0, 5).map((r) => (
              <li key={r.id}>
                <Link
                  href={`/client/pozadavky-poradce/${r.id}`}
                  className="flex min-h-[44px] items-center justify-between gap-2 rounded-xl bg-white border border-amber-100 px-4 py-2 text-sm font-bold text-[color:var(--wp-text)] hover:bg-amber-100/50"
                >
                  <span className="line-clamp-2">{r.title}</span>
                  <span className="text-xs text-[color:var(--wp-text-secondary)] shrink-0">
                    {r.categoryLabel}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {advisorMaterialRequests.length > 5 && (
            <Link
              href="/client/pozadavky-poradce"
              className="mt-3 inline-block text-sm font-bold text-amber-900 underline"
            >
              Zobrazit všechny
            </Link>
          )}
        </div>
      )}

      {quickStatsLoadFailed && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-800 flex items-start gap-2"
        >
          <span aria-hidden className="mt-0.5">⚠️</span>
          <div>
            <strong className="font-bold">Statistiky portfolia se nepodařilo načíst.</strong>{" "}
            Zobrazené částky nejsou k dispozici — zkuste stránku obnovit nebo se vraťte později.
          </div>
        </div>
      )}

      {/* 5E: Quick stats link to portfolio detail */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href="/client/portfolio" className="group bg-white rounded-[24px] p-6 border border-[color:var(--wp-surface-card-border)] shadow-sm hover:shadow-md hover:border-indigo-200 transition-all">
          <div className="flex items-center justify-between gap-2 mb-2 text-indigo-600">
            <div className="flex items-center gap-2">
              <PieChart size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">
                Spravovaný majetek
              </span>
            </div>
            <ArrowRight size={13} className="opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="text-3xl font-display font-black text-[color:var(--wp-text)]">
            {quickStatsLoadFailed ? "—" : formatMoney(quickStats.assetsUnderManagement)}
          </div>
        </Link>
        <Link href="/client/portfolio" className="group bg-white rounded-[24px] p-6 border border-[color:var(--wp-surface-card-border)] shadow-sm hover:shadow-md hover:border-emerald-200 transition-all">
          <div className="flex items-center justify-between gap-2 mb-2 text-emerald-600">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">
                Měsíční investice
              </span>
            </div>
            <ArrowRight size={13} className="opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="text-3xl font-display font-black text-[color:var(--wp-text)]">
            {quickStatsLoadFailed ? "—" : formatMoney(quickStats.monthlyInvestments)}
          </div>
        </Link>
        <Link href="/client/portfolio" className="group bg-white rounded-[24px] p-6 border border-[color:var(--wp-surface-card-border)] shadow-sm hover:shadow-md hover:border-amber-200 transition-all">
          <div className="flex items-center justify-between gap-2 mb-2 text-amber-500">
            <div className="flex items-center gap-2">
              <Shield size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">
                Měsíční pojistné
              </span>
            </div>
            <ArrowRight size={13} className="opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="text-3xl font-display font-black text-[color:var(--wp-text)]">
            {quickStatsLoadFailed ? "—" : formatMoney(quickStats.monthlyInsurancePremiums)}
          </div>
          <p className="text-xs text-[color:var(--wp-text-secondary)] mt-2 font-medium">
            {quickStatsLoadFailed
              ? "Aktivních položek v přehledu: —"
              : `Aktivních položek v přehledu: ${quickStats.activeContractCount}`}
          </p>
        </Link>
      </div>

      {coverageSection}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-aidv-create to-[#0f172a] rounded-[24px] p-8 text-white shadow-xl relative overflow-hidden border border-slate-800">
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
              {/* 5E/5F: smart CTA based on latest notification type */}
              {(() => {
                const notifHref = getPortalNotificationDeepLink(latestNotification);
                const primaryHref = notifHref ?? (highlightedRequest ? "/client/requests" : "/client/requests");
                const primaryLabel = latestNotification
                  ? getNotificationCtaLabel(latestNotification.type)
                  : "Otevřít požadavky";
                return (
                  <Link
                    href={primaryHref}
                    className="min-h-[44px] inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 transition-colors rounded-xl text-sm font-bold tracking-wide shadow-lg shadow-indigo-500/30"
                  >
                    {primaryLabel}
                    <ArrowRight size={14} />
                  </Link>
                );
              })()}
              <Link
                href="/client/messages"
                className="min-h-[44px] inline-flex items-center px-6 py-3 bg-white/10 hover:bg-white/20 transition-colors rounded-xl text-sm font-bold tracking-wide backdrop-blur-sm border border-white/10"
              >
                Napsat zprávu
              </Link>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[24px] border border-[color:var(--wp-surface-card-border)] p-8 shadow-sm grid grid-cols-2 gap-4">
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
              color: paymentsLoadFailed
                ? "text-rose-600 bg-rose-50"
                : "text-emerald-600 bg-emerald-50",
              value: paymentsLoadFailed
                ? "Nelze načíst — otevřít"
                : `${paymentInstructionsCount} instrukcí`,
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
              className="p-5 rounded-2xl border border-[color:var(--wp-surface-card-border)] hover:border-indigo-200 hover:shadow-md transition-all flex flex-col items-center justify-center text-center gap-2 group min-h-[132px]"
            >
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center ${item.color} group-hover:scale-110 transition-transform`}
              >
                <item.icon size={24} />
              </div>
              <span className="font-bold text-sm text-[color:var(--wp-text)]">{item.label}</span>
              <span className="text-xs text-[color:var(--wp-text-tertiary)] font-bold">{item.value}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-[24px] p-6 border border-[color:var(--wp-surface-card-border)] shadow-sm">
        <h3 className="text-sm font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">
          E-mailová oznámení
        </h3>
        <p className="text-sm text-[color:var(--wp-text-secondary)] mb-2">
          {isUnsubscribed
            ? "E-mailové notifikace jsou aktuálně vypnuté."
            : "Dostáváte servisní upozornění, nové dokumenty a změny ve vašich požadavcích."}
        </p>
        {!isUnsubscribed && (
          <Link
            href={`/client/unsubscribe?contactId=${authContactId}`}
            className="text-sm text-rose-600 font-bold hover:underline inline-flex min-h-[44px] items-center"
          >
            Odhlásit se z notifikací
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <ClientZoneExportButton />
        <Link href="/privacy" className="text-sm text-indigo-600 font-bold hover:underline inline-flex min-h-[44px] items-center">
          Ochrana osobních údajů
        </Link>
      </div>

      {!isClientPortalAiDisabled() ? <AiSupportButton /> : null}
      {serviceRequestsEnabled && (
        <NewRequestModal
          open={requestModalOpen}
          onClose={() => setRequestModalOpen(false)}
        />
      )}
    </div>
  );
}

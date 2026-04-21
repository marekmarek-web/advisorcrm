"use client";

import { useState, useEffect } from "react";
import { TrendingUp, Wallet, Shield, CalendarDays, Banknote, Receipt } from "lucide-react";
import { getContactOverviewKpi } from "@/app/actions/financial";

function fmtCZK(value: number): string {
  if (value === 0) return "—";
  return value.toLocaleString("cs-CZ", { maximumFractionDigits: 0 }) + " Kč";
}

type KpiData = {
  monthlyInvest: number;
  personalAum: number;
  monthlyInsurance: number;
  annualInsurance: number;
  /**
   * F3-3 (C-10 follow-up): propagated from contact-overview-kpi aggregator —
   * sum of monthly loan installments (HYPO + UVER) for this contact.
   */
  monthlyLoan?: number;
  /** Remaining loan principal across HYPO + UVER contracts. */
  outstandingLoanBalance?: number;
};

const DEFAULT_KPI: KpiData = {
  monthlyInvest: 0,
  personalAum: 0,
  monthlyInsurance: 0,
  annualInsurance: 0,
  monthlyLoan: 0,
  outstandingLoanBalance: 0,
};

export function ContactOverviewKpi({ contactId }: { contactId: string }) {
  const [data, setData] = useState<KpiData | null>(null);

  useEffect(() => {
    getContactOverviewKpi(contactId)
      .then((k) => setData(k))
      .catch(() => setData(null));
  }, [contactId]);

  const d = data ?? DEFAULT_KPI;

  const monthlyLoan = d.monthlyLoan ?? 0;
  const outstandingLoanBalance = d.outstandingLoanBalance ?? 0;
  const hasLoanKpis = monthlyLoan > 0 || outstandingLoanBalance > 0;

  const baseKpis = [
    {
      label: "Měsíční investice",
      value: fmtCZK(d.monthlyInvest),
      icon: TrendingUp,
      accent: "text-indigo-600",
      bg: "bg-indigo-50 dark:bg-indigo-950/40",
    },
    {
      label: "Osobní AUM",
      value: fmtCZK(d.personalAum),
      icon: Wallet,
      accent: "text-[color:var(--wp-text)]",
      bg: "bg-[color:var(--wp-surface-muted)]",
    },
    {
      label: "Měsíční pojistné",
      value: fmtCZK(d.monthlyInsurance),
      icon: Shield,
      accent: "text-emerald-600",
      bg: "bg-emerald-50 dark:bg-emerald-950/40",
    },
    {
      label: "Roční pojistné",
      value: fmtCZK(d.annualInsurance),
      icon: CalendarDays,
      accent: "text-[color:var(--wp-text)]",
      bg: "bg-[color:var(--wp-surface-muted)]",
    },
  ];

  // F3-3 (C-10 follow-up): surface loan KPIs only when the contact has at
  // least one loan contract. Prevents empty "— Kč" tiles dominating the
  // overview for purely insurance/investment clients.
  const loanKpis = hasLoanKpis
    ? [
        {
          label: "Měsíční splátka úvěrů",
          value: fmtCZK(monthlyLoan),
          icon: Banknote,
          accent: "text-rose-600",
          bg: "bg-rose-50 dark:bg-rose-950/40",
        },
        {
          label: "Zbývající jistina",
          value: fmtCZK(outstandingLoanBalance),
          icon: Receipt,
          accent: "text-[color:var(--wp-text)]",
          bg: "bg-[color:var(--wp-surface-muted)]",
        },
      ]
    : [];

  const kpis = [...baseKpis, ...loanKpis];
  const gridCols = kpis.length <= 4
    ? "grid-cols-2 lg:grid-cols-4"
    : "grid-cols-2 lg:grid-cols-3 xl:grid-cols-6";

  return (
    <div className={`grid ${gridCols} gap-3 sm:gap-4`}>
      {kpis.map(({ label, value, icon: Icon, accent, bg }) => (
        <div
          key={label}
          className="bg-[color:var(--wp-surface-card)] p-4 sm:p-5 rounded-[20px] border border-[color:var(--wp-surface-card-border)] shadow-sm flex flex-col gap-2"
        >
          <div className="flex items-center gap-2">
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${bg}`}>
              <Icon size={14} className={accent} aria-hidden />
            </span>
            <span className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] leading-tight">
              {label}
            </span>
          </div>
          <div className={`text-xl font-black leading-none ${accent}`}>{value}</div>
        </div>
      ))}
    </div>
  );
}

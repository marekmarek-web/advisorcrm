"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Sparkles, UserPlus, RefreshCw } from "lucide-react";
import { PremiumToggleGroup } from "./primitives";

type ShellProps = {
  title: string;
  subtitle: string;
  /** Scope labels pro ToggleGroup — např. Já / Můj tým */
  scopeItems: string[];
  scopeActive: string;
  onScopeItemChange: (label: string) => void;
  periodItems: string[];
  periodActive: string;
  onPeriodItemChange: (label: string) => void;
  viewItems: string[];
  viewActive: string;
  onViewChange: (label: string) => void;
  teamManagementHref: string;
  onTeamManagementOpen: () => void;
  /** Když je „Správa týmu“ samostatný tab, schovat duplicitní tlačítko v hlavičce. */
  showTeamManagementQuickLink?: boolean;
  calendarActions: ReactNode;
  onRefresh: () => void;
  loading: boolean;
  /** Dev-only panel */
  runtimeChecksSlot?: ReactNode;
  children: ReactNode;
  aside: ReactNode;
};

export function TeamOverviewPremiumShell({
  title,
  subtitle,
  scopeItems,
  scopeActive,
  onScopeItemChange,
  periodItems,
  periodActive,
  onPeriodItemChange,
  viewItems,
  viewActive,
  onViewChange,
  teamManagementHref,
  onTeamManagementOpen,
  showTeamManagementQuickLink = true,
  calendarActions,
  onRefresh,
  loading,
  runtimeChecksSlot,
  children,
  aside,
}: ShellProps) {
  return (
    <div className="min-h-screen bg-[#f4f5f8] text-slate-900">
      <div className="mx-auto max-w-[1680px] px-5 pb-12 pt-6 xl:px-8">

        {/* HEADER SHELL */}
        <div className="mb-6 rounded-[32px] border border-white/80 bg-white px-7 py-6 shadow-[0_16px_48px_rgba(15,23,42,0.07)]">

          {/* Upper row: brand + utility actions */}
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[16px] bg-[#16192b] text-white shadow-[0_12px_30px_rgba(22,25,43,0.20)]">
                <Sparkles className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.28em] text-slate-400">
                  AIDVISORA CRM PORTAL
                </p>
                <h1 className="mt-1 text-[28px] font-black leading-tight tracking-tight text-[#16192b]">
                  {title}
                </h1>
                <p className="mt-1 text-[13px] font-medium leading-5 text-slate-500">
                  {subtitle}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 xl:shrink-0">
              {showTeamManagementQuickLink ? (
                <Link
                  href={teamManagementHref}
                  onClick={onTeamManagementOpen}
                  className="inline-flex h-10 items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-4 text-[10px] font-extrabold uppercase leading-none tracking-[0.16em] text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <UserPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Správa týmu
                </Link>
              ) : null}
              {calendarActions}
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                className="inline-flex h-10 items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-4 text-[10px] font-extrabold uppercase leading-none tracking-[0.16em] text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                aria-label="Obnovit data"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
                Obnovit
              </button>
            </div>
          </div>

          {/* Filter pills — stejná výška jako utility tlačítka (40px řádek) */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <PremiumToggleGroup items={scopeItems} active={scopeActive} onChange={onScopeItemChange} />
            <PremiumToggleGroup items={periodItems} active={periodActive} onChange={onPeriodItemChange} />
          </div>

          {/* Line tabs — sjednocená baseline, podtržení v rovině s borderem */}
          <nav
            className="mt-6 flex flex-wrap items-end gap-x-0.5 border-b border-slate-200/80"
            aria-label="Sekce týmového přehledu"
          >
            {viewItems.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onViewChange(item)}
                className={`relative -mb-px min-h-[44px] border-b-2 border-transparent px-4 pb-3 pt-2 text-[13px] font-extrabold leading-snug tracking-tight transition-colors md:px-5 ${
                  viewActive === item
                    ? "border-[#16192b] text-[#16192b]"
                    : "text-slate-400 hover:border-slate-200 hover:text-slate-700"
                }`}
              >
                {item}
              </button>
            ))}
          </nav>
        </div>

        {runtimeChecksSlot}

        {/* MAIN LAYOUT: vyvážený grid, aside drží výšku kvůli empty panel parity */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,400px)] xl:items-start">
          <div className="min-w-0 space-y-5">{children}</div>
          <div className="flex min-h-0 min-w-0 flex-col xl:sticky xl:top-6 xl:max-h-[calc(100vh-6rem)] xl:self-start">
            <div className="flex min-h-[min(720px,calc(100vh-7.5rem))] flex-1 flex-col">{aside}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Souhrnný blok týmu — metriky pouze z props (reálná data). */
export function TeamOverviewPremiumBriefingDark({
  periodLabel,
  scopeLabel,
  stats,
  priorityItems,
}: {
  periodLabel: string;
  scopeLabel: string;
  stats: {
    attention: number;
    adaptation: number;
    onTrack: number;
    managerial: number;
    performance: number;
  };
  priorityItems: { title: string; subtitle: string }[];
}) {
  const hasSignals = stats.attention > 0 || stats.adaptation > 0;
  const heroLine = hasSignals
    ? `${stats.attention > 0 ? `${stats.attention} lidí vyžaduje pozornost` : ""}${stats.attention > 0 && stats.adaptation > 0 ? " · " : ""}${stats.adaptation > 0 ? `${stats.adaptation} nováčků v adaptaci` : ""}. Udržujte aktivní kontakt.`
    : "Tým je ve stabilním stavu. Pokračujte v pravidelném rytmu 1:1 a kariérních krocích.";

  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.06)]">
      {/* Hero briefing */}
      <div className="border-b border-slate-100 px-7 pb-6 pt-7">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">
          <span>{periodLabel}</span>
          <span>·</span>
          <span>{scopeLabel}</span>
        </div>
        <h2 className="mt-2.5 text-[22px] font-black tracking-tight text-slate-950 leading-tight max-w-3xl">
          {heroLine}
        </h2>
      </div>

      {/* 5 stat cards — horizontální řád = px-7 jako hero */}
      <div className="grid grid-cols-2 gap-3 px-7 pb-6 pt-5 sm:grid-cols-3 xl:grid-cols-5">
        <div className="flex min-h-[108px] flex-col justify-between rounded-[20px] border border-amber-200/70 bg-amber-50/60 px-4 py-4">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-amber-700/80">Pozornost</p>
          <p className="mt-2 text-[28px] font-black leading-none tabular-nums text-amber-900">{stats.attention}</p>
          <p className="mt-1.5 text-[10px] font-semibold text-amber-700/70">CRM / kariérní signály</p>
        </div>
        <div className="flex min-h-[108px] flex-col justify-between rounded-[20px] border border-sky-200/70 bg-sky-50/60 px-4 py-4">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-sky-700/80">Adaptace</p>
          <p className="mt-2 text-[28px] font-black leading-none tabular-nums text-sky-900">{stats.adaptation}</p>
          <p className="mt-1.5 text-[10px] font-semibold text-sky-700/70">90d okno ve scope</p>
        </div>
        <div className="flex min-h-[108px] flex-col justify-between rounded-[20px] border border-emerald-200/70 bg-emerald-50/60 px-4 py-4">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-emerald-700/80">Na cestě</p>
          <p className="mt-2 text-[28px] font-black leading-none tabular-nums text-emerald-900">{stats.onTrack}</p>
          <p className="mt-1.5 text-[10px] font-semibold text-emerald-700/70">Kariérní evaluace</p>
        </div>
        <div className="flex min-h-[108px] flex-col justify-between rounded-[20px] border border-slate-200/80 bg-slate-50/60 px-4 py-4">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-slate-500">Manažerská</p>
          <p className="mt-2 text-[28px] font-black leading-none tabular-nums text-slate-900">{stats.managerial}</p>
          <p className="mt-1.5 text-[10px] font-semibold text-slate-400">větev struktury</p>
        </div>
        <div className="flex min-h-[108px] flex-col justify-between rounded-[20px] border border-violet-200/70 bg-violet-50/60 px-4 py-4">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-violet-700/80">Výkon</p>
          <p className="mt-2 text-[28px] font-black leading-none tabular-nums text-violet-900">{stats.performance}</p>
          <p className="mt-1.5 text-[10px] font-semibold text-violet-700/70">výkonové větve</p>
        </div>
      </div>

      {/* Priority briefing notes */}
      {priorityItems.length > 0 ? (
        <div className="border-t border-slate-100 px-7 py-5">
          <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">
            Briefing — priority v rozsahu
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {priorityItems.slice(0, 6).map((item) => (
              <div
                key={item.title}
                className="rounded-[16px] border border-slate-200/80 bg-slate-50/70 px-4 py-3 transition hover:border-slate-300"
              >
                <p className="text-[12px] font-bold text-slate-900">{item.title}</p>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">{item.subtitle}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

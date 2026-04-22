"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { UserPlus, RefreshCw, X } from "lucide-react";
import { PremiumToggleGroup } from "./primitives";
import { PortalPageShell } from "@/app/components/layout/PortalPageShell";

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
  /** Pod xl: zobrazovat aside jako bottom-sheet (když je vybraný člen). */
  mobileAsideOpen?: boolean;
  onMobileAsideClose?: () => void;
};

export function TeamOverviewPremiumShell({
  title: _title,
  subtitle: _subtitle,
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
  mobileAsideOpen = false,
  onMobileAsideClose,
}: ShellProps) {
  void _title;
  void _subtitle;
  return (
    <PortalPageShell maxWidth="full">
        {/* HEADER SHELL — kompaktní bez duplicitního portal titulku */}
        <div className="mb-6 rounded-[var(--wp-radius-card,24px)] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-5 py-4 shadow-[var(--wp-shadow-card,0_10px_30px_rgba(15,23,42,0.05))] md:px-7 md:py-5">

          {/* Filtr pills + utility actions: jedna řada na desktopu, wrap na mobilu */}
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              <PremiumToggleGroup items={scopeItems} active={scopeActive} onChange={onScopeItemChange} />
              <PremiumToggleGroup items={periodItems} active={periodActive} onChange={onPeriodItemChange} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {showTeamManagementQuickLink ? (
                <Link
                  href={teamManagementHref}
                  onClick={onTeamManagementOpen}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-[12px] border border-[color:var(--wp-surface-card-border)] bg-white px-4 text-[10px] font-extrabold uppercase leading-none tracking-[0.16em] text-[color:var(--wp-text)] shadow-sm transition hover:bg-[color:var(--wp-main-scroll-bg)]"
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
                className="inline-flex min-h-[40px] items-center gap-2 rounded-[12px] border border-[color:var(--wp-surface-card-border)] bg-white px-4 text-[10px] font-extrabold uppercase leading-none tracking-[0.16em] text-[color:var(--wp-text)] shadow-sm transition hover:bg-[color:var(--wp-main-scroll-bg)] disabled:opacity-50"
                aria-label="Obnovit data"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
                Obnovit
              </button>
            </div>
          </div>

          {/* Line tabs */}
          <nav
            className="mt-4 flex flex-wrap items-end gap-x-0.5 border-b border-[color:var(--wp-surface-card-border)]"
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
                    : "text-[color:var(--wp-text-tertiary)] hover:border-[color:var(--wp-surface-card-border)] hover:text-[color:var(--wp-text)]"
                }`}
              >
                {item}
              </button>
            ))}
          </nav>
        </div>

        {runtimeChecksSlot}

        {/* MAIN LAYOUT: na xl dvousloupec; pod xl jen hlavní obsah, aside je bottom-sheet po výběru člena. */}
        <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(368px,404px)] xl:items-start">
          <div className="min-w-0 space-y-6">{children}</div>
          <div className="hidden min-h-0 min-w-0 xl:flex xl:flex-col xl:sticky xl:top-6 xl:max-h-[calc(100vh-5.5rem)] xl:self-start">
            <div className="flex min-h-[min(76vh,calc(100vh-6.5rem))] w-full flex-1 flex-col">{aside}</div>
          </div>
        </div>

        {/* Mobile / tablet bottom-sheet s detailem vybraného člena */}
        {mobileAsideOpen ? (
          <div className="fixed inset-0 z-[60] flex items-end bg-black/40 backdrop-blur-sm xl:hidden" role="dialog" aria-modal="true">
            <button
              type="button"
              aria-label="Zavřít"
              className="absolute inset-0"
              onClick={() => onMobileAsideClose?.()}
            />
            <div className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[24px] border-t border-[color:var(--wp-surface-card-border)] bg-white shadow-[var(--wp-shadow-card)]">
              <div className="flex items-center justify-between border-b border-[color:var(--wp-surface-card-border)] px-4 py-3">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[color:var(--wp-text-tertiary)]">Detail člena</span>
                <button
                  type="button"
                  onClick={() => onMobileAsideClose?.()}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
                  aria-label="Zavřít detail"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
                {aside}
              </div>
            </div>
          </div>
        ) : null}
    </PortalPageShell>
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
    <section className="rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] bg-white shadow-[var(--wp-shadow-card)]">
      {/* Hero briefing */}
      <div className="border-b border-[color:var(--wp-surface-card-border)] px-7 pb-6 pt-7">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[color:var(--wp-text-tertiary)]">
          <span>{periodLabel}</span>
          <span>·</span>
          <span>{scopeLabel}</span>
        </div>
        <h2 className="mt-2.5 text-[22px] font-black tracking-tight text-[color:var(--wp-text)] leading-tight max-w-3xl">
          {heroLine}
        </h2>
      </div>

      {/* 5 stat cards — horizontální řád = px-7 jako hero */}
      <div className="grid grid-cols-2 gap-3 px-7 pb-6 pt-5 sm:grid-cols-3 xl:grid-cols-5">
        <div className="flex min-h-[108px] flex-col justify-between rounded-[20px] border border-amber-200/70 bg-amber-50/60 px-4 py-4">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-amber-700/80">Pozornost</p>
          <p className="mt-2 text-[28px] font-black leading-none tabular-nums text-amber-900">{stats.attention}</p>
          <p className="mt-1.5 text-[10px] font-semibold text-amber-700/70">Aidvisory / kariérní signály</p>
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
        <div className="flex min-h-[108px] flex-col justify-between rounded-[20px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)] px-4 py-4">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-[color:var(--wp-text-secondary)]">Manažerská</p>
          <p className="mt-2 text-[28px] font-black leading-none tabular-nums text-[color:var(--wp-text)]">{stats.managerial}</p>
          <p className="mt-1.5 text-[10px] font-semibold text-[color:var(--wp-text-tertiary)]">větev struktury</p>
        </div>
        <div className="flex min-h-[108px] flex-col justify-between rounded-[20px] border border-violet-200/70 bg-violet-50/60 px-4 py-4">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-violet-700/80">Výkon</p>
          <p className="mt-2 text-[28px] font-black leading-none tabular-nums text-violet-900">{stats.performance}</p>
          <p className="mt-1.5 text-[10px] font-semibold text-violet-700/70">výkonové větve</p>
        </div>
      </div>

      {/* Priority briefing notes */}
      {priorityItems.length > 0 ? (
        <div className="border-t border-[color:var(--wp-surface-card-border)] px-7 py-5">
          <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[color:var(--wp-text-tertiary)]">
            Briefing — priority v rozsahu
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {priorityItems.slice(0, 6).map((item) => (
              <div
                key={item.title}
                className="rounded-[16px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)] px-4 py-3 transition hover:border-[color:var(--wp-surface-card-border)]"
              >
                <p className="text-[12px] font-bold text-[color:var(--wp-text)]">{item.title}</p>
                <p className="mt-1 text-[11px] leading-4 text-[color:var(--wp-text-secondary)]">{item.subtitle}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

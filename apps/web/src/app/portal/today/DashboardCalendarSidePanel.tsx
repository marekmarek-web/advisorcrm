"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Calendar, CheckSquare, ChevronLeft, ChevronRight, Plus, Users } from "lucide-react";
import { MessengerPreview } from "@/app/components/dashboard/MessengerPreview";
import type { DashboardAgendaTimelineRow } from "./dashboard-agenda-types";

type Props = {
  drawerOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  agendaEmpty: boolean;
  agendaTimelineRows: DashboardAgendaTimelineRow[];
  sidePanelTodayLabel: string;
};

/**
 * Pravý kalendářový panel nástěnky — plovoucí karta (lg+) podle UX sidecalendar v2.
 */
export function DashboardCalendarSidePanel({
  drawerOpen,
  onOpen,
  onClose,
  agendaEmpty,
  agendaTimelineRows,
  sidePanelTodayLabel,
}: Props) {
  const router = useRouter();

  return (
    <>
      {drawerOpen && (
        <button
          type="button"
          className="fixed inset-0 z-drawer-overlay bg-[color:var(--wp-overlay-scrim)] lg:hidden"
          aria-label="Zavřít panel"
          onClick={onClose}
        />
      )}

      <button
        type="button"
        onClick={onOpen}
        className={clsx(
          "fixed top-1/2 z-[35] flex h-32 w-10 -translate-y-1/2 flex-col items-center justify-center gap-3 rounded-l-2xl border border-r-0 py-3 pl-1 pr-0.5 backdrop-blur-xl transition-all duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
          "border-[color:var(--wp-sc-panel-border)] bg-[color:var(--wp-sc-panel-bg)] text-[color:var(--wp-text-muted)] shadow-[-10px_0_30px_rgba(0,0,0,0.05)] hover:text-indigo-600 dark:shadow-[-10px_0_30px_rgba(0,0,0,0.25)] dark:hover:text-indigo-300",
          "right-[max(0px,env(safe-area-inset-right,0px))]",
          drawerOpen && "pointer-events-none translate-x-full opacity-0",
        )}
        aria-label="Otevřít kalendář, agendu a zprávy"
      >
        <ChevronLeft size={20} className="opacity-70" aria-hidden />
        <div className="h-6 w-px rounded-full bg-current opacity-20" aria-hidden />
        <Calendar size={16} className="text-indigo-600 dark:text-indigo-300" aria-hidden />
      </button>

      <aside
        className={clsx(
          "fixed z-drawer-panel flex flex-col overflow-hidden backdrop-blur-3xl transition-all duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
          "max-lg:inset-y-0 max-lg:right-0 max-lg:left-auto max-lg:w-full max-lg:max-w-[min(100vw,420px)] max-lg:rounded-none max-lg:border-l max-lg:border-[color:var(--wp-sc-panel-border)] max-lg:bg-[color:var(--wp-sc-panel-bg)] max-lg:shadow-[var(--wp-sc-panel-shadow)] max-lg:pt-[env(safe-area-inset-top,0px)]",
          "lg:right-5 lg:top-5 lg:bottom-5 lg:left-auto lg:h-auto lg:w-[420px] lg:max-w-[420px] lg:rounded-[32px] lg:border lg:border-[color:var(--wp-sc-panel-border)] lg:bg-[color:var(--wp-sc-panel-bg)] lg:shadow-[0_20px_60px_rgba(0,0,0,0.06)] dark:lg:shadow-[0_20px_60px_rgba(0,0,0,0.45)]",
          drawerOpen
            ? "translate-x-0 opacity-100"
            : "pointer-events-none opacity-0 max-lg:translate-x-full lg:translate-x-[120%]",
        )}
        aria-hidden={!drawerOpen}
      >
        <div className="relative z-10 flex shrink-0 items-center justify-between px-8 py-6 max-lg:border-b max-lg:border-[color:var(--wp-sc-panel-border)]">
          <div className="flex gap-3">
            <Link
              href="/portal/calendar"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[color:var(--wp-text-muted)] transition-colors hover:bg-[color:var(--wp-link-hover-bg)] hover:text-[color:var(--wp-text)]"
              aria-label="Otevřít kalendář"
            >
              <Calendar size={20} aria-hidden />
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-slate-500/10 text-[color:var(--wp-text-muted)] transition-colors hover:bg-[color:var(--wp-link-hover-bg)] hover:text-[color:var(--wp-text)]"
              aria-label="Skrýt panel"
            >
              <ChevronRight size={20} aria-hidden />
            </button>
          </div>
        </div>

        <div className="dashboard-sc-panel-scroll relative z-10 min-h-0 flex-1 space-y-10 overflow-y-auto px-8 pb-10 pt-0">
          <section>
            <h3 className="font-display mb-4 ml-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[color:var(--wp-text-tertiary)]">
              Kalendář
            </h3>
            <div className="group relative overflow-hidden rounded-3xl border border-[color:var(--wp-sc-card-border)] bg-[color:var(--wp-sc-card-bg)] p-6 shadow-sm backdrop-blur-xl transition-all duration-500 hover:border-[color:var(--wp-sc-card-border)]">
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                aria-hidden
              />
              <div className="relative z-10 flex items-center justify-between gap-3">
                <div>
                  <div className="font-display mb-1 text-[11px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                    Dnes
                  </div>
                  <div className="font-display max-w-[240px] text-2xl font-extrabold tracking-tight bg-gradient-to-br from-indigo-900 to-indigo-500 bg-clip-text text-transparent dark:from-white dark:to-indigo-200">
                    {sidePanelTodayLabel}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/portal/calendar?new=1")}
                  className="flex h-12 w-12 min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-200 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl dark:from-indigo-500 dark:to-indigo-400 dark:shadow-indigo-900/40"
                  aria-label="Nová aktivita v kalendáři"
                >
                  <Plus size={24} strokeWidth={3} aria-hidden />
                </button>
              </div>
            </div>
          </section>

          <section>
            <h3 className="font-display mb-6 ml-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[color:var(--wp-text-tertiary)]">
              Agenda
            </h3>
            {agendaEmpty ? (
              <p className="text-sm text-[color:var(--wp-text-muted)]">Žádná nadcházející aktivita v příštích dnech.</p>
            ) : (
              <div className="relative space-y-6 pl-12">
                <div
                  className="absolute bottom-2 left-5 top-2 w-px bg-gradient-to-b from-indigo-300 via-[color:var(--wp-sc-timeline-line-via)] to-transparent dark:from-indigo-500/50 dark:via-slate-700"
                  aria-hidden
                />
                <ul className="space-y-6">
                  {agendaTimelineRows.map((row) => (
                    <li key={row.id} className="relative">
                      <div className="group relative">
                        <div
                          className={clsx(
                            "absolute -left-12 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm transition-all",
                            "border-indigo-200 bg-white group-hover:border-indigo-400 group-hover:shadow-md dark:border-indigo-500/30 dark:bg-[color:var(--wp-sc-panel-bg)] dark:group-hover:border-indigo-400 dark:group-hover:shadow-[0_0_15px_rgba(99,102,241,0.4)]",
                          )}
                        >
                          {row.kind === "event" ? (
                            <Users size={16} className="text-indigo-600 dark:text-indigo-400" aria-hidden />
                          ) : (
                            <CheckSquare size={16} className="text-indigo-600 dark:text-indigo-400" aria-hidden />
                          )}
                        </div>
                        <Link
                          href={row.kind === "event" ? "/portal/calendar" : "/portal/tasks"}
                          className="block rounded-2xl border border-[color:var(--wp-sc-card-border)] bg-[color:var(--wp-sc-card-bg)] p-5 text-inherit shadow-sm backdrop-blur-md transition-all duration-300 no-underline group-hover:translate-x-1 group-hover:border-indigo-200 group-hover:shadow-md dark:group-hover:border-indigo-500/30"
                        >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <span className="font-display text-sm font-bold text-indigo-600 dark:text-indigo-300">
                            {row.time}
                          </span>
                          <span className="text-xs font-semibold text-[color:var(--wp-text-tertiary)]">{row.dateShort}</span>
                        </div>
                        <h4 className="font-display mb-1 text-base font-bold text-[color:var(--wp-text)]">{row.title}</h4>
                        <div className="flex items-end justify-between gap-2">
                          {row.sub ? (
                            <span className="text-sm font-medium text-[color:var(--wp-text-secondary)]">{row.sub}</span>
                          ) : (
                            <span />
                          )}
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">
                            {row.relativeLabel}
                          </span>
                        </div>
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="pb-2">
            <MessengerPreview variant="sidePanelV2" />
          </section>
        </div>
      </aside>
    </>
  );
}

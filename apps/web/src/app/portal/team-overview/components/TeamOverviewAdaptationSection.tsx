"use client";

import { Check, X } from "lucide-react";
import type { TeamMemberInfo } from "@/app/actions/team-overview";
import type { NewcomerAdaptation } from "@/app/actions/team-overview";

export function TeamOverviewAdaptationSection({
  members,
  newcomers,
  displayName,
  selectMember,
  variant = "compact",
  onCheckIn,
}: {
  members: TeamMemberInfo[];
  newcomers: NewcomerAdaptation[];
  displayName: (m: TeamMemberInfo) => string;
  selectMember: (userId: string) => void;
  /** Standalone tab „Adaptace“ — širší karty + check-in CTA. */
  variant?: "compact" | "standalone";
  onCheckIn?: (userId: string) => void;
}) {
  return (
    <section
      className="overflow-hidden rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)]/80 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.06)]"
      aria-labelledby="team-adaptation-heading"
    >
      <div className="border-b border-[color:var(--wp-surface-card-border)] px-7 py-5">
        <h2 id="team-adaptation-heading" className="text-[22px] font-black tracking-tight text-[color:var(--wp-text)]">
          Adaptace nováčků
        </h2>
        <p className="mt-1 text-[13px] text-[color:var(--wp-text-secondary)]">
          Nováčci v adaptačním okně, checklist a signály z CRM pro check-in.
        </p>
      </div>

      {newcomers.length === 0 ? (
        <div className="px-7 py-10 text-center">
          <p className="rounded-[20px] border border-[color:var(--wp-surface-card-border)]/80 bg-[color:var(--wp-main-scroll-bg)]/80 px-6 py-8 text-sm text-[color:var(--wp-text-secondary)]">
            <span className="block text-[14px] font-bold text-[color:var(--wp-text)]">Aktuálně bez aktivní adaptace</span>
            <span className="mt-1.5 block text-xs leading-relaxed">
              Jakmile do týmu nastoupí nový člen v adaptačním okně, objeví se zde jeho checklist.
            </span>
          </p>
        </div>
      ) : (
        <div className="grid gap-5 p-7 xl:grid-cols-2">
          {newcomers.map((n) => {
            const member = members.find((m) => m.userId === n.userId);
            const name = member ? displayName(member) : "Člen týmu";
            const risky = n.adaptationStatus === "Rizikový";
            return (
              <div
                key={n.userId}
                className="overflow-hidden rounded-[20px] border border-[color:var(--wp-surface-card-border)]/80 bg-white shadow-sm transition hover:border-[color:var(--wp-surface-card-border)]"
              >
                <button
                  type="button"
                  onClick={() => selectMember(n.userId)}
                  className="w-full p-5 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[16px] font-extrabold text-[color:var(--wp-text)]">{name}</p>
                      <p className="mt-0.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[color:var(--wp-text-tertiary)]">
                        Fáze: {n.adaptationStatus}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span
                        className={`rounded-[10px] border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] ${
                          risky
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {n.adaptationStatus}
                      </span>
                      <span className="rounded-[10px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)] px-2.5 py-1 text-[10px] font-extrabold text-[color:var(--wp-text-secondary)]">
                        {n.adaptationScore} %
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between text-[10px] font-extrabold uppercase tracking-[0.14em] text-[color:var(--wp-text-tertiary)]">
                      <span>Adaptační osa</span>
                      <span className="text-[#16192b]">{n.adaptationScore}% hotovo</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--wp-surface-muted)]">
                      <div
                        className={`h-full rounded-full transition-all ${risky ? "bg-rose-500" : "bg-emerald-500"}`}
                        style={{ width: `${n.adaptationScore}%` }}
                      />
                    </div>
                  </div>

                  {/* Checklist */}
                  <div className="mt-4 space-y-2">
                    {n.checklist.map((s, index) => (
                      <div key={s.key} className="flex items-center gap-3">
                        <span
                          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                            s.completed
                              ? "border-emerald-500 bg-emerald-500 text-white"
                              : index === 0
                                ? "border-[#16192b] bg-white text-[#16192b]"
                                : "border-[color:var(--wp-surface-card-border)] bg-white text-[color:var(--wp-text-tertiary)]"
                          }`}
                        >
                          {s.completed ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                        </span>
                        <span
                          className={`text-[11px] font-bold ${
                            s.completed ? "text-[color:var(--wp-text-tertiary)] line-through" : index === 0 ? "text-[color:var(--wp-text)]" : "text-[color:var(--wp-text-tertiary)]"
                          }`}
                        >
                          {s.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  {n.warnings.length > 0 && (
                    <p className="mt-3 text-[11px] font-semibold text-amber-700">
                      {n.warnings.join(" · ")}
                    </p>
                  )}
                </button>

                {variant === "standalone" && onCheckIn ? (
                  <div className="flex items-center justify-end border-t border-[color:var(--wp-surface-card-border)] px-5 py-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCheckIn(n.userId);
                      }}
                      className="rounded-[12px] bg-[#16192b] px-4 py-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-white transition hover:bg-black"
                    >
                      Check-in
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

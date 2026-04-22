"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { TeamOverviewPeriod } from "@/app/actions/team-overview";
import { getAdvisorProductionMix, type AdvisorProductionMix } from "@/app/actions/team-overview";
import { formatTeamOverviewProduction } from "@/lib/team-overview-format";
import type { TeamMemberMetrics } from "@/lib/team-overview-alerts";
import { formatCareerProgramLabel, formatCareerTrackLabel } from "@/lib/career/evaluate-career-progress";
import type { CareerEvaluationViewModel } from "@/lib/career/career-evaluation-vm";
import { careerProgressShortLabel } from "@/lib/career/career-ui-labels";
import { toAvatarDisplayUrl } from "@/lib/storage/avatar-proxy";

function mixPercents(mix: AdvisorProductionMix): {
  investice: number;
  penze: number;
  zivot: number;
  hypoteky: number;
  other: number;
} {
  const t = mix.total;
  if (t <= 0)
    return { investice: 0, penze: 0, zivot: 0, hypoteky: 0, other: 0 };
  return {
    investice: Math.round((mix.investice / t) * 100),
    penze: Math.round((mix.penze / t) * 100),
    zivot: Math.round((mix.zivot / t) * 100),
    hypoteky: Math.round((mix.hypoteky / t) * 100),
    other: Math.max(0, 100 - Math.round(((mix.investice + mix.penze + mix.zivot + mix.hypoteky) / t) * 100)),
  };
}

export function TeamOverviewCrmCardModal({
  open,
  userId,
  memberName,
  avatarUrl,
  metrics,
  careerEvaluation,
  period,
  onClose,
}: {
  open: boolean;
  userId: string | null;
  memberName: string;
  avatarUrl?: string | null;
  metrics: TeamMemberMetrics | null;
  careerEvaluation: CareerEvaluationViewModel;
  period: TeamOverviewPeriod;
  onClose: () => void;
}) {
  const [mix, setMix] = useState<AdvisorProductionMix | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !userId) {
      setMix(null);
      return;
    }
    let cancel = false;
    setLoading(true);
    setErr(null);
    getAdvisorProductionMix(userId, period)
      .then((data) => {
        if (!cancel) setMix(data);
      })
      .catch(() => {
        if (!cancel) setErr("Nepodařilo se načíst složení produkce.");
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [open, userId, period]);

  if (!open) return null;

  const pct = mix ? mixPercents(mix) : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[32px] bg-white shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-6 top-6 rounded-full bg-[color:var(--wp-surface-muted)] p-2 hover:bg-[color:var(--wp-surface-muted)]"
          aria-label="Zavřít"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col gap-6 border-b border-[color:var(--wp-surface-card-border)] p-10 sm:flex-row sm:items-center">
          {(() => {
            const avatarDisplay = toAvatarDisplayUrl(avatarUrl);
            return avatarDisplay ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarDisplay} alt="" className="h-24 w-24 rounded-[20px] border border-[color:var(--wp-surface-card-border)] shadow-sm" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-[20px] bg-[color:var(--wp-surface-muted)] text-2xl font-black text-[color:var(--wp-text-secondary)]">
              {memberName.slice(0, 1)}
            </div>
          );
          })()}
          <div>
            <h2 className="text-3xl font-black tracking-tight text-[color:var(--wp-text)]">{memberName}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-lg bg-[color:var(--wp-surface-muted)] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[color:var(--wp-text-secondary)]">
                {careerEvaluation.systemRoleName}
              </span>
              <span className="text-[color:var(--wp-text-tertiary)]">·</span>
              <span className="font-semibold text-[color:var(--wp-text)]">
                {formatCareerTrackLabel(careerEvaluation.careerTrackId)} /{" "}
                {careerEvaluation.careerPositionLabel ?? "—"}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-8 bg-[color:var(--wp-main-scroll-bg)]/50 p-10">
          <div>
            <h3 className="mb-4 text-lg font-extrabold text-[color:var(--wp-text)]">CRM data a produkce (aktuální měsíc)</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-[20px] border border-[color:var(--wp-surface-card-border)] bg-white p-6 shadow-sm">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">Celková produkce</p>
                <p className="mt-1 text-3xl font-black text-[#16192b]">
                  {metrics ? formatTeamOverviewProduction(metrics.productionThisPeriod) : "—"}
                </p>
              </div>
              <div className="rounded-[20px] border border-[color:var(--wp-surface-card-border)] bg-white p-6 shadow-sm">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">Počet schůzek</p>
                <p className="mt-1 text-3xl font-black text-[#16192b]">{metrics?.meetingsThisPeriod ?? "—"}</p>
              </div>
              <div className="rounded-[20px] border border-[color:var(--wp-surface-card-border)] bg-white p-6 shadow-sm">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">Hodnocení</p>
                <p className="mt-2 text-xl font-bold text-emerald-600">
                  {careerProgressShortLabel(careerEvaluation.progressEvaluation)}
                </p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-lg font-extrabold text-[color:var(--wp-text)]">Složení produkce (produktový mix)</h3>
            {loading ? (
              <p className="text-sm text-[color:var(--wp-text-secondary)]">Načítám…</p>
            ) : err ? (
              <p className="text-sm text-amber-700">{err}</p>
            ) : mix && mix.total <= 0 ? (
              <p className="text-sm text-[color:var(--wp-text-secondary)]">V tomto období nejsou evidované smlouvy — nelze zobrazit mix.</p>
            ) : pct && mix ? (
              <div className="rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] bg-white p-8 shadow-sm">
                <div className="mb-6 flex h-8 w-full overflow-hidden rounded-xl shadow-inner">
                  {pct.investice > 0 && (
                    <div
                      className="flex items-center justify-center bg-emerald-400 text-[10px] font-bold text-white"
                      style={{ width: `${pct.investice}%` }}
                    >
                      {pct.investice > 8 ? `${pct.investice}%` : ""}
                    </div>
                  )}
                  {pct.penze > 0 && (
                    <div
                      className="flex items-center justify-center bg-violet-500 text-[10px] font-bold text-white"
                      style={{ width: `${pct.penze}%` }}
                    >
                      {pct.penze > 8 ? `${pct.penze}%` : ""}
                    </div>
                  )}
                  {pct.zivot > 0 && (
                    <div
                      className="flex items-center justify-center bg-rose-400 text-[10px] font-bold text-white"
                      style={{ width: `${pct.zivot}%` }}
                    >
                      {pct.zivot > 8 ? `${pct.zivot}%` : ""}
                    </div>
                  )}
                  {pct.hypoteky > 0 && (
                    <div
                      className="flex items-center justify-center bg-blue-500 text-[10px] font-bold text-white"
                      style={{ width: `${pct.hypoteky}%` }}
                    >
                      {pct.hypoteky > 8 ? `${pct.hypoteky}%` : ""}
                    </div>
                  )}
                  {pct.other > 0 && (
                    <div
                      className="flex items-center justify-center bg-slate-400 text-[10px] font-bold text-white"
                      style={{ width: `${pct.other}%` }}
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Legend color="bg-emerald-400" label="Investice" />
                  <Legend color="bg-violet-500" label="Penze (DPS)" />
                  <Legend color="bg-rose-400" label="Životní poj." />
                  <Legend color="bg-blue-500" label="Hypotéky / úvěry" />
                </div>
                <p className="mt-4 text-[11px] text-[color:var(--wp-text-secondary)]">
                  Pool programu: {formatCareerProgramLabel(careerEvaluation.careerProgramId)} · součet z obratu smluv v
                  CRM.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-3 w-3 rounded-full ${color}`} />
      <span className="font-bold text-[color:var(--wp-text)]">{label}</span>
    </div>
  );
}

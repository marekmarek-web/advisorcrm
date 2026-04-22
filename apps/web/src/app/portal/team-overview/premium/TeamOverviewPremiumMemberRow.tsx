"use client";

import type { TeamMemberInfo } from "@/app/actions/team-overview";
import type { TeamMemberMetrics } from "@/lib/team-overview-alerts";
import { formatCareerProgramLabel } from "@/lib/career/evaluate-career-progress";
import { formatCareerTrackLabel } from "@/lib/career/evaluate-career-progress";
import { PremiumPill } from "./primitives";

function poolTone(programId: string | undefined): "info" | "violet" | "default" {
  if (programId === "beplan") return "info";
  if (programId === "premium_brokers") return "violet";
  return "default";
}

function evalTone(managerLabel: string): "success" | "danger" | "warn" | "default" {
  if (managerLabel === "Na dobré cestě") return "success";
  if (managerLabel === "Potřebuje pozornost") return "danger";
  if (managerLabel === "Vyžaduje doplnění" || managerLabel === "Bez dostatku dat" || managerLabel === "Částečně vyhodnoceno")
    return "warn";
  return "default";
}

export function TeamOverviewPremiumMemberRow({
  member,
  metrics,
  displayName,
  active,
  onClick,
}: {
  member: TeamMemberInfo;
  metrics: TeamMemberMetrics | undefined;
  displayName: (m: TeamMemberInfo) => string;
  active: boolean;
  onClick: () => void;
}) {
  const ce = metrics?.careerEvaluation;
  const programLabel = ce ? formatCareerProgramLabel(ce.careerProgramId) : "—";
  const trackLabel = ce ? formatCareerTrackLabel(ce.careerTrackId) : "—";
  const positionLabel = ce?.careerPositionLabel?.trim() || "—";
  const evalLabel = ce?.managerProgressLabel ?? "—";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid w-full grid-cols-12 items-center gap-3 rounded-[var(--wp-radius-card)] border px-4 py-3 text-left transition ${
        active
          ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10"
          : "border-[color:var(--wp-surface-card-border)]/80 bg-white hover:border-[color:var(--wp-surface-card-border)] hover:bg-[color:var(--wp-main-scroll-bg)]/60"
      }`}
    >
      <div className="col-span-5 min-w-0 lg:col-span-4">
        <div className="truncate text-sm font-semibold">{displayName(member)}</div>
        <div className={`truncate text-xs ${active ? "text-[color:var(--wp-text-tertiary)]" : "text-[color:var(--wp-text-secondary)]"}`}>{member.roleName}</div>
      </div>
      <div className="col-span-3 hidden lg:block xl:col-span-2">
        {ce ? (
          <PremiumPill tone={active ? "dark" : poolTone(ce.careerProgramId)}>{programLabel}</PremiumPill>
        ) : (
          <span className={`text-xs ${active ? "text-[color:var(--wp-text-tertiary)]" : "text-[color:var(--wp-text-secondary)]"}`}>—</span>
        )}
      </div>
      <div className="col-span-2 hidden xl:block text-sm">{trackLabel}</div>
      <div className="col-span-2 text-sm font-medium">{positionLabel}</div>
      <div className="col-span-3 flex justify-end">
        {ce ? (
          <PremiumPill tone={active ? "dark" : evalTone(evalLabel)}>{evalLabel}</PremiumPill>
        ) : (
          <span className={`text-xs ${active ? "text-[color:var(--wp-text-tertiary)]" : "text-[color:var(--wp-text-secondary)]"}`}>—</span>
        )}
      </div>
    </button>
  );
}

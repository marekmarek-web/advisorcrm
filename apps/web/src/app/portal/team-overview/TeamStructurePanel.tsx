"use client";

import clsx from "clsx";
import { Network, UserCircle, ChevronRight } from "lucide-react";
import type { TeamOverviewScope, TeamTreeNode } from "@/lib/team-hierarchy-types";
import type { TeamMemberMetrics } from "@/lib/team-overview-alerts";
import { formatTeamOverviewProduction } from "@/lib/team-overview-format";
import {
  classifyStructureRole,
  deriveBranchHealthLabel,
} from "@/lib/team-overview-structure-classification";

function countDescendants(node: TeamTreeNode): number {
  return node.children.reduce((acc, c) => acc + 1 + countDescendants(c), 0);
}

function TreeBranch({
  nodes,
  currentUserId,
  depth,
  selectedUserId,
  onSelectMember,
  metricsByUser,
  newcomerUserIds,
}: {
  nodes: TeamTreeNode[];
  currentUserId: string;
  depth: number;
  selectedUserId?: string | null;
  onSelectMember: (userId: string) => void;
  metricsByUser?: Map<string, TeamMemberMetrics>;
  newcomerUserIds?: Set<string>;
}) {
  return (
    <ul className={clsx("space-y-4", depth > 0 && "mt-4 pl-8")}>
      {nodes.map((node) => {
        const below = countDescendants(node);
        const isSelf = node.userId === currentUserId;
        const isSelected = selectedUserId != null && selectedUserId === node.userId;
        const label = node.displayName?.trim() || node.email || "Člen týmu";
        const m = metricsByUser?.get(node.userId);
        const childrenProd = node.children.reduce(
          (s, c) => s + (metricsByUser?.get(c.userId)?.productionThisPeriod ?? 0),
          0
        );
        const isNewcomer = newcomerUserIds?.has(node.userId) ?? false;
        const classification =
          m != null
            ? classifyStructureRole({
                isNewcomer,
                directReportsCount: m.directReportsCount,
                roleName: node.roleName,
                progressEvaluation: m.careerEvaluation.progressEvaluation,
                productionThisPeriod: m.productionThisPeriod,
                approximateProductionTarget:
                  m.targetProgressPercent != null && m.targetProgressPercent > 0
                    ? m.productionThisPeriod / (m.targetProgressPercent / 100)
                    : null,
              })
            : null;
        const health =
          m != null
            ? deriveBranchHealthLabel({
                nodeProduction: m.productionThisPeriod,
                childrenProductionSum: childrenProd,
                riskLevelWorst: m.riskLevel,
              })
            : null;
        return (
          <li key={node.userId}>
            <div className="relative">
              {depth > 0 ? (
                <>
                  <span className="pointer-events-none absolute -left-8 top-5 h-px w-8 bg-slate-200/90" />
                  <span className="pointer-events-none absolute -left-8 -top-4 h-9 w-px bg-slate-200/90" />
                </>
              ) : null}
              <div
                className={clsx(
                  "group flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[20px] border px-5 py-4 text-sm transition",
                  depth === 0 && "border-slate-800 bg-[#16192b] text-white shadow-[0_12px_30px_rgba(22,25,43,0.18)]",
                  depth > 0 && "bg-white",
                  isSelf && depth > 0 && "border-indigo-200/80 bg-indigo-50/60",
                  isSelected && !isSelf && depth > 0 && "border-violet-300/80 bg-violet-50/80",
                  !isSelf && !isSelected && depth > 0 && "border-slate-200/80 hover:border-slate-300 hover:-translate-y-px"
                )}
              >
                {isSelf && depth > 0 && (
                  <UserCircle className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
                )}
                <button
                  type="button"
                  onClick={() => onSelectMember(node.userId)}
                  className={clsx(
                    "text-left text-[14px] font-extrabold transition hover:underline",
                    depth === 0
                      ? "text-white"
                      : isSelected
                        ? "text-violet-900"
                        : isSelf
                          ? "text-indigo-900"
                          : "text-slate-900 hover:text-[#16192b]"
                  )}
                >
                  {label}
                </button>
                <span className={clsx("text-[11px] font-medium", depth === 0 ? "text-slate-400" : "text-slate-400")}>
                  {node.roleName}
                </span>
                {m != null && (
                  <span className={clsx("text-[11px] font-semibold tabular-nums", depth === 0 ? "text-slate-300" : "text-slate-500")}>
                    {formatTeamOverviewProduction(m.productionThisPeriod)}
                  </span>
                )}
                {classification && classification.kind !== "neutral" && (
                  <span className={clsx(
                    "rounded-[10px] border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em]",
                    depth === 0
                      ? "border-white/10 bg-white/10 text-white"
                      : "border-slate-200 bg-slate-50 text-slate-600"
                  )}>
                    {classification.labelCs}
                  </span>
                )}
                {health && health.labelCs && (
                  <span className="rounded-[10px] border border-amber-200/70 bg-amber-50 px-2.5 py-1 text-[10px] font-extrabold text-amber-800">
                    {health.labelCs}
                  </span>
                )}
                {below > 0 && (
                  <span className={clsx(
                    "rounded-[10px] border px-2.5 py-1 text-[10px] font-extrabold",
                    depth === 0
                      ? "border-white/10 bg-white/10 text-slate-300"
                      : "border-slate-200 bg-white text-slate-400"
                  )}>
                    +{below}
                  </span>
                )}
                <span
                  className={clsx(
                    "ml-auto inline-flex items-center text-[10px] font-extrabold uppercase tracking-[0.14em] opacity-0 transition group-hover:opacity-100",
                    depth === 0 ? "text-slate-400" : "text-slate-400"
                  )}
                  aria-hidden
                >
                  <ChevronRight className="h-4 w-4" />
                </span>
              </div>
            </div>
            {node.children.length > 0 && (
              <TreeBranch
                nodes={node.children}
                currentUserId={currentUserId}
                depth={depth + 1}
                selectedUserId={selectedUserId}
                onSelectMember={onSelectMember}
                metricsByUser={metricsByUser}
                newcomerUserIds={newcomerUserIds}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function TeamStructurePanel({
  roots,
  currentUserId,
  scope,
  hierarchyParentLinksConfigured: _hierarchyParentLinksConfigured = true,
  selectedUserId = null,
  onSelectMember,
  metricsByUser,
  newcomerUserIds,
}: {
  roots: TeamTreeNode[];
  currentUserId: string;
  scope: TeamOverviewScope;
  /** Zachováno kvůli kompatibilitě volání — UI už neodkazuje na legacy detail page. */
  memberDetailQuery?: string;
  hierarchyParentLinksConfigured?: boolean;
  selectedUserId?: string | null;
  onSelectMember: (userId: string) => void;
  metricsByUser?: Map<string, TeamMemberMetrics>;
  newcomerUserIds?: Set<string>;
}) {
  if (roots.length === 0) {
    return (
      <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.06)]">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/50 px-7 py-4">
          <Network className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
          <h2 className="text-[17px] font-black tracking-tight text-slate-950">Struktura týmu</h2>
        </div>
        <p className="px-7 py-5 text-sm text-slate-500">
          V tomto rozsahu zatím nejsou data o struktuře. Zkontrolujte nastavení nadřízených v týmu.
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.06)]">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/40 px-7 py-4">
        <Network className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
        <h2 className="text-[17px] font-black tracking-tight text-slate-950">Struktura týmu</h2>
        <span className="ml-auto text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
          {scope === "me" ? "Osobní rozsah" : `${roots.length} ${roots.length === 1 ? "kořen" : "kořenů"}`}
        </span>
      </div>

      <div className="relative overflow-hidden px-7 py-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:22px_22px] opacity-[0.28]" />
        <div className="relative z-10 min-h-[520px] overflow-x-auto">
          <div className="mx-auto max-w-[1080px] pt-1">
            <TreeBranch
              nodes={roots}
              currentUserId={currentUserId}
              depth={0}
              selectedUserId={selectedUserId}
              onSelectMember={onSelectMember}
              metricsByUser={metricsByUser}
              newcomerUserIds={newcomerUserIds}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

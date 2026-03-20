"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  getTeamAlerts,
  getTeamHierarchy,
  getTeamMemberMetrics,
  getTeamOverviewKpis,
  getTeamPerformanceOverTime,
  listTeamMembersWithNames,
  type TeamAlert,
  type TeamMemberInfo,
  type TeamMemberMetrics,
  type TeamOverviewKpis,
  type TeamOverviewPeriod,
} from "@/app/actions/team-overview";
import { createTeamEvent, createTeamTask } from "@/app/actions/team-events";
import type { TeamOverviewScope, TeamTreeNode } from "@/lib/team-hierarchy";
import {
  AIInsightCard,
  BottomSheet,
  EmptyState,
  ErrorState,
  KPIProgressCard,
  LoadingSkeleton,
  MobileCard,
  MobileSection,
  TeamMemberCard,
} from "@/app/shared/mobile-ui/primitives";

export function TeamOverviewScreen() {
  const [period, setPeriod] = useState<TeamOverviewPeriod>("month");
  const [scope, setScope] = useState<TeamOverviewScope>("my_team");
  const [kpis, setKpis] = useState<TeamOverviewKpis | null>(null);
  const [members, setMembers] = useState<TeamMemberInfo[]>([]);
  const [metrics, setMetrics] = useState<TeamMemberMetrics[]>([]);
  const [alerts, setAlerts] = useState<TeamAlert[]>([]);
  const [hierarchy, setHierarchy] = useState<TeamTreeNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [actionOpen, setActionOpen] = useState(false);
  const [actionType, setActionType] = useState<"event" | "task">("task");
  const [actionTitle, setActionTitle] = useState("");
  const [actionDate, setActionDate] = useState(new Date().toISOString().slice(0, 10));

  function reload() {
    startTransition(async () => {
      setError(null);
      try {
        const [nextKpis, nextMembers, nextMetrics, nextAlerts, nextHierarchy] = await Promise.all([
          getTeamOverviewKpis(period, scope),
          listTeamMembersWithNames(scope),
          getTeamMemberMetrics(period, scope),
          getTeamAlerts(period, scope),
          getTeamHierarchy(scope),
          getTeamPerformanceOverTime(period, scope),
        ]);
        setKpis(nextKpis);
        setMembers(nextMembers);
        setMetrics(nextMetrics);
        setAlerts(nextAlerts);
        setHierarchy(nextHierarchy);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Týmový přehled se nepodařilo načíst.");
      }
    });
  }

  useEffect(() => {
    reload();
  }, [period, scope]);

  const metricsByUser = useMemo(() => new Map(metrics.map((item) => [item.userId, item])), [metrics]);
  const criticalAlerts = alerts.filter((item) => item.severity === "critical");

  async function createAction() {
    const memberIds = members.map((member) => member.userId);
    if (!actionTitle.trim() || memberIds.length === 0) return;
    startTransition(async () => {
      setError(null);
      try {
        if (actionType === "event") {
          await createTeamEvent(
            {
              title: actionTitle.trim(),
              eventType: "schuzka",
              startAt: `${actionDate}T09:00:00`,
              endAt: `${actionDate}T09:30:00`,
            },
            memberIds
          );
        } else {
          await createTeamTask(
            {
              title: actionTitle.trim(),
              dueDate: actionDate,
            },
            memberIds
          );
        }
        setActionOpen(false);
        setActionTitle("");
        reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Týmovou akci se nepodařilo vytvořit.");
      }
    });
  }

  return (
    <>
      {error ? <ErrorState title={error} onRetry={reload} /> : null}
      {pending && !kpis ? <LoadingSkeleton rows={3} /> : null}

      <MobileSection title="Týmový přehled">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { id: "week", label: "Týden" },
            { id: "month", label: "Měsíc" },
            { id: "quarter", label: "Kvartál" },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setPeriod(option.id as TeamOverviewPeriod)}
              className={`min-h-[36px] rounded-lg border px-3 text-xs font-bold whitespace-nowrap ${
                period === option.id ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white border-slate-200 text-slate-600"
              }`}
            >
              {option.label}
            </button>
          ))}
          {[
            { id: "me", label: "Já" },
            { id: "my_team", label: "Můj tým" },
            { id: "full", label: "Celý tým" },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setScope(option.id as TeamOverviewScope)}
              className={`min-h-[36px] rounded-lg border px-3 text-xs font-bold whitespace-nowrap ${
                scope === option.id ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-slate-200 text-slate-600"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </MobileSection>

      {kpis ? (
        <MobileSection
          title={kpis.periodLabel}
          action={
            <button
              type="button"
              onClick={() => setActionOpen(true)}
              className="min-h-[32px] rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 px-2.5 text-xs font-bold"
            >
              Týmová akce
            </button>
          }
        >
          <KPIProgressCard label="Produkce" actual={Math.round(kpis.productionThisPeriod)} target={Math.round(kpis.teamGoalTarget ?? 0)} unit="Kč" tone="info" />
          <KPIProgressCard label="Schůzky" actual={kpis.meetingsThisWeek} target={kpis.teamGoalType === "meetings" ? kpis.teamGoalTarget ?? 0 : 0} tone="success" />
          <KPIProgressCard label="Uzavřené obchody" actual={kpis.closedDealsThisPeriod} target={kpis.teamGoalType === "units" ? kpis.teamGoalTarget ?? 0 : 0} tone="warning" />
          <MobileCard className="p-3.5">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-black">Scope</p>
            <p className="text-sm font-semibold mt-1">
              {kpis.memberCount} členů • {kpis.activeMemberCount} aktivních • {kpis.riskyMemberCount} rizikových
            </p>
          </MobileCard>
        </MobileSection>
      ) : (
        <EmptyState title="Bez dat KPI" description="Pro vybraný scope nejsou data nebo nemáte oprávnění." />
      )}

      {criticalAlerts.length > 0 ? (
        <AIInsightCard
          title="Rizika týmu"
          insight={criticalAlerts[0].title}
          action={<p className="text-xs text-violet-800/80">{criticalAlerts[0].description}</p>}
        />
      ) : null}

      <MobileSection title="Členové týmu">
        {members.length === 0 ? (
          <EmptyState title="Žádní členové" />
        ) : (
          members.map((member) => {
            const memberMetric = metricsByUser.get(member.userId);
            return (
              <TeamMemberCard
                key={member.userId}
                name={member.displayName || member.email || member.userId}
                role={member.roleName}
                subtitle={
                  memberMetric
                    ? `Schůzky: ${memberMetric.meetingsThisPeriod} • Produkce: ${Math.round(memberMetric.productionThisPeriod).toLocaleString("cs-CZ")} Kč`
                    : "Bez metrik"
                }
                riskLevel={memberMetric?.riskLevel}
              />
            );
          })
        )}
      </MobileSection>

      <MobileSection title="Alerty">
        {alerts.length === 0 ? (
          <EmptyState title="Žádné alerty" />
        ) : (
          alerts.slice(0, 8).map((alert, idx) => (
            <MobileCard key={`${alert.memberId}-${alert.type}-${idx}`} className="p-3.5">
              <p className="text-sm font-bold">{alert.title}</p>
              <p className="text-xs text-slate-500 mt-1">{alert.description}</p>
            </MobileCard>
          ))
        )}
      </MobileSection>

      <BottomSheet open={actionOpen} onClose={() => setActionOpen(false)} title="Nová týmová akce">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setActionType("task")}
              className={`min-h-[40px] rounded-lg border text-xs font-bold ${
                actionType === "task" ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200"
              }`}
            >
              Úkol
            </button>
            <button
              type="button"
              onClick={() => setActionType("event")}
              className={`min-h-[40px] rounded-lg border text-xs font-bold ${
                actionType === "event" ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200"
              }`}
            >
              Schůzka
            </button>
          </div>
          <input
            type="text"
            value={actionTitle}
            onChange={(e) => setActionTitle(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm"
            placeholder="Název akce"
          />
          <input
            type="date"
            value={actionDate}
            onChange={(e) => setActionDate(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm"
          />
          <button type="button" onClick={createAction} className="w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold">
            Vytvořit pro {members.length} členů
          </button>
          {hierarchy.length === 0 ? <p className="text-xs text-slate-500">Hierarchy není dostupná.</p> : null}
        </div>
      </BottomSheet>
    </>
  );
}

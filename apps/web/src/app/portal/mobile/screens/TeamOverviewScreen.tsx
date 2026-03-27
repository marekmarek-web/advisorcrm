"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Users,
  TrendingUp,
  Calendar,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Target,
  Activity,
} from "lucide-react";
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
import type { TeamOverviewScope, TeamTreeNode } from "@/lib/team-hierarchy-types";
import {
  AIInsightCard,
  BottomSheet,
  EmptyState,
  ErrorState,
  FilterChips,
  MobileCard,
  MobileSection,
  StatusBadge,
} from "@/app/shared/mobile-ui/primitives";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";
import { portalPrimaryButtonClassName } from "@/lib/ui/create-action-button-styles";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const AVATAR_PALETTE = [
  "bg-indigo-500", "bg-purple-500", "bg-emerald-500",
  "bg-blue-500", "bg-rose-500", "bg-amber-500",
];

function getInitials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string): string {
  const idx = Array.from(name).reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx];
}

function fmtCzk(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1).replace(".", ",")} M Kč`;
  if (amount >= 1_000) return `${Math.round(amount / 1_000)} tis. Kč`;
  return `${amount.toLocaleString("cs-CZ")} Kč`;
}

function AlertCard({ alert }: { alert: TeamAlert }) {
  return (
    <MobileCard
      className={cx(
        "p-3.5 border-l-4",
        alert.severity === "critical" ? "border-l-rose-500 bg-rose-50/30" : "border-l-amber-400 bg-amber-50/30"
      )}
    >
      <div className="flex items-start gap-2.5">
        {alert.severity === "critical" ? (
          <AlertCircle size={16} className="text-rose-500 flex-shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[color:var(--wp-text)]">{alert.title}</p>
          {alert.description ? (
            <p className="text-xs text-[color:var(--wp-text-secondary)] mt-0.5">{alert.description}</p>
          ) : null}
        </div>
        <StatusBadge tone={alert.severity === "critical" ? "danger" : "warning"}>
          {alert.severity === "critical" ? "kritické" : "pozor"}
        </StatusBadge>
      </div>
    </MobileCard>
  );
}

function MemberCard({
  member,
  metrics,
}: {
  member: TeamMemberInfo;
  metrics: TeamMemberMetrics | undefined;
}) {
  const name = member.displayName || member.email || member.userId;
  const initials = getInitials(name);
  const avatarColor = getAvatarColor(name);
  const riskLevel = metrics?.riskLevel;

  return (
    <MobileCard className="p-3.5">
      <div className="flex items-center gap-3">
        <div className={cx("w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-black flex-shrink-0", avatarColor)}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-[color:var(--wp-text)] truncate">{name}</p>
            {riskLevel === "critical" ? (
              <AlertCircle size={14} className="text-rose-500 flex-shrink-0" />
            ) : riskLevel === "warning" ? (
              <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
            ) : (
              <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
            )}
          </div>
          <p className="text-xs text-[color:var(--wp-text-secondary)] mt-0.5 truncate">{member.roleName}</p>
        </div>
      </div>

      {metrics ? (
        <div className="mt-3 grid grid-cols-3 gap-2 pt-2.5 border-t border-[color:var(--wp-surface-card-border)]">
          <div className="text-center">
            <p className="text-[10px] font-black uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">Schůzky</p>
            <p className="text-sm font-black text-[color:var(--wp-text)] mt-0.5">{metrics.meetingsThisPeriod}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-black uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">Produkce</p>
            <p className="text-sm font-black text-[color:var(--wp-text)] mt-0.5">{fmtCzk(metrics.productionThisPeriod)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-black uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">Hodnota obchodů</p>
            <p className="text-sm font-black text-[color:var(--wp-text)] mt-0.5">{fmtCzk(metrics.pipelineValue)}</p>
          </div>
        </div>
      ) : null}
    </MobileCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Screen                                                        */
/* ------------------------------------------------------------------ */

export function TeamOverviewScreen({ deviceClass = "phone" }: { deviceClass?: DeviceClass }) {
  const [period, setPeriod] = useState<TeamOverviewPeriod>("month");
  const [scope, setScope] = useState<TeamOverviewScope>("my_team");
  const [kpis, setKpis] = useState<TeamOverviewKpis | null>(null);
  const [members, setMembers] = useState<TeamMemberInfo[]>([]);
  const [metrics, setMetrics] = useState<TeamMemberMetrics[]>([]);
  const [alerts, setAlerts] = useState<TeamAlert[]>([]);
  const [hierarchy, setHierarchy] = useState<TeamTreeNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"members" | "alerts">("members");

  const [actionOpen, setActionOpen] = useState(false);
  const [actionType, setActionType] = useState<"event" | "task">("task");
  const [actionTitle, setActionTitle] = useState("");
  const [actionDate, setActionDate] = useState(new Date().toISOString().slice(0, 10));

  const isTablet = deviceClass === "tablet";

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, scope]);

  const metricsByUser = useMemo(
    () => new Map(metrics.map((item) => [item.userId, item])),
    [metrics]
  );

  const criticalAlerts = alerts.filter((item) => item.severity === "critical");
  const warningAlerts = alerts.filter((item) => item.severity === "warning");

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
          await createTeamTask({ title: actionTitle.trim(), dueDate: actionDate }, memberIds);
        }
        setActionOpen(false);
        setActionTitle("");
        reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Týmovou akci se nepodařilo vytvořit.");
      }
    });
  }

  if (pending && !kpis) {
    return (
      <div className="min-h-[50vh] space-y-0 pb-6">
        <div className="h-28 bg-gradient-to-br from-[#1e293b] to-[#0f172a] animate-pulse rounded-b-2xl" />
        <div className="px-4 py-3 grid grid-cols-3 gap-2 bg-[color:var(--wp-surface-card)]/80 border-b border-[color:var(--wp-surface-card-border)]">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-[color:var(--wp-surface-card-border)]/70 animate-pulse" />
          ))}
        </div>
        <div className="px-4 py-3 space-y-2 bg-[color:var(--wp-surface-card)] border-b border-[color:var(--wp-surface-card-border)]">
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 w-16 rounded-xl bg-[color:var(--wp-surface-card-border)]/70 animate-pulse shrink-0" />
            ))}
          </div>
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 w-20 rounded-xl bg-[color:var(--wp-surface-card-border)]/70 animate-pulse shrink-0" />
            ))}
          </div>
        </div>
        <div className="px-4 pt-3 space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-[color:var(--wp-surface-card-border)]/70 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {error ? <ErrorState title={error} onRetry={reload} /> : null}
      <div
        className={cx(
          "pb-6",
          pending && kpis && "opacity-60 pointer-events-none transition-opacity duration-200"
        )}
      >
      {/* Hero */}
      <div className="bg-gradient-to-br from-[#1e293b] to-[#0f172a] px-4 pt-4 pb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
              Týmový přehled
            </p>
            <h2 className="text-base font-black text-white mt-1">
              {kpis?.periodLabel ?? "Aktuální období"}
            </h2>
            {kpis ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="flex items-center gap-1 text-[11px] font-black text-white/70 bg-[color:var(--wp-surface-card)]/10 px-2 py-0.5 rounded-lg">
                  <Users size={10} /> {kpis.memberCount} členů
                </span>
                <span className="flex items-center gap-1 text-[11px] font-black text-white/70 bg-[color:var(--wp-surface-card)]/10 px-2 py-0.5 rounded-lg">
                  <Activity size={10} /> {kpis.activeMemberCount} aktivních
                </span>
                {kpis.riskyMemberCount > 0 ? (
                  <span className="flex items-center gap-1 text-[11px] font-black text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded-lg">
                    <AlertCircle size={10} /> {kpis.riskyMemberCount} rizikových
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setActionOpen(true)}
            className="flex items-center gap-1.5 min-h-[36px] px-3 rounded-xl bg-[color:var(--wp-surface-card)]/10 border border-white/20 text-white text-xs font-bold whitespace-nowrap"
          >
            <Target size={13} /> Týmová akce
          </button>
        </div>

        {/* KPI row */}
        {kpis ? (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">Produkce</p>
              <p className="text-base font-black text-white mt-0.5">{fmtCzk(Math.round(kpis.productionThisPeriod))}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">Schůzky</p>
              <p className="text-base font-black text-white mt-0.5">{kpis.meetingsThisWeek}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">Uzavřeno</p>
              <p className="text-base font-black text-white mt-0.5">{kpis.closedDealsThisPeriod}</p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Filters */}
      <div className="px-4 py-3 bg-[color:var(--wp-surface-card)] border-b border-[color:var(--wp-surface-card-border)] space-y-2">
        <div className="flex gap-2 overflow-x-auto">
          <FilterChips
            value={period}
            onChange={(id) => setPeriod(id as TeamOverviewPeriod)}
            options={[
              { id: "week", label: "Týden" },
              { id: "month", label: "Měsíc" },
              { id: "quarter", label: "Kvartál" },
            ]}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          <FilterChips
            value={scope}
            onChange={(id) => setScope(id as TeamOverviewScope)}
            options={[
              { id: "me", label: "Já" },
              { id: "my_team", label: "Můj tým" },
              { id: "full", label: "Celý tým" },
            ]}
          />
        </div>
      </div>

      {/* Alert banner */}
      {criticalAlerts.length > 0 ? (
        <MobileCard className="mx-4 mt-3 border-rose-200 bg-rose-50/60 p-3">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="text-rose-500 flex-shrink-0" />
            <p className="text-sm font-bold text-rose-800">
              {criticalAlerts.length} {criticalAlerts.length === 1 ? "kritický alert" : "kritické alerty"} — {criticalAlerts[0].title}
            </p>
          </div>
        </MobileCard>
      ) : null}

      {/* AI insight */}
      {criticalAlerts.length > 0 ? (
        <MobileSection>
          <AIInsightCard
            title="Rizika týmu"
            insight={criticalAlerts[0].title}
            action={<p className="text-xs text-violet-800/80">{criticalAlerts[0].description}</p>}
          />
        </MobileSection>
      ) : null}

      {/* Tabs */}
      <div className="px-4 py-2 bg-[color:var(--wp-surface-card)] border-b border-[color:var(--wp-surface-card-border)]">
        <FilterChips
          value={activeTab}
          onChange={(id) => setActiveTab(id as "members" | "alerts")}
          options={[
            { id: "members", label: "Členové", badge: members.length },
            {
              id: "alerts",
              label: "Alerty",
              badge: alerts.length,
              tone: criticalAlerts.length > 0 ? "danger" : warningAlerts.length > 0 ? "warning" : "neutral",
            },
          ]}
        />
      </div>

      {/* Members tab */}
      {activeTab === "members" ? (
        <MobileSection title={`Členové týmu (${members.length})`}>
          {members.length === 0 ? (
            <EmptyState title="Žádní členové" description="Pro vybraný scope nejsou data." />
          ) : (
            <div className={cx("grid gap-2", isTablet ? "grid-cols-2" : "grid-cols-1")}>
              {members.map((member) => (
                <MemberCard
                  key={member.userId}
                  member={member}
                  metrics={metricsByUser.get(member.userId)}
                />
              ))}
            </div>
          )}
        </MobileSection>
      ) : null}

      {/* Alerts tab */}
      {activeTab === "alerts" ? (
        <MobileSection title={`Alerty (${alerts.length})`}>
          {alerts.length === 0 ? (
            <EmptyState
              title="Žádné alerty"
              description="Tým je v pořádku, žádné problémy nezjištěny."
            />
          ) : (
            <div className="space-y-2">
              {alerts.slice(0, 12).map((alert, idx) => (
                <AlertCard key={`${alert.memberId}-${alert.type}-${idx}`} alert={alert} />
              ))}
            </div>
          )}
        </MobileSection>
      ) : null}
      </div>

      {/* Action sheet */}
      <BottomSheet
        open={actionOpen}
        onClose={() => setActionOpen(false)}
        title="Nová týmová akce"
      >
        <div className="space-y-3">
          <FilterChips
            value={actionType}
            onChange={(id) => setActionType(id as "task" | "event")}
            options={[
              { id: "task", label: "Úkol" },
              { id: "event", label: "Schůzka" },
            ]}
          />
          <input
            type="text"
            value={actionTitle}
            onChange={(e) => setActionTitle(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
            placeholder="Název akce"
          />
          <input
            type="date"
            value={actionDate}
            onChange={(e) => setActionDate(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
          />
          <button
            type="button"
            onClick={createAction}
            disabled={!actionTitle.trim()}
            className={cx(portalPrimaryButtonClassName, "w-full min-h-[48px] text-sm disabled:opacity-50")}
          >
            Vytvořit pro {members.length} členů
          </button>
          {hierarchy.length === 0 ? (
            <p className="text-xs text-[color:var(--wp-text-tertiary)] text-center">Hierarchy není dostupná.</p>
          ) : null}
        </div>
      </BottomSheet>
    </>
  );
}

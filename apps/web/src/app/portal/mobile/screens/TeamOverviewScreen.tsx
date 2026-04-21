"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Users,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Target,
  Activity,
  TrendingUp,
  Calendar,
  Briefcase,
} from "lucide-react";
import {
  getTeamHierarchy,
  getTeamMemberMetrics,
  getTeamOverviewKpis,
  listTeamMembersWithNames,
  type TeamMemberInfo,
  type TeamOverviewKpis,
  type TeamOverviewPeriod,
} from "@/app/actions/team-overview";
import type { TeamAlert, TeamMemberMetrics } from "@/lib/team-overview-alerts";
import { buildTeamAlertsFromMemberMetrics } from "@/lib/team-overview-alerts";
import { createTeamEvent, createTeamTask } from "@/app/actions/team-events";
import { defaultTaskDueDateYmd } from "@/lib/date/date-only";
import type { TeamOverviewScope, TeamTreeNode } from "@/lib/team-hierarchy-types";
import {
  AIInsightCard,
  BottomSheet,
  EmptyState,
  MobileCard,
  MobileSection,
  StatusBadge,
} from "@/app/shared/mobile-ui/primitives";
import {
  HeroCard,
  HeroAction,
  HeroMetaDot,
  InlineAlert,
  KpiCard,
  MetricGrid,
  SegmentPills,
} from "@/app/shared/portal-ui/primitives";
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
        "p-3 border-l-4",
        alert.severity === "critical" ? "border-l-rose-500 bg-rose-50/30" : "border-l-amber-400 bg-amber-50/30"
      )}
    >
      <div className="flex items-start gap-2.5">
        {alert.severity === "critical" ? (
          <AlertCircle size={15} className="text-rose-500 flex-shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-[color:var(--wp-text)] leading-snug">{alert.title}</p>
          {alert.description ? (
            <p className="text-[11px] text-[color:var(--wp-text-secondary)] mt-0.5 leading-snug">{alert.description}</p>
          ) : null}
        </div>
        <StatusBadge tone={alert.severity === "critical" ? "danger" : "warning"}>
          {alert.severity === "critical" ? "kritické" : "pozor"}
        </StatusBadge>
      </div>
    </MobileCard>
  );
}

/**
 * Kompaktní member row — jednotná výška, avatar + name + roleName + mini-KPI
 * inline (Schůzky · Produkce · Pipeline). Bez velkých nadpisů, padding 12px.
 */
function MemberRow({
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
    <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-3">
        <div className={cx("w-9 h-9 rounded-xl flex items-center justify-center text-white text-[13px] font-black flex-shrink-0", avatarColor)}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-bold text-[color:var(--wp-text)] truncate">{name}</p>
            {riskLevel === "critical" ? (
              <AlertCircle size={13} className="text-rose-500 flex-shrink-0" />
            ) : riskLevel === "warning" ? (
              <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />
            ) : (
              <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
            )}
          </div>
          <p className="text-[11px] text-[color:var(--wp-text-secondary)] truncate">{member.roleName}</p>
        </div>
      </div>
      {metrics ? (
        <div className="mt-2.5 flex items-center gap-3 border-t border-[color:var(--wp-surface-card-border)] pt-2 text-[11px] font-semibold text-[color:var(--wp-text-secondary)]">
          <span className="inline-flex items-center gap-1">
            <Calendar size={11} className="text-indigo-500" />
            <span className="text-[color:var(--wp-text)] font-black">{metrics.meetingsThisPeriod}</span>
          </span>
          <span className="text-[color:var(--wp-text-tertiary)]">·</span>
          <span className="inline-flex items-center gap-1">
            <TrendingUp size={11} className="text-emerald-500" />
            <span className="text-[color:var(--wp-text)] font-black">{fmtCzk(metrics.productionThisPeriod)}</span>
          </span>
          <span className="text-[color:var(--wp-text-tertiary)]">·</span>
          <span className="inline-flex items-center gap-1 truncate">
            <Briefcase size={11} className="text-amber-500" />
            <span className="text-[color:var(--wp-text)] font-black truncate">{fmtCzk(metrics.pipelineValue)}</span>
          </span>
        </div>
      ) : null}
      {metrics?.careerEvaluation ? (
        <p className="mt-2 text-[11px] leading-snug text-[color:var(--wp-text-secondary)] break-words">
          <span className="font-semibold text-[color:var(--wp-text)]">Kariéra: </span>
          {metrics.careerEvaluation.summaryLine || metrics.careerEvaluation.managerProgressLabel}
        </p>
      ) : null}
    </div>
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
  const [actionDate, setActionDate] = useState(defaultTaskDueDateYmd());

  const isTablet = deviceClass === "tablet";

  function reload() {
    startTransition(async () => {
      setError(null);
      try {
        const [nextKpis, nextMembers, nextMetrics, nextHierarchy] = await Promise.all([
          getTeamOverviewKpis(period, scope),
          listTeamMembersWithNames(scope),
          getTeamMemberMetrics(period, scope),
          getTeamHierarchy(scope),
        ]);
        setKpis(nextKpis);
        setMembers(nextMembers);
        setMetrics(nextMetrics);
        setAlerts(buildTeamAlertsFromMemberMetrics(nextMetrics));
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
      <div className="min-h-[50vh] space-y-3 px-4 pt-4 pb-6">
        <div className="h-[168px] rounded-[24px] bg-[color:var(--wp-surface-card-border)]/70 animate-pulse" />
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[92px] rounded-2xl bg-[color:var(--wp-surface-card-border)]/70 animate-pulse" />
          ))}
        </div>
        <div className="h-10 rounded-2xl bg-[color:var(--wp-surface-card-border)]/70 animate-pulse" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[72px] rounded-2xl bg-[color:var(--wp-surface-card-border)]/70 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={cx(
          "space-y-4 px-4 pt-4 pb-6",
          pending && kpis && "opacity-60 pointer-events-none transition-opacity duration-200"
        )}
      >
        {error ? (
          <InlineAlert
            tone="danger"
            title="Týmový přehled se nepodařilo načíst"
            description={error}
            action={
              <button
                type="button"
                onClick={reload}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-[11px] font-black uppercase tracking-wide text-rose-700 hover:bg-rose-100"
              >
                Zkusit znovu
              </button>
            }
          />
        ) : null}

        {/* Hero briefing */}
        <HeroCard
          eyebrow="Týmový přehled"
          title={kpis?.periodLabel ?? "Aktuální období"}
          icon={<Users size={20} className="text-white" />}
          actions={
            <HeroAction onClick={() => setActionOpen(true)}>
              <Target size={13} /> Týmová akce
            </HeroAction>
          }
          meta={
            kpis ? (
              <>
                <span className="inline-flex items-center gap-1">
                  <Users size={11} /> {kpis.memberCount} členů
                </span>
                <HeroMetaDot />
                <span className="inline-flex items-center gap-1">
                  <Activity size={11} /> {kpis.activeMemberCount} aktivních
                </span>
                {kpis.riskyMemberCount > 0 ? (
                  <>
                    <HeroMetaDot />
                    <span className="inline-flex items-center gap-1 text-rose-200">
                      <AlertCircle size={11} /> {kpis.riskyMemberCount} rizikových
                    </span>
                  </>
                ) : null}
              </>
            ) : null
          }
        >
          {kpis ? (
            <div className="grid grid-cols-3 gap-3 border-t border-white/10 pt-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/60">Produkce</p>
                <p className="mt-0.5 text-[17px] font-black leading-tight text-white">
                  {fmtCzk(Math.round(kpis.productionThisPeriod))}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/60">Schůzky</p>
                <p className="mt-0.5 text-[17px] font-black leading-tight text-white">{kpis.meetingsThisWeek}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/60">Uzavřeno</p>
                <p className="mt-0.5 text-[17px] font-black leading-tight text-white">{kpis.closedDealsThisPeriod}</p>
              </div>
            </div>
          ) : null}
        </HeroCard>

        {/* Filters – scope + period */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <SegmentPills
            label="Rozsah"
            value={scope}
            onChange={(id) => setScope(id as TeamOverviewScope)}
            options={[
              { id: "me", label: "Já" },
              { id: "my_team", label: "Můj tým" },
              { id: "full", label: "Celý tým" },
            ]}
          />
          <SegmentPills
            label="Období"
            value={period}
            onChange={(id) => setPeriod(id as TeamOverviewPeriod)}
            options={[
              { id: "week", label: "Týden" },
              { id: "month", label: "Měsíc" },
              { id: "quarter", label: "Kvartál" },
            ]}
          />
        </div>

        {/* Hierarchy warning */}
        {kpis && scope !== "me" && !kpis.hierarchyParentLinksConfigured ? (
          <InlineAlert
            tone="warning"
            title="Hierarchie není kompletně nastavena"
            description="Chybí vazby nadřízenosti — „Můj tým“ může zobrazit jen vás. Doplňte parent_id u členů v Nastavení → Tým."
          />
        ) : null}

        {/* Kokpit – čtyři klíčové metriky */}
        {kpis ? (
          <MetricGrid cols={isTablet ? 4 : 2}>
            <KpiCard
              label="Produkce"
              value={fmtCzk(Math.round(kpis.productionThisPeriod))}
              icon={<TrendingUp size={13} />}
              health="neutral"
            />
            <KpiCard
              label="Schůzky"
              value={kpis.meetingsThisWeek}
              icon={<Calendar size={13} />}
              health="neutral"
            />
            <KpiCard
              label="Uzavřeno"
              value={kpis.closedDealsThisPeriod}
              icon={<Briefcase size={13} />}
              health="neutral"
            />
            <KpiCard
              label="Aktivní členové"
              value={`${kpis.activeMemberCount}/${kpis.memberCount}`}
              icon={<Activity size={13} />}
              health={
                kpis.riskyMemberCount > 0
                  ? kpis.riskyMemberCount >= Math.max(1, Math.round(kpis.memberCount / 2))
                    ? "critical"
                    : "warning"
                  : "ok"
              }
            />
          </MetricGrid>
        ) : null}

        {/* AI insight na kritické alerty */}
        {criticalAlerts.length > 0 ? (
          <AIInsightCard
            title="Rizika týmu"
            insight={criticalAlerts[0].title}
            action={
              criticalAlerts[0].description ? (
                <p className="text-xs text-violet-800/80">{criticalAlerts[0].description}</p>
              ) : null
            }
          />
        ) : null}

        {/* Tabs – Členové / Alerty */}
        <SegmentPills
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

        {activeTab === "members" ? (
          <MobileSection title={`Členové týmu (${members.length})`}>
            {members.length === 0 ? (
              <EmptyState title="Žádní členové" description="Pro vybraný scope nejsou data." />
            ) : (
              <div className={cx("grid gap-2", isTablet ? "grid-cols-2" : "grid-cols-1")}>
                {members.map((member) => (
                  <MemberRow
                    key={member.userId}
                    member={member}
                    metrics={metricsByUser.get(member.userId)}
                  />
                ))}
              </div>
            )}
          </MobileSection>
        ) : null}

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
          <SegmentPills
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

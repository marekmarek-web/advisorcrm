"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  TrendingUp,
  FileText,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Coins,
  Receipt,
  FileSignature,
  BarChart3,
} from "lucide-react";
import {
  getProductionSummary,
  getContractsForPeriod,
  type PeriodType,
  type ProductionSummary,
  type ContractInPeriodRow,
} from "@/app/actions/production";
import {
  EmptyState,
  MobileCard,
  MobileSection,
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

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmt(amount: number): string {
  return amount.toLocaleString("cs-CZ");
}

function fmtCzk(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1).replace(".", ",")} M Kč`;
  if (amount >= 1_000) return `${Math.round(amount / 1_000)} tis. Kč`;
  return `${fmt(amount)} Kč`;
}

const SEGMENT_COLORS: Record<string, string> = {
  life: "bg-indigo-500",
  property: "bg-emerald-500",
  vehicle: "bg-amber-500",
  health: "bg-rose-500",
  pension: "bg-violet-500",
  investment: "bg-blue-500",
  other: "bg-[color:var(--wp-text-tertiary)]",
};

function getSegmentColor(segment: string): string {
  return SEGMENT_COLORS[segment] ?? "bg-[color:var(--wp-text-tertiary)]";
}

/* ------------------------------------------------------------------ */
/*  Summary hero (HeroCard + KPI grid)                                 */
/* ------------------------------------------------------------------ */

function SummaryHero({
  summary,
  onRefresh,
  pending,
}: {
  summary: ProductionSummary;
  onRefresh: () => void;
  pending: boolean;
}) {
  const career = summary.careerPosition;
  const bjCzkLabel =
    summary.totalBjCzk != null
      ? fmtCzk(summary.totalBjCzk)
      : career
        ? "—"
        : "Nezadaná pozice";

  return (
    <div className="space-y-3 px-4 pt-4">
      <HeroCard
        eyebrow="Produkce"
        title={summary.periodLabel}
        subtitle={
          career
            ? `Pozice: ${career.positionLabel} · ${career.bjValueCzk.toLocaleString("cs-CZ")} Kč / BJ`
            : "Nastav kariérní pozici v profilu pro přepočet BJ na Kč."
        }
        icon={<TrendingUp size={20} className="text-white" />}
        actions={
          <HeroAction onClick={onRefresh} aria-label="Obnovit">
            <RefreshCw size={13} className={cx(pending && "animate-spin")} />
            Obnovit
          </HeroAction>
        }
        meta={
          <>
            <span>{summary.totalCount} smluv</span>
            <HeroMetaDot />
            <span>{fmtCzk(summary.totalPremium)} / měs.</span>
            <HeroMetaDot />
            <span>{fmtCzk(summary.totalAnnual)} / rok</span>
          </>
        }
      />

      <MetricGrid cols={2}>
        <KpiCard
          label="Roční pojistné"
          value={fmtCzk(summary.totalAnnual)}
          icon={<Coins size={14} />}
          variant="compact"
        />
        <KpiCard
          label="Měsíční pojistné"
          value={fmtCzk(summary.totalPremium)}
          icon={<Receipt size={14} />}
          variant="compact"
        />
        <KpiCard
          label="Smluv v období"
          value={summary.totalCount}
          icon={<FileSignature size={14} />}
          variant="compact"
        />
        <KpiCard
          label="BJ → Kč"
          value={bjCzkLabel}
          icon={<BarChart3 size={14} />}
          health={career ? "ok" : "neutral"}
          variant="compact"
        />
      </MetricGrid>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Segment breakdown                                                  */
/* ------------------------------------------------------------------ */

function SegmentBreakdown({
  summary,
  isTablet,
}: {
  summary: ProductionSummary;
  isTablet: boolean;
}) {
  if (summary.rows.length === 0) {
    return (
      <MobileSection title="Breakdown">
        <EmptyState title="Žádná produkce" description="V tomto období nebyly uzavřeny žádné smlouvy." />
      </MobileSection>
    );
  }

  const maxAnnual = Math.max(...summary.rows.map((r) => r.totalAnnual), 1);

  return (
    <MobileSection title="Breakdown po segmentech">
      <div className={cx("grid gap-2", isTablet ? "grid-cols-2" : "grid-cols-1")}>
        {summary.rows.map((row) => {
          const pct = Math.round((row.totalAnnual / maxAnnual) * 100);
          const color = getSegmentColor(row.segment);
          return (
            <MobileCard key={`${row.segment}-${row.partnerName}`} className="p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={cx("w-3 h-3 rounded-full flex-shrink-0", color)} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[color:var(--wp-text)] truncate">{row.segmentLabel}</p>
                    {row.partnerName ? (
                      <p className="text-xs text-[color:var(--wp-text-secondary)] truncate">{row.partnerName}</p>
                    ) : null}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-black text-[color:var(--wp-text)]">{fmtCzk(row.totalAnnual)}</p>
                  <p className="text-[11px] text-[color:var(--wp-text-secondary)]">{row.count} smluv</p>
                </div>
              </div>
              <div className="mt-2 h-1.5 bg-[color:var(--wp-surface-muted)] rounded-full overflow-hidden">
                <div
                  className={cx("h-full rounded-full transition-all", color)}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </MobileCard>
          );
        })}
      </div>
    </MobileSection>
  );
}

/* ------------------------------------------------------------------ */
/*  Contract list (collapsible)                                        */
/* ------------------------------------------------------------------ */

function ContractList({
  contracts,
  isTablet,
}: {
  contracts: ContractInPeriodRow[];
  isTablet: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? contracts : contracts.slice(0, 5);

  if (contracts.length === 0) {
    return (
      <MobileSection title="Smlouvy v období">
        <EmptyState title="Žádné smlouvy" description="Žádné smlouvy v daném období." />
      </MobileSection>
    );
  }

  return (
    <MobileSection title={`Smlouvy v období (${contracts.length})`}>
      <div className={cx("grid gap-2", isTablet ? "grid-cols-2" : "grid-cols-1")}>
        {shown.map((contract) => (
          <MobileCard key={contract.id} className="p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <FileText size={14} className="text-[color:var(--wp-text-tertiary)] flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[color:var(--wp-text)] truncate">
                    {contract.contractNumber ?? "Bez čísla"}
                  </p>
                  <p className="text-xs text-[color:var(--wp-text-secondary)] mt-0.5 truncate">
                    {contract.segmentLabel}
                    {contract.partnerName ? ` · ${contract.partnerName}` : ""}
                  </p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-black text-[color:var(--wp-text)]">
                  {fmtCzk(contract.premiumAnnual)}
                </p>
                <p className="text-[11px] text-[color:var(--wp-text-tertiary)]">
                  {contract.productionDate
                    ? new Date(contract.productionDate).toLocaleDateString("cs-CZ", {
                        day: "numeric",
                        month: "short",
                      })
                    : "—"}
                </p>
              </div>
            </div>
          </MobileCard>
        ))}
      </div>

      {contracts.length > 5 ? (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 text-sm font-bold text-indigo-600 border border-indigo-200 rounded-xl bg-indigo-50 mt-1"
        >
          {expanded ? (
            <>
              <ChevronUp size={15} /> Zobrazit méně
            </>
          ) : (
            <>
              <ChevronDown size={15} /> Zobrazit vše ({contracts.length})
            </>
          )}
        </button>
      ) : null}
    </MobileSection>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Screen                                                        */
/* ------------------------------------------------------------------ */

export function ProductionScreen({ deviceClass = "phone" }: { deviceClass?: DeviceClass }) {
  const [period, setPeriod] = useState<PeriodType>("month");
  const [summary, setSummary] = useState<ProductionSummary | null>(null);
  const [contracts, setContracts] = useState<ContractInPeriodRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [contractsError, setContractsError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isTablet = deviceClass === "tablet";

  function loadData() {
    startTransition(async () => {
      setError(null);
      setContractsError(null);
      const [summaryResult, contractsResult] = await Promise.allSettled([
        getProductionSummary(period),
        getContractsForPeriod(period),
      ]);
      if (summaryResult.status === "fulfilled") {
        setSummary(summaryResult.value);
      } else {
        const err = summaryResult.reason;
        if (typeof console !== "undefined") console.error("[ProductionScreen] summary failed", err);
        setError(err instanceof Error ? err.message : "Produkci se nepodařilo načíst.");
      }
      if (contractsResult.status === "fulfilled") {
        setContracts(contractsResult.value.rows);
      } else {
        const err = contractsResult.reason;
        if (typeof console !== "undefined") console.error("[ProductionScreen] contracts failed", err);
        setContracts([]);
        setContractsError(err instanceof Error ? err.message : "Seznam smluv se nepodařilo načíst.");
      }
    });
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  // Group rows by segment for summary chart
  const segmentTotals = useMemo(() => {
    if (!summary) return [];
    const map = new Map<string, { label: string; annual: number; count: number }>();
    for (const row of summary.rows) {
      const existing = map.get(row.segment);
      if (existing) {
        existing.annual += row.totalAnnual;
        existing.count += row.count;
      } else {
        map.set(row.segment, { label: row.segmentLabel, annual: row.totalAnnual, count: row.count });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.annual - a.annual);
  }, [summary]);

  return (
    <div
      className={cx(
        "pb-6",
        pending && summary && "opacity-60 pointer-events-none transition-opacity duration-200"
      )}
    >
      {error ? (
        <div className="px-4 pt-4">
          <InlineAlert
            tone="danger"
            title="Produkci se nepodařilo načíst"
            description={error}
            action={
              <button
                type="button"
                onClick={loadData}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 text-[11px] font-black uppercase tracking-wide text-rose-700 hover:bg-rose-50"
              >
                <RefreshCw size={12} /> Zkusit znovu
              </button>
            }
          />
        </div>
      ) : null}

      {summary ? (
        <SummaryHero summary={summary} onRefresh={loadData} pending={pending} />
      ) : null}
      {pending && !summary ? (
        <div className="px-4 pt-4">
          <div className="h-32 animate-pulse rounded-[var(--wp-radius-card)] bg-gradient-to-br from-[var(--aidv-hero-navy)] to-indigo-950 opacity-60" />
        </div>
      ) : null}

      {/* Period selector */}
      <div className="px-4 pt-3">
        <SegmentPills
          label="Období"
          value={period}
          onChange={(id) => setPeriod(id as PeriodType)}
          options={[
            { id: "month", label: "Měsíc" },
            { id: "quarter", label: "Kvartál" },
            { id: "year", label: "Rok" },
          ]}
        />
      </div>

      {pending && !summary ? (
        <div className="min-h-[50vh] px-4 pt-3 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-2xl bg-[color:var(--wp-surface-card-border)]/70 animate-pulse" />
            ))}
          </div>
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 rounded-2xl bg-[color:var(--wp-surface-card-border)]/70 animate-pulse" />
            ))}
          </div>
        </div>
      ) : null}

      {/* Content */}
      {summary ? (
        <>
          {/* Segment mini-chart */}
          {segmentTotals.length > 0 ? (
            <MobileSection title="Přehled segmentů">
              <MobileCard className="p-4">
                <div className="space-y-2.5">
                  {segmentTotals.map((seg) => {
                    const totalAnnual = summary.totalAnnual || 1;
                    const pct = Math.round((seg.annual / totalAnnual) * 100);
                    const color = getSegmentColor(
                      Object.keys(SEGMENT_COLORS).find((k) =>
                        seg.label.toLowerCase().includes(k)
                      ) ?? "other"
                    );
                    return (
                      <div key={seg.label}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <div className={cx("w-2.5 h-2.5 rounded-full flex-shrink-0", color)} />
                            <span className="text-xs font-bold text-[color:var(--wp-text-secondary)]">{seg.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[color:var(--wp-text-secondary)]">{seg.count}×</span>
                            <span className="text-xs font-black text-[color:var(--wp-text)]">{fmtCzk(seg.annual)}</span>
                            <span className="text-[11px] text-[color:var(--wp-text-tertiary)] w-8 text-right">{pct}%</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-[color:var(--wp-surface-muted)] rounded-full overflow-hidden">
                          <div
                            className={cx("h-full rounded-full transition-all", color)}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </MobileCard>
            </MobileSection>
          ) : null}

          <SegmentBreakdown summary={summary} isTablet={isTablet} />
          {contractsError ? (
            <div className="px-4 pt-2">
              <InlineAlert
                tone="warning"
                title="Seznam smluv se nepodařilo načíst"
                description={contractsError}
                action={
                  <button
                    type="button"
                    onClick={loadData}
                    className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 text-[11px] font-black uppercase tracking-wide text-amber-700 hover:bg-amber-50"
                  >
                    <RefreshCw size={12} /> Zkusit znovu
                  </button>
                }
              />
            </div>
          ) : (
            <ContractList contracts={contracts} isTablet={isTablet} />
          )}
        </>
      ) : null}

      {!pending && summary && summary.totalCount === 0 ? (
        <MobileSection>
          <EmptyState
            title="Žádná produkce"
            description="V tomto období nebyly uzavřeny žádné smlouvy."
          />
        </MobileSection>
      ) : null}
    </div>
  );
}

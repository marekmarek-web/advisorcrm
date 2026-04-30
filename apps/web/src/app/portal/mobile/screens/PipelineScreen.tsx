"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowRight,
  ArrowRightLeft,
  Banknote,
  Briefcase,
  Calendar,
  ChevronRight,
  Clock,
  Pencil,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
import type { StageWithOpportunities, OpportunityCard } from "@/app/actions/pipeline";
import { closeOpportunity, deleteOpportunity, updateOpportunity } from "@/app/actions/pipeline";
import {
  BottomSheet,
  EmptyState,
  MobileCard,
  MobileLoadingState,
  Toast,
  useToast,
} from "@/app/shared/mobile-ui/primitives";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";
import { useConfirm } from "@/app/components/ConfirmDialog";
import { triggerConfettiBurstFromRect } from "@/app/lib/confetti-burst";

type OppSelected = OpportunityCard & { stageName: string; stageId: string; stageSortOrder: number };
type EnrichedStage = StageWithOpportunities & {
  index: number;
  displayName: string;
  totalValue: number;
  riskCount: number;
};

type StagePalette = {
  gradient: string;
  soft: string;
  icon: string;
  text: string;
  border: string;
  shadow: string;
};

const STAGE_PALETTES: StagePalette[] = [
  {
    gradient: "from-emerald-500 via-teal-500 to-cyan-500",
    soft: "bg-emerald-50 text-emerald-700 border-emerald-100",
    icon: "bg-gradient-to-br from-emerald-500 to-cyan-500",
    text: "text-emerald-700",
    border: "border-l-emerald-500",
    shadow: "shadow-[0_24px_60px_-30px_rgba(16,185,129,.62)]",
  },
  {
    gradient: "from-sky-500 via-blue-500 to-indigo-500",
    soft: "bg-sky-50 text-sky-700 border-sky-100",
    icon: "bg-gradient-to-br from-sky-500 to-indigo-500",
    text: "text-sky-700",
    border: "border-l-sky-500",
    shadow: "shadow-[0_24px_60px_-30px_rgba(14,165,233,.62)]",
  },
  {
    gradient: "from-violet-500 via-indigo-500 to-blue-900",
    soft: "bg-violet-50 text-violet-700 border-violet-100",
    icon: "bg-gradient-to-br from-violet-500 to-blue-900",
    text: "text-violet-700",
    border: "border-l-violet-500",
    shadow: "shadow-[0_24px_60px_-30px_rgba(99,102,241,.65)]",
  },
  {
    gradient: "from-orange-400 via-orange-500 to-amber-700",
    soft: "bg-orange-50 text-orange-700 border-orange-100",
    icon: "bg-gradient-to-br from-orange-400 to-amber-700",
    text: "text-orange-700",
    border: "border-l-orange-500",
    shadow: "shadow-[0_24px_60px_-30px_rgba(249,115,22,.65)]",
  },
  {
    gradient: "from-rose-500 via-pink-600 to-fuchsia-700",
    soft: "bg-rose-50 text-rose-700 border-rose-100",
    icon: "bg-gradient-to-br from-rose-500 to-fuchsia-700",
    text: "text-rose-700",
    border: "border-l-rose-500",
    shadow: "shadow-[0_24px_60px_-30px_rgba(244,63,94,.68)]",
  },
  {
    gradient: "from-zinc-700 via-zinc-800 to-zinc-950",
    soft: "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] border-[color:var(--wp-surface-card-border)]",
    icon: "bg-gradient-to-br from-zinc-700 to-zinc-950",
    text: "text-[color:var(--wp-text-secondary)]",
    border: "border-l-[color:var(--wp-border-strong)]",
    shadow: "shadow-[0_24px_60px_-30px_rgba(15,23,42,.45)]",
  },
];

const MOCK_ALIGNED_STAGE_LABELS = [
  "Začínáme",
  "Analýza potřeb",
  "Šla nabídka",
  "Před uzavřením",
  "Realizace",
] as const;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function paletteForIndex(index: number): StagePalette {
  return STAGE_PALETTES[index % STAGE_PALETTES.length]!;
}

function parseMoney(value: string | null | undefined): number {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatMoneyFull(value: number | string | null | undefined): string {
  const n = typeof value === "number" ? value : parseMoney(value);
  if (!Number.isFinite(n) || n <= 0) return "0 Kč";
  return `${Math.round(n).toLocaleString("cs-CZ")} Kč`;
}

function formatMoneyShort(value: number | string | null | undefined): string {
  const n = typeof value === "number" ? value : parseMoney(value);
  if (!Number.isFinite(n) || n <= 0) return "0 Kč";

  if (n >= 1_000_000) {
    const amount = n / 1_000_000;
    return `${amount.toLocaleString("cs-CZ", {
      maximumFractionDigits: amount >= 10 ? 0 : 1,
    })} mil. Kč`;
  }

  if (n >= 1000) {
    return `${Math.round(n / 1000).toLocaleString("cs-CZ")} tis. Kč`;
  }

  return `${Math.round(n).toLocaleString("cs-CZ")} Kč`;
}

function formatCaseCount(count: number): string {
  if (count === 1) return "1 případ";
  if (count >= 2 && count <= 4) return `${count} případy`;
  return `${count} případů`;
}

function formatCaseNoun(count: number): string {
  return formatCaseCount(count).replace(String(count), "").trim();
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function isOverdue(opp: OpportunityCard): boolean {
  return Boolean(opp.expectedCloseDate && opp.expectedCloseDate < todayYmd());
}

function daysUntil(dateYmd: string): number {
  const today = new Date(todayYmd());
  const target = new Date(dateYmd);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function formatCloseDate(d: string | null): string {
  if (!d) return "Bez termínu";
  if (d < todayYmd()) return "Po termínu";
  const diff = daysUntil(d);
  if (diff === 0) return "Dnes";
  if (diff === 1) return "Zítra";
  if (diff <= 7) return `${diff} dní`;
  return new Date(d).toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function getNextStepLabel(opp: OpportunityCard): string {
  if (opp.aiSubtitle?.trim()) return opp.aiSubtitle.trim();
  if (opp.expectedCloseDate) return `Termín: ${formatCloseDate(opp.expectedCloseDate)}`;
  if (opp.contactName && opp.contactName !== "—") return "Navázat na klienta";
  return "Doplnit další krok";
}

function selectFocusDeal(rows: OppSelected[]): OppSelected | null {
  if (rows.length === 0) return null;
  const risk = rows
    .filter(isOverdue)
    .sort((a, b) => (a.expectedCloseDate ?? "").localeCompare(b.expectedCloseDate ?? ""))[0];
  if (risk) return risk;

  const withValue = rows
    .filter((row) => parseMoney(row.expectedValue) > 0)
    .sort((a, b) => parseMoney(b.expectedValue) - parseMoney(a.expectedValue))[0];
  if (withValue) return withValue;

  const withDate = rows
    .filter((row) => row.expectedCloseDate)
    .sort((a, b) => (a.expectedCloseDate ?? "").localeCompare(b.expectedCloseDate ?? ""))[0];
  return withDate ?? null;
}

function DealsSummaryCard({
  totalCount,
  totalValue,
  riskCount,
  focusCount,
}: {
  totalCount: number;
  totalValue: number;
  riskCount: number;
  focusCount: number;
}) {
  return (
    <section className="grid grid-cols-2 gap-4">
      <div className="relative col-span-2 min-h-[238px] overflow-hidden rounded-[36px] bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-800 p-6 text-white shadow-[0_28px_70px_-28px_rgba(37,99,235,.62)]">
        <div className="absolute -left-10 -top-12 h-44 w-44 rounded-full bg-white/10" aria-hidden />
        <div className="absolute -bottom-16 right-0 h-44 w-44 rounded-full bg-indigo-950/20 blur-md" aria-hidden />
        <div className="absolute right-7 top-7 rounded-full border border-white/20 bg-white/15 px-4 py-2 text-[13px] font-black backdrop-blur-md">
          {formatMoneyShort(totalValue)}
        </div>
        <div className="relative">
          <TrendingUp size={30} strokeWidth={2.5} className="mb-8 text-white drop-shadow-sm" aria-hidden />
          <p className="text-[15px] font-black text-white/85">Potenciál obchodů</p>
          <div className="mt-2 flex items-end gap-3">
            <span className="text-[58px] font-black leading-none tracking-tight">{totalCount}</span>
            <span className="pb-2 text-[18px] font-bold text-white/72">{formatCaseNoun(totalCount)}</span>
          </div>
          <p className="mt-4 text-sm font-semibold leading-snug text-white/72">
            Aktivní obchodní příležitosti poradce
          </p>
        </div>
      </div>

      <div className="relative min-h-[176px] overflow-hidden rounded-[32px] bg-gradient-to-br from-orange-400 via-orange-500 to-amber-700 p-5 text-white shadow-[0_24px_58px_-26px_rgba(249,115,22,.62)]">
        <div className="absolute -left-8 -top-10 h-32 w-32 rounded-full bg-white/12" aria-hidden />
        <div className="relative">
          <div className="mb-7 flex items-start justify-between gap-2">
            <Clock size={22} className="text-white drop-shadow-sm" aria-hidden />
            <span className="rounded-full border border-white/20 bg-white/15 px-2.5 py-1 text-[10px] font-black">
              risk
            </span>
          </div>
          <p className="text-sm font-black text-white/84">Rizikové</p>
          <p className="mt-2 text-[44px] font-black leading-none">{riskCount}</p>
          <p className="mt-3 text-xs font-semibold text-white/72">{riskCount > 0 ? "ke kontrole" : "Bez rizik"}</p>
        </div>
      </div>

      <div className="relative min-h-[176px] overflow-hidden rounded-[32px] bg-gradient-to-br from-violet-500 via-indigo-500 to-zinc-950 p-5 text-white shadow-[0_24px_58px_-26px_rgba(99,102,241,.62)]">
        <div className="absolute -left-8 -top-10 h-32 w-32 rounded-full bg-white/12" aria-hidden />
        <div className="relative">
          <div className="mb-7 flex items-start justify-between gap-2">
            <Target size={22} className="text-white drop-shadow-sm" aria-hidden />
            <span className="rounded-full border border-white/20 bg-white/15 px-2.5 py-1 text-[10px] font-black">
              fokus
            </span>
          </div>
          <p className="text-sm font-black text-white/84">Ve fokusu</p>
          <p className="mt-2 text-[44px] font-black leading-none">{focusCount}</p>
          <p className="mt-3 text-xs font-semibold text-white/72">
            {focusCount > 0 ? "prioritně" : "Bez fokusu"}
          </p>
        </div>
      </div>
    </section>
  );
}

function FocusDealCard({
  deal,
  riskCount,
  onOpen,
}: {
  deal: OppSelected | null;
  riskCount: number;
  onOpen: (deal: OppSelected) => void;
}) {
  return (
    <section className="relative overflow-hidden rounded-[34px] bg-[color:var(--wp-text)] p-5 text-white shadow-[0_24px_64px_-24px_rgba(15,23,42,.48)]">
      <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-indigo-500/30 blur-[58px]" aria-hidden />
      <div className="absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-violet-500/20 blur-[58px]" aria-hidden />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-violet-100 ring-1 ring-white/15">
              <Sparkles size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/55">
                Fokus obchody
              </p>
              <p className="mt-1 text-[13px] font-semibold text-white/70">Priorita pro dnešek</p>
            </div>
          </div>
          {riskCount > 0 ? (
            <span className="shrink-0 rounded-full bg-rose-500/16 px-3 py-1.5 text-[11px] font-black text-rose-100 ring-1 ring-rose-300/20">
              {riskCount} risk
            </span>
          ) : null}
        </div>

        <div className="mt-6">
          <h2 className="text-[25px] font-black leading-[1.08] tracking-tight">
            {deal?.title ?? "Žádný focus obchod"}
          </h2>
          <div className="mt-3 flex min-w-0 items-center gap-2 text-[13px] font-semibold text-white/64">
            <span className="min-w-0 truncate">{deal?.contactName ?? "Bez prioritního případu"}</span>
            <span className="shrink-0">•</span>
            <span className="shrink-0 whitespace-nowrap">{deal ? formatMoneyFull(deal.expectedValue) : "0 Kč"}</span>
          </div>
          <p className="mt-3 text-[13px] font-semibold text-white/52">
            {deal ? `Další krok: ${getNextStepLabel(deal)}` : "Fallback: nejsou dostupná data pro focus deal."}
          </p>
        </div>

        <button
          type="button"
          disabled={!deal}
          onClick={() => deal && onOpen(deal)}
          className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[20px] bg-white text-sm font-black text-[color:var(--wp-text)] shadow-[0_12px_30px_-16px_rgba(255,255,255,.8)] active:scale-[.98] disabled:opacity-55"
        >
          {deal ? "Otevřít detail" : "Bez detailu"}
          {deal ? <ArrowRight size={18} /> : null}
        </button>
      </div>
    </section>
  );
}

function PipelinePhaseHeroCard({
  stage,
  active,
  onClick,
}: {
  stage: EnrichedStage;
  active: boolean;
  onClick: () => void;
}) {
  const palette = paletteForIndex(stage.index);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "relative min-h-[166px] overflow-hidden rounded-[32px] bg-gradient-to-br p-5 text-left text-white transition-transform active:scale-[.985]",
        stage.index === 0 && "col-span-2 min-h-[188px]",
        palette.gradient,
        palette.shadow,
        active ? "ring-[3px] ring-white/95" : "ring-1 ring-white/20"
      )}
    >
      <div className="absolute -left-10 -top-10 h-36 w-36 rounded-full bg-white/12" aria-hidden />
      <div className="absolute -bottom-12 right-0 h-32 w-32 rounded-full bg-black/12 blur-sm" aria-hidden />
      <div className="relative">
        <div className="mb-6 flex items-start justify-between gap-3">
          <span className="text-[22px] font-black leading-none text-white drop-shadow-sm tabular-nums">{stage.index + 1}</span>
          <span className="shrink-0 rounded-full border border-white/20 bg-white/15 px-3 py-1.5 text-[11px] font-black backdrop-blur-md">
            {formatMoneyShort(stage.totalValue)}
          </span>
        </div>
        <p className={cx("font-black text-white/90", stage.index === 0 ? "text-[18px]" : "text-[15px]")}>
          {stage.displayName}
        </p>
        <div className="mt-3 flex items-end gap-2">
          <span className={cx("font-black leading-none tracking-tight", stage.index === 0 ? "text-[46px]" : "text-[38px]")}>{stage.opportunities.length}</span>
          <span className="pb-1 text-sm font-bold text-white/74">{formatCaseNoun(stage.opportunities.length)}</span>
        </div>
      </div>
    </button>
  );
}

function MobileDealCard({
  deal,
  palette,
  onOpen,
  onOpenMove,
}: {
  deal: OppSelected;
  palette: StagePalette;
  onOpen: () => void;
  onOpenMove: () => void;
}) {
  const overdue = isOverdue(deal);
  return (
    <div
      className={cx(
        "overflow-hidden rounded-[26px] border bg-white/96 shadow-[0_15px_34px_-26px_rgba(15,23,42,.28)] ring-1 ring-[color:var(--wp-surface-card-border)] backdrop-blur-xl",
        overdue ? "border-rose-200" : "border-white/80"
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_74px]">
        <button type="button" onClick={onOpen} className="min-w-0 p-[18px] text-left active:bg-[color:var(--wp-surface-muted)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex min-w-0 items-center gap-2">
                <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-xl text-white", palette.icon)}>
                  <Briefcase size={16} />
                </span>
                <h3 className="line-clamp-2 text-[17px] font-black leading-[1.15] tracking-tight text-[color:var(--wp-text)]">
                  {deal.title}
                </h3>
              </div>
              <p className="text-[11px] font-black uppercase tracking-[0.1em] text-[color:var(--wp-text-tertiary)]">
                {deal.caseType || "Jiné"}
              </p>
            </div>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-tertiary)]">
              <ChevronRight size={17} />
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {deal.contactName && deal.contactName !== "—" ? (
              <span className="inline-flex max-w-[145px] items-center gap-1.5 rounded-full bg-[color:var(--wp-surface-muted)] px-2.5 py-1.5 text-[11px] font-black text-[color:var(--wp-text-secondary)]">
                <Users size={13} />
                <span className="truncate">{deal.contactName}</span>
              </span>
            ) : null}
            {parseMoney(deal.expectedValue) > 0 ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1.5 text-[11px] font-black text-emerald-700">
                <Banknote size={13} />
                <span className="whitespace-nowrap">{formatMoneyShort(deal.expectedValue)}</span>
              </span>
            ) : null}
            {deal.expectedCloseDate ? (
              <span
                className={cx(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-black",
                  overdue ? "bg-rose-50 text-rose-600" : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]"
                )}
              >
                <Calendar size={13} />
                <span className="whitespace-nowrap">{formatCloseDate(deal.expectedCloseDate)}</span>
              </span>
            ) : null}
          </div>

          <p className="mt-3 line-clamp-1 text-xs font-semibold text-[color:var(--wp-text-secondary)]">
            Další krok: {getNextStepLabel(deal)}
          </p>
        </button>

        <button
          type="button"
          onClick={onOpenMove}
          className="flex min-h-[44px] flex-col items-center justify-center gap-2 border-l border-[color:var(--wp-surface-card-border)] bg-white/80 text-[color:var(--wp-text-secondary)] active:bg-[color:var(--wp-surface-muted)]"
          aria-label="Přesunout fázi"
        >
          <ArrowRightLeft size={23} />
          <span className="text-[10px] font-black uppercase tracking-[0.12em]">Fáze</span>
        </button>
      </div>
    </div>
  );
}

function PipelinePhaseSection({
  stage,
  onOpenDeal,
  onOpenMove,
}: {
  stage: EnrichedStage;
  onOpenDeal: (deal: OppSelected) => void;
  onOpenMove: (deal: OppSelected) => void;
}) {
  const palette = paletteForIndex(stage.index);
  return (
    <section className="space-y-3 rounded-[34px] border border-white/75 bg-white/54 p-3 shadow-[0_18px_42px_-32px_rgba(15,23,42,.24)] ring-1 ring-[color:var(--wp-surface-card-border)] backdrop-blur-xl">
      <div className={cx("relative overflow-hidden rounded-[28px] bg-gradient-to-br p-4 text-white", palette.gradient, palette.shadow)}>
        <div className="absolute -left-9 -top-9 h-28 w-28 rounded-full bg-white/12" aria-hidden />
        <div className="absolute -bottom-10 right-0 h-28 w-28 rounded-full bg-black/10 blur-sm" aria-hidden />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="shrink-0 text-xl font-black text-white drop-shadow-sm tabular-nums">{stage.index + 1}</span>
            <div className="min-w-0">
              <h2 className="truncate text-[17px] font-black">{stage.displayName}</h2>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[20px] font-black leading-none">{stage.opportunities.length}</p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.1em] text-white/65">
              {formatMoneyShort(stage.totalValue)}
            </p>
          </div>
        </div>
      </div>

      {stage.opportunities.length === 0 ? (
        <p className="px-2 py-4 text-center text-xs font-semibold text-[color:var(--wp-text-tertiary)]">
          Prázdná fáze
        </p>
      ) : (
        <div className="space-y-3">
          {stage.opportunities.map((opp) => {
            const deal = {
              ...opp,
              stageName: stage.displayName,
              stageId: stage.id,
              stageSortOrder: stage.sortOrder,
            };
            return (
              <MobileDealCard
                key={opp.id}
                deal={deal}
                palette={palette}
                onOpen={() => onOpenDeal(deal)}
                onOpenMove={() => onOpenMove(deal)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function MoveDealStageSheet({
  deal,
  stages,
  onClose,
  onMove,
}: {
  deal: OppSelected | null;
  stages: EnrichedStage[];
  onClose: () => void;
  onMove: (toStageId: string) => void;
}) {
  if (!deal) return null;
  return (
    <BottomSheet open onClose={onClose} title="Přesunout případ">
      <div className="space-y-4">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[19px] border border-indigo-200 bg-indigo-50 text-indigo-600">
            <ArrowRightLeft size={24} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[color:var(--wp-text-tertiary)]">
              Přesunout případ
            </p>
            <h3 className="mt-1 line-clamp-2 text-[23px] font-black leading-[1.08] tracking-tight text-[color:var(--wp-text)]">
              {deal.title}
            </h3>
            <p className="mt-2 text-sm font-semibold text-[color:var(--wp-text-secondary)]">
              Aktuální fáze: <span className="font-black text-[color:var(--wp-text)]">{deal.stageName}</span>
            </p>
          </div>
        </div>

        <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[color:var(--wp-text-tertiary)]">Vyberte fázi</p>
        <div className="space-y-3">
          {stages.map((stage) => {
            const active = stage.id === deal.stageId;
            const palette = paletteForIndex(stage.index);
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => {
                  if (!active) onMove(stage.id);
                  onClose();
                }}
                className={cx(
                  "flex w-full items-center justify-between rounded-[22px] border px-4 py-4 text-left shadow-sm active:scale-[.99]",
                  active ? "border-indigo-200 bg-indigo-50" : "border-[color:var(--wp-surface-card-border)] bg-white"
                )}
              >
                <span className="flex min-w-0 items-center gap-3.5">
                  <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-[15px] text-white", palette.icon)}>
                    <span className="text-sm font-black">{stage.index + 1}</span>
                  </span>
                  <span className="min-w-0">
                    <span className={cx("block text-[16px] font-black", active ? "text-indigo-600" : "text-[color:var(--wp-text)]")}>
                      {stage.displayName}
                    </span>
                  </span>
                </span>
                {active ? (
                  <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-indigo-600">
                    Aktuální
                  </span>
                ) : (
                  <ArrowRight size={18} className="shrink-0 text-[color:var(--wp-text-tertiary)]" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </BottomSheet>
  );
}

function OpportunityDetailSheet({
  opp,
  stages,
  contactOptions,
  onClose,
  onMove,
  onOpenContact,
  onAfterMutation,
}: {
  opp: OppSelected;
  stages: EnrichedStage[];
  contactOptions: Array<{ id: string; label: string }>;
  onClose: () => void;
  onMove: (toStageId: string) => void;
  onOpenContact: (contactId: string) => void;
  onAfterMutation: () => void;
}) {
  const { toast, showToast, dismissToast } = useToast();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const soldButtonRef = useRef<HTMLButtonElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(opp.title);
  const [caseType, setCaseType] = useState(opp.caseType || "");
  const [expectedValue, setExpectedValue] = useState(opp.expectedValue || "");
  const [expectedCloseDate, setExpectedCloseDate] = useState(opp.expectedCloseDate ? opp.expectedCloseDate.slice(0, 10) : "");
  const [contactId, setContactId] = useState(opp.contactId || "");

  function runMutation(fn: () => Promise<void>, okMsg: string, celebrate?: boolean) {
    startTransition(async () => {
      try {
        await fn();
        showToast(okMsg, "success");
        if (celebrate) {
          triggerConfettiBurstFromRect(soldButtonRef.current?.getBoundingClientRect() ?? null);
        }
        onAfterMutation();
        onClose();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Akce selhala.", "error");
      }
    });
  }

  return (
    <>
      {toast ? <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} /> : null}
      <BottomSheet open title={opp.title} onClose={onClose}>
        <div className="space-y-4">
          <MobileCard className="space-y-3 bg-[color:var(--wp-text)] p-4 text-white">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Obchodní případ</p>
            <h2 className="text-xl font-black leading-tight">{opp.title}</h2>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-black">{opp.stageName}</span>
              <span className="rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-black">{opp.caseType || "Jiné"}</span>
              {parseMoney(opp.expectedValue) > 0 ? (
                <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-black text-emerald-100">
                  {formatMoneyFull(opp.expectedValue)}
                </span>
              ) : null}
            </div>
          </MobileCard>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              disabled={pending}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm font-bold text-[color:var(--wp-text-secondary)] active:scale-[0.98] disabled:opacity-50"
            >
              <Pencil size={14} /> {editing ? "Zrušit úpravy" : "Upravit"}
            </button>
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  if (
                    !(await confirm({
                      title: "Smazat případ",
                      message: "Opravdu chcete smazat tento případ?",
                      confirmLabel: "Smazat",
                      variant: "destructive",
                    }))
                  ) {
                    return;
                  }
                  runMutation(() => deleteOpportunity(opp.id), "Případ byl smazán.");
                })();
              }}
              disabled={pending}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-rose-200 px-3 text-sm font-bold text-rose-600 active:scale-[0.98] disabled:opacity-50"
            >
              <Trash2 size={14} /> Smazat
            </button>
          </div>

          {editing ? (
            <div className="space-y-3 rounded-[24px] border border-[color:var(--wp-surface-card-border)] bg-white p-4">
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-wider text-[color:var(--wp-text-secondary)]">Název</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-wider text-[color:var(--wp-text-secondary)]">Typ / produkt</span>
                <input
                  value={caseType}
                  onChange={(e) => setCaseType(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
                />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[color:var(--wp-text-secondary)]">Hodnota Kč</span>
                  <input
                    value={expectedValue}
                    onChange={(e) => setExpectedValue(e.target.value)}
                    inputMode="decimal"
                    className="mt-1 w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[color:var(--wp-text-secondary)]">Datum uzavření</span>
                  <input
                    type="date"
                    value={expectedCloseDate}
                    onChange={(e) => setExpectedCloseDate(e.target.value)}
                    className="mt-1 w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-wider text-[color:var(--wp-text-secondary)]">Klient</span>
                <select
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white px-3 text-sm"
                >
                  <option value="">— bez klienta —</option>
                  {contactOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={pending || !title.trim()}
                onClick={() =>
                  runMutation(
                    () =>
                      updateOpportunity(opp.id, {
                        title: title.trim(),
                        caseType: caseType.trim() || undefined,
                        expectedValue: expectedValue.trim() || null,
                        expectedCloseDate: expectedCloseDate || null,
                        contactId: contactId || null,
                      }),
                    "Změny uloženy."
                  )
                }
                className="w-full min-h-[48px] rounded-xl bg-indigo-600 text-sm font-black text-white active:scale-[0.98] disabled:opacity-40"
              >
                {pending ? "Ukládám…" : "Uložit změny"}
              </button>
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)]">Posunout do fáze</p>
            <div className="space-y-2">
              {stages.map((stage) => {
                const active = stage.id === opp.stageId;
                const palette = paletteForIndex(stage.index);
                return (
                  <button
                    key={stage.id}
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (!active) onMove(stage.id);
                    }}
                    className={cx(
                      "flex w-full min-h-[44px] items-center justify-between rounded-xl border px-4 text-left text-sm font-semibold active:scale-[0.99] disabled:opacity-50",
                      active ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)]",
                      "border-l-4",
                      palette.border
                    )}
                  >
                    {stage.displayName}
                    {active ? <span className="text-[10px] font-black uppercase text-indigo-500">Aktuální</span> : <ArrowRight size={14} />}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)]">Uzavřít případ</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                ref={soldButtonRef}
                type="button"
                disabled={pending}
                onClick={() => {
                  void (async () => {
                    if (
                      !(await confirm({
                        title: "Uzavřít případ",
                        message: "Označit tento případ jako prodaný?",
                        confirmLabel: "Prodáno",
                      }))
                    ) {
                      return;
                    }
                    runMutation(() => closeOpportunity(opp.id, true), "Případ uzavřen jako prodaný.", true);
                  })();
                }}
                className="flex min-h-[44px] items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-black text-emerald-800 active:scale-[0.98] disabled:opacity-50"
              >
                Prodáno
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  void (async () => {
                    if (
                      !(await confirm({
                        title: "Uzavřít případ",
                        message: "Označit tento případ jako neprodaný?",
                        confirmLabel: "Neprodáno",
                        variant: "destructive",
                      }))
                    ) {
                      return;
                    }
                    runMutation(() => closeOpportunity(opp.id, false), "Případ uzavřen jako neprodaný.");
                  })();
                }}
                className="flex min-h-[44px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-xs font-black text-rose-700 active:scale-[0.98] disabled:opacity-50"
              >
                Neprodáno
              </button>
            </div>
          </div>

          {opp.contactId ? (
            <button
              type="button"
              onClick={() => onOpenContact(opp.contactId!)}
              className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[color:var(--wp-surface-card-border)] text-sm font-bold text-[color:var(--wp-text-secondary)] active:scale-[0.98]"
            >
              <Users size={14} /> Otevřít klienta <ChevronRight size={14} />
            </button>
          ) : null}
        </div>
      </BottomSheet>
    </>
  );
}

export interface PipelineScreenProps {
  pipeline: StageWithOpportunities[];
  deviceClass: DeviceClass;
  /** Shell transition (e.g. refresh) — suppress empty-state flash while data may be stale. */
  refreshing?: boolean;
  onMoveOpportunity: (oppId: string, toStageId: string) => void;
  contactOptions: Array<{ id: string; label: string }>;
  onOpenContact: (contactId: string) => void;
  onPipelineRefresh: () => void;
}

export function PipelineScreen({
  pipeline,
  deviceClass,
  refreshing = false,
  onMoveOpportunity,
  contactOptions,
  onOpenContact,
  onPipelineRefresh,
}: PipelineScreenProps) {
  const [selectedOpp, setSelectedOpp] = useState<OppSelected | null>(null);
  const [moveSheetOpp, setMoveSheetOpp] = useState<OppSelected | null>(null);
  const [activeStageId, setActiveStageId] = useState<string | "all">("all");

  const stages = useMemo<EnrichedStage[]>(
    () =>
      pipeline.map((stage, index) => ({
        ...stage,
        index,
        displayName: MOCK_ALIGNED_STAGE_LABELS[index] ?? stage.name,
        totalValue: stage.opportunities.reduce((sum, opp) => sum + parseMoney(opp.expectedValue), 0),
        riskCount: stage.opportunities.filter(isOverdue).length,
      })),
    [pipeline]
  );

  const allDeals = useMemo<OppSelected[]>(
    () =>
      stages.flatMap((stage) =>
        stage.opportunities.map((opp) => ({
          ...opp,
          stageName: stage.displayName,
          stageId: stage.id,
          stageSortOrder: stage.sortOrder,
        }))
      ),
    [stages]
  );

  const visibleStages = activeStageId === "all" ? stages : stages.filter((stage) => stage.id === activeStageId);
  const totalCount = allDeals.length;
  const totalValue = stages.reduce((sum, stage) => sum + stage.totalValue, 0);
  const riskCount = allDeals.filter(isOverdue).length;
  const focusDeal = selectFocusDeal(allDeals);
  const focusCount = focusDeal ? 1 : 0;
  const wideLayout = deviceClass === "tablet" || deviceClass === "desktop";

  function handleMoveDeal(deal: OppSelected, toStageId: string) {
    if (toStageId === deal.stageId) return;
    onMoveOpportunity(deal.id, toStageId);
    setMoveSheetOpp(null);
    setSelectedOpp(null);
  }

  if (refreshing && pipeline.length === 0) {
    return <MobileLoadingState rows={5} variant="card" label="Načítání obchodů" />;
  }

  if (!refreshing && pipeline.length === 0) {
    return (
      <div className="space-y-5">
        <section className="pt-2">
          <h1 className="mt-1 text-[32px] font-black leading-tight tracking-tight text-[color:var(--wp-text)]">
            Obchodní nástěnka
          </h1>
        </section>
        <EmptyState title="Žádné obchody ve fázích" description="Začněte přidáním prvního případu přes centrální +." />
      </div>
    );
  }

  return (
    <div className="space-y-7 pb-6">
      <section className="pt-2">
        <h1 className="mt-1 text-[32px] font-black leading-tight tracking-tight text-[color:var(--wp-text)]">
          Obchodní nástěnka
        </h1>
      </section>

      <DealsSummaryCard
        totalCount={totalCount}
        totalValue={totalValue}
        riskCount={riskCount}
        focusCount={focusCount}
      />

      <FocusDealCard deal={focusDeal} riskCount={riskCount} onOpen={setSelectedOpp} />

      <section className="space-y-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--wp-text-secondary)]">Fáze obchodů</p>
          <p className="mt-1 text-[13px] font-semibold text-[color:var(--wp-text-secondary)]">Tapnutím zúžíte seznam obchodů.</p>
        </div>
        <div className={cx("grid grid-cols-2 gap-4", wideLayout && "mx-auto max-w-3xl")}>
          {stages.map((stage) => (
            <PipelinePhaseHeroCard
              key={stage.id}
              stage={stage}
              active={activeStageId === stage.id}
              onClick={() => setActiveStageId(activeStageId === stage.id ? "all" : stage.id)}
            />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--wp-text-secondary)]">Seznam obchodů</p>
            <p className="mt-1 text-[13px] font-semibold text-[color:var(--wp-text-secondary)]">
              {activeStageId === "all"
                ? "Všechny fáze obchodů"
                : stages.find((stage) => stage.id === activeStageId)?.displayName ?? "Vybraná fáze"}
            </p>
          </div>
          {activeStageId !== "all" ? (
            <button
              type="button"
              onClick={() => setActiveStageId("all")}
              className="min-h-[36px] rounded-full bg-white px-3 text-xs font-black text-[color:var(--wp-text-secondary)] shadow-sm ring-1 ring-[color:var(--wp-surface-card-border)]"
            >
              Vše
            </button>
          ) : null}
        </div>

        <div className="space-y-7">
          {visibleStages.map((stage) => (
            <PipelinePhaseSection
              key={stage.id}
              stage={stage}
              onOpenDeal={setSelectedOpp}
              onOpenMove={setMoveSheetOpp}
            />
          ))}
        </div>
      </section>

      <MoveDealStageSheet
        deal={moveSheetOpp}
        stages={stages}
        onClose={() => setMoveSheetOpp(null)}
        onMove={(toStageId) => {
          if (moveSheetOpp) handleMoveDeal(moveSheetOpp, toStageId);
        }}
      />

      {selectedOpp ? (
        <OpportunityDetailSheet
          opp={selectedOpp}
          stages={stages}
          contactOptions={contactOptions}
          onClose={() => setSelectedOpp(null)}
          onMove={(toStageId) => handleMoveDeal(selectedOpp, toStageId)}
          onOpenContact={onOpenContact}
          onAfterMutation={onPipelineRefresh}
        />
      ) : null}
    </div>
  );
}

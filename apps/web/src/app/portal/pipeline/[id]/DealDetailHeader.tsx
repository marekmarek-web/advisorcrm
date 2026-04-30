"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { Briefcase } from "lucide-react";
import Link from "next/link";
import {
  closeOpportunity,
  updateOpportunity,
  updateOpportunityStage,
} from "@/app/actions/pipeline";
import type { OpportunityDetail } from "@/app/actions/pipeline";
import { triggerConfettiBurstFromRect } from "@/app/lib/confetti-burst";

function parseExpectedValue(s: string | null): number {
  if (s == null || s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function DealDetailHeader({ opportunity }: { opportunity: OpportunityDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  const wonButtonRef = useRef<HTMLButtonElement | null>(null);

  const refreshOpportunityAndCaches = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.pipeline.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
    router.refresh();
  }, [queryClient, router]);
  const closedAt = opportunity.closedAt;

  const initialProb =
    opportunity.probability ?? opportunity.stageProbability ?? 0;
  const [dealPrice, setDealPrice] = useState(() =>
    Math.round(parseExpectedValue(opportunity.expectedValue)),
  );
  const [probability, setProbability] = useState(initialProb);

  useEffect(() => {
    setDealPrice(Math.round(parseExpectedValue(opportunity.expectedValue)));
    setProbability(opportunity.probability ?? opportunity.stageProbability ?? 0);
  }, [
    opportunity.id,
    opportunity.expectedValue,
    opportunity.probability,
    opportunity.stageProbability,
    opportunity.updatedAt,
  ]);

  const dealPriceRef = useRef(dealPrice);
  const probabilityRef = useRef(probability);
  dealPriceRef.current = dealPrice;
  probabilityRef.current = probability;

  const flushPrice = useCallback(() => {
    const v = dealPriceRef.current;
    const str = String(v);
    startTransition(async () => {
      try {
        await updateOpportunity(opportunity.id, { expectedValue: str });
        refreshOpportunityAndCaches();
      } catch {
        /* ignore */
      }
    });
  }, [opportunity.id, refreshOpportunityAndCaches]);

  const flushProbability = useCallback(() => {
    const p = Math.min(100, Math.max(0, Math.round(probabilityRef.current)));
    setProbability(p);
    startTransition(async () => {
      try {
        await updateOpportunity(opportunity.id, { probability: p });
        refreshOpportunityAndCaches();
      } catch {
        /* ignore */
      }
    });
  }, [opportunity.id, refreshOpportunityAndCaches]);

  const priceDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const probDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (priceDebounceRef.current) clearTimeout(priceDebounceRef.current);
      if (probDebounceRef.current) clearTimeout(probDebounceRef.current);
    };
  }, []);

  function schedulePriceSave() {
    if (priceDebounceRef.current) clearTimeout(priceDebounceRef.current);
    priceDebounceRef.current = setTimeout(() => {
      priceDebounceRef.current = null;
      flushPrice();
    }, 500);
  }

  function scheduleProbSave() {
    if (probDebounceRef.current) clearTimeout(probDebounceRef.current);
    probDebounceRef.current = setTimeout(() => {
      probDebounceRef.current = null;
      flushProbability();
    }, 500);
  }

  function handleStageChange(stageId: string) {
    if (closedAt) return;
    startTransition(async () => {
      await updateOpportunityStage(opportunity.id, stageId);
      refreshOpportunityAndCaches();
    });
  }

  function handleClose(won: boolean) {
    startTransition(async () => {
      try {
        await closeOpportunity(opportunity.id, won);
        if (won) {
          triggerConfettiBurstFromRect(wonButtonRef.current?.getBoundingClientRect() ?? null);
        }
        refreshOpportunityAndCaches();
      } catch {
        /* ignore */
      }
    });
  }

  if (closedAt) {
    return (
      <div className="bg-[color:var(--wp-surface-card)] rounded-[32px] border border-[color:var(--wp-surface-card-border)] shadow-sm p-8 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-2xl flex items-center justify-center text-[color:var(--wp-text-tertiary)] shadow-inner shrink-0">
              <Briefcase size={28} aria-hidden />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">
                Obchodní případ {opportunity.opportunityNumber}
              </p>
              <h1 className="text-3xl md:text-4xl font-black text-[color:var(--wp-text)] tracking-tight">
                {opportunity.title}
              </h1>
            </div>
          </div>
          <p className="text-sm font-semibold text-[color:var(--wp-text-secondary)]">
            Obchod uzavřen {new Date(closedAt).toLocaleDateString("cs-CZ")}
            {opportunity.closedAs === "won"
              ? " (prodáno)"
              : opportunity.closedAs === "lost"
                ? " (neprodáno)"
                : ""}
          </p>
        </div>
        {opportunity.faSourceId ? (
          <div className="mt-6">
            <Link
              href={`/portal/analyses/financial?id=${encodeURIComponent(opportunity.faSourceId)}`}
              className="inline-flex min-h-[44px] items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100"
            >
              Z finanční analýzy
            </Link>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="bg-[color:var(--wp-surface-card)] rounded-[32px] border border-[color:var(--wp-surface-card-border)] shadow-sm p-6 sm:p-8 relative overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-8">
        <div className="flex items-center gap-5 min-w-0">
          <div className="w-16 h-16 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-2xl flex items-center justify-center text-[color:var(--wp-text-tertiary)] shadow-inner shrink-0">
            <Briefcase size={28} aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">
              Obchodní případ {opportunity.opportunityNumber}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-[color:var(--wp-text)] tracking-tight">
                {opportunity.title}
              </h1>
              {opportunity.faSourceId ? (
                <Link
                  href={`/portal/analyses/financial?id=${encodeURIComponent(opportunity.faSourceId)}`}
                  className="inline-flex min-h-[44px] items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 hover:bg-amber-100"
                >
                  Z finanční analýzy
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 bg-[color:var(--wp-surface-muted)] p-4 rounded-2xl border border-[color:var(--wp-surface-card-border)] flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">
              Konečná cena
            </p>
            <div className="flex items-baseline gap-1">
              <input
                type="number"
                min={0}
                step={1}
                value={dealPrice}
                onChange={(e) => {
                  setDealPrice(Number(e.target.value));
                  schedulePriceSave();
                }}
                onBlur={flushPrice}
                className="w-24 sm:w-28 bg-transparent border-b border-[color:var(--wp-border-strong)] focus:border-indigo-500 outline-none text-xl sm:text-2xl font-black text-[color:var(--wp-text)] transition-colors min-h-[44px]"
                aria-label="Konečná cena v Kč"
              />
              <span className="text-sm font-bold text-[color:var(--wp-text-secondary)]">Kč</span>
            </div>
          </div>
          <div className="w-px h-10 bg-[color:var(--wp-surface-card-border)] hidden sm:block" aria-hidden />
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">
              Šance na úspěch
            </p>
            <div className="flex items-center gap-2">
              <div className="flex items-baseline gap-1 bg-[color:var(--wp-surface-card)] px-2 py-1 rounded-lg border border-[color:var(--wp-surface-card-border)] focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all min-h-[44px]">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={probability}
                  onChange={(e) => {
                    const v = Math.min(
                      100,
                      Math.max(0, Number(e.target.value) || 0),
                    );
                    setProbability(v);
                    scheduleProbSave();
                  }}
                  onBlur={flushProbability}
                  className="w-12 bg-transparent border-none outline-none text-xl sm:text-2xl font-black text-indigo-600 text-right"
                  aria-label="Pravděpodobnost v procentech"
                />
                <span className="text-sm font-black text-indigo-600">%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pt-6 border-t border-[color:var(--wp-surface-card-border)]">
        <div className="flex flex-wrap gap-2 flex-1">
          {opportunity.stages.map((stage) => {
            const isActive = stage.id === opportunity.stageId;
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => handleStageChange(stage.id)}
                disabled={pending}
                className={`min-h-[44px] px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors border touch-manipulation ${
                  isActive
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] border-[color:var(--wp-surface-card-border)] hover:bg-[color:var(--wp-surface-muted)] hover:border-[color:var(--wp-border-strong)] active:bg-[color:var(--wp-surface-muted)]"
                }`}
              >
                {stage.name}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 mt-2 xl:mt-0 flex-wrap">
          <button
            ref={wonButtonRef}
            type="button"
            onClick={() => handleClose(true)}
            disabled={pending}
            className="min-h-[44px] px-4 py-2.5 bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 rounded-lg text-sm font-semibold transition-colors touch-manipulation"
          >
            Prodáno
          </button>
          <button
            type="button"
            onClick={() => handleClose(false)}
            disabled={pending}
            className="min-h-[44px] px-4 py-2.5 bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-600 hover:text-white hover:border-rose-600 rounded-lg text-sm font-semibold transition-colors touch-manipulation"
          >
            Neprodáno
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-sm text-[color:var(--wp-text-secondary)]">
        <span>
          Otevřeno od{" "}
          {opportunity.createdAt
            ? new Date(opportunity.createdAt).toLocaleDateString("cs-CZ")
            : "—"}
        </span>
        <span>
          Odhad uzavření {opportunity.expectedCloseDate ?? "—"}
        </span>
      </div>
    </div>
  );
}

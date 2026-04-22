"use client";

import { useState } from "react";
import Link from "next/link";
import { Zap, ArrowUpRight, ChevronDown, ChevronUp, Info } from "lucide-react";
import type { AiOpportunity, ClientAiOpportunitiesResult } from "@/lib/ai-opportunities/types";
import clsx from "clsx";
import { getCtaForOpportunity } from "@/lib/ai-opportunities/action-cta-mapping";
import { portalPrimaryButtonClassName } from "@/lib/ui/create-action-button-styles";

const INITIAL_VISIBLE = 4;
const PRIORITY_BADGE: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Vysoká",
  2: "Vysoká",
  3: "Střední",
  4: "Nízká",
  5: "Nízká",
};

type Props = {
  contactId: string;
  data: ClientAiOpportunitiesResult;
};

export function ClientAiOpportunitiesSection({ contactId, data }: Props) {
  const [showAll, setShowAll] = useState(false);
  const { opportunities, nextBestAction, hasAnyData } = data;
  const others = nextBestAction
    ? opportunities.filter((o) => o.id !== nextBestAction.id)
    : opportunities;
  const visibleOthers = showAll ? others : others.slice(0, INITIAL_VISIBLE - 1);
  const hasMore = others.length > INITIAL_VISIBLE - 1;

  if (!hasAnyData && opportunities.length === 0) {
    return (
      <div
        className="bg-[color:var(--wp-surface-card)] rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden p-6"
        style={{ borderRadius: "var(--wp-radius-lg, 24px)" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-100">
            <Zap size={16} className="text-indigo-600" aria-hidden />
          </div>
          <h2 className="text-lg font-bold text-[color:var(--wp-text)]">AI příležitosti</h2>
        </div>
        <p className="text-sm text-[color:var(--wp-text-secondary)] mb-4">
          Pro doporučení doplňte údaje o klientovi. Založte finanční analýzu nebo přidejte první schůzku.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/portal/analyses/financial?clientId=${contactId}`}
            className={clsx(portalPrimaryButtonClassName, "px-4 py-2.5 font-semibold transition-colors")}
          >
            Založit analýzu <ArrowUpRight size={14} aria-hidden />
          </Link>
          <Link
            href={`/portal/calendar?contactId=${contactId}&newEvent=1`}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold border border-[color:var(--wp-border-strong)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] transition-colors"
          >
            Naplánovat schůzku
          </Link>
        </div>
      </div>
    );
  }

  if (opportunities.length === 0) {
    return (
      <div
        className="bg-[color:var(--wp-surface-card)] rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden p-6"
        style={{ borderRadius: "var(--wp-radius-lg, 24px)" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[color:var(--wp-surface-muted)]">
            <Zap size={16} className="text-[color:var(--wp-text-secondary)]" aria-hidden />
          </div>
          <h2 className="text-lg font-bold text-[color:var(--wp-text)]">AI příležitosti</h2>
        </div>
        <p className="text-sm text-[color:var(--wp-text-secondary)]">
          Momentálně nemáme konkrétní doporučení. Pravidelně kontrolujte schůzky a servisní termíny.
        </p>
      </div>
    );
  }

  const primaryCta = nextBestAction
    ? getCtaForOpportunity(nextBestAction, contactId)
    : null;

  return (
    <div
      className="bg-[color:var(--wp-surface-card)] rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden"
      style={{ borderRadius: "var(--wp-radius-lg, 24px)" }}
    >
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-100">
            <Zap size={16} className="text-indigo-600" aria-hidden />
          </div>
          <h2 className="text-lg font-bold text-[color:var(--wp-text)]">AI příležitosti a další krok</h2>
        </div>

        {/* Next best action card */}
        {nextBestAction && (
          <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/50 p-4 sm:p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-1">
              Další nejlepší krok
            </p>
            <h3 className="text-base font-bold text-[color:var(--wp-text)] mb-1">
              {nextBestAction.title}
            </h3>
            <p className="text-sm text-[color:var(--wp-text-secondary)] mb-3">
              {nextBestAction.explanation}
            </p>
            {nextBestAction.scope === "household" && nextBestAction.householdName && (
              <span className="inline-block text-xs font-medium text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded mb-3">
                Domácnost: {nextBestAction.householdName}
              </span>
            )}
            <SourceSignalsInline signals={nextBestAction.sourceSignals} />
            {primaryCta && (
              <Link
                href={primaryCta.href}
                className={clsx(portalPrimaryButtonClassName, "mt-4 w-full px-4 py-2.5 font-semibold transition-colors sm:w-auto")}
              >
                {primaryCta.label} <ArrowUpRight size={14} aria-hidden />
              </Link>
            )}
          </div>
        )}

        {/* Other opportunities */}
        {others.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-3">Další příležitosti</h3>
            <ul className="space-y-3">
              {visibleOthers.map((o) => (
                <OpportunityCard
                  key={o.id}
                  opportunity={o}
                  contactId={contactId}
                />
              ))}
            </ul>
            {hasMore && (
              <button
                type="button"
                onClick={() => setShowAll(!showAll)}
                className="mt-3 flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800 min-h-[44px]"
              >
                {showAll ? (
                  <>
                    <ChevronUp size={16} aria-hidden /> Zobrazit méně
                  </>
                ) : (
                  <>
                    <ChevronDown size={16} aria-hidden /> Zobrazit další (
                    {others.length - visibleOthers.length})
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function OpportunityCard({
  opportunity,
  contactId,
}: {
  opportunity: AiOpportunity;
  contactId: string;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const cta = getCtaForOpportunity(opportunity, contactId);
  const priorityLabel = PRIORITY_BADGE[opportunity.priority];

  return (
    <li className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50 p-4">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="text-xs font-medium text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-card-border)]/80 px-2 py-0.5 rounded">
          {priorityLabel}
        </span>
        {opportunity.confidence === "low" && (
          <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
            Nízká jistota
          </span>
        )}
        {opportunity.scope === "household" && opportunity.householdName && (
          <span className="text-xs font-medium text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
            Domácnost: {opportunity.householdName}
          </span>
        )}
      </div>
      <h4 className="text-sm font-semibold text-[color:var(--wp-text)]">{opportunity.title}</h4>
      <p className="text-sm text-[color:var(--wp-text-secondary)] mt-0.5">{opportunity.explanation}</p>
      <button
        type="button"
        onClick={() => setShowWhy(!showWhy)}
        className="mt-2 flex items-center gap-1 text-xs text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text-secondary)] min-h-[32px]"
      >
        <Info size={12} aria-hidden /> {showWhy ? "Skrýt proč" : "Proč"}
      </button>
      {showWhy && (
        <ul className="mt-2 pl-4 text-xs text-[color:var(--wp-text-secondary)] space-y-0.5">
          {opportunity.sourceSignals.map((s, i) => (
            <li key={i}>{s.label}</li>
          ))}
        </ul>
      )}
      {cta && (
        <Link
          href={cta.href}
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800 min-h-[44px]"
        >
          {cta.label} <ArrowUpRight size={14} aria-hidden />
        </Link>
      )}
    </li>
  );
}

function SourceSignalsInline({ signals }: { signals: AiOpportunity["sourceSignals"] }) {
  if (signals.length === 0) return null;
  return (
    <p className="text-xs text-[color:var(--wp-text-secondary)]">
      Proč: {signals.map((s) => s.label).join(" · ")}
    </p>
  );
}

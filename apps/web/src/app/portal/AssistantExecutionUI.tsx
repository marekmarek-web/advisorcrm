"use client";

/**
 * Phase 3H: Shared assistant execution UI components.
 * Used by both AiAssistantDrawer (desktop) and AiAssistantChatScreen (mobile)
 * to render confirmation previews, step outcomes, and next-step suggestions.
 */

import {
  CheckCircle2,
  XCircle,
  SkipForward,
  RefreshCw,
  AlertCircle,
  Sparkles,
  ChevronRight,
  ListChecks,
  User,
  CircleDashed,
} from "lucide-react";
import {
  getExecutionStatusInfo,
  getStepOutcomeStatusLabel,
  hasAnyFailure,
  buildOutcomeSummaryLine,
  type StepOutcomeSummary,
  type StepPreviewItem,
  type ExecutionStatus,
} from "@/lib/ai/assistant-execution-ui";
import type { SuggestedNextStepItem } from "@/lib/ai/suggested-next-step-types";
import {
  dispatchSuggestedNextStepItem,
  effectiveLegacySuggestedNextSteps,
} from "@/lib/ai/suggested-next-step-dispatch";

export {
  dispatchSuggestedNextStepItem,
  effectiveLegacySuggestedNextSteps,
} from "@/lib/ai/suggested-next-step-dispatch";

// ─── UTILITY ─────────────────────────────────────────────────────────────────

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

// ─── EXECUTION BADGE ─────────────────────────────────────────────────────────

interface ExecutionBadgeProps {
  status: ExecutionStatus;
  totalSteps?: number;
  pendingSteps?: number;
  /** If true, renders inline (compact). Otherwise block-level card. */
  inline?: boolean;
}

export function ExecutionBadge({ status, totalSteps, pendingSteps, inline }: ExecutionBadgeProps) {
  const info = getExecutionStatusInfo(status);
  if (inline) {
    return (
      <div className={cx("inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-bold", info.badgeClassName)}>
        <span>{info.text}</span>
        {totalSteps ? <span>• {totalSteps} kroků</span> : null}
        {(pendingSteps ?? 0) > 0 ? <span>• čeká {pendingSteps}</span> : null}
      </div>
    );
  }
  return (
    <div className={cx("mt-2 rounded-xl border px-3 py-2", info.badgeClassName)}>
      <p className="text-xs font-bold">
        {info.text}
        {totalSteps ? ` • ${totalSteps} kroků` : ""}
        {(pendingSteps ?? 0) > 0 ? ` • čeká: ${pendingSteps}` : ""}
      </p>
    </div>
  );
}

// ─── CONTEXT LOCK BADGE ──────────────────────────────────────────────────────

interface ContextLockBadgeProps {
  lockedClientId: string | null;
  /** Display name — shown instead of truncated UUID if available. */
  lockedClientLabel?: string | null;
  className?: string;
}

export function ContextLockBadge({ lockedClientId, lockedClientLabel, className }: ContextLockBadgeProps) {
  if (!lockedClientId) return null;
  const label = lockedClientLabel?.trim() || "Neznámý klient";
  return (
    <div
      className={cx(
        "inline-flex items-center gap-1.5 rounded-xl border border-indigo-200/80 bg-indigo-50/90 px-3 py-1.5 text-[11px] font-bold text-indigo-800 shadow-sm",
        className,
      )}
      title="Zámek kontextu — akce se vztahují k tomuto klientovi"
    >
      <User size={12} className="shrink-0 opacity-80" aria-hidden />
      <span className="text-indigo-600/90">Aktivní klient</span>
      <ChevronRight size={10} className="opacity-60" aria-hidden />
      <span className="truncate max-w-[14rem]">{label}</span>
    </div>
  );
}

// ─── CONFIRMATION PREVIEW PANEL ───────────────────────────────────────────────

interface ConfirmationPreviewPanelProps {
  stepPreviews: StepPreviewItem[];
  clientLabel?: string;
  /** Extra advisory / warning texts shown before the step list. */
  advisoryHints?: string[];
  /** If status is "draft", show different heading. */
  isDraft?: boolean;
  /** 6C: zaškrtávací výběr kroků (jen pokud mají všechny `stepId`). */
  selectable?: boolean;
  stepSelection?: Record<string, boolean>;
  onToggleStep?: (stepId: string) => void;
  /** Values for inline inputs keyed by stepId → key → value. */
  inlineValues?: Record<string, Record<string, string>>;
  onInlineChange?: (stepId: string, key: string, value: string) => void;
}

export function ConfirmationPreviewPanel({
  stepPreviews,
  clientLabel,
  advisoryHints = [],
  isDraft = false,
  selectable = false,
  stepSelection = {},
  onToggleStep,
  inlineValues = {},
  onInlineChange,
}: ConfirmationPreviewPanelProps) {
  if (stepPreviews.length === 0) return null;

  const selectionEnabled = Boolean(selectable) && stepPreviews.every((s) => Boolean(s.stepId));

  return (
    <div className="mt-3 rounded-xl border border-amber-200/90 bg-gradient-to-b from-amber-50/80 to-amber-50/40 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 bg-amber-100/50 border-b border-amber-200/80">
        <ListChecks size={15} className="text-amber-800 shrink-0" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-black uppercase tracking-wider text-amber-800">
            {isDraft ? "Chybějící informace" : "Návrh akcí"}
          </p>
          {clientLabel && (
            <p className="text-[11px] font-semibold text-amber-700/95 truncate mt-0.5" title={clientLabel}>
              Klient: {clientLabel}
            </p>
          )}
        </div>
        <span className="text-[10px] font-bold text-amber-800 bg-amber-100/90 border border-amber-200/60 rounded-lg px-2 py-0.5 tabular-nums shrink-0">
          {stepPreviews.length} {stepPreviews.length === 1 ? "krok" : stepPreviews.length < 5 ? "kroky" : "kroků"}
        </span>
      </div>

      {/* Advisory hints (missing fields, domain warnings) */}
      {advisoryHints.length > 0 && (
        <div className="px-3 pt-2.5 space-y-1.5 border-b border-amber-100/80">
          {advisoryHints.map((hint, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-[11px] text-amber-900 font-medium bg-amber-100/40 rounded-lg px-2 py-1.5 border border-amber-200/50"
            >
              <AlertCircle size={12} className="shrink-0 mt-0.5 text-amber-600" aria-hidden />
              <span>{hint}</span>
            </div>
          ))}
        </div>
      )}

      {/* Step list */}
      <div className="px-3 py-2.5 space-y-2">
        {stepPreviews.map((step, i) => {
          const sid = step.stepId;
          const rowKey = sid || `row-${i}`;
          const checked = sid ? (stepSelection[sid] ?? true) : true;
          const blocked = step.preflightStatus === "blocked";
          const needsInput = step.preflightStatus === "needs_input";
          const cannotRun = blocked || needsInput;
          return (
            <div
              key={rowKey}
              className={cx(
                "flex items-start gap-2.5 rounded-lg border px-2 py-2 transition-colors",
                selectionEnabled && sid && !checked
                  ? "border-amber-100/80 bg-amber-50/30 opacity-80"
                  : "border-amber-200/50 bg-white/40",
              )}
            >
              {selectionEnabled && sid ? (
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleStep?.(sid)}
                  className="mt-1 w-4 h-4 rounded border-amber-300 text-amber-700 focus:ring-2 focus:ring-amber-400 focus:ring-offset-0 shrink-0"
                  aria-label={`Zařadit krok: ${step.label}`}
                  disabled={cannotRun}
                  title={
                    blocked
                      ? (step.blockedReason ??
                        "Krok nelze provést — opravte formát parametrů (např. datum s časovou zónou).")
                      : needsInput
                        ? "Krok nelze zařadit — chybí povinné údaje. Doplňte je v novém zadání."
                        : undefined
                  }
                />
              ) : (
                <span className={cx(
                  "mt-0.5 w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0",
                  blocked
                    ? "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text)]"
                    : needsInput
                      ? "bg-rose-100 text-rose-700"
                      : "bg-amber-200/90 text-amber-900",
                )}>
                  {cannotRun ? "!" : (i + 1)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <span className={cx(
                  "text-[13px] font-semibold leading-snug",
                  needsInput ? "text-rose-800" : blocked ? "text-[color:var(--wp-text)]" : "text-amber-950",
                )}>{step.label}</span>
                {blocked && (
                  <span className="ml-2 align-middle text-[9px] font-bold text-[color:var(--wp-text)] bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-md px-1.5 py-0.5">
                    Blokováno
                  </span>
                )}
                {needsInput && (
                  <span className="ml-2 align-middle text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-1.5 py-0.5">
                    Chybí údaje
                  </span>
                )}
                {step.contextHint ? (
                  <span className="ml-2 align-middle text-[10px] font-semibold text-amber-800 bg-amber-100/90 border border-amber-200/60 rounded-md px-1.5 py-0.5">
                    {step.contextHint}
                  </span>
                ) : null}
                {step.description ? (
                  <p className="text-[10px] text-amber-700/90 mt-0.5 font-medium">{step.description}</p>
                ) : null}
                {step.inlineInput && step.stepId ? (
                  <div className="mt-1.5 flex flex-col gap-0.5">
                    <label className="text-[10px] font-bold text-rose-600">
                      {step.inlineInput.label}
                    </label>
                    <input
                      type="text"
                      value={inlineValues[step.stepId]?.[step.inlineInput.key] ?? step.inlineInput.prefilled ?? ""}
                      onChange={(e) => onInlineChange?.(step.stepId!, step.inlineInput!.key, e.target.value)}
                      placeholder={step.inlineInput.placeholder}
                      className="w-full rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs text-amber-950 min-h-[34px] outline-none focus:ring-2 focus:ring-rose-100 focus:border-rose-400"
                    />
                  </div>
                ) : null}
                {blocked && step.blockedReason ? (
                  <p className="text-[10px] text-[color:var(--wp-text)] mt-1 font-medium flex gap-1">
                    <AlertCircle size={10} className="shrink-0 mt-0.5" />
                    <span>{step.blockedReason}</span>
                  </p>
                ) : null}
                {(step.validationWarnings?.length ?? 0) > 0 ? (
                  <ul className="mt-1 space-y-0.5">
                    {step.validationWarnings!.map((w, wi) => (
                      <li key={wi} className="text-[10px] text-amber-800 flex gap-1">
                        <AlertCircle size={10} className="shrink-0 mt-0.5" />
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── STEP OUTCOME CARD ───────────────────────────────────────────────────────

interface StepOutcomeCardProps {
  outcomes: StepOutcomeSummary[];
  hasPartialFailure?: boolean;
}

export function StepOutcomeCard({ outcomes, hasPartialFailure }: StepOutcomeCardProps) {
  if (outcomes.length === 0) return null;
  const failed = hasAnyFailure(outcomes, hasPartialFailure);
  const borderColor = failed ? "border-rose-200 bg-rose-50/60" : "border-emerald-200 bg-emerald-50/60";

  return (
    <div className={cx("mt-2 rounded-xl border overflow-hidden", borderColor)}>
      {/* Summary header */}
      <div className={cx(
        "px-3 py-2 border-b text-[10px] font-black uppercase tracking-wider",
        failed ? "border-rose-200 bg-rose-100/40 text-rose-700" : "border-emerald-200 bg-emerald-100/40 text-emerald-700",
      )}>
        {buildOutcomeSummaryLine(outcomes)}
      </div>

      {/* Per-step outcomes */}
      <div className="px-3 py-2 space-y-1.5">
        {outcomes.map((o, i) => {
          const icon =
            o.status === "succeeded"      ? <CheckCircle2 size={13} className="text-emerald-600 shrink-0 mt-0.5" /> :
            o.status === "failed"         ? <XCircle size={13} className="text-rose-600 shrink-0 mt-0.5" /> :
            o.status === "requires_input" ? <CircleDashed size={13} className="text-amber-500 shrink-0 mt-0.5" /> :
            o.status === "skipped"        ? <SkipForward size={13} className="text-[color:var(--wp-text-tertiary)] shrink-0 mt-0.5" /> :
                                            <RefreshCw size={13} className="text-indigo-400 shrink-0 mt-0.5" />;
          return (
            <div key={i} className="flex items-start gap-1.5">
              {icon}
              <div className="min-w-0 flex-1">
                <span className={cx(
                  "text-xs",
                  o.status === "failed" ? "text-rose-700 font-semibold" :
                  o.status === "requires_input" ? "text-amber-700 font-semibold" :
                  "text-[color:var(--wp-text-secondary)]",
                )}>
                  {o.label}
                </span>
                {o.status !== "failed" && o.status !== "succeeded" && (
                  <span className="ml-1.5 text-[10px] text-[color:var(--wp-text-tertiary)]">
                    ({getStepOutcomeStatusLabel(o.status)})
                  </span>
                )}
                {o.error && (
                  <p className={cx(
                    "text-[10px] mt-0.5",
                    o.status === "requires_input" ? "text-amber-600" : "text-rose-500",
                  )}>{o.error}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SUGGESTED NEXT STEPS CHIPS ───────────────────────────────────────────────

function truncateChipLabel(label: string): string {
  return label.length > 50 ? label.slice(0, 48) + "…" : label;
}

export type SuggestedNextStepsChipsProps = {
  /** Legacy: každý řádek se odešle jako zpráva. */
  steps?: string[];
  /** Strukturované kroky (hint = jen text, focus_composer = fokus pole, send_message = odeslání). */
  stepItems?: SuggestedNextStepItem[];
  onSend?: (msg: string) => void;
  onFocusComposer?: () => void;
};

export function SuggestedNextStepsChips({
  steps = [],
  stepItems,
  onSend,
  onFocusComposer,
}: SuggestedNextStepsChipsProps) {
  const hasItems = (stepItems?.length ?? 0) > 0;
  const effectiveLegacySteps = effectiveLegacySuggestedNextSteps(steps, stepItems);
  const hasSteps = effectiveLegacySteps.length > 0;
  if (!hasItems && !hasSteps) return null;

  return (
    <div className="mt-2 space-y-1">
      <p className="text-[10px] font-black uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">
        Doporučené kroky
      </p>
      <div className="flex flex-wrap gap-1.5 items-center">
        {stepItems?.map((item, i) => {
          if (item.kind === "hint") {
            return (
              <div
                key={`hint-${i}`}
                className="w-full text-[11px] text-[color:var(--wp-text-secondary)] font-medium leading-snug pl-0.5"
              >
                {item.label}
              </div>
            );
          }
          return (
            <button
              key={`step-${i}-${item.kind}`}
              type="button"
              onClick={() => dispatchSuggestedNextStepItem(item, { onSend, onFocusComposer })}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-800 font-semibold hover:bg-indigo-100 active:bg-indigo-100 transition-colors text-left min-h-[32px]"
            >
              <Sparkles size={10} className="shrink-0 text-indigo-400" />
              {truncateChipLabel(item.label)}
            </button>
          );
        })}
        {effectiveLegacySteps.map((s, i) => (
          <button
            key={`legacy-${i}`}
            type="button"
            onClick={() => onSend?.(s)}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-800 font-semibold hover:bg-indigo-100 active:bg-indigo-100 transition-colors text-left min-h-[32px]"
          >
            <Sparkles size={10} className="shrink-0 text-indigo-400" />
            {truncateChipLabel(s)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── WARNINGS BLOCK ───────────────────────────────────────────────────────────

interface WarningsBlockProps {
  warnings: string[];
}

export function WarningsBlock({ warnings }: WarningsBlockProps) {
  if (warnings.length === 0) return null;
  return (
    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 space-y-1">
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700 font-medium">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <span>{w}</span>
        </div>
      ))}
    </div>
  );
}

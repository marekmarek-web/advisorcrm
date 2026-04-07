"use client";

import Link from "next/link";
import { Sparkles, CheckCircle2 } from "lucide-react";

export type AiProvenanceKind = "confirmed" | "auto_applied";

export type AiReviewProvenanceBadgeProps = {
  /** "confirmed" = poradce explicitně potvrdil pole, "auto_applied" = zapsáno automaticky z AI Review */
  kind: AiProvenanceKind;
  /** ID AI Review, pro odkaz na detail  */
  reviewId?: string | null;
  /** Datum potvrzení poradcem (ISO string nebo Date) */
  confirmedAt?: string | Date | null;
  /** Extra CSS třídy pro wrapping span */
  className?: string;
};

/**
 * Jemná provenance indikace pro pole pocházející z AI Review.
 * Zobrazuje se jako sekundární muted řádek pod hodnotou pole.
 *
 * kind = "confirmed"    → "Potvrzeno z AI Review"  (poradce explicitně potvrdil)
 * kind = "auto_applied" → "Převzato z AI Review"   (zapsáno automaticky)
 */
export function AiReviewProvenanceBadge({
  kind,
  reviewId,
  confirmedAt,
  className = "",
}: AiReviewProvenanceBadgeProps) {
  const label = kind === "confirmed" ? "Potvrzeno z AI Review" : "Převzato z AI Review";
  const Icon = kind === "confirmed" ? CheckCircle2 : Sparkles;
  const iconColor = kind === "confirmed" ? "text-emerald-500" : "text-indigo-400";

  const dateStr = confirmedAt
    ? new Date(confirmedAt).toLocaleDateString("cs-CZ", {
        day: "numeric",
        month: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] text-[color:var(--wp-text-tertiary)] leading-none ${className}`}
    >
      <Icon className={`w-3 h-3 shrink-0 ${iconColor}`} aria-hidden />
      {reviewId ? (
        <Link
          href={`/portal/contracts/review/${reviewId}`}
          className="hover:text-indigo-600 transition-colors underline-offset-2 hover:underline"
          title="Zobrazit AI Review"
        >
          {label}
        </Link>
      ) : (
        <span>{label}</span>
      )}
      {dateStr ? (
        <span className="opacity-70">· {dateStr}</span>
      ) : null}
    </span>
  );
}

/**
 * Pomocná funkce: ze sourceKind a advisorConfirmedAt urči provenance kind.
 * Vrací null pokud pole není z AI Review.
 */
export function resolveAiProvenanceKind(
  sourceKind: string | null | undefined,
  advisorConfirmedAt: Date | string | null | undefined,
): AiProvenanceKind | null {
  if (sourceKind !== "ai_review") return null;
  return advisorConfirmedAt ? "confirmed" : "auto_applied";
}

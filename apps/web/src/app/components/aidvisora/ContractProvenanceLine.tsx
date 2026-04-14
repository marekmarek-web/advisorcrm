"use client";

import Link from "next/link";
import { CheckCircle2, Sparkles, PenLine, FileText, Download } from "lucide-react";

type ContractProvenanceLineProps = {
  sourceKind: string;
  sourceDocumentId?: string | null;
  sourceContractReviewId?: string | null;
  advisorConfirmedAt?: Date | string | null;
  className?: string;
};

type ProvenanceConfig = {
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  iconColor: string;
};

function resolveConfig(
  sourceKind: string,
  advisorConfirmedAt?: Date | string | null,
): ProvenanceConfig {
  if (sourceKind === "ai_review") {
    return advisorConfirmedAt
      ? { label: "Z AI kontroly", icon: CheckCircle2, iconColor: "text-emerald-500" }
      : { label: "Z AI kontroly", icon: Sparkles, iconColor: "text-indigo-400" };
  }
  switch (sourceKind) {
    case "document":
      return { label: "Z dokumentu", icon: FileText, iconColor: "text-slate-400" };
    case "import":
      return { label: "Importováno", icon: Download, iconColor: "text-slate-400" };
    default:
      return { label: "Přidáno ručně", icon: PenLine, iconColor: "text-slate-400" };
  }
}

/**
 * Unified provenance indicator for contracts/products.
 * All sourceKinds share the same visual weight — icon + short label.
 */
export function ContractProvenanceLine({
  sourceKind,
  sourceDocumentId,
  sourceContractReviewId,
  advisorConfirmedAt,
  className = "",
}: ContractProvenanceLineProps) {
  const { label, icon: Icon, iconColor } = resolveConfig(sourceKind, advisorConfirmedAt);

  const dateStr =
    advisorConfirmedAt && sourceKind === "ai_review"
      ? new Date(advisorConfirmedAt).toLocaleDateString("cs-CZ", {
          day: "numeric",
          month: "numeric",
          year: "numeric",
        })
      : null;

  const reviewLink =
    sourceKind === "ai_review" && sourceContractReviewId
      ? `/portal/contracts/review/${sourceContractReviewId}`
      : null;

  const docLink =
    sourceKind !== "ai_review" && sourceDocumentId
      ? `/api/documents/${sourceDocumentId}/download`
      : null;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] leading-none text-[color:var(--wp-text-tertiary)] ${className}`}
    >
      <Icon className={`w-3 h-3 shrink-0 ${iconColor}`} aria-hidden />
      {reviewLink ? (
        <Link
          href={reviewLink}
          className="hover:text-indigo-600 transition-colors underline-offset-2 hover:underline"
        >
          {label}
        </Link>
      ) : (
        <span>{label}</span>
      )}
      {dateStr && <span className="opacity-70">· {dateStr}</span>}
      {docLink && (
        <a
          href={docLink}
          target="_blank"
          rel="noreferrer"
          className="text-indigo-600 font-semibold hover:underline underline-offset-2"
          onClick={(e) => e.stopPropagation()}
        >
          Dokument
        </a>
      )}
    </span>
  );
}

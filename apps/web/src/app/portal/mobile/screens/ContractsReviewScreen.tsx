"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  FileSearch,
  Upload,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  ChevronRight,
  RefreshCw,
  Plus,
  User,
  Shield,
  Zap,
  FileText,
  Eye,
} from "lucide-react";
import {
  approveContractReview,
  approveAndApplyContractReview,
  applyContractReviewDrafts,
  confirmCreateNewClient,
  rejectContractReview,
  selectMatchedClient,
} from "@/app/actions/contract-review";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";
import {
  BottomSheet,
  EmptyState,
  ErrorState,
  FilterChips,
  FullscreenSheet,
  LoadingSkeleton,
  MobileCard,
  SearchBar,
  StatusBadge,
} from "@/app/shared/mobile-ui/primitives";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";
import { confidenceToPercentForUi } from "@/lib/ai/review-ui-confidence";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ReviewListItem = {
  id: string;
  fileName: string;
  processingStatus: "uploaded" | "processing" | "extracted" | "review_required" | "failed";
  reviewStatus: "pending" | "approved" | "rejected" | "applied" | null;
  confidence: number | null;
  createdAt: string;
  errorMessage?: string | null;
};

type ReviewDetail = {
  id: string;
  fileName: string;
  processingStatus: ReviewListItem["processingStatus"];
  reviewStatus: ReviewListItem["reviewStatus"];
  confidence: number | null;
  errorMessage?: string | null;
  extractedPayload?: Record<string, unknown> | null;
  draftActions?: unknown[] | null;
  clientMatchCandidates?: Array<{ id: string; fullName?: string; score?: number }> | null;
  matchedClientId?: string;
  createNewClientConfirmed?: string | null;
  createdAt: string;
};

type StatusFilter = "all" | "pending" | "done" | "failed";

type ExtractedFieldCell = { value?: unknown; status?: string; confidence?: number };

const TECHNICAL_PAYLOAD_KEYS = new Set([
  "extractedFields",
  "documentClassification",
  "documentMeta",
  "parties",
  "evidence",
  "contentFlags",
  "serviceTerms",
  "financialTerms",
  "reviewWarnings",
  "candidateMatches",
  "dataCompleteness",
  "suggestedActions",
  "sectionSensitivity",
  "relationshipInference",
]);

function humanizeFieldKey(key: string): string {
  const s = key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatExtractedCellValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (value.every((x) => x != null && (typeof x === "string" || typeof x === "number"))) {
      return value.map(String).join(", ");
    }
    return `${value.length} položek`;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if ("value" in o) return formatExtractedCellValue(o.value);
    const keys = Object.keys(o);
    if (keys.length <= 5) {
      return keys
        .slice(0, 5)
        .map((k) => `${humanizeFieldKey(k)}: ${formatExtractedCellValue(o[k])}`)
        .join(" · ");
    }
    return "Složitý objekt (detail na desktopu)";
  }
  return String(value);
}

function buildMobileExtractedRows(payload: Record<string, unknown> | null | undefined): {
  rows: Array<{ key: string; label: string; value: string; status?: string }>;
  technicalTopLevelCount: number;
} {
  if (!payload || typeof payload !== "object") return { rows: [], technicalTopLevelCount: 0 };

  const rows: Array<{ key: string; label: string; value: string; status?: string }> = [];
  const ef = payload.extractedFields;
  if (ef && typeof ef === "object" && !Array.isArray(ef)) {
    for (const [key, cell] of Object.entries(ef as Record<string, unknown>)) {
      if (key.startsWith("_")) continue;
      const c = cell as ExtractedFieldCell;
      const display = formatExtractedCellValue(c?.value);
      if (display === "—") continue;
      rows.push({
        key,
        label: humanizeFieldKey(key),
        value: display,
        status: typeof c?.status === "string" ? c.status : undefined,
      });
    }
  }

  let technicalTopLevelCount = 0;
  for (const k of Object.keys(payload)) {
    if (k.startsWith("_") || k === "extractedFields") continue;
    if (TECHNICAL_PAYLOAD_KEYS.has(k)) continue;
    const v = payload[k];
    if (v != null && v !== "") technicalTopLevelCount += 1;
  }

  return { rows, technicalTopLevelCount };
}

function parseDraftActionRow(action: unknown): { label: string; type?: string } | null {
  if (action == null) return null;
  if (typeof action === "string") {
    const t = action.trim();
    return t ? { label: t.slice(0, 240) } : null;
  }
  if (typeof action === "object") {
    const o = action as Record<string, unknown>;
    const label = typeof o.label === "string" && o.label.trim() ? o.label.trim() : null;
    const type = typeof o.type === "string" ? o.type : undefined;
    if (label) return { label: label.slice(0, 240), type };
    if (type) return { label: humanizeFieldKey(type), type };
  }
  return null;
}

function collectDraftActionsForMobile(detail: ReviewDetail): Array<{ label: string; type?: string }> {
  const out: Array<{ label: string; type?: string }> = [];
  const seen = new Set<string>();
  const push = (label: string, type?: string) => {
    const k = `${type ?? ""}:${label}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ label, type });
  };

  for (const a of detail.draftActions ?? []) {
    const row = parseDraftActionRow(a);
    if (row) push(row.label, row.type);
  }

  const sug = detail.extractedPayload?.suggestedActions;
  if (Array.isArray(sug)) {
    for (const a of sug) {
      const row = parseDraftActionRow(a);
      if (row) push(row.label, row.type);
    }
  }

  return out;
}

function fieldStatusTone(status: string | undefined): "success" | "warning" | "danger" | "neutral" {
  const s = (status ?? "").toLowerCase();
  if (s.includes("fail") || s.includes("invalid") || s.includes("error")) return "danger";
  if (s.includes("warn") || s.includes("uncertain") || s.includes("low")) return "warning";
  if (s.includes("ok") || s.includes("success") || s.includes("valid")) return "success";
  return "neutral";
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getEffectiveStatus(item: ReviewListItem) {
  return item.reviewStatus ?? item.processingStatus;
}

function getStatusConfig(status: string) {
  switch (status) {
    case "approved":
    case "applied":
      return { label: status === "applied" ? "Aplikováno" : "Schváleno", tone: "success" as const, Icon: CheckCircle2, bg: "bg-emerald-50", border: "border-l-emerald-500" };
    case "rejected":
      return { label: "Zamítnuto", tone: "danger" as const, Icon: XCircle, bg: "bg-rose-50", border: "border-l-rose-500" };
    case "failed":
      return { label: "Chyba", tone: "danger" as const, Icon: AlertTriangle, bg: "bg-rose-50", border: "border-l-rose-500" };
    case "review_required":
      return { label: "K revizi", tone: "warning" as const, Icon: Eye, bg: "bg-amber-50", border: "border-l-amber-500" };
    case "processing":
      return { label: "Zpracování…", tone: "info" as const, Icon: Loader2, bg: "bg-blue-50", border: "border-l-blue-500" };
    case "extracted":
      return { label: "Extrahováno", tone: "info" as const, Icon: Zap, bg: "bg-indigo-50", border: "border-l-indigo-500" };
    case "pending":
      return { label: "Čeká", tone: "info" as const, Icon: Clock, bg: "bg-[color:var(--wp-surface-muted)]", border: "border-l-[color:var(--wp-text-tertiary)]" };
    default:
      return { label: "Nahráno", tone: "info" as const, Icon: Upload, bg: "bg-[color:var(--wp-surface-muted)]", border: "border-l-[color:var(--wp-text-tertiary)]" };
  }
}

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 80 ? "bg-emerald-500" : value >= 50 ? "bg-amber-400" : "bg-rose-500";
  const textColor = value >= 80 ? "text-emerald-700" : value >= 50 ? "text-amber-700" : "text-rose-700";
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div className="flex-1 h-1.5 rounded-full bg-[color:var(--wp-surface-muted)] overflow-hidden">
        <div className={cx("h-full rounded-full transition-all", color)} style={{ width: `${value}%` }} />
      </div>
      <span className={cx("text-[10px] font-black tabular-nums", textColor)}>{value}%</span>
    </div>
  );
}

function formatRelativeDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Právě teď";
  if (diffMin < 60) return `Před ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Před ${diffH} hod`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `Před ${diffD} dny`;
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "short" });
}

/* ------------------------------------------------------------------ */
/*  Queue card                                                         */
/* ------------------------------------------------------------------ */

function QueueCard({ item, onClick, active }: { item: ReviewListItem; onClick: () => void; active?: boolean }) {
  const status = getEffectiveStatus(item);
  const cfg = getStatusConfig(status);
  const StatusIcon = cfg.Icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "w-full text-left border rounded-xl overflow-hidden border-l-4 transition-colors",
        cfg.border,
        cfg.bg,
        active ? "ring-2 ring-indigo-300 border-indigo-300" : "border-[color:var(--wp-surface-card-border)]"
      )}
    >
      <div className="p-3.5">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-[color:var(--wp-surface-card)]/80 flex items-center justify-center flex-shrink-0 border border-[color:var(--wp-surface-card-border)]">
            <FileText size={16} className="text-[color:var(--wp-text-secondary)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-[color:var(--wp-text)] truncate">{item.fileName}</p>
              <ChevronRight size={14} className="text-[color:var(--wp-text-tertiary)] flex-shrink-0" />
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <StatusIcon size={12} className={cx(
                status === "processing" && "animate-spin",
                cfg.tone === "success" ? "text-emerald-500" :
                cfg.tone === "danger" ? "text-rose-500" :
                cfg.tone === "warning" ? "text-amber-500" : "text-indigo-500"
              )} />
              <StatusBadge tone={cfg.tone}>{cfg.label}</StatusBadge>
              <span className="text-[10px] text-[color:var(--wp-text-tertiary)] ml-auto">{formatRelativeDate(item.createdAt)}</span>
            </div>
            {(() => {
              const pct = confidenceToPercentForUi(item.confidence);
              return pct != null ? <ConfidenceBar value={pct} /> : null;
            })()}
            {item.errorMessage ? (
              <p className="text-[10px] text-rose-500 mt-1 truncate">{item.errorMessage}</p>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail panel                                                       */
/* ------------------------------------------------------------------ */

function ReviewDetailPanel({
  detail,
  pending,
  onApprove,
  onApproveAndApply,
  onReject,
  onApply,
  onSelectClient,
  onCreateNewClient,
}: {
  detail: ReviewDetail;
  pending: boolean;
  onApprove: () => void;
  onApproveAndApply: () => void;
  onReject: () => void;
  onApply: () => void;
  onSelectClient: (clientId: string) => void;
  onCreateNewClient: () => void;
}) {
  const status = detail.reviewStatus ?? detail.processingStatus;
  const cfg = getStatusConfig(status);
  const canReviewDecision =
    (detail.processingStatus === "extracted" || detail.processingStatus === "review_required") &&
    (detail.reviewStatus === "pending" || detail.reviewStatus === null);
  const hasResolvedClient =
    !!detail.matchedClientId?.trim() || detail.createNewClientConfirmed === "true";
  const isApprovedOnly = detail.reviewStatus === "approved";
  const isApplied = detail.reviewStatus === "applied";

  const confidencePct = confidenceToPercentForUi(detail.confidence);
  const { rows: extractedRows, technicalTopLevelCount } = buildMobileExtractedRows(detail.extractedPayload);
  const draftActionRows = collectDraftActionsForMobile(detail);

  return (
    <div className="space-y-3 pb-4">
      {/* Hero */}
      <MobileCard className="p-4 bg-gradient-to-br from-[#0a0f29] to-indigo-900 border-0 rounded-xl">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-[color:var(--wp-surface-card)]/10 flex items-center justify-center flex-shrink-0">
            <FileSearch size={22} className="text-indigo-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-black text-white truncate">{detail.fileName}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <StatusBadge tone={cfg.tone}>{cfg.label}</StatusBadge>
              <span className="text-[10px] text-indigo-300">{formatRelativeDate(detail.createdAt)}</span>
            </div>
            {confidencePct != null ? (
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-indigo-300">Jistota modelu</span>
                  <span className="text-xs font-black text-white">{confidencePct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-[color:var(--wp-surface-card)]/20 overflow-hidden">
                  <div
                    className={cx(
                      "h-full rounded-full",
                      confidencePct >= 80 ? "bg-emerald-400" : confidencePct >= 50 ? "bg-amber-400" : "bg-rose-400"
                    )}
                    style={{ width: `${confidencePct}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </MobileCard>

      {/* Error */}
      {detail.errorMessage ? (
        <MobileCard className="p-3.5 bg-rose-50 border-rose-200">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-rose-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-rose-800">Chyba zpracování</p>
              <p className="text-xs text-rose-600 mt-0.5">{detail.errorMessage}</p>
            </div>
          </div>
        </MobileCard>
      ) : null}

      {/* Client match */}
      {detail.clientMatchCandidates?.length ? (
        <MobileCard className="p-3.5">
          <div className="flex items-center gap-2 mb-2.5">
            <User size={14} className="text-[color:var(--wp-text-tertiary)]" />
            <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
              Nalezení klienti
            </p>
          </div>
          <div className="space-y-2">
            {detail.clientMatchCandidates.slice(0, 5).map((candidate) => {
              const score = typeof candidate.score === "number" ? Math.round(candidate.score * 100) : null;
              const isMatched = detail.matchedClientId === candidate.id;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => onSelectClient(candidate.id)}
                  disabled={pending || isMatched}
                  className={cx(
                    "w-full flex items-center gap-3 p-2.5 rounded-xl border transition-colors text-left",
                    isMatched
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-[color:var(--wp-surface-card-border)] hover:border-indigo-200"
                  )}
                >
                  <div className="w-8 h-8 rounded-lg bg-[color:var(--wp-surface-muted)] flex items-center justify-center flex-shrink-0">
                    <User size={14} className="text-[color:var(--wp-text-secondary)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[color:var(--wp-text)] truncate">
                      {candidate.fullName || candidate.id}
                    </p>
                    {score !== null ? (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="w-12 h-1 rounded-full bg-[color:var(--wp-surface-muted)] overflow-hidden">
                          <div
                            className={cx("h-full rounded-full", score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-400" : "bg-rose-400")}
                            style={{ width: `${score}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-[color:var(--wp-text-secondary)]">{score}%</span>
                      </div>
                    ) : null}
                  </div>
                  {isMatched ? (
                    <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                  ) : null}
                </button>
              );
            })}
            <button
              type="button"
              onClick={onCreateNewClient}
              disabled={pending}
              className="w-full min-h-[40px] rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 text-indigo-700 text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <Plus size={12} /> Vytvořit nového klienta
            </button>
          </div>
        </MobileCard>
      ) : null}

      {/* Extracted data (envelope extractedFields, not raw JSON keys) */}
      {extractedRows.length > 0 ? (
        <MobileCard className="p-3.5">
          <div className="flex items-center gap-2 mb-2.5">
            <Zap size={14} className="text-[color:var(--wp-text-tertiary)]" />
            <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
              Extrahovaná data ({extractedRows.length} polí)
            </p>
          </div>
          <div className="divide-y divide-[color:var(--wp-surface-card-border)]">
            {extractedRows.slice(0, 18).map((row) => {
              const tone = fieldStatusTone(row.status);
              return (
                <div key={row.key} className="flex flex-col gap-0.5 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[color:var(--wp-text-secondary)] truncate">{row.label}</span>
                    {row.status ? (
                      <StatusBadge
                        tone={
                          tone === "success"
                            ? "success"
                            : tone === "warning"
                              ? "warning"
                              : tone === "danger"
                                ? "danger"
                                : "neutral"
                        }
                      >
                        {row.status}
                      </StatusBadge>
                    ) : null}
                  </div>
                  <p className="text-xs font-semibold text-[color:var(--wp-text)] leading-snug break-words">
                    {row.value}
                  </p>
                </div>
              );
            })}
            {extractedRows.length > 18 ? (
              <p className="text-[10px] text-[color:var(--wp-text-tertiary)] pt-2">
                …a dalších {extractedRows.length - 18} polí
              </p>
            ) : null}
          </div>
          {technicalTopLevelCount > 0 ? (
            <p className="text-[10px] text-[color:var(--wp-text-tertiary)] mt-2 pt-2 border-t border-[color:var(--wp-surface-card-border)]">
              V dokumentu je navíc {technicalTopLevelCount} technických polí (metadata) — upravte na desktopu.
            </p>
          ) : null}
        </MobileCard>
      ) : detail.extractedPayload && Object.keys(detail.extractedPayload).length > 0 ? (
        <MobileCard className="p-3.5 border-amber-200 bg-amber-50/40">
          <p className="text-xs font-bold text-amber-900">Extrahovaná pole zatím nejsou ve čitelné podobě</p>
          <p className="text-[11px] text-amber-800/90 mt-1">
            Zkuste otevřít revizi na desktopu, nebo počkejte na dokončení extrakce.
          </p>
        </MobileCard>
      ) : null}

      {/* Draft / suggested actions */}
      {draftActionRows.length > 0 ? (
        <MobileCard className="p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={14} className="text-[color:var(--wp-text-tertiary)]" />
            <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
              Navrhované akce ({draftActionRows.length})
            </p>
          </div>
          <ul className="space-y-2">
            {draftActionRows.slice(0, 10).map((row, i) => (
              <li
                key={`${row.type ?? "a"}-${i}`}
                className="flex items-start gap-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/60 px-3 py-2.5"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-indigo-200 bg-indigo-50 text-[10px] font-black text-indigo-700">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[color:var(--wp-text)] leading-snug">{row.label}</p>
                  {row.type ? (
                    <p className="text-[10px] text-[color:var(--wp-text-tertiary)] font-mono mt-0.5 truncate">{row.type}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </MobileCard>
      ) : null}

      {isApprovedOnly && !isApplied && hasResolvedClient ? (
        <MobileCard className="p-3.5 bg-amber-50 border-amber-200">
          <p className="text-xs font-medium text-amber-950 leading-snug">
            Schváleno, ale v CRM ještě není zapsáno. Klepněte na <strong>Zapsat do CRM</strong> níže.
          </p>
        </MobileCard>
      ) : null}

      {/* Decision buttons */}
      <MobileCard className="p-3.5">
        <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2.5">
          Rozhodnutí
        </p>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onReject}
              disabled={pending || status === "rejected" || !canReviewDecision}
              className={cx(
                "min-h-[44px] rounded-xl border text-xs font-bold transition-colors",
                status === "rejected"
                  ? "border-rose-300 bg-rose-50 text-rose-700"
                  : "border-rose-200 bg-[color:var(--wp-surface-card)] text-rose-700 hover:bg-rose-50 disabled:opacity-40"
              )}
            >
              <XCircle size={14} className="mx-auto mb-0.5" />
              Zamítnout
            </button>
            <button
              type="button"
              onClick={onApprove}
              disabled={pending || !canReviewDecision}
              className={cx(
                "min-h-[44px] rounded-xl border text-xs font-bold transition-colors",
                status === "approved" || status === "applied"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-muted)]"
              )}
            >
              <CheckCircle2 size={14} className="mx-auto mb-0.5" />
              Jen schválit
            </button>
          </div>
          {canReviewDecision && hasResolvedClient ? (
            <button
              type="button"
              onClick={onApproveAndApply}
              disabled={pending}
              className="w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-wide"
            >
              Schválit a zapsat do CRM
            </button>
          ) : null}
          {isApprovedOnly && !isApplied && hasResolvedClient ? (
            <CreateActionButton
              type="button"
              onClick={onApply}
              disabled={pending}
              className="min-h-[44px] w-full"
              icon={null}
            >
              Zapsat do CRM
            </CreateActionButton>
          ) : null}
        </div>
      </MobileCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main screen                                                        */
/* ------------------------------------------------------------------ */

export function ContractsReviewScreen({
  detailIdFromPath,
  deviceClass = "phone",
}: {
  detailIdFromPath: string | null;
  deviceClass?: DeviceClass;
}) {
  const [items, setItems] = useState<ReviewListItem[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function fetchList() {
    try {
      const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
      const res = await fetch(`/api/contracts/review${query}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Načtení seznamu revizí selhalo.");
      const rawItems = (json.items || []) as ReviewListItem[];
      setItems(
        rawItems.map((row) => ({
          ...row,
          confidence: confidenceToPercentForUi(row.confidence),
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Načtení seznamu revizí selhalo.");
    }
  }

  async function fetchDetail(id: string) {
    try {
      const res = await fetch(`/api/contracts/review/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Načtení detailu selhalo.");
      const raw = json as ReviewDetail;
      setDetail({
        ...raw,
        confidence: confidenceToPercentForUi(raw.confidence),
      });
      setDetailOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Načtení detailu selhalo.");
    }
  }

  useEffect(() => {
    startTransition(async () => {
      setError(null);
      await fetchList();
    });
  }, []);

  useEffect(() => {
    if (!detailIdFromPath) return;
    startTransition(async () => {
      await fetchDetail(detailIdFromPath);
    });
  }, [detailIdFromPath]);

  const filtered = useMemo(() => {
    let list = items;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((item) => item.fileName.toLowerCase().includes(q));
    }
    if (statusFilter === "pending") {
      list = list.filter((item) => {
        const s = getEffectiveStatus(item);
        return s === "pending" || s === "review_required" || s === "extracted" || s === "uploaded" || s === "processing";
      });
    } else if (statusFilter === "done") {
      list = list.filter((item) => {
        const s = getEffectiveStatus(item);
        return s === "approved" || s === "applied";
      });
    } else if (statusFilter === "failed") {
      list = list.filter((item) => {
        const s = getEffectiveStatus(item);
        return s === "failed" || s === "rejected";
      });
    }
    return list;
  }, [items, search, statusFilter]);

  const pendingCount = items.filter((i) => {
    const s = getEffectiveStatus(i);
    return s === "pending" || s === "review_required" || s === "extracted" || s === "uploaded" || s === "processing";
  }).length;
  const doneCount = items.filter((i) => { const s = getEffectiveStatus(i); return s === "approved" || s === "applied"; }).length;
  const failCount = items.filter((i) => { const s = getEffectiveStatus(i); return s === "failed" || s === "rejected"; }).length;

  async function handleUpload(file: File | null) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch("/api/contracts/upload", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Nahrání smlouvy selhalo.");
        const reviewId = json?.id as string | undefined;
        if (reviewId) {
          await fetch(`/api/contracts/review/${reviewId}/process`, { method: "POST" });
        }
        await fetchList();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Nahrání smlouvy selhalo.");
      }
    });
  }

  async function handleApprove() {
    if (!detail) return;
    startTransition(async () => {
      const result = await approveContractReview(detail.id);
      if (!result.ok) setError(result.error);
      await fetchList();
      await fetchDetail(detail.id);
    });
  }

  async function handleReject() {
    if (!detail) return;
    startTransition(async () => {
      const result = await rejectContractReview(detail.id, "Vyžaduje manuální revizi");
      if (!result.ok) setError(result.error);
      await fetchList();
      await fetchDetail(detail.id);
    });
  }

  async function handleApply(options?: {
    overrideGateReasons?: string[];
    overrideReason?: string;
  }) {
    if (!detail) return;
    startTransition(async () => {
      const result = await applyContractReviewDrafts(detail.id, options);
      if (!result.ok) setError(result.error);
      await fetchList();
      await fetchDetail(detail.id);
    });
  }

  async function handleApproveAndApply(
    _editedFields?: Record<string, string>,
    options?: {
      overrideGateReasons?: string[];
      overrideReason?: string;
    }
  ) {
    if (!detail) return;
    startTransition(async () => {
      const result = await approveAndApplyContractReview(detail.id, options);
      if (!result.ok) setError(result.error);
      await fetchList();
      await fetchDetail(detail.id);
    });
  }

  const isTablet = deviceClass === "tablet" || deviceClass === "desktop";

  return (
    <>
      {error ? <ErrorState title={error} onRetry={fetchList} /> : null}

      {/* Header */}
      <div className="px-4 py-3 bg-[color:var(--wp-surface-card)] border-b border-[color:var(--wp-surface-card-border)] space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileSearch size={18} className="text-indigo-600" />
            <h2 className="text-base font-black text-[color:var(--wp-text)]">AI Review smluv</h2>
            {pendingCount > 0 ? (
              <span className="text-[11px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-lg">
                {pendingCount} k revizi
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => startTransition(async () => { setError(null); await fetchList(); })}
              disabled={pending}
              className="w-9 h-9 rounded-xl border border-[color:var(--wp-surface-card-border)] flex items-center justify-center"
            >
              <RefreshCw size={14} className={cx("text-[color:var(--wp-text-secondary)]", pending && "animate-spin")} />
            </button>
            <label className="flex items-center gap-1.5 min-h-[36px] rounded-xl bg-indigo-600 text-white px-3 text-xs font-bold cursor-pointer">
              <Upload size={14} />
              Nahrát
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => handleUpload(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </div>
        <FilterChips
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          options={[
            { id: "all", label: "Vše", badge: items.length },
            { id: "pending", label: "K revizi", badge: pendingCount },
            { id: "done", label: "Hotové", badge: doneCount },
            { id: "failed", label: "Chyby", badge: failCount },
          ]}
        />
        <SearchBar value={search} onChange={setSearch} placeholder="Hledat podle názvu…" />
      </div>

      {pending && items.length === 0 ? <LoadingSkeleton rows={3} /> : null}

      {!pending && filtered.length === 0 ? (
        <div className="px-4 pt-8">
          <EmptyState
            title="Žádné revize"
            description="Nahrajte první smlouvu (PDF) přes tlačítko Nahrát."
          />
        </div>
      ) : null}

      {/* Content */}
      {isTablet ? (
        <div className="grid grid-cols-2 gap-0 h-[calc(100vh-12rem)]">
          {/* Master */}
          <div className="border-r border-[color:var(--wp-surface-card-border)] overflow-y-auto px-4 py-3 space-y-2">
            {filtered.map((item) => (
              <QueueCard
                key={item.id}
                item={item}
                active={detail?.id === item.id}
                onClick={() => startTransition(async () => { await fetchDetail(item.id); })}
              />
            ))}
          </div>
          {/* Detail */}
          <div className="overflow-y-auto px-4 py-3">
            {detail ? (
              <ReviewDetailPanel
                detail={detail}
                pending={pending}
                onApprove={handleApprove}
                onApproveAndApply={handleApproveAndApply}
                onReject={handleReject}
                onApply={handleApply}
                onSelectClient={(id) => startTransition(async () => { await selectMatchedClient(detail.id, id); await fetchDetail(detail.id); })}
                onCreateNewClient={() => startTransition(async () => { await confirmCreateNewClient(detail.id); await fetchDetail(detail.id); })}
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <EmptyState title="Vyberte revizi" description="Klikněte na položku vlevo." />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 space-y-2">
          {filtered.map((item) => (
            <QueueCard
              key={item.id}
              item={item}
              onClick={() => startTransition(async () => { await fetchDetail(item.id); })}
            />
          ))}
        </div>
      )}

      {/* Phone detail sheet */}
      {!isTablet ? (
        <FullscreenSheet open={detailOpen} onClose={() => setDetailOpen(false)} title="Detail AI revize">
          {detail ? (
            <ReviewDetailPanel
              detail={detail}
              pending={pending}
              onApprove={handleApprove}
              onApproveAndApply={handleApproveAndApply}
              onReject={handleReject}
              onApply={handleApply}
              onSelectClient={(id) => startTransition(async () => { await selectMatchedClient(detail.id, id); await fetchDetail(detail.id); })}
              onCreateNewClient={() => startTransition(async () => { await confirmCreateNewClient(detail.id); await fetchDetail(detail.id); })}
            />
          ) : (
            <LoadingSkeleton rows={3} />
          )}
        </FullscreenSheet>
      ) : null}
    </>
  );
}

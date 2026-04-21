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
  Download,
  Pencil,
  Sparkles,
} from "lucide-react";
import {
  approveContractReview,
  approveAndApplyContractReview,
  applyContractReviewDrafts,
  confirmCreateNewClient,
  confirmPendingField,
  rejectContractReview,
  selectMatchedClient,
} from "@/app/actions/contract-review";
import type { MatchVerdict } from "@/lib/ai-review/types";
import { isSupportingDocumentOnly } from "@/lib/ai/apply-policy-enforcement";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";
import {
  EmptyState,
  ErrorState,
  FilterChips,
  FullscreenSheet,
  LoadingSkeleton,
  MobileCard,
  SearchBar,
  StatusBadge,
  Toast,
  useToast,
} from "@/app/shared/mobile-ui/primitives";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";
import { confidenceToPercentForUi } from "@/lib/ai/review-ui-confidence";
import { mapApiToExtractionDocument, hasMeaningfulReviewContent } from "@/lib/ai-review/mappers";
import { labelFieldKey } from "@/lib/ai-review/label-dictionary";
import { aiReviewPdfFileName, buildAiReviewPdfBlob } from "@/lib/ai-review/build-ai-review-pdf";
import type { ApplyResultPayload } from "@/lib/ai-review/types";
import { resolveEffectiveFieldStatus } from "@/lib/ai-review/field-visual-status";

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
  extractionTrace?: Record<string, unknown> | null;
  matchVerdict?: string | null;
  draftActions?: unknown[] | null;
  clientMatchCandidates?: Array<{ id: string; fullName?: string; score?: number; clientId?: string }> | null;
  matchedClientId?: string;
  createNewClientConfirmed?: string | null;
  createdAt: string;
  applyResultPayload?: ApplyResultPayload | null;
  [key: string]: unknown;
};

type StatusFilter = "all" | "pending" | "done" | "failed";

function resolveMatchVerdictFromReviewDetail(d: ReviewDetail): MatchVerdict | null {
  const v =
    (d.matchVerdict as MatchVerdict | undefined) ??
    (d.extractionTrace?.matchVerdict as MatchVerdict | undefined);
  if (v === "existing_match" || v === "near_match" || v === "ambiguous_match" || v === "no_match") {
    return v;
  }
  return null;
}

function humanizeFieldKey(key: string): string {
  return labelFieldKey(key);
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
  onConfirmPendingField,
  onDownloadPdf,
  pdfExportBusy,
}: {
  detail: ReviewDetail;
  pending: boolean;
  onApprove: () => void;
  onApproveAndApply: () => void;
  onReject: () => void;
  onApply: () => void;
  onSelectClient: (clientId: string) => void;
  onCreateNewClient: () => void;
  onConfirmPendingField: (reviewId: string, fieldKey: string, scope: "contact" | "contract" | "payment") => void;
  onDownloadPdf?: () => void;
  pdfExportBusy?: boolean;
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

  // Map raw API detail through desktop mapper to get proper evidence display
  const mappedDoc = mapApiToExtractionDocument(detail as Record<string, unknown>, "");
  const mappedGroups = mappedDoc.groups;

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
        {onDownloadPdf ? (
          <button
            type="button"
            onClick={onDownloadPdf}
            disabled={!!pdfExportBusy || pending}
            className="mt-3 w-full min-h-[44px] rounded-xl border border-indigo-400/50 bg-indigo-500/10 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest text-indigo-100 disabled:opacity-40"
          >
            {pdfExportBusy ? (
              <Loader2 size={16} className="animate-spin shrink-0" />
            ) : (
              <Download size={16} className="shrink-0" />
            )}
            Stáhnout PDF
          </button>
        ) : null}
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

      {/* Evidence display — grouped fields with displayStatus / displaySource parity */}
      {mappedGroups.length > 0 ? (
        mappedGroups.map((group) => (
          <MobileCard key={group.id} className="p-3.5">
            <div className="flex items-center gap-2 mb-2.5">
              <Zap size={14} className="text-[color:var(--wp-text-tertiary)]" />
              <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                {group.name} ({group.fields.length})
              </p>
            </div>
            <div className="divide-y divide-[color:var(--wp-surface-card-border)]">
              {group.fields.slice(0, 20).map((field) => {
                const dsStatus = field.displayStatus;
                const dsSource = field.displaySource;
                const effectiveStatus = resolveEffectiveFieldStatus({
                  fieldId: field.id,
                  fieldStatus: field.status,
                  locallyConfirmed: false,
                  reviewApproved: detail.reviewStatus === "approved" || detail.reviewStatus === "applied",
                  applyResultPayload: detail.applyResultPayload as ApplyResultPayload | undefined,
                });
                const tone =
                  effectiveStatus === "success"
                    ? ("success" as const)
                    : dsStatus === "Chybí" || effectiveStatus === "error"
                      ? ("danger" as const)
                      : dsStatus === "Odvozeno" || effectiveStatus === "warning"
                        ? ("warning" as const)
                        : ("success" as const);
                const displayLabel = effectiveStatus === "success" && field.status === "warning"
                  ? "Ověřeno"
                  : dsStatus ?? (field.status === "error" ? "Chybí" : field.status === "warning" ? "Odvozeno" : "Nalezeno");
                return (
                  <div key={field.id} className="flex flex-col gap-0.5 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[color:var(--wp-text-secondary)] truncate">{field.label}</span>
                      <StatusBadge tone={tone}>{displayLabel}</StatusBadge>
                    </div>
                    <p className="text-xs font-semibold text-[color:var(--wp-text)] leading-snug break-words">
                      {field.value}
                    </p>
                    {dsSource ? (
                      <p className="text-[10px] text-[color:var(--wp-text-tertiary)] leading-none mt-0.5">{dsSource}</p>
                    ) : null}
                    {field.applyPolicyLabel && field.applyPolicy !== "auto_apply" ? (
                      <p className={cx(
                        "text-[10px] leading-none mt-0.5 font-semibold",
                        field.applyPolicy === "manual_required" ? "text-rose-500" :
                        field.applyPolicy === "do_not_apply" ? "text-slate-400" :
                        "text-amber-600"
                      )}>
                        {field.applyPolicyLabel}
                      </p>
                    ) : null}
                  </div>
                );
              })}
              {group.fields.length > 20 ? (
                <p className="text-[10px] text-[color:var(--wp-text-tertiary)] pt-2">
                  …a dalších {group.fields.length - 20} polí
                </p>
              ) : null}
            </div>
          </MobileCard>
        ))
      ) : detail.extractedPayload && Object.keys(detail.extractedPayload).length > 0 ? (
        <MobileCard className="p-3.5 border-amber-200 bg-amber-50/40">
          <p className="text-xs font-bold text-amber-900">Extrahovaná pole zatím nejsou ve čitelné podobě</p>
          <p className="text-[11px] text-amber-800/90 mt-1">
            Zkuste otevřít revizi na desktopu, nebo počkejte na dokončení extrakce.
          </p>
        </MobileCard>
      ) : null}

      {/* Apply result parity — enforcement trace summary */}
      {isApplied && detail.applyResultPayload?.policyEnforcementTrace ? (() => {
        const trace = detail.applyResultPayload.policyEnforcementTrace!;
        const s = trace.summary;
        const isSupporting = trace.supportingDocumentGuard;
        const pendingFields: string[] = [
          ...(trace.contactEnforcement?.pendingConfirmationFields ?? []),
          ...(trace.contractEnforcement?.pendingConfirmationFields ?? []),
          ...(trace.paymentEnforcement?.pendingConfirmationFields ?? []),
        ];
        const manualFields: string[] = [
          ...(trace.contactEnforcement?.manualRequiredFields ?? []),
          ...(trace.contractEnforcement?.manualRequiredFields ?? []),
          ...(trace.paymentEnforcement?.manualRequiredFields ?? []),
        ];
        return (
          <MobileCard className="p-3.5 bg-emerald-50/60 border-emerald-200">
            <div className="flex items-center gap-2 mb-2.5">
              <Shield size={14} className="text-emerald-600" />
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800">
                {isSupporting ? "Výsledek zpracování" : "Výsledek propsání do Aidvisory"}
              </p>
            </div>
            {isSupporting ? (
              <p className="text-xs font-semibold text-amber-800 leading-snug">
                Podpůrný dokument — žádný automatický zápis smluvních ani platebních dat.
              </p>
            ) : (
              <div className="space-y-1.5">
                {s.totalAutoApplied > 0 ? (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-100 px-2.5 py-1.5">
                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                    <span className="text-xs font-bold text-emerald-800">{s.totalAutoApplied} — Zapsáno automaticky</span>
                  </div>
                ) : null}
                {s.totalPendingConfirmation > 0 ? (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-100 px-2.5 py-1.5">
                    <Clock size={13} className="text-amber-600 shrink-0" />
                    <span className="text-xs font-bold text-amber-800">{s.totalPendingConfirmation} — Předvyplněno k potvrzení</span>
                  </div>
                ) : null}
                {s.totalManualRequired > 0 ? (
                  <div className="flex items-center gap-2 rounded-lg bg-rose-100 px-2.5 py-1.5">
                    <Pencil size={13} className="text-rose-600 shrink-0" />
                    <span className="text-xs font-bold text-rose-800">{s.totalManualRequired} — Vyžaduje ruční doplnění</span>
                  </div>
                ) : null}
                {s.totalExcluded > 0 ? (
                  <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-1.5">
                    <XCircle size={13} className="text-slate-500 shrink-0" />
                    <span className="text-xs font-bold text-slate-600">{s.totalExcluded} — Nezapsáno</span>
                  </div>
                ) : null}
              </div>
            )}
            {/* Pending confirmation fields — with human labels, inline confirm CTA */}
            {pendingFields.length > 0 ? (
              <div className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-800 mb-2 flex items-center gap-1">
                  <Clock size={10} /> Čeká na potvrzení poradcem
                </p>
                <div className="space-y-1.5">
                  {pendingFields.map((fieldKey) => {
                    const scope =
                      (trace.contactEnforcement?.pendingConfirmationFields ?? []).includes(fieldKey)
                        ? "contact" as const
                        : (trace.contractEnforcement?.pendingConfirmationFields ?? []).includes(fieldKey)
                          ? "contract" as const
                          : "payment" as const;
                    const humanLabel = humanizeFieldKey(fieldKey);
                    return (
                      <div key={fieldKey} className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-amber-800 truncate">{humanLabel}</span>
                        <button
                          type="button"
                          onClick={() => onConfirmPendingField(detail.id, fieldKey, scope)}
                          disabled={pending}
                          className="shrink-0 min-h-[32px] px-2.5 rounded-lg bg-amber-500 text-white text-[10px] font-black uppercase tracking-wide disabled:opacity-40"
                        >
                          Potvrdit
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {/* Manual required fields */}
            {manualFields.length > 0 ? (
              <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50/70 px-2.5 py-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-rose-800 mb-1.5 flex items-center gap-1">
                  <Pencil size={10} /> Vyžaduje ruční doplnění
                </p>
                <div className="flex flex-wrap gap-1">
                  {manualFields.map((f) => (
                    <span key={f} className="text-[10px] font-bold text-rose-700 bg-rose-100 rounded px-1.5 py-0.5">
                      {humanizeFieldKey(f)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </MobileCard>
        );
      })() : null}

      {/* Advisor summary (from advisorReview model) */}
      {mappedDoc.advisorReview ? (
        <MobileCard className="p-3.5">
          <div className="flex items-center gap-2 mb-2.5">
            <Sparkles size={14} className="text-indigo-400" />
            <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
              Souhrn pro poradce
            </p>
          </div>
          <div className="space-y-2">
            {mappedDoc.advisorReview.client ? (
              <p className="text-xs text-[color:var(--wp-text)] leading-snug">
                <span className="font-bold text-[color:var(--wp-text-secondary)]">Klient: </span>{mappedDoc.advisorReview.client}
              </p>
            ) : null}
            {mappedDoc.advisorReview.product ? (
              <p className="text-xs text-[color:var(--wp-text)] leading-snug">
                <span className="font-bold text-[color:var(--wp-text-secondary)]">Produkt: </span>{mappedDoc.advisorReview.product}
              </p>
            ) : null}
            {mappedDoc.advisorReview.payments ? (
              <p className="text-xs text-[color:var(--wp-text)] leading-snug">
                <span className="font-bold text-[color:var(--wp-text-secondary)]">Platby: </span>{mappedDoc.advisorReview.payments}
              </p>
            ) : null}
            {mappedDoc.advisorReview.llmExecutiveBrief ? (
              <p className="text-xs text-[color:var(--wp-text-secondary)] leading-snug italic mt-1">
                {mappedDoc.advisorReview.llmExecutiveBrief}
              </p>
            ) : null}
          </div>
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
                </div>
              </li>
            ))}
          </ul>
        </MobileCard>
      ) : null}

      {isApprovedOnly && !isApplied ? (
        <MobileCard className="p-3.5 bg-amber-50 border-amber-200">
          <p className="text-xs font-medium text-amber-950 leading-snug">
            {hasResolvedClient
              ? (
                <>
                  Schváleno, ale v Aidvisory ještě není zapsáno. Klepněte na <strong>Propsat do Aidvisory</strong> níže.
                </>
              )
              : (
                <>
                  Schváleno, ale v Aidvisory ještě není zapsáno. Klepněte na <strong>Propsat do Aidvisory</strong> níže a systém
                  nejdřív připraví nového klienta ze smlouvy.
                </>
              )}
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
          {canReviewDecision ? (
            <button
              type="button"
              onClick={onApproveAndApply}
              disabled={pending}
              className="w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-wide"
            >
              Schválit a propsat do Aidvisory
            </button>
          ) : null}
          {isApprovedOnly && !isApplied ? (
            <CreateActionButton
              type="button"
              onClick={onApply}
              disabled={pending}
              className="min-h-[44px] w-full"
              icon={null}
            >
              Propsat do Aidvisory
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
  const [pdfExportBusy, setPdfExportBusy] = useState(false);
  const { toast, showToast, dismissToast } = useToast();

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

  async function ensureClientResolvedForApply(current: ReviewDetail): Promise<boolean> {
    const alreadyResolved =
      !!current.matchedClientId?.trim() || current.createNewClientConfirmed === "true";
    if (alreadyResolved) return true;

    const verdict = resolveMatchVerdictFromReviewDetail(current);
    if (verdict === "ambiguous_match") {
      const msg = "Nejdřív vyberte klienta — zápis je do výběru pozastavený.";
      setError(msg);
      showToast(msg, "error");
      return false;
    }
    if (verdict === "near_match" || verdict === "existing_match") {
      return true;
    }

    const payload = current.extractedPayload;
    if (payload && isSupportingDocumentOnly(payload)) {
      const msg = "U podpůrného dokumentu vyberte klienta pro připojení.";
      setError(msg);
      showToast(msg, "error");
      return false;
    }

    const cand = current.clientMatchCandidates;
    if (verdict == null && Array.isArray(cand) && cand.length > 1) {
      const msg = "Vyberte klienta z kandidátů.";
      setError(msg);
      showToast(msg, "error");
      return false;
    }

    const result = await confirmCreateNewClient(current.id);
    if (!result.ok) {
      setError(result.error);
      showToast(result.error, "error");
      return false;
    }
    return true;
  }

  async function handleApply(options?: {
    overrideGateReasons?: string[];
    overrideReason?: string;
  }) {
    if (!detail) return;
    startTransition(async () => {
      const ready = await ensureClientResolvedForApply(detail);
      if (!ready) return;
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
      const ready = await ensureClientResolvedForApply(detail);
      if (!ready) return;
      const result = await approveAndApplyContractReview(detail.id, options);
      if (!result.ok) setError(result.error);
      await fetchList();
      await fetchDetail(detail.id);
    });
  }

  async function handleConfirmPendingField(
    reviewId: string,
    fieldKey: string,
    scope: "contact" | "contract" | "payment",
  ) {
    startTransition(async () => {
      const result = await confirmPendingField(reviewId, fieldKey, scope);
      if (!result.ok) {
        showToast(result.error, "error");
      } else {
        showToast(`Pole "${fieldKey}" potvrzeno.`, "success");
      }
      await fetchList();
      await fetchDetail(reviewId);
    });
  }

  async function handleDownloadPdf() {
    if (!detail) return;
    setPdfExportBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/contracts/review/${detail.id}`, { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Načtení detailu pro export selhalo.");
      }
      const json = (await res.json()) as Record<string, unknown>;
      let pdfUrl = "";
      try {
        const fr = await fetch(`/api/contracts/review/${detail.id}/file`, { cache: "no-store" });
        if (fr.ok) {
          const fj = (await fr.json()) as { url?: string };
          if (typeof fj.url === "string") pdfUrl = fj.url;
        }
      } catch {
        /* optional */
      }
      const mapped = mapApiToExtractionDocument(json, pdfUrl);
      const isFailed = mapped.processingStatus === "failed";
      const isProcessing = mapped.processingStatus === "uploaded" || mapped.processingStatus === "processing";
      if (isFailed || isProcessing || !hasMeaningfulReviewContent(mapped)) {
        showToast("PDF export pro tento stav není k dispozici.", "error");
        return;
      }
      const blob = await buildAiReviewPdfBlob(mapped, {});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = aiReviewPdfFileName(mapped);
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("PDF bylo staženo.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Export PDF se nepodařil.", "error");
    } finally {
      setPdfExportBusy(false);
    }
  }

  const isTablet = deviceClass === "tablet" || deviceClass === "desktop";

  return (
    <>
      {toast ? <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} /> : null}
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
                onConfirmPendingField={handleConfirmPendingField}
                onDownloadPdf={() => void handleDownloadPdf()}
                pdfExportBusy={pdfExportBusy}
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
              onConfirmPendingField={handleConfirmPendingField}
              onDownloadPdf={() => void handleDownloadPdf()}
              pdfExportBusy={pdfExportBusy}
            />
          ) : (
            <LoadingSkeleton rows={3} />
          )}
        </FullscreenSheet>
      ) : null}
    </>
  );
}

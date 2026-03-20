"use client";

import React, { useState } from "react";
import Link from "next/link";
import { FileText, ChevronLeft, UserPlus, Check, X, Send, AlertTriangle, ChevronDown, ChevronRight, Info } from "lucide-react";
import { StickyBottomCTA, STICKY_BOTTOM_CTA_PADDING_CLASS } from "@/app/components/StickyBottomCTA";

type ClientMatchCandidate = {
  clientId: string;
  score: number;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  matchedFields: Record<string, boolean>;
  displayName?: string;
};

type ValidationWarningItem = { code?: string; message: string; field?: string };

type ReviewDetail = {
  id: string;
  fileName: string;
  processingStatus: string;
  errorMessage?: string | null;
  reviewStatus?: string | null;
  appliedAt?: string | null;
  confidence?: number | null;
  reasonsForReview?: string[] | null;
  clientMatchCandidates?: ClientMatchCandidate[];
  draftActions?: Array<{ type: string; label: string; payload: Record<string, unknown> }>;
  matchedClientId?: string | null;
  createNewClientConfirmed?: string | null;
  applyResultPayload?: {
    createdClientId?: string;
    linkedClientId?: string;
    createdContractId?: string;
    createdTaskId?: string;
    bridgeSuggestions?: Array<{
      id: string;
      label: string;
      href: string;
      type: "analysis" | "service_action";
    }>;
  };
  extractedPayload?: Record<string, unknown>;
  detectedDocumentType?: string | null;
  inputMode?: string | null;
  extractionMode?: string | null;
  extractionTrace?: { failedStep?: string; warnings?: string[] } | null;
  validationWarnings?: ValidationWarningItem[] | null;
  fieldConfidenceMap?: Record<string, number> | null;
  classificationReasons?: string[] | null;
};

const SECTION_LABELS: Record<string, string> = {
  contract: "Smlouva",
  client: "Klient",
  institution: "Instituce",
  product: "Produkt",
  paymentDetails: "Platby",
  dates: "Datum",
};

function PipelineDiagnosticsSection({ detail }: { detail: ReviewDetail }) {
  const [open, setOpen] = useState(false);
  const hasContent =
    detail.detectedDocumentType ||
    detail.inputMode ||
    detail.extractionMode ||
    (detail.validationWarnings && detail.validationWarnings.length > 0) ||
    (detail.fieldConfidenceMap && Object.keys(detail.fieldConfidenceMap ?? {}).length > 0) ||
    (detail.classificationReasons && detail.classificationReasons.length > 0);
  if (!hasContent) return null;
  return (
    <section
      className="rounded-xl border mb-4 overflow-hidden"
      style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 p-4 text-left"
        style={{ color: "var(--wp-text)" }}
      >
        <span className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--wp-text-muted)" }}>
          <Info size={16} /> Diagnostika extrakce
        </span>
        {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0 border-t" style={{ borderColor: "var(--wp-border)" }}>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm mt-3">
            {detail.detectedDocumentType && (
              <>
                <dt style={{ color: "var(--wp-text-muted)" }}>Typ dokumentu</dt>
                <dd style={{ color: "var(--wp-text)" }}>{detail.detectedDocumentType}</dd>
              </>
            )}
            {detail.inputMode && (
              <>
                <dt style={{ color: "var(--wp-text-muted)" }}>Režim vstupu</dt>
                <dd style={{ color: "var(--wp-text)" }}>{detail.inputMode}</dd>
              </>
            )}
            {detail.extractionMode && (
              <>
                <dt style={{ color: "var(--wp-text-muted)" }}>Režim extrakce</dt>
                <dd style={{ color: "var(--wp-text)" }}>{detail.extractionMode}</dd>
              </>
            )}
          </dl>
          {detail.fieldConfidenceMap && Object.keys(detail.fieldConfidenceMap).length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: "var(--wp-text-muted)" }}>Jistota po sekcích</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(detail.fieldConfidenceMap).map(([key, val]) => (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs"
                    style={{
                      background: (val as number) >= 0.7 ? "var(--wp-bg)" : "var(--wp-bg)",
                      borderColor: "var(--wp-border)",
                      color: (val as number) >= 0.7 ? "var(--wp-text)" : "var(--wp-text-muted)",
                    }}
                  >
                    {SECTION_LABELS[key] ?? key}: {Math.round((val as number) * 100)} %
                  </span>
                ))}
              </div>
            </div>
          )}
          {detail.validationWarnings && detail.validationWarnings.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: "var(--wp-text-muted)" }}>Validační upozornění</p>
              <ul className="list-disc list-inside text-sm" style={{ color: "var(--wp-text)" }}>
                {detail.validationWarnings.map((w, i) => (
                  <li key={i}>{w.field ? `[${w.field}] ` : ""}{w.message}</li>
                ))}
              </ul>
            </div>
          )}
          {detail.classificationReasons && detail.classificationReasons.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: "var(--wp-text-muted)" }}>Důvody klasifikace</p>
              <ul className="list-disc list-inside text-sm" style={{ color: "var(--wp-text)" }}>
                {detail.classificationReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

type Props = {
  detail: ReviewDetail;
  extracted: Record<string, unknown> | undefined;
  client: Record<string, unknown> | undefined;
  candidates: ClientMatchCandidate[];
  isApplied: boolean;
  canApproveReject: boolean;
  isApproved: boolean;
  hasResolvedClient: boolean;
  canApply: boolean;
  lowConfidence: boolean;
  missingFields: string[];
  actionLoading: string | null;
  rejectReason: string;
  showRejectModal: boolean;
  showApplyConfirm: boolean;
  onOpenOriginalFile: () => void;
  onSelectClient: (clientId: string) => void;
  onConfirmCreateNew: () => void;
  onApprove: () => void;
  onReject: () => void;
  setShowRejectModal: (v: boolean) => void;
  setRejectReason: (v: string) => void;
  setShowApplyConfirm: (v: boolean) => void;
  onApply: () => void;
};

export function ContractReviewDetailView(props: Props) {
  const {
    detail,
    extracted,
    client,
    candidates,
    isApplied,
    canApproveReject,
    isApproved,
    hasResolvedClient,
    canApply,
    lowConfidence,
    missingFields,
    actionLoading,
    rejectReason,
    showRejectModal,
    showApplyConfirm,
    onOpenOriginalFile,
    onSelectClient,
    onConfirmCreateNew,
    onApprove,
    onReject,
    setShowRejectModal,
    setRejectReason,
    setShowApplyConfirm,
    onApply,
  } = props;

  const showStickyActions = !props.isApplied && (props.canApproveReject || props.canApply);
  return (
    <div className={`flex flex-col flex-1 min-h-0 p-4 md:p-6 max-w-4xl mx-auto ${showStickyActions ? STICKY_BOTTOM_CTA_PADDING_CLASS : ""}`}>
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/portal/contracts/review"
          className="flex items-center gap-1 text-sm"
          style={{ color: "var(--wp-accent)" }}
        >
          <ChevronLeft size={18} /> Zpět na seznam
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold" style={{ color: "var(--wp-text)" }}>
          Review: {detail.fileName}
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--wp-text-muted)" }}>
          Stav: {detail.processingStatus} / {detail.reviewStatus ?? "—"}
          {detail.appliedAt && ` · Aplikováno ${new Date(detail.appliedAt).toLocaleString("cs-CZ")}`}
        </p>
      </div>

      {detail.processingStatus === "failed" && detail.errorMessage && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-3 mb-4"
          role="alert"
        >
          <p className="text-sm font-medium text-red-800 dark:text-red-200">Extrakce ze smlouvy selhala</p>
          <p className="text-sm mt-1 text-red-700 dark:text-red-300">{detail.errorMessage}</p>
          <p className="text-xs mt-2 text-red-600 dark:text-red-400">
            Možné příčiny: PDF je naskenované (obrázek) a model neumí text rozpoznat, dokument je poškozený, nebo došlo k chybě API. Zkuste jiný soubor nebo ověřte OPENAI_API_KEY.
          </p>
        </div>
      )}

      {lowConfidence && (
        <div
          className="flex items-start gap-2 rounded-lg border p-3 mb-4"
          style={{ borderColor: "var(--wp-border)", background: "var(--wp-bg)" }}
        >
          <AlertTriangle size={20} className="shrink-0" style={{ color: "var(--wp-text-muted)" }} />
          <p className="text-sm" style={{ color: "var(--wp-text)" }}>
            Nízká confidence ({Math.round((detail.confidence ?? 0) * 100)} %). Zkontrolujte extrahované údaje.
          </p>
        </div>
      )}

      {missingFields.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 mb-4 text-sm">
          <p className="font-medium mb-1" style={{ color: "var(--wp-text)" }}>Chybějící pole</p>
          <ul className="list-disc list-inside" style={{ color: "var(--wp-text-muted)" }}>
            {missingFields.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="rounded-xl border p-4 mb-4" style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--wp-text-muted)" }}>
          Metadata souboru
        </h2>
        <p className="text-sm" style={{ color: "var(--wp-text)" }}>
          Soubor: {detail.fileName}
        </p>
        <button
          type="button"
          onClick={onOpenOriginalFile}
          className="mt-2 text-sm font-medium flex items-center gap-1"
          style={{ color: "var(--wp-accent)" }}
        >
          <FileText size={14} /> Otevřít originální PDF
        </button>
      </section>

      {(
        detail.detectedDocumentType ||
        detail.inputMode ||
        detail.extractionMode ||
        (detail.validationWarnings && detail.validationWarnings.length > 0) ||
        (detail.fieldConfidenceMap && Object.keys(detail.fieldConfidenceMap).length > 0) ||
        (detail.classificationReasons && detail.classificationReasons.length > 0)
      ) && (
        <PipelineDiagnosticsSection detail={detail} />
      )}

      {extracted && (
        <section className="rounded-xl border p-4 mb-4" style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--wp-text-muted)" }}>
            Extrahovaná smlouva
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <dt style={{ color: "var(--wp-text-muted)" }}>Instituce</dt>
            <dd style={{ color: "var(--wp-text)" }}>{String(extracted.institutionName ?? "—")}</dd>
            <dt style={{ color: "var(--wp-text-muted)" }}>Číslo smlouvy</dt>
            <dd style={{ color: "var(--wp-text)" }}>{String(extracted.contractNumber ?? "—")}</dd>
            <dt style={{ color: "var(--wp-text-muted)" }}>Produkt</dt>
            <dd style={{ color: "var(--wp-text)" }}>{String(extracted.productName ?? "—")}</dd>
            <dt style={{ color: "var(--wp-text-muted)" }}>Klient</dt>
            <dd style={{ color: "var(--wp-text)" }}>
              {client ? [client.fullName, client.firstName, client.lastName].filter(Boolean).join(" ") || "—" : "—"}
            </dd>
            {client && (
              <>
                <dt style={{ color: "var(--wp-text-muted)" }}>E-mail / telefon</dt>
                <dd style={{ color: "var(--wp-text)" }}>{[client.email, client.phone].filter(Boolean).join(" · ") || "—"}</dd>
              </>
            )}
          </dl>
        </section>
      )}

      {detail.reasonsForReview?.length ? (
        <section className="rounded-xl border p-4 mb-4" style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--wp-text-muted)" }}>
            Důvody pro kontrolu
          </h2>
          <ul className="list-disc list-inside text-sm" style={{ color: "var(--wp-text)" }}>
            {detail.reasonsForReview.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border p-4 mb-4" style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--wp-text-muted)" }}>
          Kandidáti klientů
        </h2>
        {candidates.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--wp-text-muted)" }}>
            Žádní kandidáti. Při aplikaci bude vytvořen nový klient podle draft akce.
          </p>
        ) : (
          <ul className="space-y-2">
            {candidates.map((c) => (
              <li
                key={c.clientId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                style={{ borderColor: "var(--wp-border)", background: "var(--wp-bg)" }}
              >
                <div>
                  <p className="font-medium text-sm" style={{ color: "var(--wp-text)" }}>
                    {c.displayName ?? c.clientId}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--wp-text-muted)" }}>
                    Skóre: {Math.round(c.score * 100)} % · {c.confidence} · {c.reasons.join(", ")}
                  </p>
                </div>
                {!isApplied && (
                  <button
                    type="button"
                    onClick={() => onSelectClient(c.clientId)}
                    disabled={!!actionLoading || detail.matchedClientId === c.clientId}
                  className="text-sm px-3 min-h-[44px] rounded-lg border flex items-center gap-1"
                    style={{
                      borderColor: "var(--wp-border)",
                      color: detail.matchedClientId === c.clientId ? "var(--wp-accent)" : "var(--wp-text)",
                    }}
                  >
                    {detail.matchedClientId === c.clientId ? <Check size={14} /> : null}
                    {detail.matchedClientId === c.clientId ? "Vybráno" : "Vybrat tohoto klienta"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!isApplied && (
          <div className="mt-3">
            <button
              type="button"
              onClick={onConfirmCreateNew}
              disabled={!!actionLoading || detail.createNewClientConfirmed === "true"}
              className="text-sm px-3 min-h-[44px] rounded-lg border flex items-center gap-2"
              style={{
                borderColor: "var(--wp-border)",
                color: detail.createNewClientConfirmed === "true" ? "var(--wp-accent)" : "var(--wp-text)",
              }}
            >
              <UserPlus size={16} />
              {detail.createNewClientConfirmed === "true" ? "Vytvoření nového klienta potvrzeno" : "Vytvořit nového klienta"}
            </button>
          </div>
        )}
      </section>

      {detail.draftActions?.length ? (
        <section className="rounded-xl border p-4 mb-4" style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--wp-text-muted)" }}>
            Návrhové akce
          </h2>
          <ul className="text-sm space-y-1" style={{ color: "var(--wp-text)" }}>
            {detail.draftActions.map((a, i) => (
              <li key={i}>{a.label}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {isApplied && detail.applyResultPayload && (
        <section className="rounded-xl border p-4 mb-4" style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--wp-text-muted)" }}>
            Výsledek aplikace
          </h2>
          <ul className="text-sm space-y-1" style={{ color: "var(--wp-text)" }}>
            {detail.applyResultPayload.createdClientId && (
              <li>Vytvořen klient: {detail.applyResultPayload.createdClientId}</li>
            )}
            {detail.applyResultPayload.linkedClientId && !detail.applyResultPayload.createdClientId && (
              <li>Propojen klient: {detail.applyResultPayload.linkedClientId}</li>
            )}
            {detail.applyResultPayload.createdContractId && (
              <li>Vytvořena smlouva: {detail.applyResultPayload.createdContractId}</li>
            )}
            {detail.applyResultPayload.createdTaskId && (
              <li>Vytvořen úkol: {detail.applyResultPayload.createdTaskId}</li>
            )}
          </ul>
          {detail.applyResultPayload.bridgeSuggestions?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {detail.applyResultPayload.bridgeSuggestions.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="min-h-[44px] rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
        </section>
      )}

      {!isApplied && (
        <section className="rounded-xl border p-4 flex flex-wrap gap-3" style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}>
          {canApproveReject && (
            <>
              <button
                type="button"
                onClick={onApprove}
                disabled={!!actionLoading}
                className="px-4 min-h-[44px] rounded-lg font-medium flex items-center gap-2 bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                <Check size={18} /> Schválit
              </button>
              <button
                type="button"
                onClick={() => setShowRejectModal(true)}
                disabled={!!actionLoading}
                  className="px-4 min-h-[44px] rounded-lg font-medium flex items-center gap-2 border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                <X size={18} /> Zamítnout
              </button>
            </>
          )}
          {canApply && (
            <button
              type="button"
              onClick={() => setShowApplyConfirm(true)}
              disabled={!!actionLoading}
              className="px-4 min-h-[44px] rounded-lg font-medium flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Send size={18} /> Aplikovat do CRM
            </button>
          )}
          {isApproved && !hasResolvedClient && (
            <p className="text-sm w-full" style={{ color: "var(--wp-text-muted)" }}>
              Pro aplikaci vyberte klienta z kandidátů nebo potvrďte vytvoření nového klienta.
            </p>
          )}
        </section>
      )}

      {!isApplied && (canApproveReject || canApply) && (
        <StickyBottomCTA showBelow="md">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {canApproveReject && (
              <>
                <button
                  type="button"
                  onClick={onApprove}
                  disabled={!!actionLoading}
                  className="min-h-[44px] px-4 py-2 rounded-lg font-medium flex items-center gap-2 bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                >
                  <Check size={18} /> Schválit
                </button>
                <button
                  type="button"
                  onClick={() => setShowRejectModal(true)}
                  disabled={!!actionLoading}
                  className="min-h-[44px] px-4 py-2 rounded-lg font-medium flex items-center gap-2 border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  <X size={18} /> Zamítnout
                </button>
              </>
            )}
            {canApply && (
              <button
                type="button"
                onClick={() => setShowApplyConfirm(true)}
                disabled={!!actionLoading}
                className="min-h-[44px] px-4 py-2 rounded-lg font-medium flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Send size={18} /> Aplikovat do CRM
              </button>
            )}
          </div>
        </StickyBottomCTA>
      )}

      {showRejectModal && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/50" onClick={() => setShowRejectModal(false)}>
          <div
            className="rounded-xl border p-6 max-w-md w-full shadow-lg"
            style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--wp-text)" }}>Zamítnout položku</h3>
            <label className="block text-sm mt-2" style={{ color: "var(--wp-text-muted)" }}>
              Důvod (volitelné)
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="w-full mt-1 rounded-lg border p-2 text-sm min-h-[88px]"
              style={{ borderColor: "var(--wp-border)", color: "var(--wp-text)" }}
              placeholder="Např. špatná smlouva, duplicita…"
            />
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="px-3 min-h-[44px] rounded-lg border text-sm"
                style={{ borderColor: "var(--wp-border)", color: "var(--wp-text)" }}
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={onReject}
                disabled={!!actionLoading}
                className="px-3 min-h-[44px] rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading === "reject" ? "Zamítám…" : "Zamítnout"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showApplyConfirm && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/50" onClick={() => setShowApplyConfirm(false)}>
          <div
            className="rounded-xl border p-6 max-w-md w-full shadow-lg"
            style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--wp-text)" }}>Aplikovat do CRM?</h3>
            <p className="text-sm mb-4" style={{ color: "var(--wp-text-muted)" }}>
              Návrhové akce (klient, smlouva, úkol…) budou zapsány do CRM. Tuto akci lze provést jen jednou.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowApplyConfirm(false)}
                className="px-3 min-h-[44px] rounded-lg border text-sm"
                style={{ borderColor: "var(--wp-border)", color: "var(--wp-text)" }}
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={onApply}
                disabled={!!actionLoading}
                className="px-3 min-h-[44px] rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {actionLoading === "apply" ? "Aplikuji…" : "Aplikovat"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

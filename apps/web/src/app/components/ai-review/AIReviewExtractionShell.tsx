"use client";

import dynamic from "next/dynamic";
import React, { useReducer, useCallback, useEffect, useState } from "react";
import {
  FileText,
  Eye,
  AlertCircle,
  UserPlus,
  Check,
  Send,
  X,
  Trash2,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import type {
  ExtractionDocument,
  ExtractionReviewState,
  ExtractionReviewAction,
  AIRecommendation,
  FieldFilter,
} from "@/lib/ai-review/types";
import { hasMeaningfulReviewContent } from "@/lib/ai-review/mappers";
import { AIReviewTopBar } from "./AIReviewTopBar";
import { ExtractionLeftPanel } from "./ExtractionLeftPanel";

const PDFViewerPanel = dynamic(
  () => import("./PDFViewerPanel").then((m) => m.PDFViewerPanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[240px] flex-1 items-center justify-center rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] px-4 text-sm font-medium text-[color:var(--wp-text-secondary)] animate-pulse">
        Načítám prohlížeč PDF…
      </div>
    ),
  },
);

const initialState: ExtractionReviewState = {
  activeFieldId: null,
  activePage: 1,
  zoomLevel: 100,
  filter: "all",
  collapsedGroups: {},
  dismissedRecommendations: {},
  editedFields: {},
  confirmedFields: {},
  isFullscreen: false,
  showPdfOnMobile: false,
};

function reducer(
  state: ExtractionReviewState,
  action: ExtractionReviewAction
): ExtractionReviewState {
  switch (action.type) {
    case "SET_ACTIVE_FIELD":
      return {
        ...state,
        activeFieldId: action.fieldId,
        activePage: action.page ?? state.activePage,
      };
    case "SET_PAGE":
      return { ...state, activePage: action.page };
    case "SET_ZOOM":
      return { ...state, zoomLevel: action.level };
    case "SET_FILTER":
      return { ...state, filter: action.filter };
    case "TOGGLE_GROUP":
      return {
        ...state,
        collapsedGroups: {
          ...state.collapsedGroups,
          [action.groupId]: !state.collapsedGroups[action.groupId],
        },
      };
    case "DISMISS_RECOMMENDATION":
      return {
        ...state,
        dismissedRecommendations: {
          ...state.dismissedRecommendations,
          [action.recId]: true,
        },
      };
    case "RESTORE_RECOMMENDATION": {
      const next = { ...state.dismissedRecommendations };
      delete next[action.recId];
      return { ...state, dismissedRecommendations: next };
    }
    case "EDIT_FIELD":
      return {
        ...state,
        editedFields: { ...state.editedFields, [action.fieldId]: action.value },
      };
    case "CONFIRM_FIELD":
      return {
        ...state,
        confirmedFields: { ...state.confirmedFields, [action.fieldId]: true },
      };
    case "REVERT_FIELD": {
      const nextEdited = { ...state.editedFields };
      delete nextEdited[action.fieldId];
      const nextConfirmed = { ...state.confirmedFields };
      delete nextConfirmed[action.fieldId];
      return { ...state, editedFields: nextEdited, confirmedFields: nextConfirmed };
    }
    case "SET_FULLSCREEN":
      return { ...state, isFullscreen: action.isFullscreen };
    case "SET_SHOW_PDF_MOBILE":
      return { ...state, showPdfOnMobile: action.show };
    default:
      return state;
  }
}

type Props = {
  doc: ExtractionDocument;
  onBack: () => void;
  onDiscard: () => void;
  onApprove: (editedFields: Record<string, string>) => void | Promise<void>;
  onApproveAndApply?: (editedFields: Record<string, string>) => void | Promise<void>;
  onReject?: (reason?: string) => void;
  onApply?: () => void;
  onSelectClient?: (clientId: string) => void;
  onConfirmCreateNew?: () => void;
  isApproving?: boolean;
  actionLoading?: string | null;
};

export function AIReviewExtractionShell({
  doc,
  onBack,
  onDiscard,
  onApprove,
  onApproveAndApply,
  onReject,
  onApply,
  onSelectClient,
  onConfirmCreateNew,
  isApproving,
  actionLoading,
}: Props) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);

  const isFailed = doc.processingStatus === "failed";
  const isProcessing = doc.processingStatus === "uploaded" || doc.processingStatus === "processing";
  const hasData = hasMeaningfulReviewContent(doc);
  const isPending = doc.reviewStatus === "pending" || !doc.reviewStatus;
  const canApproveReject =
    isPending &&
    (doc.processingStatus === "extracted" ||
      doc.processingStatus === "review_required" ||
      doc.processingStatus === "blocked");
  const isApproved = doc.reviewStatus === "approved";
  const hasResolvedClient = !!doc.matchedClientId || doc.createNewClientConfirmed === "true";
  const canApply = isApproved && hasResolvedClient && !doc.isApplied;
  const canApproveAndApply =
    !!onApproveAndApply && canApproveReject && hasResolvedClient;

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.isFullscreen) {
        dispatch({ type: "SET_FULLSCREEN", isFullscreen: false });
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [state.isFullscreen]);

  const handleFieldClick = useCallback((fieldId: string, page?: number) => {
    dispatch({ type: "SET_ACTIVE_FIELD", fieldId, page });
  }, []);

  const handleHighlightClick = useCallback((fieldId: string) => {
    dispatch({ type: "SET_ACTIVE_FIELD", fieldId });
  }, []);

  const handleEdit = useCallback((fieldId: string, value: string) => {
    dispatch({ type: "EDIT_FIELD", fieldId, value });
  }, []);

  const handleConfirm = useCallback((fieldId: string) => {
    dispatch({ type: "CONFIRM_FIELD", fieldId });
  }, []);

  const handleRevert = useCallback((fieldId: string) => {
    dispatch({ type: "REVERT_FIELD", fieldId });
  }, []);

  const handleFilterChange = useCallback((filter: FieldFilter) => {
    dispatch({ type: "SET_FILTER", filter });
  }, []);

  const handleToggleGroup = useCallback((groupId: string) => {
    dispatch({ type: "TOGGLE_GROUP", groupId });
  }, []);

  const handleDismissRec = useCallback((id: string) => {
    dispatch({ type: "DISMISS_RECOMMENDATION", recId: id });
  }, []);

  const handleRestoreRec = useCallback((id: string) => {
    dispatch({ type: "RESTORE_RECOMMENDATION", recId: id });
  }, []);

  const handleCreateTask = useCallback((_rec: AIRecommendation) => {
    // TODO: wire to actual task creation flow
  }, []);

  const handleApproveClick = useCallback(() => {
    void Promise.resolve(onApprove(state.editedFields));
  }, [onApprove, state.editedFields]);

  const handleApproveAndApplyClick = useCallback(() => {
    if (!onApproveAndApply) return;
    void Promise.resolve(onApproveAndApply(state.editedFields));
  }, [onApproveAndApply, state.editedFields]);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[#f8fafc] font-sans text-[color:var(--wp-text)] overflow-hidden -m-4 md:-m-6">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800;900&display=swap');
        .font-display { font-family: 'Plus Jakarta Sans', sans-serif; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scroll::-webkit-scrollbar { width: 6px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 10px; }
      `}</style>

      <AIReviewTopBar
        doc={doc}
        onBack={onBack}
        onDiscard={onDiscard}
        onApprove={handleApproveClick}
        onApproveAndApply={canApproveAndApply ? handleApproveAndApplyClick : undefined}
        isApproving={isApproving}
        canApproveReject={canApproveReject}
        canApproveAndApply={canApproveAndApply}
        canApply={canApply}
        isApplied={doc.isApplied}
        onReject={() => setShowRejectModal(true)}
        onApply={() => setShowApplyConfirm(true)}
        actionLoading={actionLoading}
      />

      {isApproved && !doc.isApplied && hasResolvedClient && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 md:px-6 py-3">
          <div className="max-w-5xl mx-auto flex items-start gap-3">
            <AlertCircle size={18} className="text-amber-700 shrink-0 mt-0.5" />
            <p className="text-sm font-medium text-amber-950 leading-snug">
              Kontrola je schválená, ale klient a smlouva v CRM ještě nevznikly, dokud neklepnete na{" "}
              <strong>Zapsat do CRM</strong>. Schválení jen potvrzuje správnost extrakce.
            </p>
          </div>
        </div>
      )}

      {/* Failed state banner */}
      {isFailed && doc.errorMessage && (
        <div className="bg-rose-50 border-b border-rose-200 px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-start gap-3">
            <AlertCircle size={20} className="text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-rose-900 mb-1">Extrakce selhala</h4>
              <p className="text-xs text-rose-800 leading-relaxed">{doc.errorMessage}</p>
              <p className="text-xs text-rose-600 mt-1">
                Možné příčiny: PDF je naskenované (obrázek) a model neumí text rozpoznat, dokument je poškozený, nebo došlo k chybě API.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Processing state */}
      {isProcessing && (
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-4">
          <div className="max-w-5xl mx-auto flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex items-center gap-3 min-h-[44px]">
              <div
                className="w-5 h-5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin shrink-0"
                aria-hidden
              />
              <p className="text-sm font-bold text-blue-900">
                {doc.processingStageLabel ?? "Dokument se zpracovává…"}
              </p>
            </div>
            {doc.processingStageLabel ? (
              <p className="text-xs text-blue-800 sm:ml-8 pl-0 sm:pl-0">
                Analýza může trvat řádově sekundy až desítky sekund.
              </p>
            ) : null}
          </div>
        </div>
      )}

      {/* Applied state */}
      {doc.isApplied && doc.applyResultPayload && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-4">
          <div className="max-w-5xl mx-auto">
            <h4 className="text-sm font-bold text-emerald-900 mb-2">Aplikováno do CRM</h4>
            <div className="flex flex-wrap gap-2 text-xs text-emerald-800">
              {doc.applyResultPayload.createdClientId && <span>Klient vytvořen</span>}
              {doc.applyResultPayload.createdContractId && <span>Smlouva vytvořena</span>}
              {doc.applyResultPayload.createdTaskId && <span>Úkol vytvořen</span>}
            </div>
            {doc.applyResultPayload.bridgeSuggestions?.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {doc.applyResultPayload.bridgeSuggestions.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="px-3 py-1.5 rounded-lg bg-[color:var(--wp-surface-card)] border border-emerald-200 text-xs font-bold text-emerald-700 hover:bg-emerald-50 transition-colors"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {(() => {
        if (isFailed || isProcessing) return null;
        const showApplyIssues =
          doc.applyGate &&
          (doc.applyGate.blockedReasons.length > 0 ||
            (doc.applyGate.applyBarrierReasons?.length ?? 0) > 0 ||
            doc.applyGate.warnings.length > 0);
        const showPrepFailed = doc.pipelineInsights?.preprocessStatus === "failed";
        const showLowCov =
          typeof doc.pipelineInsights?.textCoverageEstimate === "number" &&
          doc.pipelineInsights.textCoverageEstimate < 0.35;
        const showProposal = (doc.reasonsForReview ?? []).some(
          (r) =>
            r.includes("proposal_or_modelation") ||
            r.includes("proposal_not_final") ||
            r.includes("offer_not_binding")
        );
        if (!showApplyIssues && !showPrepFailed && !showLowCov && !showProposal) return null;
        return (
          <div className="border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] px-4 py-1.5 md:px-6">
            <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-x-3 gap-y-1">
              {doc.applyGate && doc.applyGate.blockedReasons.length > 0 ? (
                <span className="text-[11px] text-red-800 font-semibold">
                  Blokace: {doc.applyGate.blockedReasons.join(", ")}
                </span>
              ) : null}
              {doc.applyGate && (doc.applyGate.applyBarrierReasons?.length ?? 0) > 0 ? (
                <span className="text-[11px] text-amber-900 font-medium">
                  Návrh/modelace — nelze automaticky aplikovat jako finální smlouvu.
                </span>
              ) : null}
              {doc.applyGate && doc.applyGate.warnings.length > 0 ? (
                <span className="text-[11px] text-amber-800">{doc.applyGate.warnings.join(", ")}</span>
              ) : null}
              {showPrepFailed ? (
                <span className="text-[11px] text-amber-800">
                  Preprocessing selhal — porovnejte extrakci s originálem.
                </span>
              ) : null}
              {showLowCov ? (
                <span className="text-[11px] text-amber-800">
                  Nízké pokrytí textem (
                  {Math.round((doc.pipelineInsights?.textCoverageEstimate ?? 0) * 100)} %) — zkontrolujte pole
                  oproti dokumentu.
                </span>
              ) : null}
              {showProposal ? (
                <span className="text-[11px] font-semibold text-amber-900">
                  Návrh / modelace — ne finální smlouva.
                </span>
              ) : null}
            </div>
          </div>
        );
      })()}

      {/* Mobile tab switcher */}
      <div className="lg:hidden flex border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]">
        <button
          onClick={() => dispatch({ type: "SET_SHOW_PDF_MOBILE", show: false })}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-widest text-center transition-colors ${
            !state.showPdfOnMobile
              ? "text-indigo-600 border-b-2 border-indigo-600"
              : "text-[color:var(--wp-text-secondary)]"
          }`}
        >
          <FileText size={14} className="inline-block mr-1.5 -mt-0.5" />
          Kontrola
        </button>
        <button
          onClick={() => dispatch({ type: "SET_SHOW_PDF_MOBILE", show: true })}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-widest text-center transition-colors ${
            state.showPdfOnMobile
              ? "text-indigo-600 border-b-2 border-indigo-600"
              : "text-[color:var(--wp-text-secondary)]"
          }`}
        >
          <Eye size={14} className="inline-block mr-1.5 -mt-0.5" />
          Dokument
        </button>
      </div>

      <main className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left panel */}
        <section
          className={`flex min-h-0 w-full min-w-0 flex-col bg-[#f4f7f9] border-r border-[color:var(--wp-surface-card-border)] lg:w-[48%] ${
            state.showPdfOnMobile ? "hidden lg:flex" : "flex"
          }`}
        >
          {hasData ? (
            <ExtractionLeftPanel
              doc={doc}
              state={state}
              onFieldClick={handleFieldClick}
              onEdit={handleEdit}
              onConfirm={handleConfirm}
              onRevert={handleRevert}
              onFilterChange={handleFilterChange}
              onToggleGroup={handleToggleGroup}
              onDismissRec={handleDismissRec}
              onRestoreRec={handleRestoreRec}
              onCreateTask={handleCreateTask}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="w-16 h-16 mx-auto mb-4 bg-[color:var(--wp-surface-muted)] rounded-2xl flex items-center justify-center">
                  <FileText size={28} className="text-[color:var(--wp-text-tertiary)]" />
                </div>
                <h3 className="text-lg font-bold text-[color:var(--wp-text)] mb-2">
                  {isFailed ? "Extrakce se nezdařila" : isProcessing ? "Zpracovávám…" : "Žádná data"}
                </h3>
                <p className="text-sm text-[color:var(--wp-text-secondary)] leading-relaxed">
                  {isFailed
                    ? "AI nedokázala z dokumentu extrahovat data. Zkuste nahrát čitelnější verzi dokumentu nebo jiný formát."
                    : isProcessing
                      ? "Dokument se právě zpracovává. Extrahovaná data se zobrazí automaticky."
                      : "Dokument zatím neobsahuje extrahovaná data."}
                </p>
              </div>
            </div>
          )}

          {/* Client match + actions at bottom of left panel */}
          {!doc.isApplied && hasData && (
            <div className="border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4 md:p-6 shrink-0">
              <details className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/40 px-4 py-3">
                <summary className="cursor-pointer list-none text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)]">
                  Klient a další akce
                </summary>
                <div className="mt-4 space-y-4">
                  {doc.clientMatchCandidates.length > 0 ? (
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] mb-2">
                        Kandidáti klientů
                      </h4>
                      <div className="space-y-2">
                        {doc.clientMatchCandidates.map((c) => (
                          <div
                            key={c.clientId}
                            className="flex items-center justify-between gap-2 p-3 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-[color:var(--wp-text)] truncate">
                                {c.displayName ?? c.clientId}
                              </p>
                              <p className="text-[10px] text-[color:var(--wp-text-secondary)]">
                                {Math.round(c.score * 100)}% · {c.reasons.join(", ")}
                              </p>
                            </div>
                            <button
                              onClick={() => onSelectClient?.(c.clientId)}
                              disabled={!!actionLoading || doc.matchedClientId === c.clientId}
                              className={`shrink-0 px-3 py-2 rounded-lg text-xs font-bold transition-colors min-h-[44px] ${
                                doc.matchedClientId === c.clientId
                                  ? "bg-indigo-100 text-indigo-700"
                                  : "bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
                              }`}
                            >
                              {doc.matchedClientId === c.clientId ? (
                                <span className="flex items-center gap-1">
                                  <Check size={14} /> Vybrán
                                </span>
                              ) : (
                                "Vybrat"
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={onConfirmCreateNew}
                      disabled={!!actionLoading || doc.createNewClientConfirmed === "true"}
                      className="flex items-center gap-2 text-xs font-bold text-[color:var(--wp-text-secondary)] hover:text-indigo-600 transition-colors min-h-[44px]"
                    >
                      <UserPlus size={14} />
                      {doc.createNewClientConfirmed === "true"
                        ? "Nový klient potvrzen"
                        : "Vytvořit nového klienta"}
                    </button>
                    {doc.clientMatchCandidates.length === 0 ? (
                      <p className="text-xs text-[color:var(--wp-text-tertiary)]">
                        Nepodařilo se navrhnout vhodného klienta. Vytvoření nového klienta je dostupné ručně.
                      </p>
                    ) : null}
                  </div>

                  <div className="pt-3 border-t border-[color:var(--wp-surface-card-border)]">
                    <button
                      onClick={onDiscard}
                      disabled={actionLoading === "delete"}
                      className="flex items-center gap-2 text-xs font-bold text-rose-600 hover:text-rose-800 transition-colors min-h-[44px]"
                    >
                      {actionLoading === "delete" ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                      Smazat dokument
                    </button>
                  </div>
                </div>
              </details>
            </div>
          )}
        </section>

        {/* Right panel */}
        <aside
          className={`flex min-h-0 w-full min-w-0 flex-col lg:w-[52%] ${
            state.showPdfOnMobile ? "flex" : "hidden lg:flex"
          }`}
        >
          <PDFViewerPanel
            doc={doc}
            activeFieldId={state.activeFieldId}
            activePage={state.activePage}
            zoomLevel={state.zoomLevel}
            isFullscreen={state.isFullscreen}
            onZoomChange={(level) => dispatch({ type: "SET_ZOOM", level })}
            onPageChange={(page) => dispatch({ type: "SET_PAGE", page })}
            onFullscreenToggle={() =>
              dispatch({ type: "SET_FULLSCREEN", isFullscreen: !state.isFullscreen })
            }
            onHighlightClick={handleHighlightClick}
          />
        </aside>
      </main>

      {/* Reject modal */}
      {showRejectModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setShowRejectModal(false)}
        >
          <div
            className="rounded-2xl bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] p-6 max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-[color:var(--wp-text)] mb-2">Zamítnout extrakci</h3>
            <label className="block text-sm text-[color:var(--wp-text-secondary)] mt-2">Důvod (volitelné)</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="w-full mt-1 rounded-xl border border-[color:var(--wp-surface-card-border)] p-3 text-sm min-h-[88px] focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 outline-none"
              placeholder="Např. špatná smlouva, duplicita…"
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-4 min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] text-sm font-bold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
              >
                Zrušit
              </button>
              <button
                onClick={() => {
                  onReject?.(rejectReason);
                  setShowRejectModal(false);
                  setRejectReason("");
                }}
                disabled={actionLoading === "reject"}
                className="px-4 min-h-[44px] rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 disabled:opacity-50"
              >
                {actionLoading === "reject" ? "Zamítám…" : "Zamítnout"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Apply confirm modal */}
      {showApplyConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setShowApplyConfirm(false)}
        >
          <div
            className="rounded-2xl bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] p-6 max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-[color:var(--wp-text)] mb-2">Zapsat do CRM?</h3>
            <p className="text-sm text-[color:var(--wp-text-secondary)] mb-4">
              Návrhové akce (klient, smlouva, úkol…) budou zapsány do databáze. Tuto akci lze provést jen jednou.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowApplyConfirm(false)}
                className="px-4 min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] text-sm font-bold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={() => {
                  onApply?.();
                  setShowApplyConfirm(false);
                }}
                disabled={actionLoading === "apply" || actionLoading === "approveApply"}
                className="px-4 min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50"
              >
                {actionLoading === "apply" ? "Zapisuji…" : "Zapsat"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

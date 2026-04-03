"use client";

import dynamic from "next/dynamic";
import React, { useReducer, useCallback, useEffect, useState } from "react";
import {
  FileText,
  Eye,
  AlertCircle,
  ArrowLeft,
  UserPlus,
  Check,
  Send,
  X,
  Trash2,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { createTask } from "@/app/actions/tasks";
import { useToast } from "@/app/components/Toast";
import type {
  ExtractionDocument,
  ExtractionReviewState,
  ExtractionReviewAction,
  AIRecommendation,
  FieldFilter,
} from "@/lib/ai-review/types";
import { hasMeaningfulReviewContent } from "@/lib/ai-review/mappers";
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

const APPLY_GATE_REASON_LABELS: Record<string, string> = {
  PROPOSAL_NOT_FINAL: "Dokument působí jako návrh nebo modelace.",
  NON_FINAL_LIFECYCLE: "Rozpoznaný životní cyklus neodpovídá finální smlouvě.",
  LOW_CLASSIFICATION_CONFIDENCE: "Typ dokumentu není rozpoznaný dost jistě.",
  LOW_EXTRACTION_CONFIDENCE: "Extrakce má nižší jistotu a potřebuje kontrolu.",
  LOW_TEXT_COVERAGE: "Dokument má slabé textové pokrytí.",
  PREPROCESS_FAILED: "Předzpracování dokumentu nebylo zcela spolehlivé.",
  PIPELINE_FAILED_STEP: "Část pipeline během zpracování selhala.",
  AMBIGUOUS_CLIENT_MATCH: "V CRM je více možných klientů a je potřeba vybrat správného.",
  LLM_CLIENT_MATCH_AMBIGUOUS: "AI našla více možných klientů.",
  UNSUPPORTED_DOCUMENT_TYPE: "Tento typ dokumentu nelze zapsat přímo do CRM.",
  PAYMENT_MISSING_AMOUNT: "Chybí částka platby.",
  PAYMENT_MISSING_TARGET: "Chybí účet nebo cíl platby.",
  PAYMENT_MISSING_FREQUENCY: "Chybí frekvence platby.",
  PAYMENT_MISSING_IDENTIFIER: "Chybí variabilní nebo konstantní symbol.",
  PAYMENT_MISSING_INSTITUTION: "Chybí příjemce nebo produkt platby.",
  PAYMENT_NEEDS_HUMAN_REVIEW: "Platební údaje potřebují ruční kontrolu.",
  PAYMENT_LOW_CONFIDENCE: "Platební údaje mají nízkou jistotu.",
};

function humanizeApplyGateReason(code: string): string {
  if (!code) return "";
  if (APPLY_GATE_REASON_LABELS[code]) return APPLY_GATE_REASON_LABELS[code];
  if (code.startsWith("LOW_FIELD_CONFIDENCE:")) {
    const fieldName = code.split(":").slice(1).join(":");
    return `Nízká jistota u pole ${fieldName}.`;
  }
  return code.replace(/_/g, " ").toLowerCase();
}

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
  onApproveAndApply?: (
    editedFields: Record<string, string>,
    options?: { overrideGateReasons?: string[]; overrideReason?: string }
  ) => void | Promise<void>;
  onReject?: (reason?: string) => void;
  onApply?: (options?: { overrideGateReasons?: string[]; overrideReason?: string }) => void;
  onSelectClient?: (clientId: string) => void;
  onConfirmCreateNew?: () => void;
  isApproving?: boolean;
  actionLoading?: string | null;
  onRefreshPdf?: () => void | Promise<void>;
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
  onRefreshPdf,
}: Props) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [applyOverrideEnabled, setApplyOverrideEnabled] = useState(false);
  const toast = useToast();

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
  const proposalBarrierReasons = doc.applyGate?.applyBarrierReasons ?? [];
  const hasProposalBarrier = proposalBarrierReasons.length > 0;
  const effectiveApplyBarrierReasons = applyOverrideEnabled ? [] : proposalBarrierReasons;

  const resolveApplyOverrideOptions = useCallback(() => {
    if (!applyOverrideEnabled || proposalBarrierReasons.length === 0) return undefined;
    return {
      overrideGateReasons: proposalBarrierReasons,
      overrideReason: "Poradce potvrdil dokument jako finální smlouvu.",
    };
  }, [applyOverrideEnabled, proposalBarrierReasons]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.isFullscreen) {
        dispatch({ type: "SET_FULLSCREEN", isFullscreen: false });
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [state.isFullscreen]);

  useEffect(() => {
    setApplyOverrideEnabled(false);
  }, [doc.id]);

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

  const handleCreateTask = useCallback(async (rec: AIRecommendation) => {
    try {
      const title = rec.title?.trim() || rec.description?.slice(0, 120).trim() || "Úkol z AI review";
      await createTask({
        title,
        description: rec.description?.trim() || undefined,
        contactId: doc.matchedClientId || undefined,
      });
      toast.showToast("Úkol vytvořen.", "success");
    } catch {
      toast.showToast("Vytvoření úkolu selhalo.", "error");
    }
  }, [doc.matchedClientId, toast]);

  const handleApproveClick = useCallback(() => {
    void Promise.resolve(onApprove(state.editedFields));
  }, [onApprove, state.editedFields]);

  const handleApproveAndApplyClick = useCallback(() => {
    if (!onApproveAndApply) return;
    void Promise.resolve(onApproveAndApply(state.editedFields, resolveApplyOverrideOptions()));
  }, [onApproveAndApply, resolveApplyOverrideOptions, state.editedFields]);

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
            <h4 className="text-sm font-bold text-emerald-900 mb-2 flex items-center gap-1.5">
              <Check size={14} className="text-emerald-600" />
              Aplikováno do CRM
            </h4>
            <div className="flex flex-wrap gap-2 text-xs text-emerald-800 mb-2">
              {doc.applyResultPayload.createdClientId && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-200">Klient vytvořen</span>
              )}
              {doc.applyResultPayload.linkedClientId && !doc.applyResultPayload.createdClientId && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-200">Klient přirazen</span>
              )}
              {doc.applyResultPayload.createdContractId && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-200">Smlouva vytvořena</span>
              )}
              {doc.applyResultPayload.createdTaskId && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-200">Úkol vytvořen</span>
              )}
              {doc.applyResultPayload.createdPaymentSetupId && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-200">Platební instrukce uloženy</span>
              )}
            </div>
            {/* Direct CRM navigation links */}
            <div className="flex flex-wrap gap-2">
              {doc.applyResultPayload.createdClientId && (
                <Link
                  href={`/portal/contacts/${doc.applyResultPayload.createdClientId}`}
                  className="px-3 py-1.5 rounded-lg bg-[color:var(--wp-surface-card)] border border-emerald-200 text-xs font-bold text-emerald-700 hover:bg-emerald-50 transition-colors flex items-center gap-1"
                >
                  <UserPlus size={11} /> Otevřít klienta
                </Link>
              )}
              {doc.applyResultPayload.linkedClientId && !doc.applyResultPayload.createdClientId && (
                <Link
                  href={`/portal/contacts/${doc.applyResultPayload.linkedClientId}`}
                  className="px-3 py-1.5 rounded-lg bg-[color:var(--wp-surface-card)] border border-emerald-200 text-xs font-bold text-emerald-700 hover:bg-emerald-50 transition-colors flex items-center gap-1"
                >
                  <UserPlus size={11} /> Zobrazit klienta
                </Link>
              )}
              {doc.applyResultPayload.bridgeSuggestions?.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="px-3 py-1.5 rounded-lg bg-[color:var(--wp-surface-card)] border border-emerald-200 text-xs font-bold text-emerald-700 hover:bg-emerald-50 transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {(() => {
        if (isFailed || isProcessing) return null;
        const showApplyIssues =
          doc.applyGate &&
          (doc.applyGate.blockedReasons.length > 0 ||
            effectiveApplyBarrierReasons.length > 0 ||
            doc.applyGate.warnings.length > 0);
        const showPrepFailed = doc.pipelineInsights?.preprocessStatus === "failed";
        const showLowCov =
          typeof doc.pipelineInsights?.textCoverageEstimate === "number" &&
          doc.pipelineInsights.textCoverageEstimate < 0.35;
        const showProposal = !applyOverrideEnabled && (doc.reasonsForReview ?? []).some(
          (r) =>
            r.includes("proposal_or_modelation") ||
            r.includes("proposal_not_final") ||
            r.includes("offer_not_binding")
        );
        if (!showApplyIssues && !showPrepFailed && !showLowCov && !showProposal && !applyOverrideEnabled) return null;
        const showFinalContractCta = hasProposalBarrier && !applyOverrideEnabled;
        return (
          <div
            className={`border-b px-4 py-3 md:px-6 ${
              showFinalContractCta || applyOverrideEnabled
                ? "border-amber-200 bg-amber-50"
                : "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]"
            }`}
          >
            <div className="max-w-6xl mx-auto flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
              <div className="min-w-0 flex flex-col gap-2 text-xs">
                {doc.applyGate && doc.applyGate.blockedReasons.length > 0 ? (
                  <span className="text-sm text-red-800 font-semibold leading-snug">
                    Blokace: {doc.applyGate.blockedReasons.map(humanizeApplyGateReason).join(" ")}
                  </span>
                ) : null}
                {effectiveApplyBarrierReasons.length > 0 ? (
                  <p className="text-sm text-amber-950 font-medium leading-snug">
                    Dokument je označen jako <strong>návrh / modelace</strong>. Pokud jde ve skutečnosti o finální
                    smlouvu, potvrďte to — jinak zápis do CRM zůstane omezený.
                  </p>
                ) : null}
                {applyOverrideEnabled ? (
                  <span className="text-sm font-semibold text-emerald-800 leading-snug">
                    Potvrzeno: dokument bereme jako finální smlouvu. Zápis do CRM je povolen (postupujte přes Schválit /
                    Zapsat do CRM).
                  </span>
                ) : null}
                {doc.applyGate && doc.applyGate.warnings.length > 0 ? (
                  <span className="text-[11px] text-amber-900 leading-snug">
                    {doc.applyGate.warnings.map(humanizeApplyGateReason).join(" ")}
                  </span>
                ) : null}
                {showPrepFailed ? (
                  <span className="text-[11px] text-amber-800 leading-snug">
                    Preprocessing selhal — porovnejte extrakci s originálem.
                  </span>
                ) : null}
                {showLowCov ? (
                  <span className="text-[11px] text-amber-800 leading-snug">
                    Nízké pokrytí textem (
                    {Math.round((doc.pipelineInsights?.textCoverageEstimate ?? 0) * 100)} %) — zkontrolujte pole
                    oproti dokumentu.
                  </span>
                ) : null}
                {showProposal ? (
                  <span className="text-sm font-semibold text-amber-950 leading-snug">
                    Návrh / modelace — ne finální smlouva.
                  </span>
                ) : null}
              </div>
              {showFinalContractCta ? (
                <button
                  type="button"
                  onClick={() => {
                    setApplyOverrideEnabled(true);
                    toast.showToast("Dokument je ručně potvrzený jako finální smlouva.", "success");
                  }}
                  className="shrink-0 inline-flex min-h-[44px] w-full md:w-auto items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-md transition-colors hover:bg-emerald-700"
                >
                  Potvrdit jako finální smlouvu
                </button>
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
          <div className="shrink-0 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-4 py-3 md:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] transition-colors hover:bg-[color:var(--wp-surface-muted)]"
              >
                <ArrowLeft size={14} />
                <span>Zpět</span>
              </button>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {canApproveReject ? (
                  <button
                    type="button"
                    onClick={() => setShowRejectModal(true)}
                    disabled={!!actionLoading}
                    className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-rose-200 px-3 text-xs font-black uppercase tracking-widest text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50"
                  >
                    <X size={14} />
                    <span>Zamítnout</span>
                  </button>
                ) : null}
                {canApproveAndApply ? (
                  <button
                    type="button"
                    onClick={handleApproveAndApplyClick}
                    disabled={!!actionLoading}
                    className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-indigo-600 px-3 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {actionLoading === "approveApply" ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                    <span>Schválit + CRM</span>
                  </button>
                ) : null}
                {canApproveReject ? (
                  <button
                    type="button"
                    onClick={handleApproveClick}
                    disabled={!!actionLoading}
                    className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 text-xs font-black uppercase tracking-widest text-[color:var(--wp-text)] transition-colors hover:bg-[color:var(--wp-surface-muted)] disabled:opacity-60"
                  >
                    {isApproving ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <Check size={14} />
                    )}
                    <span>Schválit</span>
                  </button>
                ) : null}
                {canApply ? (
                  <button
                    type="button"
                    onClick={() => setShowApplyConfirm(true)}
                    disabled={!!actionLoading}
                    className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-indigo-600 px-3 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {actionLoading === "apply" ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                    <span>Zapsat do CRM</span>
                  </button>
                ) : null}
                {!canApproveReject && !canApply && !doc.isApplied ? (
                  <button
                    type="button"
                    onClick={onDiscard}
                    disabled={actionLoading === "delete"}
                    className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] transition-colors hover:bg-[color:var(--wp-surface-muted)] disabled:opacity-50"
                  >
                    {actionLoading === "delete" ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                    <span>Zahodit</span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
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
            onRefreshPdf={onRefreshPdf}
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
                  onApply?.(resolveApplyOverrideOptions());
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

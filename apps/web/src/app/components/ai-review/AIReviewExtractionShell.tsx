"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import React, { useReducer, useCallback, useEffect, useRef, useState } from "react";
import {
  FileText,
  Eye,
  AlertCircle,
  ArrowLeft,
  UserPlus,
  UserRoundSearch,
  Check,
  Send,
  X,
  Trash2,
  RefreshCw,
  Shield,
  CreditCard,
  Download,
  CheckCircle2,
  Clock,
  Pencil,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { createOpportunity, getOpportunityStages } from "@/app/actions/pipeline";
import { createTask } from "@/app/actions/tasks";
import { useToast } from "@/app/components/Toast";
import { humanizeReviewReasonLine } from "@/lib/ai-review/czech-labels";
import { advisorFieldLabelForKey } from "@/lib/ai-review/mappers";
import type {
  ExtractionDocument,
  ExtractionReviewState,
  ExtractionReviewAction,
  DraftAction,
  FieldFilter,
  ApplyResultPayload,
  MatchVerdict,
} from "@/lib/ai-review/types";
import {
  approvedPendingApplyHint,
  buildMatchVerdictBanner,
} from "@/lib/ai/document-messages";
import { hasMeaningfulReviewContent } from "@/lib/ai-review/mappers";
import { aiReviewPdfFileName, buildAiReviewPdfBlob } from "@/lib/ai-review/build-ai-review-pdf";
import { ExtractionLeftPanel } from "./ExtractionLeftPanel";
import { ReviewAttachClientDialog } from "./ReviewAttachClientDialog";

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
  PROPOSAL_NOT_FINAL: "Dokument je klasifikován jako modelace nebo kalkulace — po potvrzení poradcem lze zapsat jako finální smlouvu.",
  NON_FINAL_LIFECYCLE: "Životní cyklus odpovídá modelaci, kalkulaci nebo ilustraci — nikoli finální smlouvě.",
  LOW_CLASSIFICATION_CONFIDENCE: "Typ dokumentu není rozpoznaný dost jistě.",
  LOW_EXTRACTION_CONFIDENCE: "Extrakce má nižší jistotu a potřebuje kontrolu.",
  LOW_TEXT_COVERAGE: "Dokument má slabé textové pokrytí.",
  PREPROCESS_FAILED: "Předzpracování dokumentu nebylo zcela spolehlivé.",
  PIPELINE_FAILED_STEP: "Část pipeline během zpracování selhala.",
  AMBIGUOUS_CLIENT_MATCH: "V evidenci Aidvisory je více možných klientů a je potřeba vybrat správného.",
  LLM_CLIENT_MATCH_AMBIGUOUS: "AI našla více možných klientů.",
  UNSUPPORTED_DOCUMENT_TYPE: "Typ dokumentu nebyl jednoznačně rozpoznán — ověřte a doplňte ručně.",
  PAYMENT_MISSING_AMOUNT: "Chybí částka platby — doplňte ručně.",
  PAYMENT_MISSING_TARGET: "Chybí účet nebo cíl platby — doplňte ručně.",
  PAYMENT_MISSING_FREQUENCY: "Chybí frekvence platby — doplňte ručně.",
  PAYMENT_MISSING_IDENTIFIER: "Chybí variabilní nebo konstantní symbol — doplňte ručně.",
  PAYMENT_MISSING_INSTITUTION: "Chybí příjemce nebo produkt platby — doplňte ručně.",
  PAYMENT_NEEDS_HUMAN_REVIEW: "Platební údaje potřebují ruční kontrolu.",
  PAYMENT_LOW_CONFIDENCE: "Platební údaje mají nízkou jistotu — ověřte v dokumentu.",
  PUBLISH_HINTS_NOT_PUBLISHABLE: "Dokument nebyl automaticky označen jako finální smlouva — po schválení poradcem bude zapsán.",
  PUBLISH_HINTS_SENSITIVE_ATTACHMENT_ONLY: "Dokument obsahuje citlivou přílohu (zdravotní dotazník, AML) — hlavní data vytěžena, citlivé sekce evidovány interně.",
  PUBLISH_HINTS_NEEDS_SPLIT: "Dokument obsahuje více logických sekcí — ověřte, zda jsou údaje správně přiřazeny.",
  PUBLISH_HINTS_NEEDS_MANUAL_VALIDATION: "Dokument vyžaduje kontrolu poradcem před zápisem.",
  PACKET_BUNDLE_WITH_SENSITIVE_ATTACHMENT:
    "Soubor obsahuje více dokumentů včetně citlivé přílohy — po schválení poradcem bude zapsán.",
  PAYMENT_INSTRUCTION_MISCLASSIFIED_AS_CONTRACT: "Platební instrukce byly rozpoznány jako smlouva — ověřte typ dokumentu.",
};

function humanizeApplyGateReason(code: string): string {
  if (!code) return "";
  if (APPLY_GATE_REASON_LABELS[code]) return APPLY_GATE_REASON_LABELS[code];
  if (code.startsWith("LOW_FIELD_CONFIDENCE:")) {
    const fieldName = code.split(":").slice(1).join(":");
    const label = advisorFieldLabelForKey(fieldName.trim());
    return `Nízká jistota u pole „${label}“ — ověřte proti dokumentu.`;
  }
  return humanizeReviewReasonLine(code);
}

/* ─── Fáze 10: Apply Enforcement Result Summary ──────────────────── */

type EnforcementTrace = NonNullable<ApplyResultPayload["policyEnforcementTrace"]>;

function pluralizeFields(n: number): string {
  if (n === 1) return "pole";
  if (n >= 2 && n <= 4) return "pole";
  return "polí";
}

function EnforcementCountBadge({
  count,
  label,
  icon,
  colorCls,
}: {
  count: number;
  label: string;
  icon: React.ReactNode;
  colorCls: string;
}) {
  if (count === 0) return null;
  return (
    <div className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${colorCls}`}>
      {icon}
      <span className="font-black tabular-nums">{count}</span>
      <span className="font-semibold">{pluralizeFields(count)} — {label}</span>
    </div>
  );
}

/** Phase 5B: Compact enforcement summary — inline counts only, field detail in disclosure. */
function ApplyEnforcementResultSummary({ trace }: { trace: EnforcementTrace }) {
  const s = trace.summary;
  const isSupporting = trace.supportingDocumentGuard;
  const total = s.totalAutoApplied + s.totalPendingConfirmation + s.totalManualRequired + s.totalExcluded;
  if (total === 0 && !isSupporting) return null;

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
  const excludedFields: string[] = [
    ...(trace.contactEnforcement?.excludedFields ?? []),
    ...(trace.contractEnforcement?.excludedFields ?? []),
    ...(trace.paymentEnforcement?.excludedFields ?? []),
  ];
  const hasDetail = pendingFields.length > 0 || manualFields.length > 0 || excludedFields.length > 0;

  if (isSupporting) {
    return (
      <p className="text-[11px] text-amber-800 font-medium leading-snug flex items-center gap-1.5">
        <AlertCircle size={12} className="shrink-0 text-amber-600" />
        Podkladový dokument — nevznikla z něj nová smlouva ani platební instrukce.
      </p>
    );
  }

  return (
    <details className="group">
      <summary className="cursor-pointer list-none select-none">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {s.totalAutoApplied > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
              <CheckCircle2 size={10} /> {s.totalAutoApplied} auto
            </span>
          )}
          {s.totalPendingConfirmation > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
              <Clock size={10} /> {s.totalPendingConfirmation} čeká
            </span>
          )}
          {s.totalManualRequired > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-bold">
              <Pencil size={10} /> {s.totalManualRequired} ručně
            </span>
          )}
          {s.totalExcluded > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">
              <XCircle size={10} /> {s.totalExcluded} vynecháno
            </span>
          )}
          {hasDetail && (
            <span className="text-[10px] text-slate-400 font-medium group-open:hidden">↓ detail</span>
          )}
          {hasDetail && (
            <span className="text-[10px] text-slate-400 font-medium hidden group-open:inline">↑ skrýt</span>
          )}
        </div>
      </summary>
      {hasDetail && (
        <div className="mt-2 space-y-1.5 pl-1">
          {pendingFields.length > 0 && (
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-[9px] font-black uppercase tracking-widest text-amber-700 mr-1">Čeká:</span>
              {pendingFields.map((f) => (
                <span key={f} className="text-[10px] font-bold text-amber-800 bg-amber-100 rounded px-1.5 py-0.5">
                  {advisorFieldLabelForKey(f)}
                </span>
              ))}
            </div>
          )}
          {manualFields.length > 0 && (
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-[9px] font-black uppercase tracking-widest text-rose-700 mr-1">Ručně:</span>
              {manualFields.map((f) => (
                <span key={f} className="text-[10px] font-bold text-rose-800 bg-rose-100 rounded px-1.5 py-0.5">
                  {advisorFieldLabelForKey(f)}
                </span>
              ))}
            </div>
          )}
          {excludedFields.length > 0 && (
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 mr-1">Vynecháno:</span>
              {excludedFields.map((f) => (
                <span key={f} className="text-[10px] font-bold text-slate-600 bg-slate-100 rounded px-1.5 py-0.5">
                  {advisorFieldLabelForKey(f)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </details>
  );
}

function maskDebugValue(value: unknown): string {
  const text = Array.isArray(value) ? value.join(", ") : String(value ?? "—");
  return text.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d\s().-]{7,}|\b\d{6}\/?\d{3,4}\b/gi, "[masked]");
}

function AiReviewLearningTraceDebug({ doc }: { doc: ExtractionDocument }) {
  const trace = doc.extractionTrace;
  if (!trace) return null;
  const validatorCodes = (doc.validationWarnings ?? [])
    .map((warning) => warning.code ?? warning.field)
    .filter((value): value is string => Boolean(value));
  const autoFixes = trace.validatorAutoFixesApplied ?? [];
  const hasLearningTrace =
    trace.learningHintsUsed !== undefined ||
    trace.learningPatternIds?.length ||
    trace.modelName ||
    trace.promptVersion ||
    trace.schemaVersion ||
    trace.pipelineVersion ||
    validatorCodes.length ||
    autoFixes.length;
  if (!hasLearningTrace) return null;

  return (
    <details className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-700 md:px-6">
      <summary className="cursor-pointer select-none font-black uppercase tracking-wide text-slate-600">
        AI Review Learning trace
      </summary>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <DebugItem label="modelName" value={trace.modelName} />
        <DebugItem label="promptVersion" value={trace.promptVersion} />
        <DebugItem label="schemaVersion" value={trace.schemaVersion} />
        <DebugItem label="pipelineVersion" value={trace.pipelineVersion} />
        <DebugItem label="learningHintsUsed" value={trace.learningHintsUsed === true ? "true" : "false"} />
        <DebugItem label="learningPatternIds" value={trace.learningPatternIds?.join(", ")} />
        <DebugItem label="validators fired" value={validatorCodes.join(", ")} />
        <DebugItem label="autoFixes applied" value={autoFixes.join(", ")} />
      </dl>
    </details>
  );
}

function DebugItem({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2">
      <dt className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 break-words font-mono text-[11px]">{maskDebugValue(value)}</dd>
    </div>
  );
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
  onTrackFieldCorrection?: (input: {
    fieldId: string;
    fieldPath?: string | null;
    correctedValue: string;
    fieldLabel?: string | null;
    originalAiValue?: string | null;
    sourcePage?: number | null;
    evidenceSnippet?: string | null;
  }) => void | Promise<void>;
  onSelectClient?: (clientId: string) => void;
  onConfirmCreateNew?: () => void;
  /** Persist "final contract" override to server so it survives reload. */
  onConfirmFinalContract?: (gateReasons: string[]) => void | Promise<void>;
  onManualReviewWarningState?: (warningText: string, state: "confirmed" | "ignored") => void | Promise<void>;
  /** Fáze 11: Per-field pending confirmation */
  onConfirmPendingField?: (fieldKey: string, scope: "contact" | "contract" | "payment") => Promise<void>;
  /** Fáze 12: Ruční doplnění manual_required polí */
  onConfirmManualField?: (fieldKey: string, scope: "contact" | "contract" | "payment", value: string) => Promise<void>;
  /** Fáze 12b: Bulk potvrzení všech pending polí */
  onConfirmAllPendingFields?: () => Promise<void>;
  isApproving?: boolean;
  actionLoading?: string | null;
  onRefreshPdf?: () => void | Promise<void>;
  /** Client document linking (rendered under the wizard in the left panel). */
  onLinkToClientDocuments?: (visibleToClient: boolean) => void | Promise<void>;
  linkDocBusy?: boolean;
  /** Po vypršení watchdog na `scan_pending_ocr` — znovu spustit pipeline. */
  onRetryPipeline?: () => void | Promise<void>;
  retryPipelineBusy?: boolean;
};

export function AIReviewExtractionShell({
  doc,
  onBack,
  onDiscard,
  onApprove,
  onApproveAndApply,
  onReject,
  onApply,
  onTrackFieldCorrection,
  onSelectClient,
  onConfirmCreateNew,
  onConfirmFinalContract,
  onManualReviewWarningState,
  onConfirmPendingField,
  onConfirmManualField,
  onConfirmAllPendingFields,
  isApproving,
  actionLoading,
  onRefreshPdf,
  onLinkToClientDocuments,
  linkDocBusy,
  onRetryPipeline,
  retryPipelineBusy,
}: Props) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [applyOverrideEnabled, setApplyOverrideEnabled] = useState(false);
  const [finalContractBusy, setFinalContractBusy] = useState(false);
  const [pdfExportBusy, setPdfExportBusy] = useState(false);
  const [shellAttachClientOpen, setShellAttachClientOpen] = useState(false);
  const correctionTimersRef = useRef<Record<string, number>>({});
  const toast = useToast();

  const isFailed = doc.processingStatus === "failed";
  const isProcessing = doc.processingStatus === "uploaded" || doc.processingStatus === "processing";
  const hasData = hasMeaningfulReviewContent(doc);
  const canExportPdf = !isFailed && !isProcessing && hasData;
  const isPending = doc.reviewStatus === "pending" || !doc.reviewStatus;
  const canApproveReject =
    isPending &&
    (doc.processingStatus === "extracted" ||
      doc.processingStatus === "review_required" ||
      doc.processingStatus === "blocked");
  const isApproved = doc.reviewStatus === "approved";
  const hasResolvedClient = !!doc.matchedClientId || doc.createNewClientConfirmed === "true";
  const matchVerdict: MatchVerdict | null =
    doc.matchVerdict ??
    (doc.extractionTrace as { matchVerdict?: MatchVerdict } | undefined)?.matchVerdict ??
    null;
  const verdictBanner = buildMatchVerdictBanner(matchVerdict, {
    topCandidateName: doc.clientMatchCandidates[0]?.displayName,
    topScorePct: doc.clientMatchCandidates[0] ? doc.clientMatchCandidates[0].score * 100 : undefined,
  });
  const canOfferCreateClientDraft = doc.draftActions.some(
    (a) => a.type === "create_new_client" || a.type === "create_client"
  );
  const canApply = isApproved && !doc.isApplied;
  const canApproveAndApply = !!onApproveAndApply && canApproveReject;
  const proposalBarrierReasons = doc.applyGate?.applyBarrierReasons ?? [];
  const _hasProposalBarrier = proposalBarrierReasons.length > 0;
  const _effectiveApplyBarrierReasons = applyOverrideEnabled ? [] : proposalBarrierReasons;

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
    // Restore override state from server when doc loads/changes
    const serverOverride =
      Array.isArray(doc.applyGate?.overriddenReasons) &&
      (doc.applyGate!.overriddenReasons as string[]).length > 0;
    setApplyOverrideEnabled(serverOverride);
  }, [doc.id, doc.applyGate]);

  useEffect(() => {
    return () => {
      Object.values(correctionTimersRef.current).forEach((timer) => window.clearTimeout(timer));
      correctionTimersRef.current = {};
    };
  }, []);

  const handleFieldClick = useCallback((fieldId: string, page?: number) => {
    dispatch({ type: "SET_ACTIVE_FIELD", fieldId, page });
  }, []);

  const handleHighlightClick = useCallback((fieldId: string) => {
    dispatch({ type: "SET_ACTIVE_FIELD", fieldId });
  }, []);

  const handleEdit = useCallback((fieldId: string, value: string) => {
    dispatch({ type: "EDIT_FIELD", fieldId, value });
    if (!onTrackFieldCorrection) return;
    const field = doc.groups.flatMap((group) => group.fields).find((candidate) => candidate.id === fieldId);
    if (!field?.fieldPath || field.id.startsWith("synthetic.")) return;
    const original = field.originalAiValue?.trim() ?? "";
    const corrected = value.trim();
    if (original === corrected) return;

    const previousTimer = correctionTimersRef.current[fieldId];
    if (previousTimer != null) window.clearTimeout(previousTimer);
    correctionTimersRef.current[fieldId] = window.setTimeout(() => {
      void Promise.resolve(onTrackFieldCorrection({
        fieldId: field.id,
        fieldPath: field.fieldPath,
        correctedValue: value,
        fieldLabel: field.label,
        originalAiValue: field.originalAiValue,
        sourcePage: field.page ?? null,
        evidenceSnippet: field.evidenceSnippet ?? null,
      })).catch((error) => {
        console.warn("[AIReviewExtractionShell] correction event tracking failed", error);
      });
    }, 650);
  }, [doc.groups, onTrackFieldCorrection]);

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

  const handleExecuteDraftAction = useCallback(async (action: DraftAction) => {
    try {
      const payload = action.payload ?? {};

      if (
        action.type === "create_task" ||
        action.type === "create_service_task" ||
        action.type === "create_service_review_task" ||
        action.type === "create_task_followup" ||
        action.type === "create_manual_review_task" ||
        action.type === "schedule_consultation"
      ) {
        const notes =
          typeof payload.notes === "string" && payload.notes.trim() ? payload.notes.trim() : undefined;
        const description =
          typeof payload.description === "string" && payload.description.trim()
            ? payload.description.trim()
            : notes;
        const title =
          typeof payload.title === "string" && payload.title.trim()
            ? payload.title.trim()
            : action.label?.trim() || "Prověřit výstup z AI review";
        await createTask({
          title,
          description,
          contactId: doc.matchedClientId || undefined,
        });
        toast.showToast("Úkol vytvořen.", "success");
        router.push("/portal/tasks");
        return;
      }

      if (action.type === "create_opportunity" || action.type === "create_or_update_pipeline_deal") {
        if (!doc.matchedClientId) {
          toast.showToast("Nejdřív vyberte nebo vytvořte klienta, pak lze založit příležitost.", "error");
          return;
        }
        const stages = await getOpportunityStages();
        const firstStageId = stages[0]?.id;
        if (!firstStageId) {
          throw new Error("V pipeline není dostupný žádný stupeň.");
        }
        const title =
          typeof payload.title === "string" && payload.title.trim()
            ? payload.title.trim()
            : action.label?.trim() || "Navazující obchodní příležitost";
        const opportunityId = await createOpportunity({
          title,
          caseType: "jiné",
          contactId: doc.matchedClientId,
          stageId: firstStageId,
          customFields: {
            aiSubtitle: action.label,
            source: "ai_review",
            reviewDocumentId: doc.id,
            ...(typeof payload.lifecycleStatus === "string" && payload.lifecycleStatus.trim()
              ? { lifecycleStatus: payload.lifecycleStatus.trim() }
              : {}),
          },
        });
        toast.showToast("Obchodní příležitost vytvořena.", "success");
        router.push(opportunityId ? `/portal/pipeline/${opportunityId}` : "/portal/pipeline");
        return;
      }
    } catch (error) {
      const message = error instanceof Error && error.message.trim() ? error.message : "Akci se nepodařilo dokončit.";
      toast.showToast(message, "error");
    }
  }, [doc.id, doc.matchedClientId, router, toast]);

  const handleApproveClick = useCallback(async () => {
    setApplyOverrideEnabled(true);
    if (onConfirmFinalContract && proposalBarrierReasons.length > 0) {
      try {
        await onConfirmFinalContract(proposalBarrierReasons);
      } catch (e) {
        const message =
          e instanceof Error && e.message.trim()
            ? e.message
            : "Potvrzení finální smlouvy se nezdařilo. Zkuste to znovu.";
        toast.showToast(message, "error");
        return;
      }
    }
    try {
      await onApprove(state.editedFields);
    } catch (e) {
      const message = e instanceof Error && e.message.trim() ? e.message : "Schválení se nezdařilo.";
      toast.showToast(message, "error");
    }
  }, [onApprove, onConfirmFinalContract, proposalBarrierReasons, state.editedFields, toast]);

  const handleApproveAndApplyClick = useCallback(async () => {
    if (!onApproveAndApply) return;
    setApplyOverrideEnabled(true);
    const overrideOpts = proposalBarrierReasons.length > 0
      ? { overrideGateReasons: proposalBarrierReasons, overrideReason: "Poradce potvrdil extrahované údaje a schválil propsání do Aidvisory." }
      : undefined;
    if (onConfirmFinalContract && proposalBarrierReasons.length > 0) {
      try {
        await onConfirmFinalContract(proposalBarrierReasons);
      } catch (e) {
        const message =
          e instanceof Error && e.message.trim()
            ? e.message
            : "Potvrzení finální smlouvy se nezdařilo. Zkuste to znovu.";
        toast.showToast(message, "error");
        return;
      }
    }
    try {
      await onApproveAndApply(state.editedFields, overrideOpts);
    } catch (e) {
      const message = e instanceof Error && e.message.trim() ? e.message : "Schválení se nezdařilo.";
      toast.showToast(message, "error");
    }
  }, [onApproveAndApply, onConfirmFinalContract, proposalBarrierReasons, state.editedFields, toast]);

  const handleDownloadPdf = useCallback(async () => {
    setPdfExportBusy(true);
    try {
      const blob = await buildAiReviewPdfBlob(doc, state.editedFields, {
        dismissedRecommendationIds: state.dismissedRecommendations,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = aiReviewPdfFileName(doc);
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.showToast("PDF bylo staženo.", "success");
    } catch {
      toast.showToast("Export PDF se nepodařil.", "error");
    } finally {
      setPdfExportBusy(false);
    }
  }, [doc, state.dismissedRecommendations, state.editedFields, toast]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[color:var(--wp-surface-raised)] font-sans text-[color:var(--wp-text)] overflow-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800;900&display=swap');
        .font-display { font-family: 'Plus Jakarta Sans', sans-serif; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scroll::-webkit-scrollbar { width: 6px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 10px; }
      `}</style>

      {/* Approved-pending-apply hint removed: advisor-confirmed flow handles this */}

      {/* Failed state banner */}
      {isFailed && doc.errorMessage && (
        <div className="bg-rose-50 border-b border-rose-200 px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-start gap-3">
            <AlertCircle size={20} className="text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-rose-900 mb-1">
                {(doc.extractionTrace as { ocrWatchdogExpired?: boolean } | undefined)?.ocrWatchdogExpired
                  ? "Časový limit čekání na čitelný text"
                  : "Extrakce selhala"}
              </h4>
              <p className="text-xs text-rose-800 leading-relaxed">{doc.errorMessage}</p>
              {(doc.extractionTrace as { ocrWatchdogExpired?: boolean } | undefined)?.ocrWatchdogExpired ? (
                <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                  Toto není chyba modelu — dokument příliš dlouho zůstal ve stavu „čeká na OCR“ bez dokončení. Zkuste znovu
                  spustit zpracování; pokud má soubor textovou vrstvu, pipeline ji umí použít bez falešného úspěchu.
                </p>
              ) : (
                <p className="text-xs text-rose-600 mt-1">
                  Možné příčiny: PDF je naskenované (obrázek) a model neumí text rozpoznat, dokument je poškozený, nebo došlo k chybě API.
                </p>
              )}
              {(doc.extractionTrace as { ocrWatchdogExpired?: boolean } | undefined)?.ocrWatchdogExpired &&
              onRetryPipeline ? (
                <button
                  type="button"
                  disabled={retryPipelineBusy}
                  onClick={() => void onRetryPipeline()}
                  className="mt-3 min-h-[40px] px-4 rounded-lg bg-rose-700 text-white text-xs font-bold disabled:opacity-50"
                >
                  {retryPipelineBusy ? "Spouštím…" : "Znovu spustit zpracování"}
                </button>
              ) : null}
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

      <AiReviewLearningTraceDebug doc={doc} />

      {/* Phase 5B: Compact post-apply status strip — single row + collapsible details */}
      {doc.isApplied && doc.applyResultPayload && (() => {
        const outcome = doc.applyResultPayload.publishOutcome;
        const isPartial = outcome?.mode === "publish_partial_failure";
        const isDocOnly = outcome?.mode === "supporting_doc_only" || outcome?.mode === "internal_document_only";
        const isProduct = outcome?.mode === "product_published_visible_to_client" || outcome?.mode === "product_published";
        const clientId = doc.applyResultPayload.createdClientId ?? doc.applyResultPayload.linkedClientId;
        const isNewClient = !!doc.applyResultPayload.createdClientId;

        const stripBg = isPartial
          ? "bg-amber-50 border-amber-200"
          : isDocOnly
          ? "bg-sky-50 border-sky-200"
          : "bg-emerald-50 border-emerald-200";
        const textCls = isPartial ? "text-amber-900" : isDocOnly ? "text-sky-900" : "text-emerald-900";
        const iconCls = isPartial ? "text-amber-500" : isDocOnly ? "text-sky-500" : "text-emerald-500";

        return (
          <details className="group border-b" open={isPartial}>
            <summary className={`cursor-pointer list-none select-none px-4 py-2 md:px-6 ${stripBg}`}>
              <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-2 min-h-[36px]">
                {/* Status icon */}
                {isPartial
                  ? <AlertCircle size={14} className="text-amber-500 shrink-0" />
                  : <CheckCircle2 size={14} className={`${iconCls} shrink-0`} />}

                {/* Primary label */}
                <span className={`text-xs font-black leading-tight ${textCls}`}>
                  {outcome ? outcome.label : "Propsáno do Aidvisory"}
                </span>

                {/* Badges */}
                {outcome?.visibleToClient && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 border border-emerald-200 text-[9px] font-black uppercase tracking-widest text-emerald-700">
                    Portál
                  </span>
                )}
                {outcome?.paymentOutcome === "payment_setup_published" && (
                  <span className="px-1.5 py-0.5 rounded bg-blue-100 border border-blue-200 text-[9px] font-black uppercase tracking-widest text-blue-700">
                    Platby ✓
                  </span>
                )}
                {outcome?.paymentOutcome === "payment_setup_skipped" && !isDocOnly && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[9px] font-black uppercase tracking-widest text-slate-500">
                    Platby —
                  </span>
                )}
                {doc.applyResultPayload.documentLinkWarning && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 border border-amber-200 text-[9px] font-black uppercase tracking-widest text-amber-700">
                    ⚠ Dok. link selhal
                  </span>
                )}

                {/* Expand toggle */}
                <span className="ml-auto text-[10px] font-medium text-slate-400 group-open:hidden shrink-0">↓ detail</span>
                <span className="ml-auto text-[10px] font-medium text-slate-400 hidden group-open:inline shrink-0">↑ skrýt</span>
              </div>
            </summary>

            {/* Collapsible detail body — only loaded when opened */}
            <div className={`px-4 pb-3 pt-2 md:px-6 ${stripBg}`}>
              <div className="max-w-6xl mx-auto space-y-2">

                {/* Artifact chips — compact row */}
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {clientId && (
                    <Link
                      href={`/portal/contacts/${clientId}`}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border font-bold hover:opacity-80 transition-opacity ${
                        isNewClient
                          ? "bg-emerald-100 border-emerald-200 text-emerald-800"
                          : "bg-slate-100 border-slate-200 text-slate-700"
                      }`}
                    >
                      <UserPlus size={10} />
                      {isNewClient ? "Nový klient →" : "Klient →"}
                    </Link>
                  )}
                  {doc.applyResultPayload.createdContractId && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold">
                      <Shield size={10} /> Smlouva
                    </span>
                  )}
                  {!doc.applyResultPayload.createdContractId && doc.applyResultPayload.linkedDocumentId && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-sky-100 border border-sky-200 text-sky-800 font-bold">
                      <FileText size={10} /> Pouze dokument
                    </span>
                  )}
                  {doc.applyResultPayload.createdPaymentSetupId && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-100 border border-blue-200 text-blue-800 font-bold">
                      <CreditCard size={10} /> Platební instrukce
                    </span>
                  )}
                  {doc.applyResultPayload.createdTaskId && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-bold">
                      <Check size={10} /> Úkol
                    </span>
                  )}
                </div>

                {/* Enforcement summary — always compact */}
                {doc.applyResultPayload.policyEnforcementTrace && (
                  <ApplyEnforcementResultSummary trace={doc.applyResultPayload.policyEnforcementTrace} />
                )}

                {/* Payment detail — compact 2-col */}
                {doc.applyResultPayload.paymentSetup && (
                  <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs border-t border-current/10 pt-2">
                    {doc.applyResultPayload.paymentSetup.provider && (
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Poskytovatel</span>
                        <p className="font-semibold text-[color:var(--wp-text)] truncate">{doc.applyResultPayload.paymentSetup.provider}</p>
                      </div>
                    )}
                    {doc.applyResultPayload.paymentSetup.regularAmount && (
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Částka</span>
                        <p className="font-semibold text-[color:var(--wp-text)]">{doc.applyResultPayload.paymentSetup.regularAmount} {doc.applyResultPayload.paymentSetup.currency}</p>
                      </div>
                    )}
                    {(doc.applyResultPayload.paymentSetup.iban || doc.applyResultPayload.paymentSetup.recipientAccount) && (
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Účet</span>
                        <p className="font-semibold text-[color:var(--wp-text)] truncate font-mono text-[10px]">
                          {doc.applyResultPayload.paymentSetup.iban || `${doc.applyResultPayload.paymentSetup.recipientAccount}${doc.applyResultPayload.paymentSetup.bankCode ? `/${doc.applyResultPayload.paymentSetup.bankCode}` : ""}`}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Portal access note */}
                {doc.applyResultPayload.portalClientAccess?.hasActiveClientPortal && (
                  <p className="text-[11px] text-emerald-800 font-medium">
                    Klient má aktivní přístup do klientské zóny.
                  </p>
                )}

                {/* Outcome-aware CTAs — Phase 5B */}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {/* Product publish → go to client detail */}
                  {isProduct && clientId && (
                    <Link
                      href={`/portal/contacts/${clientId}?tab=prehled`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-emerald-200 text-[11px] font-black text-emerald-700 hover:bg-emerald-50 transition-colors"
                    >
                      <Shield size={11} /> Otevřít přehled klienta
                    </Link>
                  )}
                  {/* visibleToClient → portal follow-up */}
                  {outcome?.visibleToClient && clientId && (
                    <Link
                      href={`/portal/contacts/${clientId}?tab=prehled`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-emerald-200 text-[11px] font-black text-emerald-700 hover:bg-emerald-50 transition-colors"
                    >
                      <Eye size={11} /> Přehled klienta
                    </Link>
                  )}
                  {/* Payment published → go to payments */}
                  {outcome?.paymentOutcome === "payment_setup_published" && clientId && (
                    <Link
                      href={`/portal/contacts/${clientId}?tab=prehled`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-blue-200 text-[11px] font-black text-blue-700 hover:bg-blue-50 transition-colors"
                    >
                      <CreditCard size={11} /> Zkontrolovat platební instrukce
                    </Link>
                  )}
                  {/* Document only → no product language */}
                  {isDocOnly && clientId && (
                    <Link
                      href={`/portal/contacts/${clientId}?tab=dokumenty`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-sky-200 text-[11px] font-black text-sky-700 hover:bg-sky-50 transition-colors"
                    >
                      <FileText size={11} /> Zobrazit dokumenty klienta
                    </Link>
                  )}
                  {/* Bridge suggestions — compact */}
                  {(doc.applyResultPayload.bridgeSuggestions ?? []).slice(0, 2).map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px] font-black text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </details>
        );
      })()}

      {/* Apply gate / proposal barrier strip removed: advisor-confirmed flow replaces it */}

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
          className={`flex min-h-0 w-full min-w-0 flex-col bg-[color:var(--wp-surface-inset)] border-r border-[color:var(--wp-surface-card-border)] lg:max-w-[48%] lg:flex-[0_0_48%] ${
            state.showPdfOnMobile ? "hidden lg:flex" : "flex"
          }`}
        >
          <div className="shrink-0 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-4 py-3 md:px-6">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              {/* Navigace + pomocné akce */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-xl px-3 text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] transition-colors hover:bg-[color:var(--wp-surface-muted)] hover:text-[color:var(--wp-text)]"
                  title="Zpět na seznam"
                >
                  <ArrowLeft size={14} />
                  <span className="hidden sm:inline">Zpět</span>
                </button>
                {canExportPdf ? (
                  <>
                    <div className="h-6 w-px bg-[color:var(--wp-surface-card-border)] hidden sm:block" aria-hidden />
                    <button
                      type="button"
                      onClick={() => void handleDownloadPdf()}
                      disabled={pdfExportBusy}
                      className="inline-flex min-h-[40px] items-center gap-2 rounded-xl px-3 text-xs font-black uppercase tracking-widest text-indigo-700 transition-colors hover:bg-indigo-50 disabled:opacity-50"
                      title="Stáhnout interní PDF souhrn"
                    >
                      {pdfExportBusy ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Download size={14} />
                      )}
                      <span className="hidden sm:inline">Stáhnout PDF</span>
                    </button>
                  </>
                ) : null}
              </div>
              {/* Akční pás s jasnou hierarchií: destruktivní → sekundární → primární */}
              <div className="flex flex-1 flex-wrap items-center justify-end gap-2 sm:flex-none">
                {canApproveReject ? (
                  <div className="flex items-center gap-1 rounded-xl bg-[color:var(--wp-surface-muted)]/60 p-1 ring-1 ring-[color:var(--wp-surface-card-border)]/70">
                    <button
                      type="button"
                      onClick={() => setShowRejectModal(true)}
                      disabled={!!actionLoading}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-black uppercase tracking-widest text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50"
                      title="Zamítnout extrakci"
                    >
                      <X size={13} />
                      <span>Zamítnout</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleApproveClick}
                      disabled={!!actionLoading}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] transition-colors hover:bg-[color:var(--wp-surface-card)] hover:text-[color:var(--wp-text)] disabled:opacity-60"
                      title="Jen schválit extrahované údaje (bez propsání do Aidvisory)"
                    >
                      {isApproving ? (
                        <RefreshCw size={13} className="animate-spin" />
                      ) : (
                        <Check size={13} />
                      )}
                      <span className="hidden sm:inline">Jen schválit</span>
                      <span className="sm:hidden">Schválit</span>
                    </button>
                  </div>
                ) : null}
                {canApproveAndApply ? (
                  <button
                    type="button"
                    onClick={handleApproveAndApplyClick}
                    disabled={!!actionLoading}
                    className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-black uppercase tracking-widest text-white shadow-sm transition-all hover:bg-indigo-700 hover:shadow active:scale-[0.98] disabled:opacity-60"
                  >
                    {actionLoading === "approveApply" ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                    <span className="hidden md:inline">Schválit a propsat do Aidvisory</span>
                    <span className="md:hidden">Schválit + propsat</span>
                  </button>
                ) : null}
                {canApply ? (
                  <button
                    type="button"
                    onClick={() => setShowApplyConfirm(true)}
                    disabled={!!actionLoading}
                    className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-black uppercase tracking-widest text-white shadow-sm transition-all hover:bg-indigo-700 hover:shadow active:scale-[0.98] disabled:opacity-60"
                  >
                    {actionLoading === "apply" ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                    <span>Propsat do Aidvisory</span>
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
          {/* Hard-supporting document warning: advisor must know that approve+apply
              WILL NOT create a contract/payment for consent/declaration/AML/payslip/etc.
              Renders above extraction so it's the first thing seen when entering review. */}
          {doc.isSupportingOnlyDocument && !doc.isApplied ? (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 md:px-6">
              <div className="flex items-start gap-2 text-amber-950">
                <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
                <div className="text-sm leading-snug">
                  <p className="font-bold">
                    Dokument vypadá jako podkladová část nebo příloha
                  </p>
                  <p className="mt-1 text-xs text-amber-900 leading-relaxed">
                    Klasifikace {doc.detectedPrimaryType ? <code className="rounded bg-amber-100 px-1 py-0.5 text-[11px] font-mono">{doc.detectedPrimaryType}</code> : "dokumentu"}
                    {" "}je v množině <strong>hard-supporting</strong> typů (souhlasy, prohlášení, AML/FATCA,
                    výplatní pásky, daňová přiznání, výpisy z účtu, lékařské dotazníky, doklady totožnosti).
                    Ověřte před schválením, zda jde o hlavní smlouvu, nebo jen o interní podklad k přiložení.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

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
              onExecuteDraftAction={handleExecuteDraftAction}
              onConfirmPendingField={onConfirmPendingField}
              onConfirmManualField={onConfirmManualField}
              onConfirmAllPendingFields={onConfirmAllPendingFields}
              onConfirmCreateNew={onConfirmCreateNew}
              onManualReviewWarningState={onManualReviewWarningState}
              onApproveAndApply={onApproveAndApply}
              onSelectClient={onSelectClient}
              editedFields={state.editedFields}
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

          {/* "Dokumenty klienta" section removed: document linking is handled automatically during CRM write-through */}
          {/* Client match + actions at bottom of left panel */}
          {!doc.isApplied && hasData && (
            <div className="border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4 md:p-6 shrink-0">
              <details className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/40 px-4 py-3">
                <summary className="cursor-pointer list-none text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)]">
                  Klient a další akce
                </summary>
                <div className="mt-4 space-y-4">
                  {verdictBanner ? (
                    <div
                      className={`rounded-xl px-3 py-2.5 text-sm border ${
                        verdictBanner.tone === "success"
                          ? "bg-emerald-50 border-emerald-200 text-emerald-950"
                          : verdictBanner.tone === "warning"
                            ? "bg-amber-50 border-amber-200 text-amber-950"
                            : verdictBanner.tone === "danger"
                              ? "bg-rose-50 border-rose-200 text-rose-950"
                              : "bg-slate-50 border-slate-200 text-slate-900"
                      }`}
                    >
                      <p className="font-bold leading-snug">{verdictBanner.title}</p>
                      <p className="text-xs mt-1.5 leading-relaxed opacity-95">{verdictBanner.body}</p>
                    </div>
                  ) : null}

                  {matchVerdict === "near_match" &&
                  doc.clientMatchCandidates[0] &&
                  !doc.matchedClientId &&
                  onSelectClient ? (
                    <button
                      type="button"
                      onClick={() => onSelectClient(doc.clientMatchCandidates[0]!.clientId)}
                      disabled={!!actionLoading}
                      className="w-full min-h-[44px] rounded-xl bg-indigo-600 px-4 text-xs font-black uppercase tracking-widest text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Potvrdit navrženého klienta
                    </button>
                  ) : null}

                  {doc.clientMatchCandidates.length > 0 ? (
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] mb-2">
                        {matchVerdict === "ambiguous_match"
                          ? "Vyberte správného klienta (řazeno podle shody)"
                          : "Kandidáti v evidenci"}
                      </h4>
                      <div className="space-y-2">
                        {doc.clientMatchCandidates.map((c, idx) => {
                          const isTopSuggested =
                            idx === 0 && (matchVerdict === "near_match" || matchVerdict === "existing_match");
                          const topHighlightClass =
                            matchVerdict === "existing_match" && idx === 0
                              ? "border-emerald-300 ring-1 ring-emerald-200/80"
                              : matchVerdict === "near_match" && idx === 0
                                ? "border-amber-300 ring-1 ring-amber-200/80"
                                : "border-[color:var(--wp-surface-card-border)]";
                          return (
                            <div
                              key={c.clientId}
                              className={`flex items-center justify-between gap-2 p-3 rounded-xl border bg-[color:var(--wp-surface-card)] ${topHighlightClass}`}
                            >
                              <div className="min-w-0">
                                {isTopSuggested ? (
                                  <p
                                    className={`text-[9px] font-black uppercase tracking-widest mb-0.5 ${
                                      matchVerdict === "existing_match" ? "text-emerald-800" : "text-amber-800"
                                    }`}
                                  >
                                    {matchVerdict === "existing_match"
                                      ? "Potvrzená shoda s klientem"
                                      : "Nejvýše hodnocená shoda"}
                                  </p>
                                ) : null}
                                <p className="text-sm font-bold text-[color:var(--wp-text)] truncate">
                                  {c.displayName ?? c.clientId}
                                </p>
                                <p className="text-[10px] text-[color:var(--wp-text-secondary)]">
                                  {Math.round(c.score * 100)} % ·{" "}
                                  {c.reasons.map((r) => humanizeReviewReasonLine(r)).join(" · ")}
                                </p>
                              </div>
                              <button
                                type="button"
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
                                ) : matchVerdict === "near_match" && idx === 0 ? (
                                  "Potvrdit"
                                ) : (
                                  "Vybrat"
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {/* Přiřadit ke klientovi — vždy dostupné */}
                  {onSelectClient ? (
                    <button
                      type="button"
                      onClick={() => setShellAttachClientOpen(true)}
                      disabled={!!actionLoading}
                      className="flex items-center gap-2 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-xl px-3 min-h-[44px] transition-colors disabled:opacity-50"
                    >
                      <UserRoundSearch size={14} />
                      Přiřadit ke klientovi
                    </button>
                  ) : null}

                  {canOfferCreateClientDraft && matchVerdict !== "existing_match" ? (
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={onConfirmCreateNew}
                        disabled={!!actionLoading || doc.createNewClientConfirmed === "true"}
                        className="flex items-center gap-2 text-xs font-bold text-[color:var(--wp-text-secondary)] hover:text-indigo-600 transition-colors min-h-[44px]"
                      >
                        <UserPlus size={14} />
                        {doc.createNewClientConfirmed === "true"
                          ? "Nový klient potvrzen"
                          : matchVerdict === "near_match" || matchVerdict === "ambiguous_match"
                            ? "Vytvořit nového klienta (místo shody)"
                            : "Vytvořit nového klienta"}
                      </button>
                      {doc.clientMatchCandidates.length === 0 && matchVerdict === "no_match" ? (
                        <p className="text-xs text-[color:var(--wp-text-tertiary)]">
                          Shoda v evidenci nebyla nalezena — přiřaďte existujícího klienta nebo založte nový záznam.
                        </p>
                      ) : null}
                    </div>
                  ) : matchVerdict === "existing_match" ? (
                    <p className="text-xs text-[color:var(--wp-text-secondary)] leading-relaxed">
                      Klient je spojen s existujícím záznamem — nového klienta z tohoto kroku zakládat nemusíte.
                    </p>
                  ) : null}

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
          className={`flex min-h-0 w-full min-w-0 flex-col lg:flex-1 ${
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
            confirmedFields={state.confirmedFields}
            applyResultPayload={doc.applyResultPayload}
            reviewApproved={doc.reviewStatus === "approved" || doc.reviewStatus === "applied" || doc.isApplied}
          />
        </aside>
      </main>

      {/* Přiřadit ke klientovi — shell-level dialog */}
      {onSelectClient && (
        <ReviewAttachClientDialog
          open={shellAttachClientOpen}
          onClose={() => setShellAttachClientOpen(false)}
          candidates={doc.clientMatchCandidates ?? []}
          onConfirm={async (clientId) => {
            await onSelectClient(clientId);
          }}
          title="Přiřadit ke klientovi"
        />
      )}

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
            <h3 className="text-lg font-bold text-[color:var(--wp-text)] mb-2">Propsat do Aidvisory?</h3>
            <p className="text-sm text-[color:var(--wp-text-secondary)] mb-4">
              Návrhové akce (klient, smlouva, úkol…) budou zapsány do databáze. Tuto akci lze provést jen jednou.
              {!hasResolvedClient
                ? " Pokud ještě není vybraný klient, systém nejdřív připraví nového klienta ze smlouvy."
                : ""}
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
                  const overrideOpts = proposalBarrierReasons.length > 0
                    ? { overrideGateReasons: proposalBarrierReasons, overrideReason: "Poradce potvrdil extrahované údaje a schválil propsání do Aidvisory." }
                    : resolveApplyOverrideOptions();
                  onApply?.(overrideOpts);
                  setShowApplyConfirm(false);
                }}
                disabled={actionLoading === "apply" || actionLoading === "approveApply"}
                className="px-4 min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50"
              >
                {actionLoading === "apply" ? "Propisuji…" : "Propsat"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

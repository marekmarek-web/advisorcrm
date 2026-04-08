"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  FileText,
  MapPin,
  Upload,
} from "lucide-react";
import { segmentLabel } from "@/app/lib/segment-labels";
import {
  createTerminationDraft,
  extractTerminationFieldsFromDocumentAction,
  getTerminationLetterPreview,
  saveTerminationIntakePartialAction,
  searchContactsForTerminationWizardAction,
  searchTerminationInsurerRegistryAction,
  type CreateTerminationDraftPayload,
  type TerminationIntakeDraftWizardState,
  type TerminationWizardPrefill,
} from "@/app/actions/terminations";
import type { TerminationLetterBuildResult } from "@/lib/terminations/termination-letter-types";
import { TerminationFinishOutputLayout } from "./TerminationFinishOutputLayout";
import type {
  TerminationMode,
  TerminationReasonCode,
  TerminationRequestSource,
  TerminationRequestStatus,
} from "@/lib/db/schema-for-client";
import { modeToReasonCode, terminationDeliveryChannelLabel } from "@/lib/terminations/client";
import type { TerminationPolicyholderKind } from "@/lib/terminations/termination-document-extras";
import {
  getAllowedTerminationModes,
  getDefaultTerminationMode,
  isTerminationModeAllowedForSegment,
} from "@/lib/terminations/segment-termination-matrix";
import { classifyInsuranceSegment } from "@/lib/terminations/segment-classifier";
import { plainTextToLetterHtml } from "@/lib/terminations/termination-letter-html";
import { replaceTerminationLetterPlaceDateLine } from "@/lib/terminations/termination-letter-builder";
import {
  computeTwoMonthDeadline,
  isTwoMonthWindowOpen,
  suggestedAnniversaryFromContractStart,
} from "@/lib/terminations/suggested-anniversary-from-contract-start";
import { formatCzDate, formatIsoDateForUiCs } from "@/lib/forms/cz-date";
import { FriendlyDateInput } from "@/components/forms/FriendlyDateInput";
import { SearchCombobox, type SearchComboboxItem } from "@/components/ui/SearchCombobox";
import { TerminationLetterPreviewPanel } from "./TerminationLetterPreviewPanel";

function insurerSearchItemMeta(addressLine: string | null | undefined, channelHint: string | null | undefined): string | null {
  const addr = addressLine?.trim() || "";
  const rawCh = channelHint?.trim() || "";
  const chLabel = rawCh ? terminationDeliveryChannelLabel(rawCh) : "";
  if (addr && chLabel) return `${addr} · ${chLabel}`;
  if (addr) return addr;
  if (chLabel) return chLabel;
  return null;
}

const MODE_OPTIONS: { value: TerminationMode; label: string }[] = [
  { value: "end_of_insurance_period", label: "Ke konci pojistného období / výročnímu dni" },
  { value: "fixed_calendar_date", label: "K určitému datu" },
  { value: "within_two_months_from_inception", label: "Do 2 měsíců od sjednání" },
  { value: "after_claim", label: "Po pojistné události" },
  { value: "distance_withdrawal", label: "Odstoupení od smlouvy na dálku" },
  { value: "mutual_agreement", label: "Dohodou" },
  { value: "manual_review_other", label: "Jiný důvod / ruční posouzení" },
];

const STEP_LABELS = ["Instituce a smlouva", "Režim a termín", "Dokončit výstup"] as const;

const TERMINATION_FIELD_CLASS =
  "h-12 w-full min-h-[44px] rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100";
const TERMINATION_LABEL_CLASS = "mb-2 block text-xs font-medium text-slate-600";
const TERMINATION_TEXTAREA_CLASS =
  "min-h-[104px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-100";
const TERMINATION_DATE_INPUT_CLASS =
  "h-12 w-full min-h-[44px] rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100";
const TERMINATION_DATE_LABEL_CLASS = "mb-2 block text-xs font-medium text-slate-600";

type Props = {
  prefill: TerminationWizardPrefill;
  segments: string[];
  canWrite: boolean;
  sourceQuick: boolean;
  sourceFromAi: boolean;
  urlPrefill?: {
    insurerName?: string;
    requestedEffectiveDate?: string;
    requestedSubmissionDate?: string;
    sourceDocumentId?: string;
  };
  loadedDraft?: TerminationIntakeDraftWizardState | null;
  draftLoadError?: string | null;
};

type SourceCard = "crm" | "upload" | "manual";

function cx(...parts: (string | false | undefined | null)[]): string {
  return parts.filter(Boolean).join(" ");
}

function localIsoDateToday(): string {
  const t = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

function initialWizardSubmissionDate(
  loadedDraft: TerminationIntakeDraftWizardState | null | undefined,
  urlPrefill: Props["urlPrefill"],
): string {
  const sub = loadedDraft?.requestedSubmissionDate?.trim();
  if (sub) return sub;
  if (loadedDraft?.terminationMode === "within_two_months_from_inception") {
    const legacy = loadedDraft.requestedEffectiveDate?.trim();
    if (legacy) return legacy;
  }
  const urlSub = urlPrefill?.requestedSubmissionDate?.trim();
  if (urlSub) return urlSub;
  return "";
}

function initialWizardEffectiveDate(
  loadedDraft: TerminationIntakeDraftWizardState | null | undefined,
  urlPrefill: Props["urlPrefill"],
): string {
  if (loadedDraft?.terminationMode === "within_two_months_from_inception") return "";
  return (
    loadedDraft?.requestedEffectiveDate?.trim() ??
    urlPrefill?.requestedEffectiveDate?.trim() ??
    ""
  );
}

export function TerminationIntakeWizard({
  prefill,
  segments,
  canWrite,
  sourceQuick,
  sourceFromAi,
  urlPrefill,
  loadedDraft,
  draftLoadError,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [wizardStep, setWizardStep] = useState(0);
  const [partialSavedOk, setPartialSavedOk] = useState<string | null>(null);
  const [finalizeOkMsg, setFinalizeOkMsg] = useState<string | null>(null);
  const [requestStatus, setRequestStatus] = useState<TerminationRequestStatus>(
    () => loadedDraft?.status ?? "intake",
  );
  const [partialRequestId, setPartialRequestId] = useState<string | null>(() => loadedDraft?.requestId ?? null);
  const partialRequestIdRef = useRef<string | null>(partialRequestId);
  useEffect(() => {
    partialRequestIdRef.current = partialRequestId;
  }, [partialRequestId]);

  const [contactId, setContactId] = useState<string | null>(() => loadedDraft?.contactId ?? prefill.contactId);
  const [contractId, setContractId] = useState<string | null>(() => loadedDraft?.contractId ?? prefill.contractId);

  const [sourceCard, setSourceCard] = useState<SourceCard>(() => {
    if (loadedDraft?.sourceDocumentId?.trim()) return "upload";
    if (prefill.mode === "crm") return "crm";
    return "manual";
  });

  const [insurerQuery, setInsurerQuery] = useState(
    () => loadedDraft?.insurerName || urlPrefill?.insurerName?.trim() || prefill.insurerName || "",
  );
  const [selectedInsurerRegistryId, setSelectedInsurerRegistryId] = useState<string | null>(
    () => loadedDraft?.insurerRegistryId ?? null,
  );
  const [registryDeliveryMeta, setRegistryDeliveryMeta] = useState<{
    addressLine: string | null;
    channelHint: string | null;
  } | null>(() =>
    loadedDraft?.insurerRegistryOneLine
      ? {
          addressLine: loadedDraft.insurerRegistryOneLine,
          channelHint: loadedDraft.insurerRegistryChannelHint,
        }
      : null,
  );
  const [letterPlainTextDraft, setLetterPlainTextDraft] = useState(
    () => loadedDraft?.documentBuilderExtras?.letterPlainTextDraft ?? "",
  );
  const [letterHeaderDateIso, setLetterHeaderDateIso] = useState(
    () => loadedDraft?.documentBuilderExtras?.letterHeaderDateIso?.trim() ?? "",
  );

  const onLetterPlainTextDraftChange = useCallback((plain: string) => {
    setLetterPlainTextDraft(plain);
  }, []);

  const [clientQuery, setClientQuery] = useState(() => prefill.contactLabel?.trim() ?? "");
  const [insurerItems, setInsurerItems] = useState<SearchComboboxItem[]>([]);
  const [clientItems, setClientItems] = useState<SearchComboboxItem[]>([]);
  const [insurerSearchBusy, setInsurerSearchBusy] = useState(false);
  const [clientSearchBusy, setClientSearchBusy] = useState(false);

  const [uncertainInsurer, setUncertainInsurer] = useState(() => loadedDraft?.uncertainInsurer ?? false);
  const [contractNumber, setContractNumber] = useState(
    () => loadedDraft?.contractNumber ?? prefill.contractNumber ?? "",
  );
  const [productSegment, setProductSegment] = useState(
    () => loadedDraft?.productSegment ?? prefill.productSegment ?? segments[0] ?? "ZP",
  );
  const [contractStartDate, setContractStartDate] = useState(
    () => loadedDraft?.contractStartDate ?? prefill.contractStartDate ?? "",
  );
  const [contractAnniversaryDate, setContractAnniversaryDate] = useState(
    () => loadedDraft?.contractAnniversaryDate ?? prefill.contractAnniversaryDate ?? "",
  );
  const [requestedEffectiveDate, setRequestedEffectiveDate] = useState(() =>
    initialWizardEffectiveDate(loadedDraft, urlPrefill),
  );
  const [requestedSubmissionDate, setRequestedSubmissionDate] = useState(() =>
    initialWizardSubmissionDate(loadedDraft, urlPrefill),
  );
  const [anniversaryManual, setAnniversaryManual] = useState(
    () => Boolean(loadedDraft?.contractAnniversaryDate?.trim()),
  );
  const [effectiveManual, setEffectiveManual] = useState(() => {
    const eff = loadedDraft?.requestedEffectiveDate?.trim();
    if (!eff) return false;
    if (loadedDraft?.terminationMode !== "end_of_insurance_period") return true;
    return eff !== (loadedDraft?.contractAnniversaryDate ?? "").trim();
  });
  const [submissionManual, setSubmissionManual] = useState(
    () => Boolean(initialWizardSubmissionDate(loadedDraft, urlPrefill).trim()),
  );
  const [sourceDocumentId, setSourceDocumentId] = useState(
    () => loadedDraft?.sourceDocumentId ?? urlPrefill?.sourceDocumentId?.trim() ?? "",
  );
  const [attachmentsDeclared, setAttachmentsDeclared] = useState(
    () => loadedDraft?.documentBuilderExtras?.attachmentsDeclared ?? "",
  );
  const [terminationMode, setTerminationMode] = useState<TerminationMode>(
    () => loadedDraft?.terminationMode ?? "end_of_insurance_period",
  );
  const [terminationReasonCode, setTerminationReasonCode] = useState<TerminationReasonCode>(() =>
    modeToReasonCode(loadedDraft?.terminationMode ?? "end_of_insurance_period"),
  );
  const [policyholderKind, setPolicyholderKind] = useState<TerminationPolicyholderKind>(
    () => loadedDraft?.documentBuilderExtras?.policyholderKind ?? "person",
  );
  const [companyName, setCompanyName] = useState(() => loadedDraft?.documentBuilderExtras?.companyName ?? "");
  const [authorizedPersonName, setAuthorizedPersonName] = useState(
    () => loadedDraft?.documentBuilderExtras?.authorizedPersonName ?? "",
  );
  const [authorizedPersonRole, setAuthorizedPersonRole] = useState(
    () => loadedDraft?.documentBuilderExtras?.authorizedPersonRole ?? "",
  );
  const [advisorNoteForReview, setAdvisorNoteForReview] = useState(
    () => loadedDraft?.documentBuilderExtras?.advisorNoteForReview ?? "",
  );
  const [claimEventDate, setClaimEventDate] = useState(
    () => loadedDraft?.documentBuilderExtras?.claimEventDate ?? "",
  );
  const [placeOverride, setPlaceOverride] = useState(
    () => loadedDraft?.documentBuilderExtras?.placeOverride ?? "",
  );
  const [policyholderAddressLine1Override, setPolicyholderAddressLine1Override] = useState(
    () => loadedDraft?.documentBuilderExtras?.policyholderAddressLine1Override ?? "",
  );
  const [policyholderAddressLine2Override, setPolicyholderAddressLine2Override] = useState(
    () => loadedDraft?.documentBuilderExtras?.policyholderAddressLine2Override ?? "",
  );
  /** Poradce musí potvrdit správnost výstupu před exportem – audit + ochrana před automatickým výstupem. */
  const [advisorConfirmed, setAdvisorConfirmed] = useState(
    () => Boolean(loadedDraft?.documentBuilderExtras?.advisorConfirmedAt),
  );
  /** Banner z AI klasifikátoru segmentu (null = nezobrazovat). */
  const [segmentSuggestionBanner, setSegmentSuggestionBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [previewSyncBusy, setPreviewSyncBusy] = useState(false);
  const [previewGapMessages, setPreviewGapMessages] = useState<string[]>([]);
  const [finishLetterVm, setFinishLetterVm] = useState<TerminationLetterBuildResult["viewModel"] | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [aiExtractBusy, setAiExtractBusy] = useState(false);
  const [aiExtractMsg, setAiExtractMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sourceKind: TerminationRequestSource = useMemo(() => {
    if (loadedDraft?.sourceKind) return loadedDraft.sourceKind;
    if (sourceFromAi) return "ai_chat";
    if (sourceQuick) return "quick_action";
    if (sourceCard === "crm" && prefill.mode === "crm") return "crm_contract";
    if (sourceCard === "upload" && sourceDocumentId.trim()) return "document_upload";
    return "manual_intake";
  }, [loadedDraft?.sourceKind, prefill.mode, sourceFromAi, sourceQuick, sourceCard, sourceDocumentId]);

  useEffect(() => {
    setTerminationReasonCode(modeToReasonCode(terminationMode));
  }, [terminationMode]);

  /** Při změně počátku přepočítat výročí, dokud uživatel výročí ručně neupravil. */
  useEffect(() => {
    const start = contractStartDate.trim();
    if (!start || anniversaryManual) return;
    const suggested = suggestedAnniversaryFromContractStart(start);
    if (suggested) setContractAnniversaryDate(suggested);
  }, [contractStartDate, anniversaryManual]);

  /** Ke konci období: držet účinnost synchronně s výročím, dokud uživatel účinnost ručně neupravil. */
  useEffect(() => {
    if (terminationMode !== "end_of_insurance_period" || effectiveManual) return;
    const ann = contractAnniversaryDate.trim();
    if (!ann) return;
    setRequestedEffectiveDate(ann);
  }, [terminationMode, contractAnniversaryDate, effectiveManual]);

  /** Do 2 měsíců: výchozí datum podání = dnes, dokud ho uživatel ručně neupravil. */
  useEffect(() => {
    if (terminationMode !== "within_two_months_from_inception" || submissionManual) return;
    setRequestedSubmissionDate(localIsoDateToday());
  }, [terminationMode, submissionManual]);

  const onSegmentChange = useCallback(
    (seg: string) => {
      setProductSegment(seg);
      // Pokud aktuální mód není povolen pro nový segment, přepni na výchozí povolený mód
      if (!isTerminationModeAllowedForSegment(terminationMode, seg)) {
        const fallback = getDefaultTerminationMode(seg);
        setTerminationMode(fallback);
      }
    },
    [terminationMode],
  );

  const buildBasePayload = useCallback((): CreateTerminationDraftPayload => {
    return {
      sourceKind,
      contactId,
      contractId,
      sourceDocumentId: sourceDocumentId.trim() || null,
      sourceConversationId: null,
      insurerName: insurerQuery.trim(),
      contractNumber: contractNumber.trim() || null,
      productSegment: productSegment.trim() || null,
      contractStartDate: contractStartDate.trim() || null,
      contractAnniversaryDate: contractAnniversaryDate.trim() || null,
      requestedEffectiveDate: requestedEffectiveDate.trim() || null,
      requestedSubmissionDate:
        terminationMode === "within_two_months_from_inception"
          ? requestedSubmissionDate.trim() || null
          : null,
      terminationMode,
      terminationReasonCode,
      uncertainInsurer,
      insurerRegistryIdHint: selectedInsurerRegistryId,
      documentBuilderExtras: {
        ...(policyholderKind === "company" ? { policyholderKind: "company" as const } : {}),
        ...(policyholderKind === "company" && companyName.trim() ? { companyName: companyName.trim() } : {}),
        ...(policyholderKind === "company" && authorizedPersonName.trim()
          ? { authorizedPersonName: authorizedPersonName.trim() }
          : {}),
        ...(policyholderKind === "company" && authorizedPersonRole.trim()
          ? { authorizedPersonRole: authorizedPersonRole.trim() }
          : {}),
        ...(advisorNoteForReview.trim() ? { advisorNoteForReview: advisorNoteForReview.trim() } : {}),
        ...(claimEventDate.trim() ? { claimEventDate: claimEventDate.trim() } : {}),
        ...(placeOverride.trim() ? { placeOverride: placeOverride.trim() } : {}),
        ...(attachmentsDeclared.trim() ? { attachmentsDeclared: attachmentsDeclared.trim() } : {}),
        ...(letterPlainTextDraft.trim() ? { letterPlainTextDraft: letterPlainTextDraft.trim() } : {}),
        ...(letterHeaderDateIso.trim() ? { letterHeaderDateIso: letterHeaderDateIso.trim() } : {}),
        ...(policyholderAddressLine1Override.trim()
          ? { policyholderAddressLine1Override: policyholderAddressLine1Override.trim() }
          : {}),
        ...(policyholderAddressLine2Override.trim()
          ? { policyholderAddressLine2Override: policyholderAddressLine2Override.trim() }
          : {}),
        ...(advisorConfirmed
          ? { advisorConfirmedAt: new Date().toISOString() }
          : {}),
      },
    };
  }, [
    sourceKind,
    contactId,
    contractId,
    sourceDocumentId,
    insurerQuery,
    contractNumber,
    productSegment,
    contractStartDate,
    contractAnniversaryDate,
    requestedEffectiveDate,
    requestedSubmissionDate,
    terminationMode,
    terminationReasonCode,
    uncertainInsurer,
    policyholderKind,
    companyName,
    authorizedPersonName,
    authorizedPersonRole,
    advisorNoteForReview,
    claimEventDate,
    placeOverride,
    attachmentsDeclared,
    selectedInsurerRegistryId,
    letterPlainTextDraft,
    letterHeaderDateIso,
    policyholderAddressLine1Override,
    policyholderAddressLine2Override,
    advisorConfirmed,
  ]);

  useEffect(() => {
    const q = insurerQuery.trim();
    if (q.length < 2) {
      /* eslint-disable react-hooks/set-state-in-effect -- vyčištění výsledků při krátkém dotazu */
      setInsurerItems([]);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        setInsurerSearchBusy(true);
        const r = await searchTerminationInsurerRegistryAction(q);
        setInsurerSearchBusy(false);
        if (!r.ok) return;
        setInsurerItems(
          r.items.map((row) => ({
            id: row.id,
            label: row.insurerName,
            meta: insurerSearchItemMeta(row.addressLine, row.channelHint),
            insurerAddressLine: row.addressLine,
            insurerChannelHint: row.channelHint,
          })),
        );
      })();
    }, 280);
    return () => clearTimeout(t);
  }, [insurerQuery]);

  useEffect(() => {
    const q = clientQuery.trim();
    if (q.length < 2) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setClientItems([]);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        setClientSearchBusy(true);
        const r = await searchContactsForTerminationWizardAction(q);
        setClientSearchBusy(false);
        if (!r.ok) return;
        setClientItems(
          r.items.map((row) => ({
            id: row.id,
            label: row.displayName,
            meta: row.hint || null,
          })),
        );
      })();
    }, 280);
    return () => clearTimeout(t);
  }, [clientQuery]);

  useEffect(() => {
    if (wizardStep !== 2 || !canWrite || requestStatus !== "intake") {
      /* eslint-disable react-hooks/set-state-in-effect */
      setPreviewSyncBusy(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    let cancelled = false;
    setPreviewSyncBusy(true);
    const tid = setTimeout(() => {
      void saveTerminationIntakePartialAction({
        ...buildBasePayload(),
        partialRequestId: partialRequestIdRef.current,
      }).then((res) => {
        if (cancelled) return;
        setPreviewSyncBusy(false);
        if (res.ok) {
          setPartialRequestId(res.requestId);
        }
      });
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, [wizardStep, canWrite, requestStatus, buildBasePayload]);

  function onInsurerQueryChange(q: string) {
    setInsurerQuery(q);
    setSelectedInsurerRegistryId(null);
    setRegistryDeliveryMeta(null);
  }

  function onInsurerPick(item: SearchComboboxItem) {
    setInsurerQuery(item.label);
    setSelectedInsurerRegistryId(item.id);
    setRegistryDeliveryMeta({
      addressLine: item.insurerAddressLine ?? null,
      channelHint: item.insurerChannelHint ?? null,
    });
  }

  function onClientPick(item: SearchComboboxItem) {
    setContactId(item.id);
    setClientQuery(item.label);
    setContractId(null);
    const next = new URLSearchParams(searchParams.toString());
    next.set("contactId", item.id);
    next.delete("contractId");
    router.replace(`/portal/terminations/new?${next.toString()}`);
  }

  async function onFileSelected(file: File) {
    setUploadError(null);
    setAiExtractMsg(null);
    setUploadBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("uploadSource", "web");
      if (contactId) fd.append("contactId", contactId);
      const res = await fetch("/api/documents/upload", { method: "POST", body: fd });
      const json = (await res.json()) as { ok?: boolean; documentId?: string; error?: string };
      if (!res.ok || !json.documentId) {
        setUploadError(json.error ?? "Nahrání selhalo.");
        return;
      }
      setSourceDocumentId(json.documentId);
      // AI extraction
      setAiExtractBusy(true);
      setAiExtractMsg("Čtu dokument s AI…");
      const extracted = await extractTerminationFieldsFromDocumentAction(json.documentId);
      if (!extracted.ok) {
        setAiExtractMsg(`AI extrakce selhala: ${extracted.error}`);
        return;
      }
      const updates: string[] = [];
      if (extracted.contractNumber) {
        setContractNumber(extracted.contractNumber);
        updates.push("číslo smlouvy");
      }
      if (extracted.policyholderName) {
        setClientQuery(extracted.policyholderName);
        updates.push("pojistník");
      }
      // Adresa pojistníka z dokumentu
      const street = extracted.policyholderStreet;
      const cityZip = [extracted.policyholderPostalCode, extracted.policyholderCity]
        .filter(Boolean)
        .join(" ");
      if (street) {
        setPolicyholderAddressLine1Override(street);
        updates.push("ulice pojistníka");
      }
      if (cityZip) {
        setPolicyholderAddressLine2Override(cityZip);
        updates.push("město/PSČ pojistníka");
      }
      // Datum počátku pojištění
      if (extracted.contractStartDate && !contractStartDate.trim()) {
        setContractStartDate(extracted.contractStartDate);
        updates.push("počátek pojištění");
      }
      // Výroční datum
      if (extracted.contractAnniversaryDate && !contractAnniversaryDate.trim()) {
        setContractAnniversaryDate(extracted.contractAnniversaryDate);
        setAnniversaryManual(true);
        updates.push("výroční datum");
      }
      // Segment – klasifikace z AI + lokální classifier
      const rawSegmentCandidate = extracted.segmentCandidate ?? null;
      const localClassification = classifyInsuranceSegment(
        extracted.productName,
        extracted.productTypeRaw,
      );
      const proposedSegment =
        rawSegmentCandidate && segments.includes(rawSegmentCandidate)
          ? rawSegmentCandidate
          : localClassification.segment && segments.includes(localClassification.segment)
            ? localClassification.segment
            : null;
      if (proposedSegment && proposedSegment !== productSegment) {
        setProductSegment(proposedSegment);
        // Zkontrolovat kompatibilitu módu s novým segmentem
        if (!isTerminationModeAllowedForSegment(terminationMode, proposedSegment)) {
          setTerminationMode(getDefaultTerminationMode(proposedSegment));
        }
        const segLabel = proposedSegment;
        const confidence =
          rawSegmentCandidate === proposedSegment
            ? "AI z dokumentu"
            : `${Math.round(localClassification.confidence * 100)} % jistota`;
        setSegmentSuggestionBanner(
          `Segment automaticky nastaven na „${segLabel}" (${confidence}). Zkontrolujte a upravte podle potřeby.`,
        );
        updates.push(`segment (${segLabel})`);
      }
      if (extracted.insurerNameOrAddressText) {
        setInsurerQuery(extracted.insurerNameOrAddressText);
        updates.push("název instituce z dokumentu");
        const regRes = await searchTerminationInsurerRegistryAction(extracted.insurerNameOrAddressText);
        if (regRes.ok && regRes.items.length === 1) {
          const hit = regRes.items[0]!;
          setSelectedInsurerRegistryId(hit.id);
          setInsurerQuery(hit.insurerName);
          setRegistryDeliveryMeta({ addressLine: hit.addressLine, channelHint: hit.channelHint });
          updates.push("adresa z registru");
        } else if (regRes.ok && regRes.items.length > 1) {
          updates.push("více shod v registru — vyberte instituci ručně");
        }
      }
      setAiExtractMsg(
        updates.length > 0
          ? `Předvyplněno: ${updates.join(", ")}.`
          : "Dokument nahrán, AI nenašlo jednoznačná data.",
      );
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Chyba nahrání.");
    } finally {
      setUploadBusy(false);
      setAiExtractBusy(false);
    }
  }

  function onSavePartial() {
    setError(null);
    setPartialSavedOk(null);
    if (requestStatus !== "intake") {
      setError("Rozepsaný koncept lze ukládat jen ve stavu „intake“. Použijte Dokončit žádost.");
      return;
    }
    if (!canWrite) {
      setError("Nemáte oprávnění uložit koncept.");
      return;
    }
    startTransition(async () => {
      const res = await saveTerminationIntakePartialAction({
        ...buildBasePayload(),
        partialRequestId,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPartialRequestId(res.requestId);
      setPartialSavedOk("Koncept uložen. Můžete pokračovat později.");
      const next = new URLSearchParams(searchParams.toString());
      next.set("draftId", res.requestId);
      router.replace(`/portal/terminations/new?${next.toString()}`);
    });
  }

  async function printLetterPreviewForRequest(requestId: string) {
    const preview = await getTerminationLetterPreview(requestId);
    if (!preview.ok) {
      setError(preview.error);
      return;
    }
    const plain = preview.data.letterPlainText?.trim();
    if (!plain) {
      setError("Náhled dopisu zatím není k dispozici.");
      return;
    }
    const html = plainTextToLetterHtml(plain);
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(
        `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"/><title>Výpověď – PDF</title></head><body style="margin:24px;font-family:system-ui,sans-serif">${html}</body></html>`,
      );
      w.document.close();
      w.focus();
      w.print();
      w.close();
    }
  }

  function onExportPdf() {
    setError(null);
    if (!partialRequestId) {
      setError("Nejdřív přejděte na krok 3 a počkejte na uložení konceptu pro náhled.");
      return;
    }
    if (!insurerQuery.trim()) {
      setError("Vyplňte název instituce.");
      return;
    }
    startTransition(async () => {
      await printLetterPreviewForRequest(partialRequestId);
    });
  }

  function onCompleteRequest() {
    setError(null);
    setFinalizeOkMsg(null);
    if (!canWrite) {
      setError("Nemáte oprávnění vytvořit žádost.");
      return;
    }
    if (!insurerQuery.trim()) {
      setError("Vyplňte název instituce před dokončením, nebo použijte „Uložit rozepsané“.");
      return;
    }
    startTransition(async () => {
      const res = await createTerminationDraft({
        ...buildBasePayload(),
        resumeRequestId: partialRequestId,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPartialRequestId(res.requestId);
      setRequestStatus(res.status);
      setFinalizeOkMsg(
        "Žádost je uložená. Můžete exportovat PDF níže, nebo otevřít detail žádosti.",
      );
      const next = new URLSearchParams(searchParams.toString());
      next.set("draftId", res.requestId);
      router.replace(`/portal/terminations/new?${next.toString()}`);
    });
  }

  const contextBanner = useMemo(() => {
    if (prefill.mode === "crm") {
      return (
        <p className="text-sm text-slate-500">
          Kontext: smlouva z CRM
          {prefill.contactLabel ? ` · klient ${prefill.contactLabel}` : ""}
          {prefill.contractId ? ` · smlouva ${prefill.contractId.slice(0, 8)}…` : ""}
        </p>
      );
    }
    if (prefill.mode === "contact_only") {
      return (
        <p className="text-sm text-slate-500">
          Kontext: klient bez vybrané smlouvy
          {prefill.contactLabel ? ` · ${prefill.contactLabel}` : ""} – doplňte údaje nebo nahrajte dokument.
        </p>
      );
    }
    return (
      <p className="text-sm text-slate-500">
        Kontext: obecný intak – zvažte vybrat klienta v kontaktech pro předvyplnění.
      </p>
    );
  }, [prefill]);

  const aiBanner =
    sourceFromAi ? (
      <p className="text-sm text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-2xl px-3 py-2">
        Otevřeno z AI asistenta – žádost bude označena zdrojem „ai_chat“. Ověřte údaje a výsledek pravidel.
      </p>
    ) : null;

  const effectivePreviewLabel =
    terminationMode === "within_two_months_from_inception"
      ? finishLetterVm?.computedEffectiveDate
        ? formatCzDate(finishLetterVm.computedEffectiveDate)
        : "— (po uložení žádosti)"
      : requestedEffectiveDate.trim()
        ? formatCzDate(requestedEffectiveDate)
        : "—";
  const submissionPreviewLabel = requestedSubmissionDate.trim()
    ? formatCzDate(requestedSubmissionDate)
    : "—";

  const twoMonthDeadline = contractStartDate.trim()
    ? computeTwoMonthDeadline(contractStartDate)
    : null;
  const twoMonthOpen = contractStartDate.trim()
    ? isTwoMonthWindowOpen(contractStartDate)
    : null;

  const hasTermComplete =
    terminationMode === "within_two_months_from_inception"
      ? Boolean(requestedSubmissionDate.trim())
      : terminationMode === "end_of_insurance_period"
        ? Boolean(requestedEffectiveDate.trim() || contractAnniversaryDate.trim())
        : Boolean(requestedEffectiveDate.trim());

  const isComplete =
    Boolean(insurerQuery.trim()) &&
    Boolean(contractNumber.trim()) &&
    Boolean(terminationMode) &&
    hasTermComplete;

  const deliveryAddressLine =
    registryDeliveryMeta?.addressLine ||
    (insurerQuery.trim() && !registryDeliveryMeta ? `${insurerQuery.trim()} (adresa se doplní po párování s registrem)` : null);

  const sourceFooterLabel =
    sourceKind === "crm_contract"
      ? "CRM smlouva"
      : sourceCard === "upload" && sourceDocumentId.trim()
        ? "Nahraná smlouva"
        : sourceDocumentId.trim()
          ? "Nahraná / odkazovaná smlouva"
          : sourceFromAi
          ? "AI asistent"
          : sourceQuick
            ? "Rychlá akce"
            : "Ruční zadání";

  const stepper = (
    <div className="grid gap-3 md:grid-cols-3">
      {STEP_LABELS.map((label, index) => {
        const active = index === wizardStep;
        const done = index < wizardStep;
        return (
          <button
            key={label}
            type="button"
            onClick={() => setWizardStep(index)}
            className={cx(
              "rounded-2xl border px-4 py-3 text-left transition min-h-[44px]",
              active && "border-violet-200 bg-violet-50 shadow-sm",
              done && "border-emerald-200 bg-emerald-50",
              !active && !done && "border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/40",
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cx(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold shrink-0",
                  active && "bg-violet-600 text-white",
                  done && "bg-emerald-500 text-white",
                  !active && !done && "bg-slate-100 text-slate-600",
                )}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
              </div>
              <div className="text-sm font-semibold text-slate-900">{label}</div>
            </div>
          </button>
        );
      })}
    </div>
  );

  const contactDocsHref = contactId ? `/portal/contacts/${contactId}?tab=dokumenty` : "/portal/contacts/new";

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">
            Výpověď smlouvy
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Vyberte klienta, instituci a typ ukončení. V posledním kroku zkontrolujte náhled dopisu před dokončením.
          </p>
          {contextBanner}
          {aiBanner}
        </div>
        <div
          className={cx(
            "inline-flex items-center gap-2 self-start rounded-full border px-3 py-2 text-xs font-semibold",
            isComplete ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900",
          )}
        >
          {isComplete ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {isComplete ? "Připraveno k dokončení" : "Doplňte chybějící údaje"}
        </div>
      </div>

      {draftLoadError ? (
        <p className="text-sm text-red-600" role="alert">
          {draftLoadError}
        </p>
      ) : null}

      {partialRequestId ? (
        <p className="text-xs text-slate-500 font-mono">Koncept: {partialRequestId}</p>
      ) : null}

      {partialSavedOk ? (
        <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-2xl px-3 py-2">
          {partialSavedOk}
        </p>
      ) : null}

      {finalizeOkMsg ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 space-y-2">
          <p>{finalizeOkMsg}</p>
          {partialRequestId ? (
            <Link
              href={`/portal/terminations/${partialRequestId}`}
              className="inline-flex font-semibold text-violet-700 underline"
            >
              Otevřít detail žádosti
            </Link>
          ) : null}
        </div>
      ) : null}

      {!canWrite ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Nemáte oprávnění vytvářet žádosti (potřebná role s úpravou kontaktů).
        </p>
      ) : null}

      {previewGapMessages.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold text-amber-900 mb-1">Chybějící údaje</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {previewGapMessages.map((m) => (
              <li key={m} className="text-xs text-amber-900">{m}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {segmentSuggestionBanner ? (
        <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <p className="text-sm text-blue-900">{segmentSuggestionBanner}</p>
          <button
            type="button"
            onClick={() => setSegmentSuggestionBanner(null)}
            className="ml-auto text-xs text-blue-600 underline shrink-0"
          >
            Zavřít
          </button>
        </div>
      ) : null}

      {uploadError ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          Nahrání dokumentu: {uploadError}
        </p>
      ) : null}
      {aiExtractMsg ? (
        <p
          className={`rounded-2xl border px-4 py-3 text-sm ${
            aiExtractMsg.startsWith("AI extrakce selhala")
              ? "border-amber-200 bg-amber-50 text-amber-950"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
          role="status"
        >
          {aiExtractMsg}
        </p>
      ) : null}

      {stepper}

      <form
        onSubmit={(e) => {
          e.preventDefault();
        }}
        className="space-y-6"
      >
        <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] sm:p-8">
          {wizardStep === 0 ? (
            <div className="space-y-6">
              <div className="grid gap-3 md:grid-cols-3">
                <button
                  type="button"
                  disabled={prefill.mode !== "crm"}
                  onClick={() => setSourceCard("crm")}
                  className={cx(
                    "rounded-3xl border p-4 text-left transition min-h-[44px]",
                    sourceCard === "crm"
                      ? "border-violet-200 bg-violet-50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/40",
                    prefill.mode !== "crm" && "opacity-50 cursor-not-allowed",
                  )}
                >
                  <div
                    className={cx(
                      "mb-3 flex h-11 w-11 items-center justify-center rounded-2xl",
                      sourceCard === "crm"
                        ? "bg-violet-600 text-white"
                        : "bg-slate-50 text-slate-500",
                    )}
                  >
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-semibold text-slate-900">Vybrat z CRM</div>
                  <div className="mt-1 text-sm leading-6 text-slate-500">
                    Nejrychlejší cesta s předvyplněním údajů.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setSourceCard("upload")}
                  className={cx(
                    "rounded-3xl border p-4 text-left transition min-h-[44px]",
                    sourceCard === "upload"
                      ? "border-violet-200 bg-violet-50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/40",
                  )}
                >
                  <div
                    className={cx(
                      "mb-3 flex h-11 w-11 items-center justify-center rounded-2xl",
                      sourceCard === "upload"
                        ? "bg-violet-600 text-white"
                        : "bg-slate-50 text-slate-500",
                    )}
                  >
                    <Upload className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-semibold text-slate-900">Nahrát smlouvu</div>
                  <div className="mt-1 text-sm leading-6 text-slate-500">
                    AI přečte instituci, číslo smlouvy a pojistníka.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setSourceCard("manual")}
                  className={cx(
                    "rounded-3xl border p-4 text-left transition min-h-[44px]",
                    sourceCard === "manual"
                      ? "border-violet-200 bg-violet-50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/40",
                  )}
                >
                  <div
                    className={cx(
                      "mb-3 flex h-11 w-11 items-center justify-center rounded-2xl",
                      sourceCard === "manual"
                        ? "bg-violet-600 text-white"
                        : "bg-slate-50 text-slate-500",
                    )}
                  >
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-semibold text-slate-900">Vyplnit ručně</div>
                  <div className="mt-1 text-sm leading-6 text-slate-500">
                    Pro cizí smlouvy nebo nový případ.
                  </div>
                </button>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <SearchCombobox
                  variant="termination"
                  label="Instituce"
                  placeholder="Začněte psát název instituce…"
                  query={insurerQuery}
                  onQueryChange={onInsurerQueryChange}
                  items={insurerItems}
                  selectedId={selectedInsurerRegistryId}
                  onSelect={(item) => onInsurerPick(item)}
                  isLoading={insurerSearchBusy}
                />
                <SearchCombobox
                  variant="termination"
                  label="Klient"
                  placeholder="Vyhledejte jméno klienta…"
                  helperText="Vyberte kontakt ze seznamu."
                  query={clientQuery}
                  onQueryChange={(q) => {
                    setClientQuery(q);
                  }}
                  items={clientItems}
                  selectedId={contactId}
                  onSelect={onClientPick}
                  isLoading={clientSearchBusy}
                />
                <div>
                  <label className={TERMINATION_LABEL_CLASS}>Číslo smlouvy</label>
                  <input
                    value={contractNumber}
                    onChange={(e) => setContractNumber(e.target.value)}
                    className={TERMINATION_FIELD_CLASS}
                  />
                </div>
                <FriendlyDateInput
                  label="Počátek pojištění"
                  value={contractStartDate}
                  onChange={setContractStartDate}
                  inputClassName={TERMINATION_DATE_INPUT_CLASS}
                  labelClassName={TERMINATION_DATE_LABEL_CLASS}
                />
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Adresa pro odeslání</div>
                    <div className="mt-1 text-sm text-slate-900">
                      {deliveryAddressLine ??
                        "Vyberte instituci ze seznamu nebo zadejte název — přesná adresa se doplní z registru po vyhodnocení."}
                    </div>
                    {registryDeliveryMeta?.channelHint ? (
                      <div className="mt-2 text-xs leading-5 text-slate-500">
                        Kanál: {terminationDeliveryChannelLabel(registryDeliveryMeta.channelHint)}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {sourceCard === "upload" ? (
                <div className="space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onFileSelected(f);
                      e.target.value = "";
                    }}
                  />
                  <div
                    className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-6 cursor-pointer hover:border-violet-300 transition"
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const f = e.dataTransfer.files?.[0];
                      if (f) void onFileSelected(f);
                    }}
                  >
                    <Upload className="h-8 w-8 text-slate-500" />
                    <div className="text-sm font-medium text-slate-900">
                      {uploadBusy || aiExtractBusy
                        ? uploadBusy
                          ? "Nahrávám soubor…"
                          : "AI čte dokument…"
                        : sourceDocumentId.trim()
                          ? "Soubor nahrán — klikněte pro nový"
                          : "Přetáhněte soubor nebo klikněte pro výběr"}
                    </div>
                    <div className="text-xs text-slate-500">PDF nebo obrázek, max 20 MB</div>
                  </div>
                  {sourceDocumentId.trim() ? (
                    <p className="text-xs text-slate-500 font-mono">
                      Dok: {sourceDocumentId.slice(0, 16)}…
                    </p>
                  ) : null}
                </div>
              ) : (
                <div>
                  <label className={TERMINATION_LABEL_CLASS}>Identifikátor dokumentu ve vašich souborech (volitelné)</label>
                  <input
                    value={sourceDocumentId}
                    onChange={(e) => setSourceDocumentId(e.target.value)}
                    className={`${TERMINATION_FIELD_CLASS} font-mono text-xs`}
                    placeholder="UUID dokumentu z CRM"
                  />
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    <Link href={contactDocsHref} className="font-semibold text-violet-600 underline">
                      Otevřít dokumenty klienta
                    </Link>
                  </div>
                </div>
              )}

              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-900 cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={uncertainInsurer}
                  onChange={(e) => setUncertainInsurer(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-200"
                />
                Nejsem si jistý institucí nebo adresou, chci to poslat do kontroly
              </label>
            </div>
          ) : null}

          {wizardStep === 1 ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Režim a termín ukončení</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Zvolte segment a způsob ukončení. Datum účinnosti lze doplnit podle potřeby.
                </p>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <label className={TERMINATION_LABEL_CLASS}>Segment</label>
                  <select
                    value={productSegment}
                    onChange={(e) => void onSegmentChange(e.target.value)}
                    className={TERMINATION_FIELD_CLASS}
                  >
                    {segments.map((s) => (
                      <option key={s} value={s}>
                        {segmentLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={TERMINATION_LABEL_CLASS}>Způsob ukončení</label>
                  <select
                    value={terminationMode}
                    onChange={(e) => {
                      const v = e.target.value as TerminationMode;
                      setTerminationMode(v);
                      if (v === "end_of_insurance_period") setEffectiveManual(false);
                      if (v === "within_two_months_from_inception") setSubmissionManual(false);
                    }}
                    className={TERMINATION_FIELD_CLASS}
                  >
                    {MODE_OPTIONS.filter((m) =>
                      isTerminationModeAllowedForSegment(m.value, productSegment),
                    ).map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  {!isTerminationModeAllowedForSegment(terminationMode, productSegment) && (
                    <p className="mt-1 text-xs text-amber-700">
                      Zvolený způsob ukončení není obvykle dostupný pro segment{" "}
                      {segmentLabel(productSegment)}. Byl automaticky přepnut.
                    </p>
                  )}
                </div>
                {terminationMode === "within_two_months_from_inception" ? (
                  <FriendlyDateInput
                    label="Datum podání výpovědi (den doručení)"
                    value={requestedSubmissionDate}
                    onChange={(v) => {
                      setSubmissionManual(true);
                      setRequestedSubmissionDate(v);
                    }}
                    inputClassName={TERMINATION_DATE_INPUT_CLASS}
                    labelClassName={TERMINATION_DATE_LABEL_CLASS}
                  />
                ) : (
                  <FriendlyDateInput
                    label="Požadované datum účinnosti (volitelné)"
                    value={requestedEffectiveDate}
                    onChange={(v) => {
                      setEffectiveManual(true);
                      setRequestedEffectiveDate(v);
                    }}
                    inputClassName={TERMINATION_DATE_INPUT_CLASS}
                    labelClassName={TERMINATION_DATE_LABEL_CLASS}
                  />
                )}
                <FriendlyDateInput
                  label="Výroční den"
                  value={contractAnniversaryDate}
                  onChange={(v) => {
                    setAnniversaryManual(true);
                    setContractAnniversaryDate(v);
                  }}
                  inputClassName={TERMINATION_DATE_INPUT_CLASS}
                  labelClassName={TERMINATION_DATE_LABEL_CLASS}
                />
                <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-violet-50 p-4">
                  <div className="flex items-start gap-3">
                    <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-900">
                        {terminationMode === "within_two_months_from_inception"
                          ? "Termíny (náhled)"
                          : "Navržené datum účinnosti (náhled)"}
                      </div>
                      {terminationMode === "within_two_months_from_inception" ? (
                        <div className="mt-1 space-y-1 text-sm text-slate-900">
                          <div>
                            <span className="font-medium text-slate-600">Datum podání: </span>
                            {submissionPreviewLabel}
                          </div>
                          <div>
                            <span className="font-medium text-slate-600">Účinnost (pravidla): </span>
                            {effectivePreviewLabel}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1 text-sm text-slate-900">{effectivePreviewLabel}</div>
                      )}
                      <div className="mt-2 text-xs leading-5 text-slate-500">
                        {terminationMode === "end_of_insurance_period" && contractAnniversaryDate.trim()
                          ? `Doplněno automaticky z výročního dne smlouvy. Po dokončení žádosti pravidla ověří přesné datum s ohledem na 6týdenní výpovědní lhůtu.`
                          : terminationMode === "within_two_months_from_inception"
                            ? twoMonthDeadline
                              ? twoMonthOpen
                                ? `Zákonná lhůta pro výpověď do 2 měsíců od sjednání platí do ${formatIsoDateForUiCs(twoMonthDeadline)}. Účinnost je typicky den doručení (datum podání) — po uložení žádosti ji dopočítají pravidla.`
                                : `Zákonná lhůta pro výpověď do 2 měsíců od sjednání pravděpodobně uplynula (limit byl ${formatIsoDateForUiCs(twoMonthDeadline)}). Pravidla to potvrdí po odeslání.`
                              : "Zadejte počátek pojištění v kroku 1 — pak se automaticky vypočítá lhůta."
                            : terminationMode === "fixed_calendar_date"
                              ? "Zadejte požadované datum ručně. Pravidla ověří, zda je datum přípustné."
                              : "Po dokončení žádosti pravidla dopočítají definitivní datum."}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="lg:col-span-2">
                  <label className={TERMINATION_LABEL_CLASS}>Přílohy</label>
                  <textarea
                    value={attachmentsDeclared}
                    onChange={(e) => setAttachmentsDeclared(e.target.value)}
                    placeholder="Například: kopie technického průkazu, zelená karta…"
                    rows={4}
                    className={TERMINATION_TEXTAREA_CLASS}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {wizardStep === 2 ? (
            <div className="space-y-6">
              {/* Detail fields: policyholder, place, note */}
              <details className="rounded-2xl border border-slate-200">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 select-none">
                  Upřesnit pojistníka a poznámku
                </summary>
                <div className="space-y-4 p-4 pt-2">
                  <fieldset className="rounded-2xl border border-slate-200 p-3 space-y-2">
                    <legend className="text-xs font-medium text-slate-600 px-1">Pojistník v dopise</legend>
                    <label className="flex items-center gap-2 text-sm min-h-[40px] cursor-pointer">
                      <input
                        type="radio"
                        name="ph-kind"
                        checked={policyholderKind === "person"}
                        onChange={() => setPolicyholderKind("person")}
                        className="h-4 w-4"
                      />
                      Fyzická osoba (jméno z kontaktu)
                    </label>
                    <label className="flex items-center gap-2 text-sm min-h-[40px] cursor-pointer">
                      <input
                        type="radio"
                        name="ph-kind"
                        checked={policyholderKind === "company"}
                        onChange={() => setPolicyholderKind("company")}
                        className="h-4 w-4"
                      />
                      Právnická osoba / firma
                    </label>
                    {policyholderKind === "company" ? (
                      <div className="grid gap-2 pt-1">
                        <input
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          className={TERMINATION_FIELD_CLASS}
                          placeholder="Obchodní firma"
                        />
                        <input
                          value={authorizedPersonName}
                          onChange={(e) => setAuthorizedPersonName(e.target.value)}
                          className={TERMINATION_FIELD_CLASS}
                          placeholder="Oprávněná osoba (podpis)"
                        />
                        <input
                          value={authorizedPersonRole}
                          onChange={(e) => setAuthorizedPersonRole(e.target.value)}
                          className={TERMINATION_FIELD_CLASS}
                          placeholder="Role (volitelné)"
                        />
                      </div>
                    ) : null}
                  </fieldset>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={`${TERMINATION_DATE_LABEL_CLASS} mb-1`}>Adresa pojistníka – ulice (doplní dopis, není-li v CRM)</label>
                      <input
                        value={policyholderAddressLine1Override}
                        onChange={(e) => setPolicyholderAddressLine1Override(e.target.value)}
                        className={TERMINATION_FIELD_CLASS}
                        placeholder="Např. Sněmovní 4"
                      />
                    </div>
                    <div>
                      <label className={`${TERMINATION_DATE_LABEL_CLASS} mb-1`}>Adresa pojistníka – PSČ a město</label>
                      <input
                        value={policyholderAddressLine2Override}
                        onChange={(e) => setPolicyholderAddressLine2Override(e.target.value)}
                        className={TERMINATION_FIELD_CLASS}
                        placeholder="Např. 118 00 Praha 1"
                      />
                    </div>
                  </div>

                  <div>
                    <label className={`${TERMINATION_DATE_LABEL_CLASS} mb-1`}>Místo v záhlaví dopisu (volitelné)</label>
                    <input
                      value={placeOverride}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPlaceOverride(v);
                        const iso = letterHeaderDateIso.trim();
                        if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
                          setLetterPlainTextDraft((prev) =>
                            replaceTerminationLetterPlaceDateLine(prev, v, iso),
                          );
                        }
                      }}
                      className={TERMINATION_FIELD_CLASS}
                      placeholder="např. Praha"
                    />
                  </div>

                  {terminationMode === "after_claim" ? (
                    <FriendlyDateInput
                      label="Datum oznámení / pojistné události (volitelné)"
                      value={claimEventDate}
                      onChange={setClaimEventDate}
                      inputClassName={TERMINATION_DATE_INPUT_CLASS}
                      labelClassName={TERMINATION_DATE_LABEL_CLASS}
                    />
                  ) : null}

                  <div>
                    <label className={`${TERMINATION_DATE_LABEL_CLASS} mb-1`}>
                      Interní poznámka pro kontrolu (volitelné)
                    </label>
                    <textarea
                      value={advisorNoteForReview}
                      onChange={(e) => setAdvisorNoteForReview(e.target.value)}
                      rows={3}
                      className={TERMINATION_TEXTAREA_CLASS}
                      placeholder="Viditelné v náhledu, ne v textu dopisu vůči instituci."
                    />
                  </div>
                </div>
              </details>

              {/* Advisor confirmation checkpoint – povinné před exportem */}
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-900 mb-2">Potvrzení poradce před exportem</p>
                <p className="text-xs text-amber-800 mb-3">
                  Aidvisora generuje návrh dokumentu na základě zadaných údajů. Zodpovědnost za
                  správnost výstupu, jeho odeslání a právní důsledky nese poradce.
                </p>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advisorConfirmed}
                    onChange={(e) => setAdvisorConfirmed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-amber-300"
                  />
                  <span className="text-sm text-amber-950">
                    Zkontroloval/a jsem pojistníka, číslo smlouvy, pojišťovnu, adresu a datum
                    účinnosti. Výstup je připraven k odeslání a přebírám za něj odpovědnost.
                  </span>
                </label>
              </div>

              {previewSyncBusy ? (
                <p className="text-xs text-slate-500">Aktualizuji náhled…</p>
              ) : null}

              {partialRequestId ? (
                <TerminationFinishOutputLayout
                  key={partialRequestId}
                  requestId={partialRequestId}
                  letterPlainTextDraft={letterPlainTextDraft}
                  onLetterPlainTextDraftChange={onLetterPlainTextDraftChange}
                  letterHeaderDateIso={letterHeaderDateIso}
                  onLetterHeaderDateIsoChange={(iso) => {
                    setLetterHeaderDateIso(iso);
                    const t = iso.trim();
                    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
                      setLetterPlainTextDraft((prev) =>
                        replaceTerminationLetterPlaceDateLine(prev, placeOverride, t),
                      );
                    }
                  }}
                  leftPanel={{
                    clientName: clientQuery.trim() || null,
                    insurerName: insurerQuery.trim() || null,
                    insurerAddress: registryDeliveryMeta?.addressLine ?? null,
                    contractNumber: contractNumber.trim() || null,
                    terminationModeLabel: MODE_OPTIONS.find((m) => m.value === terminationMode)?.label ?? terminationMode,
                    effectiveDateLabel:
                      finishLetterVm?.computedEffectiveDate || finishLetterVm?.requestedEffectiveDate
                        ? formatCzDate(
                            finishLetterVm.computedEffectiveDate ?? finishLetterVm.requestedEffectiveDate ?? "",
                          )
                        : effectivePreviewLabel,
                    submissionDateLabel:
                      terminationMode === "within_two_months_from_inception"
                        ? submissionPreviewLabel
                        : null,
                    deliveryChannelHint: registryDeliveryMeta?.channelHint ?? null,
                  }}
                  onBuildResult={(data: TerminationLetterBuildResult) => {
                    setPreviewGapMessages(data.validityReasons);
                    setFinishLetterVm(data.viewModel);
                  }}
                />
              ) : (
                <div className="rounded-[28px] border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                  {previewSyncBusy ? "Připravuji koncept pro náhled…" : "Náhled bude k dispozici po uložení konceptu."}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <span className="rounded-full bg-violet-50 px-3 py-1 font-medium text-violet-700">
              {sourceFooterLabel}
            </span>
            <span>
              {wizardStep === 2 ? "Toto je finální náhled před exportem." : "Vyplňte údaje a pokračujte na další krok."}
            </span>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={wizardStep === 0}
                onClick={() => setWizardStep((s) => Math.max(0, s - 1))}
                className="h-11 min-h-[44px] rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 disabled:opacity-40"
              >
                Zpět
              </button>
              {contactId ? (
                <Link
                  href={`/portal/contacts/${contactId}`}
                  className="inline-flex h-11 min-h-[44px] items-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700"
                >
                  Zrušit
                </Link>
              ) : (
                <Link
                  href="/portal/today"
                  className="inline-flex h-11 min-h-[44px] items-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700"
                >
                  Zrušit
                </Link>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                disabled={!canWrite || isPending}
                onClick={() => void onSavePartial()}
                className="h-11 min-h-[44px] rounded-2xl border border-violet-200 bg-violet-50 px-4 text-sm font-semibold text-violet-700 disabled:opacity-50"
              >
                {isPending ? "Ukládám…" : "Uložit rozepsané"}
              </button>
              {wizardStep < STEP_LABELS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setWizardStep((s) => Math.min(STEP_LABELS.length - 1, s + 1))}
                  className="inline-flex h-11 min-h-[44px] items-center gap-2 rounded-2xl bg-violet-600 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-600/20"
                >
                  Další krok
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : null}
              {wizardStep === STEP_LABELS.length - 1 ? (
                <>
                  {!advisorConfirmed && (
                    <p className="text-xs text-amber-700 self-center">
                      Nejdříve potvrďte správnost výstupu výše.
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={!canWrite || isPending || !partialRequestId || !advisorConfirmed}
                    onClick={() => onExportPdf()}
                    className="inline-flex h-11 min-h-[44px] items-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 shadow-sm disabled:opacity-50"
                  >
                    Exportovat PDF
                  </button>
                  <button
                    type="button"
                    disabled={!canWrite || isPending || !advisorConfirmed}
                    onClick={() => onCompleteRequest()}
                    className="inline-flex h-11 min-h-[44px] items-center gap-2 rounded-2xl bg-slate-900 px-5 text-sm font-semibold text-white shadow-lg shadow-slate-900/15 disabled:opacity-50"
                  >
                    Dokončit žádost
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

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
  saveTerminationIntakePartialAction,
  searchContactsForTerminationWizardAction,
  searchTerminationInsurerRegistryAction,
  type CreateTerminationDraftPayload,
  type TerminationIntakeDraftWizardState,
  type TerminationWizardPrefill,
} from "@/app/actions/terminations";
import type { TerminationLetterBuildResult } from "@/lib/terminations/termination-letter-types";
import { TerminationFinishOutputLayout } from "./TerminationFinishOutputLayout";
import type { TerminationMode, TerminationReasonCode, TerminationRequestSource } from "@/lib/db/schema-for-client";
import { modeToReasonCode, terminationDeliveryChannelLabel } from "@/lib/terminations/client";
import type { TerminationRulesResult } from "@/lib/terminations/types";

function insurerSearchItemMeta(addressLine: string | null | undefined, channelHint: string | null | undefined): string | null {
  const addr = addressLine?.trim() || "";
  const rawCh = channelHint?.trim() || "";
  const chLabel = rawCh ? terminationDeliveryChannelLabel(rawCh) : "";
  if (addr && chLabel) return `${addr} · ${chLabel}`;
  if (addr) return addr;
  if (chLabel) return chLabel;
  return null;
}
import type { TerminationPolicyholderKind } from "@/lib/terminations/termination-document-extras";
import { formatCzDate } from "@/lib/forms/cz-date";
import { FriendlyDateInput } from "@/components/forms/FriendlyDateInput";
import { SearchCombobox, type SearchComboboxItem } from "@/components/ui/SearchCombobox";
import { TerminationLetterPreviewPanel } from "./TerminationLetterPreviewPanel";

const MODE_OPTIONS: { value: TerminationMode; label: string }[] = [
  { value: "end_of_insurance_period", label: "Ke konci pojistného období / výročnímu dni" },
  { value: "fixed_calendar_date", label: "K určitému datu" },
  { value: "within_two_months_from_inception", label: "Do 2 měsíců od sjednání" },
  { value: "after_claim", label: "Po pojistné události" },
  { value: "distance_withdrawal", label: "Odstoupení od smlouvy na dálku" },
  { value: "mutual_agreement", label: "Dohodou" },
  { value: "manual_review_other", label: "Jiný důvod / ruční posouzení" },
];

const STEP_LABELS = ["Pojišťovna a smlouva", "Režim a termín", "Dokončit výstup"] as const;

type Props = {
  prefill: TerminationWizardPrefill;
  segments: string[];
  canWrite: boolean;
  sourceQuick: boolean;
  sourceFromAi: boolean;
  urlPrefill?: {
    insurerName?: string;
    requestedEffectiveDate?: string;
    sourceDocumentId?: string;
  };
  loadedDraft?: TerminationIntakeDraftWizardState | null;
  draftLoadError?: string | null;
};

type SourceCard = "crm" | "upload" | "manual";

function outcomeLabel(outcome: TerminationRulesResult["outcome"]): string {
  switch (outcome) {
    case "ready":
      return "Připraveno k dalšímu kroku (generování dokumentu)";
    case "awaiting_data":
      return "Doplňte chybějící údaje";
    case "review_required":
      return "Vyžaduje ruční kontrolu";
    case "hard_fail":
      return "Nelze automaticky pokračovat";
    default:
      return outcome;
  }
}

function cx(...parts: (string | false | undefined | null)[]): string {
  return parts.filter(Boolean).join(" ");
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
  const [selectedInsurerRegistryId, setSelectedInsurerRegistryId] = useState<string | null>(null);
  const [registryDeliveryMeta, setRegistryDeliveryMeta] = useState<{
    addressLine: string | null;
    channelHint: string | null;
  } | null>(null);

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
  const [requestedEffectiveDate, setRequestedEffectiveDate] = useState(
    () => loadedDraft?.requestedEffectiveDate ?? urlPrefill?.requestedEffectiveDate?.trim() ?? "",
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
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ requestId: string; rules: TerminationRulesResult } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [previewNonce, setPreviewNonce] = useState(0);
  const [previewSyncBusy, setPreviewSyncBusy] = useState(false);
  const [previewGapMessages, setPreviewGapMessages] = useState<string[]>([]);
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

  const onSegmentChange = useCallback((seg: string) => {
    setProductSegment(seg);
  }, []);

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
      terminationMode,
      terminationReasonCode,
      uncertainInsurer,
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
    if (wizardStep !== 2 || !canWrite) {
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
          setPreviewNonce((n) => n + 1);
        }
      });
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, [wizardStep, canWrite, buildBasePayload]);

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
      if (extracted.contractNumber && !contractNumber.trim()) {
        setContractNumber(extracted.contractNumber);
        updates.push("číslo smlouvy");
      }
      if (extracted.policyholderName && !clientQuery.trim()) {
        setClientQuery(extracted.policyholderName);
        updates.push("pojistník");
      }
      if (extracted.insurerNameOrAddressText) {
        if (!insurerQuery.trim()) {
          setInsurerQuery(extracted.insurerNameOrAddressText);
        }
        // Try registry search
        const regRes = await searchTerminationInsurerRegistryAction(extracted.insurerNameOrAddressText);
        if (regRes.ok && regRes.items.length === 1) {
          const hit = regRes.items[0]!;
          setSelectedInsurerRegistryId(hit.id);
          setInsurerQuery(hit.insurerName);
          setRegistryDeliveryMeta({ addressLine: hit.addressLine, channelHint: hit.channelHint });
          updates.push("pojišťovna z registru");
        } else if (!insurerQuery.trim()) {
          updates.push("název pojišťovny");
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
      setPreviewNonce((n) => n + 1);
      setPartialSavedOk("Koncept uložen. Můžete pokračovat později.");
      const next = new URLSearchParams(searchParams.toString());
      next.set("draftId", res.requestId);
      router.replace(`/portal/terminations/new?${next.toString()}`);
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canWrite) {
      setError("Nemáte oprávnění vytvořit žádost.");
      return;
    }
    if (!insurerQuery.trim()) {
      setError("Vyplňte název pojišťovny před dokončením, nebo použijte „Uložit rozepsané“.");
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
      setResult({ requestId: res.requestId, rules: res.rules });
    });
  }

  const contextBanner = useMemo(() => {
    if (prefill.mode === "crm") {
      return (
        <p className="text-sm text-[color:var(--wp-text-secondary)]">
          Kontext: smlouva z CRM
          {prefill.contactLabel ? ` · klient ${prefill.contactLabel}` : ""}
          {prefill.contractId ? ` · smlouva ${prefill.contractId.slice(0, 8)}…` : ""}
        </p>
      );
    }
    if (prefill.mode === "contact_only") {
      return (
        <p className="text-sm text-[color:var(--wp-text-secondary)]">
          Kontext: klient bez vybrané smlouvy
          {prefill.contactLabel ? ` · ${prefill.contactLabel}` : ""} – doplňte údaje nebo nahrajte dokument.
        </p>
      );
    }
    return (
      <p className="text-sm text-[color:var(--wp-text-secondary)]">
        Kontext: obecný intak – zvažte vybrat klienta v kontaktech pro předvyplnění.
      </p>
    );
  }, [prefill]);

  const aiBanner =
    sourceFromAi ? (
      <p className="text-sm text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-[var(--wp-radius)] px-3 py-2">
        Otevřeno z AI asistenta – žádost bude označena zdrojem „ai_chat“. Ověřte údaje a výsledek pravidel.
      </p>
    ) : null;

  const effectivePreviewLabel = requestedEffectiveDate.trim()
    ? formatCzDate(requestedEffectiveDate)
    : "—";

  const isComplete =
    Boolean(insurerQuery.trim()) &&
    Boolean(contractNumber.trim()) &&
    Boolean(terminationMode) &&
    Boolean(requestedEffectiveDate.trim() || terminationMode === "end_of_insurance_period");

  const deliveryAddressLine =
    registryDeliveryMeta?.addressLine ||
    (insurerQuery.trim() && !registryDeliveryMeta ? `${insurerQuery.trim()} (adresa se doplní po párování s registrem)` : null);

  const sourceFooterLabel =
    sourceKind === "crm_contract"
      ? "CRM smlouva"
      : sourceDocumentId.trim()
        ? "Nahraná / odkazovaná smlouva"
        : sourceFromAi
          ? "AI asistent"
          : sourceQuick
            ? "Rychlá akce"
            : "Ruční zadání";

  if (result) {
    const { rules, requestId } = result;
    return (
      <div className="mx-auto max-w-2xl space-y-6 rounded-[var(--wp-radius-lg)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-[color:var(--wp-text)]">Žádost uložena</h1>
        <p className="text-sm text-[color:var(--wp-text-secondary)]">
          ID žádosti: <span className="font-mono">{requestId}</span>
        </p>
        <div
          className={cx(
            "rounded-[var(--wp-radius)] border p-4 text-sm",
            rules.outcome === "hard_fail" && "border-red-200 bg-red-50 text-red-900",
            rules.outcome === "review_required" && "border-amber-200 bg-amber-50 text-amber-950",
            rules.outcome === "awaiting_data" && "border-indigo-200 bg-indigo-50 text-indigo-950",
            rules.outcome === "ready" && "border-emerald-200 bg-emerald-50 text-emerald-950",
          )}
        >
          <p className="font-semibold">{outcomeLabel(rules.outcome)}</p>
          {rules.computedEffectiveDate ? (
            <p className="mt-2">Navrhované datum účinnosti: {rules.computedEffectiveDate}</p>
          ) : null}
          {rules.reviewRequiredReason ? <p className="mt-2">{rules.reviewRequiredReason}</p> : null}
          {rules.missingFields.length > 0 ? (
            <ul className="mt-2 list-disc pl-5">
              {rules.missingFields.map((m) => (
                <li key={m.field}>{m.labelCs}</li>
              ))}
            </ul>
          ) : null}
          {rules.requiredAttachments.length > 0 ? (
            <div className="mt-2">
              <p className="font-medium">Přílohy</p>
              <ul className="list-disc pl-5">
                {rules.requiredAttachments.map((a) => (
                  <li key={a.requirementCode}>
                    {a.label}
                    {a.required ? " (povinné)" : " (doporučené)"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-[color:var(--wp-text)]">Náhled dokumentu</h2>
          <TerminationLetterPreviewPanel requestId={requestId} />
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/portal/terminations/${requestId}`}
            className="rounded-[var(--wp-radius)] bg-[var(--wp-accent)] px-4 py-2.5 text-sm font-semibold text-white min-h-[44px] inline-flex items-center"
          >
            Detail žádosti
          </Link>
          {contactId ? (
            <Link
              href={`/portal/contacts/${contactId}`}
              className="rounded-[var(--wp-radius)] bg-[var(--wp-accent)] px-4 py-2.5 text-sm font-semibold text-white min-h-[44px] inline-flex items-center"
            >
              Zpět na kontakt
            </Link>
          ) : (
            <Link
              href="/portal/contacts"
              className="rounded-[var(--wp-radius)] bg-[var(--wp-accent)] px-4 py-2.5 text-sm font-semibold text-white min-h-[44px] inline-flex items-center"
            >
              Na kontakty
            </Link>
          )}
          <Link
            href="/portal/terminations/new"
            className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-4 py-2.5 text-sm font-semibold min-h-[44px] inline-flex items-center"
          >
            Nová žádost
          </Link>
        </div>
      </div>
    );
  }

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
              "rounded-[var(--wp-radius)] border px-4 py-3 text-left transition min-h-[44px]",
              active && "border-[var(--wp-accent)] bg-[var(--wp-accent)]/10 shadow-sm",
              done && "border-emerald-200 bg-emerald-50",
              !active && !done && "border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] hover:border-[var(--wp-accent)]/40",
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cx(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold shrink-0",
                  active && "bg-[var(--wp-accent)] text-white",
                  done && "bg-emerald-500 text-white",
                  !active && !done && "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]",
                )}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
              </div>
              <div className="text-sm font-semibold text-[color:var(--wp-text)]">{label}</div>
            </div>
          </button>
        );
      })}
    </div>
  );

  const contactDocsHref = contactId ? `/portal/contacts/${contactId}?tab=dokumenty` : "/portal/contacts/new";

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-24">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[color:var(--wp-text)] md:text-2xl">
            Výpověď smlouvy
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--wp-text-secondary)]">
            Vyberte klienta, pojišťovnu a typ ukončení. V posledním kroku zkontrolujte náhled dopisu před dokončením.
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
        <p className="text-xs text-[color:var(--wp-text-secondary)] font-mono">Koncept: {partialRequestId}</p>
      ) : null}

      {partialSavedOk ? (
        <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-[var(--wp-radius)] px-3 py-2">
          {partialSavedOk}
        </p>
      ) : null}

      {!canWrite ? (
        <p className="rounded-[var(--wp-radius)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Nemáte oprávnění vytvářet žádosti (potřebná role s úpravou kontaktů).
        </p>
      ) : null}

      {previewGapMessages.length > 0 ? (
        <div className="rounded-[var(--wp-radius)] border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold text-amber-900 mb-1">Chybějící údaje</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {previewGapMessages.map((m) => (
              <li key={m} className="text-xs text-amber-900">{m}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {stepper}

      <form onSubmit={onSubmit} className="space-y-6">
        <div className="rounded-[var(--wp-radius-lg)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] p-6 shadow-sm sm:p-8">
          {wizardStep === 0 ? (
            <div className="space-y-6">
              <div className="grid gap-3 md:grid-cols-3">
                <button
                  type="button"
                  disabled={prefill.mode !== "crm"}
                  onClick={() => setSourceCard("crm")}
                  className={cx(
                    "rounded-[var(--wp-radius)] border p-4 text-left transition min-h-[44px]",
                    sourceCard === "crm"
                      ? "border-[var(--wp-accent)] bg-[var(--wp-accent)]/10 shadow-sm"
                      : "border-[color:var(--wp-border)] hover:border-[var(--wp-accent)]/30",
                    prefill.mode !== "crm" && "opacity-50 cursor-not-allowed",
                  )}
                >
                  <div
                    className={cx(
                      "mb-3 flex h-11 w-11 items-center justify-center rounded-[var(--wp-radius)]",
                      sourceCard === "crm"
                        ? "bg-[var(--wp-accent)] text-white"
                        : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]",
                    )}
                  >
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-semibold text-[color:var(--wp-text)]">Vybrat z CRM</div>
                  <div className="mt-1 text-sm leading-6 text-[color:var(--wp-text-secondary)]">
                    Nejrychlejší cesta s předvyplněním údajů.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setSourceCard("upload")}
                  className={cx(
                    "rounded-[var(--wp-radius)] border p-4 text-left transition min-h-[44px]",
                    sourceCard === "upload"
                      ? "border-[var(--wp-accent)] bg-[var(--wp-accent)]/10 shadow-sm"
                      : "border-[color:var(--wp-border)] hover:border-[var(--wp-accent)]/30",
                  )}
                >
                  <div
                    className={cx(
                      "mb-3 flex h-11 w-11 items-center justify-center rounded-[var(--wp-radius)]",
                      sourceCard === "upload"
                        ? "bg-[var(--wp-accent)] text-white"
                        : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]",
                    )}
                  >
                    <Upload className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-semibold text-[color:var(--wp-text)]">Nahrát smlouvu</div>
                  <div className="mt-1 text-sm leading-6 text-[color:var(--wp-text-secondary)]">
                    AI přečte pojišťovnu, číslo smlouvy a pojistníka.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setSourceCard("manual")}
                  className={cx(
                    "rounded-[var(--wp-radius)] border p-4 text-left transition min-h-[44px]",
                    sourceCard === "manual"
                      ? "border-[var(--wp-accent)] bg-[var(--wp-accent)]/10 shadow-sm"
                      : "border-[color:var(--wp-border)] hover:border-[var(--wp-accent)]/30",
                  )}
                >
                  <div
                    className={cx(
                      "mb-3 flex h-11 w-11 items-center justify-center rounded-[var(--wp-radius)]",
                      sourceCard === "manual"
                        ? "bg-[var(--wp-accent)] text-white"
                        : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]",
                    )}
                  >
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-semibold text-[color:var(--wp-text)]">Vyplnit ručně</div>
                  <div className="mt-1 text-sm leading-6 text-[color:var(--wp-text-secondary)]">
                    Pro cizí smlouvy nebo nový případ.
                  </div>
                </button>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <SearchCombobox
                  label="Pojišťovna"
                  placeholder="Začněte psát název pojišťovny…"
                  query={insurerQuery}
                  onQueryChange={onInsurerQueryChange}
                  items={insurerItems}
                  selectedId={selectedInsurerRegistryId}
                  onSelect={(item) => onInsurerPick(item)}
                  isLoading={insurerSearchBusy}
                />
                <SearchCombobox
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
                  <label className="mb-2 block text-xs font-medium text-[color:var(--wp-text-muted)]">
                    Číslo smlouvy
                  </label>
                  <input
                    value={contractNumber}
                    onChange={(e) => setContractNumber(e.target.value)}
                    className="h-12 w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] px-4 text-sm min-h-[44px]"
                  />
                </div>
                <FriendlyDateInput
                  label="Počátek pojištění"
                  value={contractStartDate}
                  onChange={setContractStartDate}
                />
              </div>

              <div className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface-muted)]/50 p-4">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[var(--wp-accent)]" />
                  <div>
                    <div className="text-sm font-semibold text-[color:var(--wp-text)]">Adresa pro odeslání</div>
                    <div className="mt-1 text-sm text-[color:var(--wp-text)]">
                      {deliveryAddressLine ?? "Vyberte pojišťovnu ze seznamu nebo zadejte název — přesná adresa se doplní z registru po vyhodnocení."}
                    </div>
                    {registryDeliveryMeta?.channelHint ? (
                      <div className="mt-2 text-xs leading-5 text-[color:var(--wp-text-secondary)]">
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
                    className="flex flex-col items-center justify-center gap-3 rounded-[var(--wp-radius)] border-2 border-dashed border-[color:var(--wp-border)] bg-[color:var(--wp-surface-muted)]/40 p-6 cursor-pointer hover:border-[var(--wp-accent)]/50 transition"
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
                    <Upload className="h-8 w-8 text-[color:var(--wp-text-secondary)]" />
                    <div className="text-sm font-medium text-[color:var(--wp-text)]">
                      {uploadBusy || aiExtractBusy
                        ? uploadBusy
                          ? "Nahrávám soubor…"
                          : "AI čte dokument…"
                        : sourceDocumentId.trim()
                          ? "Soubor nahrán — klikněte pro nový"
                          : "Přetáhněte soubor nebo klikněte pro výběr"}
                    </div>
                    <div className="text-xs text-[color:var(--wp-text-secondary)]">PDF nebo obrázek, max 20 MB</div>
                  </div>
                  {aiExtractMsg ? (
                    <p
                      className={`text-xs rounded-[var(--wp-radius)] px-3 py-2 ${
                        aiExtractMsg.startsWith("AI extrakce selhala")
                          ? "bg-amber-50 text-amber-900 border border-amber-200"
                          : "bg-emerald-50 text-emerald-900 border border-emerald-200"
                      }`}
                    >
                      {aiExtractMsg}
                    </p>
                  ) : null}
                  {uploadError ? (
                    <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-[var(--wp-radius)] px-3 py-2">
                      {uploadError}
                    </p>
                  ) : null}
                  {sourceDocumentId.trim() ? (
                    <p className="text-xs text-[color:var(--wp-text-secondary)] font-mono">
                      Dok: {sourceDocumentId.slice(0, 16)}…
                    </p>
                  ) : null}
                </div>
              ) : (
                <div>
                  <label className="mb-2 block text-xs font-medium text-[color:var(--wp-text-muted)]">
                    Identifikátor dokumentu ve vašich souborech (volitelné)
                  </label>
                  <input
                    value={sourceDocumentId}
                    onChange={(e) => setSourceDocumentId(e.target.value)}
                    className="h-12 w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] px-4 text-sm min-h-[44px] font-mono text-xs"
                    placeholder="UUID dokumentu z CRM"
                  />
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    <Link href={contactDocsHref} className="font-semibold text-[var(--wp-accent)] underline">
                      Otevřít dokumenty klienta
                    </Link>
                  </div>
                </div>
              )}

              <label className="flex items-center gap-3 rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface-muted)]/30 px-4 py-3 text-sm text-[color:var(--wp-text)] cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={uncertainInsurer}
                  onChange={(e) => setUncertainInsurer(e.target.checked)}
                  className="h-4 w-4 rounded border-[color:var(--wp-border)]"
                />
                Nejsem si jistý pojišťovnou nebo adresou, chci to poslat do kontroly
              </label>
            </div>
          ) : null}

          {wizardStep === 1 ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-[color:var(--wp-text)]">Režim a termín ukončení</h2>
                <p className="mt-1 text-sm text-[color:var(--wp-text-secondary)]">
                  Zvolte segment a způsob ukončení. Datum účinnosti lze doplnit podle potřeby.
                </p>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-medium text-[color:var(--wp-text-muted)]">Segment</label>
                  <select
                    value={productSegment}
                    onChange={(e) => void onSegmentChange(e.target.value)}
                    className="h-12 w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] px-4 text-sm min-h-[44px]"
                  >
                    {segments.map((s) => (
                      <option key={s} value={s}>
                        {segmentLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium text-[color:var(--wp-text-muted)]">
                    Způsob ukončení
                  </label>
                  <select
                    value={terminationMode}
                    onChange={(e) => setTerminationMode(e.target.value as TerminationMode)}
                    className="h-12 w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] px-4 text-sm min-h-[44px]"
                  >
                    {MODE_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <FriendlyDateInput
                  label="Požadované datum účinnosti (volitelné)"
                  value={requestedEffectiveDate}
                  onChange={setRequestedEffectiveDate}
                />
                <FriendlyDateInput label="Výroční den" value={contractAnniversaryDate} onChange={setContractAnniversaryDate} />
                <div className="lg:col-span-2 rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[var(--wp-accent)]/5 p-4">
                  <div className="flex items-start gap-3">
                    <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-[var(--wp-accent)]" />
                    <div>
                      <div className="text-sm font-semibold text-[color:var(--wp-text)]">Navržené datum účinnosti (náhled)</div>
                      <div className="mt-1 text-sm text-[color:var(--wp-text)]">{effectivePreviewLabel}</div>
                      <div className="mt-2 text-xs leading-5 text-[color:var(--wp-text-secondary)]">
                        Po dokončení žádosti dopočítá pravidla definitivní datum; u režimu ke konci období ověřte výsledek v
                        souhrnu.
                      </div>
                    </div>
                  </div>
                </div>
                <div className="lg:col-span-2">
                  <label className="mb-2 block text-xs font-medium text-[color:var(--wp-text-muted)]">Přílohy</label>
                  <textarea
                    value={attachmentsDeclared}
                    onChange={(e) => setAttachmentsDeclared(e.target.value)}
                    placeholder="Například: kopie technického průkazu, zelená karta…"
                    rows={4}
                    className="min-h-[104px] w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] px-4 py-3 text-sm"
                  />
                </div>
              </div>
            </div>
          ) : null}

          {wizardStep === 2 ? (
            <div className="space-y-6">
              {/* Detail fields: policyholder, place, note */}
              <details className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)]">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[color:var(--wp-text)] select-none">
                  Upřesnit pojistníka a poznámku
                </summary>
                <div className="space-y-4 p-4 pt-2">
                  <fieldset className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] p-3 space-y-2">
                    <legend className="text-xs font-medium text-[color:var(--wp-text-muted)] px-1">Pojistník v dopise</legend>
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
                          className="w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2 text-sm min-h-[44px]"
                          placeholder="Obchodní firma"
                        />
                        <input
                          value={authorizedPersonName}
                          onChange={(e) => setAuthorizedPersonName(e.target.value)}
                          className="w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2 text-sm min-h-[44px]"
                          placeholder="Oprávněná osoba (podpis)"
                        />
                        <input
                          value={authorizedPersonRole}
                          onChange={(e) => setAuthorizedPersonRole(e.target.value)}
                          className="w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2 text-sm min-h-[44px]"
                          placeholder="Role (volitelné)"
                        />
                      </div>
                    ) : null}
                  </fieldset>

                  <div>
                    <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1">
                      Místo v záhlaví dopisu (volitelné)
                    </label>
                    <input
                      value={placeOverride}
                      onChange={(e) => setPlaceOverride(e.target.value)}
                      className="w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2 text-sm min-h-[44px]"
                      placeholder="např. Praha"
                    />
                  </div>

                  {terminationMode === "after_claim" ? (
                    <FriendlyDateInput
                      label="Datum oznámení / pojistné události (volitelné)"
                      value={claimEventDate}
                      onChange={setClaimEventDate}
                    />
                  ) : null}

                  <div>
                    <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1">
                      Interní poznámka pro kontrolu (volitelné)
                    </label>
                    <textarea
                      value={advisorNoteForReview}
                      onChange={(e) => setAdvisorNoteForReview(e.target.value)}
                      rows={3}
                      className="w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2 text-sm"
                      placeholder="Viditelné v náhledu, ne v textu dopisu vůči pojišťovně."
                    />
                  </div>
                </div>
              </details>

              {previewSyncBusy ? (
                <p className="text-xs text-[color:var(--wp-text-secondary)]">Aktualizuji náhled…</p>
              ) : null}

              {partialRequestId ? (
                <TerminationFinishOutputLayout
                  key={previewNonce}
                  requestId={partialRequestId}
                  leftPanel={{
                    clientName: clientQuery.trim() || null,
                    insurerName: insurerQuery.trim() || null,
                    insurerAddress: registryDeliveryMeta?.addressLine ?? null,
                    contractNumber: contractNumber.trim() || null,
                    terminationModeLabel: MODE_OPTIONS.find((m) => m.value === terminationMode)?.label ?? terminationMode,
                    effectiveDateLabel: effectivePreviewLabel,
                    deliveryChannelHint: registryDeliveryMeta?.channelHint ?? null,
                  }}
                  onBuildResult={(data: TerminationLetterBuildResult) => {
                    setPreviewGapMessages(data.validityReasons);
                  }}
                />
              ) : (
                <div className="rounded-[28px] border border-slate-200 bg-white p-8 text-center text-sm text-[color:var(--wp-text-secondary)] shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
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

        <div className="sticky bottom-0 z-10 rounded-[var(--wp-radius-lg)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] px-5 py-4 shadow-md">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-[color:var(--wp-text-secondary)]">
            <span className="rounded-full bg-[var(--wp-accent)]/10 px-3 py-1 font-medium text-[var(--wp-accent)]">
              {sourceFooterLabel}
            </span>
            <span>
              {wizardStep === 2 ? "Finální náhled před odesláním pravidel." : "Vyplňte údaje a pokračujte na další krok."}
            </span>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={wizardStep === 0}
                onClick={() => setWizardStep((s) => Math.max(0, s - 1))}
                className="h-11 rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] px-4 text-sm font-medium text-[color:var(--wp-text)] min-h-[44px] disabled:opacity-40"
              >
                Zpět
              </button>
              {contactId ? (
                <Link
                  href={`/portal/contacts/${contactId}`}
                  className="inline-flex h-11 items-center rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] px-4 text-sm font-semibold text-[color:var(--wp-text)] min-h-[44px]"
                >
                  Zrušit
                </Link>
              ) : (
                <Link
                  href="/portal/today"
                  className="inline-flex h-11 items-center rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] px-4 text-sm font-semibold text-[color:var(--wp-text)] min-h-[44px]"
                >
                  Zrušit
                </Link>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={!canWrite || isPending}
                onClick={() => void onSavePartial()}
                className="h-11 rounded-[var(--wp-radius)] border border-[var(--wp-accent)] bg-transparent px-4 text-sm font-semibold text-[var(--wp-accent)] min-h-[44px] disabled:opacity-50"
              >
                {isPending ? "Ukládám…" : "Uložit rozepsané"}
              </button>
              {wizardStep < STEP_LABELS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setWizardStep((s) => Math.min(STEP_LABELS.length - 1, s + 1))}
                  className="inline-flex h-11 items-center gap-2 rounded-[var(--wp-radius)] bg-[var(--wp-accent)] px-5 text-sm font-semibold text-white min-h-[44px]"
                >
                  Další krok
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : null}
              {wizardStep === STEP_LABELS.length - 1 ? (
                <button
                  type="submit"
                  disabled={!canWrite || isPending}
                  className="inline-flex h-11 items-center gap-2 rounded-[var(--wp-radius)] bg-[var(--wp-accent)] px-5 text-sm font-semibold text-white min-h-[44px] disabled:opacity-50"
                >
                  Dokončit a vyhodnotit pravidla
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

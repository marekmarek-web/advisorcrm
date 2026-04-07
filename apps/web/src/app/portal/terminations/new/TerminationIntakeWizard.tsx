"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { segmentLabel } from "@/app/lib/segment-labels";
import {
  createTerminationDraft,
  listTerminationReasonsAction,
  saveTerminationIntakePartialAction,
  type CreateTerminationDraftPayload,
  type TerminationIntakeDraftWizardState,
  type TerminationWizardPrefill,
} from "@/app/actions/terminations";
import type { TerminationMode, TerminationReasonCode, TerminationRequestSource } from "@/lib/db/schema-for-client";
import type { TerminationRulesResult } from "@/lib/terminations";
import type { TerminationPolicyholderKind } from "@/lib/terminations/termination-document-extras";
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

export type WizardReasonOption = {
  id: string;
  reasonCode: string;
  labelCs: string;
  defaultDateComputation: string;
};

type Props = {
  prefill: TerminationWizardPrefill;
  segments: string[];
  initialReasons: WizardReasonOption[];
  canWrite: boolean;
  /** Otevřeno z rychlé akce „Výpověď“ – `source_kind` = quick_action. */
  sourceQuick: boolean;
  /** Query z AI asistenta (`prepare_termination_request`) → `source_kind` = ai_chat. */
  sourceFromAi: boolean;
  /** Předvyplnění z URL (asistent / externí odkaz). */
  urlPrefill?: {
    insurerName?: string;
    requestedEffectiveDate?: string;
    sourceDocumentId?: string;
  };
  /** Načtený rozepsaný koncept (`?draftId=`). */
  loadedDraft?: TerminationIntakeDraftWizardState | null;
  draftLoadError?: string | null;
};

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

export function TerminationIntakeWizard({
  prefill,
  segments,
  initialReasons,
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

  const [insurerName, setInsurerName] = useState(
    () => loadedDraft?.insurerName || urlPrefill?.insurerName?.trim() || prefill.insurerName
  );
  const [uncertainInsurer, setUncertainInsurer] = useState(() => loadedDraft?.uncertainInsurer ?? false);
  const [contractNumber, setContractNumber] = useState(
    () => loadedDraft?.contractNumber ?? prefill.contractNumber ?? ""
  );
  const [productSegment, setProductSegment] = useState(
    () => loadedDraft?.productSegment ?? prefill.productSegment ?? segments[0] ?? "ZP"
  );
  const [contractStartDate, setContractStartDate] = useState(
    () => loadedDraft?.contractStartDate ?? prefill.contractStartDate ?? ""
  );
  const [contractAnniversaryDate, setContractAnniversaryDate] = useState(
    () => loadedDraft?.contractAnniversaryDate ?? prefill.contractAnniversaryDate ?? ""
  );
  const [requestedEffectiveDate, setRequestedEffectiveDate] = useState(
    () => loadedDraft?.requestedEffectiveDate ?? urlPrefill?.requestedEffectiveDate?.trim() ?? ""
  );
  const [sourceDocumentId, setSourceDocumentId] = useState(
    () => loadedDraft?.sourceDocumentId ?? urlPrefill?.sourceDocumentId?.trim() ?? ""
  );
  const [reasons, setReasons] = useState<WizardReasonOption[]>(initialReasons);
  const [terminationReasonCode, setTerminationReasonCode] = useState<TerminationReasonCode>(
    () =>
      (loadedDraft?.terminationReasonCode as TerminationReasonCode) ??
      (initialReasons[0]?.reasonCode as TerminationReasonCode) ??
      "end_of_period_6_weeks"
  );
  const [terminationMode, setTerminationMode] = useState<TerminationMode>(
    () => loadedDraft?.terminationMode ?? "end_of_insurance_period"
  );
  const [policyholderKind, setPolicyholderKind] = useState<TerminationPolicyholderKind>(
    () => loadedDraft?.documentBuilderExtras?.policyholderKind ?? "person"
  );
  const [companyName, setCompanyName] = useState(() => loadedDraft?.documentBuilderExtras?.companyName ?? "");
  const [authorizedPersonName, setAuthorizedPersonName] = useState(
    () => loadedDraft?.documentBuilderExtras?.authorizedPersonName ?? ""
  );
  const [authorizedPersonRole, setAuthorizedPersonRole] = useState(
    () => loadedDraft?.documentBuilderExtras?.authorizedPersonRole ?? ""
  );
  const [advisorNoteForReview, setAdvisorNoteForReview] = useState(
    () => loadedDraft?.documentBuilderExtras?.advisorNoteForReview ?? ""
  );
  const [claimEventDate, setClaimEventDate] = useState(
    () => loadedDraft?.documentBuilderExtras?.claimEventDate ?? ""
  );
  const [placeOverride, setPlaceOverride] = useState(
    () => loadedDraft?.documentBuilderExtras?.placeOverride ?? ""
  );
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    requestId: string;
    rules: TerminationRulesResult;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const sourceKind: TerminationRequestSource = useMemo(() => {
    if (loadedDraft?.sourceKind) return loadedDraft.sourceKind;
    if (sourceFromAi) return "ai_chat";
    if (prefill.mode === "crm") return "crm_contract";
    if (sourceQuick) return "quick_action";
    return "manual_intake";
  }, [loadedDraft?.sourceKind, prefill.mode, sourceFromAi, sourceQuick]);

  useEffect(() => {
    if (!loadedDraft?.productSegment) return;
    void listTerminationReasonsAction(loadedDraft.productSegment).then(setReasons);
  }, [loadedDraft?.productSegment]);

  const onSegmentChange = useCallback(
    async (seg: string) => {
      setProductSegment(seg);
      const next = await listTerminationReasonsAction(seg);
      setReasons(next);
      if (next.length && !next.some((r) => r.reasonCode === terminationReasonCode)) {
        setTerminationReasonCode(next[0].reasonCode as TerminationReasonCode);
      }
    },
    [terminationReasonCode]
  );

  const STEP_LABELS = ["Pojišťovna a smlouva", "Režim a termíny", "Doplnění a kontrola"];

  function buildBasePayload(): CreateTerminationDraftPayload {
    return {
      sourceKind,
      contactId: loadedDraft?.contactId ?? prefill.contactId,
      contractId: loadedDraft?.contractId ?? prefill.contractId,
      sourceDocumentId: sourceDocumentId.trim() || null,
      sourceConversationId: null,
      insurerName: insurerName.trim(),
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
        ...(policyholderKind === "company" && companyName.trim()
          ? { companyName: companyName.trim() }
          : {}),
        ...(policyholderKind === "company" && authorizedPersonName.trim()
          ? { authorizedPersonName: authorizedPersonName.trim() }
          : {}),
        ...(policyholderKind === "company" && authorizedPersonRole.trim()
          ? { authorizedPersonRole: authorizedPersonRole.trim() }
          : {}),
        ...(advisorNoteForReview.trim() ? { advisorNoteForReview: advisorNoteForReview.trim() } : {}),
        ...(claimEventDate.trim() ? { claimEventDate: claimEventDate.trim() } : {}),
        ...(placeOverride.trim() ? { placeOverride: placeOverride.trim() } : {}),
      },
    };
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
    if (!insurerName.trim()) {
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
          {prefill.contactLabel ? ` · ${prefill.contactLabel}` : ""} – vyplňte údaje ručně nebo nahrajte
          dokument později.
        </p>
      );
    }
    return (
      <p className="text-sm text-[color:var(--wp-text-secondary)]">
        Kontext: obecný intak – není vázán na CRM smlouvu. Zvažte nejdřív vybrat klienta v kontaktech.
      </p>
    );
  }, [prefill]);

  const aiBanner =
    sourceFromAi ? (
      <p className="text-sm text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-[var(--wp-radius)] px-3 py-2">
        Otevřeno z AI asistenta – po uložení bude žádost označena zdrojem „ai_chat“. Doplňte údaje a ověřte výsledek
        rules engine.
      </p>
    ) : null;

  if (result) {
    const { rules, requestId } = result;
    return (
      <div className="mx-auto max-w-2xl space-y-6 rounded-[var(--wp-radius-lg)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-[color:var(--wp-text)]">Žádost uložena</h1>
        <p className="text-sm text-[color:var(--wp-text-secondary)]">
          ID žádosti: <span className="font-mono">{requestId}</span>
        </p>
        <div
          className={`rounded-[var(--wp-radius)] border p-4 text-sm ${
            rules.outcome === "hard_fail"
              ? "border-red-200 bg-red-50 text-red-900"
              : rules.outcome === "review_required"
                ? "border-amber-200 bg-amber-50 text-amber-950"
                : rules.outcome === "awaiting_data"
                  ? "border-indigo-200 bg-indigo-50 text-indigo-950"
                  : "border-emerald-200 bg-emerald-50 text-emerald-950"
          }`}
        >
          <p className="font-semibold">{outcomeLabel(rules.outcome)}</p>
          {rules.computedEffectiveDate ? (
            <p className="mt-2">Navrhované datum účinnosti: {rules.computedEffectiveDate}</p>
          ) : null}
          {rules.reviewRequiredReason ? (
            <p className="mt-2">{rules.reviewRequiredReason}</p>
          ) : null}
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
          <h2 className="text-sm font-semibold text-[color:var(--wp-text)]">Náhled dokumentu (fáze 6)</h2>
          <TerminationLetterPreviewPanel requestId={requestId} />
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/portal/terminations/${requestId}`}
            className="rounded-[var(--wp-radius)] bg-[var(--wp-accent)] px-4 py-2.5 text-sm font-semibold text-white min-h-[44px] inline-flex items-center"
          >
            Detail žádosti (stav, odeslání, audit)
          </Link>
          {prefill.contactId ? (
            <Link
              href={`/portal/contacts/${prefill.contactId}`}
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

  return (
    <div className="mx-auto max-w-2xl space-y-6 rounded-[var(--wp-radius-lg)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] p-6 shadow-sm">
      <div>
        <h1 className="text-xl font-semibold text-[color:var(--wp-text)]">Výpověď smlouvy</h1>
        {contextBanner}
        {aiBanner}
      </div>

      {draftLoadError ? (
        <p className="text-sm text-red-600" role="alert">
          {draftLoadError}
        </p>
      ) : null}

      {partialRequestId ? (
        <p className="text-xs text-[color:var(--wp-text-secondary)] font-mono">
          Rozpracovaný koncept: {partialRequestId}
        </p>
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

      <div className="flex flex-wrap gap-2 text-xs">
        {STEP_LABELS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setWizardStep(i)}
            className={`rounded-full px-3 py-1.5 font-semibold min-h-[36px] border ${
              wizardStep === i
                ? "border-[var(--wp-accent)] bg-[var(--wp-accent)] text-white"
                : "border-[color:var(--wp-border)] text-[color:var(--wp-text-secondary)]"
            }`}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {wizardStep === 0 ? (
          <>
            <div>
              <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1">
                Pojišťovna (název)
              </label>
              <input
                value={insurerName}
                onChange={(e) => setInsurerName(e.target.value)}
                className="w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2 text-sm min-h-[44px]"
                placeholder="např. Kooperativa — u rozepsaného konceptu můžete nechat prázdné a doplnit později"
              />
            </div>
            <label className="flex items-center gap-3 min-h-[44px] cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={uncertainInsurer}
                onChange={(e) => setUncertainInsurer(e.target.checked)}
                className="h-5 w-5 rounded border-[color:var(--wp-border)]"
              />
              Nejsem si jistý/á pojišťovnou – poslat do review
            </label>

            <div>
              <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1">
                Číslo smlouvy
              </label>
              <input
                value={contractNumber}
                onChange={(e) => setContractNumber(e.target.value)}
                className="w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2 text-sm min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1">
                ID zdrojového dokumentu (volitelné)
              </label>
              <input
                value={sourceDocumentId}
                onChange={(e) => setSourceDocumentId(e.target.value)}
                className="w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2 text-sm min-h-[44px] font-mono text-xs"
                placeholder="UUID dokumentu z CRM (nahraná smlouva)"
              />
              <p className="text-[11px] text-[color:var(--wp-text-muted)] mt-1">
                Fáze 5 masterplan: navázání na existující soubor ve vašem tenantu před doplněním kontaktu.
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {(loadedDraft?.contactId ?? prefill.contactId) ? (
                  <Link
                    href={`/portal/contacts/${loadedDraft?.contactId ?? prefill.contactId}?tab=dokumenty`}
                    className="font-semibold text-[var(--wp-accent)] underline"
                  >
                    Nahrát smlouvu v dokumentech klienta
                  </Link>
                ) : (
                  <Link href="/portal/contacts/new" className="font-semibold text-[var(--wp-accent)] underline">
                    Založit lehký kontakt (nový záznam)
                  </Link>
                )}
              </div>
            </div>
          </>
        ) : null}

        {wizardStep === 1 ? (
          <>
            <div>
              <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1">Segment</label>
              <select
                value={productSegment}
                onChange={(e) => void onSegmentChange(e.target.value)}
                className="w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2 text-sm min-h-[44px]"
              >
                {segments.map((s) => (
                  <option key={s} value={s}>
                    {segmentLabel(s)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1">
                  Počátek smlouvy
                </label>
                <input
                  type="date"
                  value={contractStartDate}
                  onChange={(e) => setContractStartDate(e.target.value)}
                  className="w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2 text-sm min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1">
                  Výroční den
                </label>
                <input
                  type="date"
                  value={contractAnniversaryDate}
                  onChange={(e) => setContractAnniversaryDate(e.target.value)}
                  className="w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2 text-sm min-h-[44px]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1">
                Požadované datum účinnosti (volitelné)
              </label>
              <input
                type="date"
                value={requestedEffectiveDate}
                onChange={(e) => setRequestedEffectiveDate(e.target.value)}
                className="w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2 text-sm min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1">
                Důvod výpovědi
              </label>
              <select
                value={terminationReasonCode}
                onChange={(e) => setTerminationReasonCode(e.target.value as TerminationReasonCode)}
                className="w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2 text-sm min-h-[44px]"
              >
                {reasons.map((r) => (
                  <option key={r.id} value={r.reasonCode}>
                    {r.labelCs}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1">
                Režim / způsob ukončení (wizard)
              </label>
              <select
                value={terminationMode}
                onChange={(e) => setTerminationMode(e.target.value as TerminationMode)}
                className="w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2 text-sm min-h-[44px]"
              >
                {MODE_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : null}

        {wizardStep === 2 ? (
          <>
        <fieldset className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] p-3 space-y-2">
          <legend className="text-xs font-medium text-[color:var(--wp-text-muted)] px-1">
            Pojistník v dopise
          </legend>
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
            <div className="grid gap-2 pt-1 sm:grid-cols-1">
              <div>
                <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1">
                  Obchodní firma
                </label>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2 text-sm min-h-[44px]"
                  placeholder="např. Example s.r.o."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1">
                  Oprávněná osoba (podpis)
                </label>
                <input
                  value={authorizedPersonName}
                  onChange={(e) => setAuthorizedPersonName(e.target.value)}
                  className="w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2 text-sm min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1">
                  Role (volitelné)
                </label>
                <input
                  value={authorizedPersonRole}
                  onChange={(e) => setAuthorizedPersonRole(e.target.value)}
                  className="w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2 text-sm min-h-[44px]"
                  placeholder="např. jednatel"
                />
              </div>
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

        {terminationReasonCode === "after_claim_event" ? (
          <div>
            <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1">
              Datum oznámení / pojistné události (volitelné)
            </label>
            <input
              type="date"
              value={claimEventDate}
              onChange={(e) => setClaimEventDate(e.target.value)}
              className="w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2 text-sm min-h-[44px]"
            />
          </div>
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
            placeholder="Viditelné v náhledu dokumentu, ne v textu dopisu vůči pojišťovně."
          />
        </div>
          </>
        ) : null}

        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            disabled={wizardStep === 0}
            onClick={() => setWizardStep((s) => Math.max(0, s - 1))}
            className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-4 py-2.5 text-sm font-semibold min-h-[44px] disabled:opacity-40"
          >
            Předchozí krok
          </button>
          <button
            type="button"
            disabled={wizardStep >= STEP_LABELS.length - 1}
            onClick={() => setWizardStep((s) => Math.min(STEP_LABELS.length - 1, s + 1))}
            className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-4 py-2.5 text-sm font-semibold min-h-[44px] disabled:opacity-40"
          >
            Další krok
          </button>
          <button
            type="button"
            disabled={!canWrite || isPending}
            onClick={() => void onSavePartial()}
            className="rounded-[var(--wp-radius)] border border-indigo-300 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-950 min-h-[44px] disabled:opacity-50"
          >
            {isPending ? "Ukládám…" : "Uložit rozepsané (koncept)"}
          </button>
          <button
            type="submit"
            disabled={!canWrite || isPending}
            className="rounded-[var(--wp-radius)] bg-[var(--wp-accent)] px-4 py-2.5 text-sm font-semibold text-white min-h-[44px] disabled:opacity-50"
          >
            {isPending ? "Ukládám…" : "Dokončit a vyhodnotit pravidla"}
          </button>
          {loadedDraft?.contactId ?? prefill.contactId ? (
            <Link
              href={`/portal/contacts/${loadedDraft?.contactId ?? prefill.contactId}`}
              className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-4 py-2.5 text-sm font-semibold min-h-[44px] inline-flex items-center"
            >
              Zrušit
            </Link>
          ) : (
            <Link
              href="/portal/today"
              className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-4 py-2.5 text-sm font-semibold min-h-[44px] inline-flex items-center"
            >
              Zrušit
            </Link>
          )}
        </div>
      </form>
    </div>
  );
}

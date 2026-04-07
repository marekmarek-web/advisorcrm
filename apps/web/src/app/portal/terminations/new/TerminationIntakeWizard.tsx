"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { segmentLabel } from "@/app/lib/segment-labels";
import {
  createTerminationDraft,
  listTerminationReasonsAction,
  type CreateTerminationDraftPayload,
  type TerminationWizardPrefill,
} from "@/app/actions/terminations";
import type { TerminationMode, TerminationReasonCode, TerminationRequestSource } from "db";
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
}: Props) {

  const [insurerName, setInsurerName] = useState(prefill.insurerName);
  const [uncertainInsurer, setUncertainInsurer] = useState(false);
  const [contractNumber, setContractNumber] = useState(prefill.contractNumber ?? "");
  const [productSegment, setProductSegment] = useState(
    prefill.productSegment ?? segments[0] ?? "ZP"
  );
  const [contractStartDate, setContractStartDate] = useState(prefill.contractStartDate ?? "");
  const [contractAnniversaryDate, setContractAnniversaryDate] = useState(
    prefill.contractAnniversaryDate ?? ""
  );
  const [requestedEffectiveDate, setRequestedEffectiveDate] = useState("");
  const [reasons, setReasons] = useState<WizardReasonOption[]>(initialReasons);
  const [terminationReasonCode, setTerminationReasonCode] = useState<TerminationReasonCode>(
    (initialReasons[0]?.reasonCode as TerminationReasonCode) ?? "end_of_period_6_weeks"
  );
  const [terminationMode, setTerminationMode] = useState<TerminationMode>("end_of_insurance_period");
  const [policyholderKind, setPolicyholderKind] = useState<TerminationPolicyholderKind>("person");
  const [companyName, setCompanyName] = useState("");
  const [authorizedPersonName, setAuthorizedPersonName] = useState("");
  const [authorizedPersonRole, setAuthorizedPersonRole] = useState("");
  const [advisorNoteForReview, setAdvisorNoteForReview] = useState("");
  const [claimEventDate, setClaimEventDate] = useState("");
  const [placeOverride, setPlaceOverride] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    requestId: string;
    rules: TerminationRulesResult;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const sourceKind: TerminationRequestSource = useMemo(() => {
    if (prefill.mode === "crm") return "crm_contract";
    if (sourceQuick) return "quick_action";
    return "manual_intake";
  }, [prefill.mode, sourceQuick]);

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

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canWrite) {
      setError("Nemáte oprávnění vytvořit žádost.");
      return;
    }
    const payload: CreateTerminationDraftPayload = {
      sourceKind,
      contactId: prefill.contactId,
      contractId: prefill.contractId,
      sourceDocumentId: null,
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

    startTransition(async () => {
      const res = await createTerminationDraft(payload);
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
      </div>

      {!canWrite ? (
        <p className="rounded-[var(--wp-radius)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Nemáte oprávnění vytvářet žádosti (potřebná role s úpravou kontaktů).
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1">
            Pojišťovna (název)
          </label>
          <input
            value={insurerName}
            onChange={(e) => setInsurerName(e.target.value)}
            required
            className="w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2 text-sm min-h-[44px]"
            placeholder="např. Kooperativa"
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

        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="submit"
            disabled={!canWrite || isPending}
            className="rounded-[var(--wp-radius)] bg-[var(--wp-accent)] px-4 py-2.5 text-sm font-semibold text-white min-h-[44px] disabled:opacity-50"
          >
            {isPending ? "Ukládám…" : "Vytvořit draft a vyhodnotit pravidla"}
          </button>
          {prefill.contactId ? (
            <Link
              href={`/portal/contacts/${prefill.contactId}`}
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

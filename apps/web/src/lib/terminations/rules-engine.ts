import "server-only";
import { findInsurerByName, findReasonByCode } from "./catalog";
import type {
  TerminationRulesInput,
  TerminationRulesResult,
  TerminationRulesOutcome,
  TerminationAttachmentRequirement,
  TerminationMissingField,
  TerminationDeliveryChannel,
} from "./types";

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

/**
 * Přičte `weeks` týdnů k datu.
 */
function addWeeks(d: Date, weeks: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + weeks * 7);
  return r;
}

/**
 * Přičte `months` měsíce k datu.
 */
function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
  return r;
}

/**
 * Vrátí nejbližší výroční datum po `cutoff` datu.
 * Výroční datum má stejný měsíc+den jako `anniversary`.
 */
function nextAnniversaryAfter(anniversary: Date, cutoff: Date): Date {
  const candidate = new Date(anniversary);
  candidate.setFullYear(cutoff.getFullYear());
  if (candidate <= cutoff) {
    candidate.setFullYear(cutoff.getFullYear() + 1);
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// Date computation per katalog
// ---------------------------------------------------------------------------

interface DateComputeInput {
  computation: string;
  contractStartDate: string | null;
  contractAnniversaryDate: string | null;
  requestedEffectiveDate: string | null;
  today: Date;
}

interface DateComputeResult {
  computedDate: string | null;
  error: string | null;
}

function computeEffectiveDate(input: DateComputeInput): DateComputeResult {
  const { computation, today } = input;

  switch (computation) {
    case "end_of_period_notice_6w": {
      const anniversary = parseDate(input.contractAnniversaryDate);
      if (!anniversary) {
        return { computedDate: null, error: "Chybí datum výročí smlouvy." };
      }
      // Výpověď musí dojít 6 týdnů před výročím → nejbližší výroční den, pro který lhůta ještě platí.
      const noticeCutoff = addWeeks(today, 6);
      const candidate = nextAnniversaryAfter(anniversary, noticeCutoff);
      return { computedDate: toISODate(candidate), error: null };
    }

    case "fixed_user_date": {
      const requested = parseDate(input.requestedEffectiveDate);
      if (!requested) {
        return { computedDate: null, error: "Požadované datum účinnosti musí být zadáno." };
      }
      if (requested <= today) {
        return {
          computedDate: null,
          error: "Požadované datum musí být v budoucnosti.",
        };
      }
      return { computedDate: toISODate(requested), error: null };
    }

    case "two_months_from_inception": {
      const start = parseDate(input.contractStartDate);
      if (!start) {
        return { computedDate: null, error: "Chybí datum počátku smlouvy." };
      }
      const deadline = addMonths(start, 2);
      if (today > deadline) {
        return {
          computedDate: null,
          error: `Lhůta pro výpověď do 2 měsíců od sjednání uplynula (limit byl ${toISODate(deadline)}).`,
        };
      }
      // Datum účinnosti = den doručení (= today nebo requested, musí být před deadline)
      const effectiveDate = input.requestedEffectiveDate
        ? parseDate(input.requestedEffectiveDate)
        : today;
      if (!effectiveDate || effectiveDate > deadline) {
        return {
          computedDate: toISODate(deadline),
          error: null,
        };
      }
      return { computedDate: toISODate(effectiveDate), error: null };
    }

    case "after_claim_manual": {
      // Datum musí zadat poradce; systém nemůže automaticky určit datum pojistné události.
      const requested = parseDate(input.requestedEffectiveDate);
      if (!requested) {
        return { computedDate: null, error: "Zadejte požadované datum účinnosti výpovědi po pojistné události." };
      }
      return { computedDate: toISODate(requested), error: null };
    }

    case "distance_withdrawal_legal": {
      const start = parseDate(input.contractStartDate);
      if (!start) {
        return { computedDate: null, error: "Chybí datum uzavření smlouvy pro ověření lhůty odstoupení." };
      }
      // Konzervativně 14 dní (kratší z možných lhůt); ops review ověří správný typ.
      const deadline = addWeeks(start, 2);
      if (today > deadline) {
        return {
          computedDate: null,
          error: `Standardní lhůta 14 dní pro odstoupení od distanční smlouvy pravděpodobně uplynula (${toISODate(deadline)}). Případ jde do review.`,
        };
      }
      return { computedDate: toISODate(today), error: null };
    }

    case "mutual_agreement_date": {
      const requested = parseDate(input.requestedEffectiveDate);
      if (!requested) {
        return { computedDate: null, error: "Zadejte navrhované datum ukončení dohodou." };
      }
      return { computedDate: toISODate(requested), error: null };
    }

    case "manual_always":
    default:
      return { computedDate: null, error: null };
  }
}

// ---------------------------------------------------------------------------
// Rules engine
// ---------------------------------------------------------------------------

/**
 * Hlavní entry point fáze 3.
 *
 * Vstup: TerminationRulesInput (CRM nebo manuální intake).
 * Výstup: TerminationRulesResult – deterministický typed result.
 *
 * NIKDY neodhaduje právní závěry – pouze aplikuje pravidla z katalogu
 * a předává do review vše, co není 100% jednoznačné.
 */
export async function evaluateTerminationRules(
  tenantId: string,
  input: TerminationRulesInput
): Promise<TerminationRulesResult> {
  const debug: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const missingFields: TerminationMissingField[] = [];
  const attachments: TerminationAttachmentRequirement[] = [];
  let outcome: TerminationRulesOutcome = "ready";
  let reviewReason: string | null = null;

  // --- 1. Insurer registry lookup ---
  const insurer = await findInsurerByName(tenantId, input.insurerName);
  debug.push(insurer ? `Insurer matched: ${insurer.catalogKey}` : `Insurer not found: ${input.insurerName}`);

  const freeformLetterAllowed = insurer?.freeformLetterAllowed ?? true;
  const requiresOfficialForm = insurer?.requiresOfficialForm ?? false;
  const allowedChannels = insurer?.allowedChannels ?? [];
  const insurerVerificationNeeded = insurer?.registryNeedsVerification ?? true;

  // Pokud pojistitel není v registru nebo potřebuje ověření → review
  if (!insurer) {
    outcome = "review_required";
    reviewReason = "Pojistitel nebyl nalezen v registru. Adresa a pravidla musí být ověřena ručně.";
  } else if (insurerVerificationNeeded) {
    outcome = "review_required";
    reviewReason = "Záznamy pojišťovny v registru ještě nebyly ověřeny. Případ jde do review.";
  }

  // --- 2. Reason catalog lookup ---
  const reason = await findReasonByCode(tenantId, input.terminationReasonCode);
  debug.push(reason ? `Reason matched: ${reason.reasonCode}` : `Reason not found: ${input.terminationReasonCode}`);

  if (!reason) {
    return {
      outcome: "hard_fail",
      computedEffectiveDate: null,
      freeformLetterAllowed,
      requiresOfficialForm,
      requiredAttachments: [],
      defaultDeliveryChannel: "not_yet_set",
      insurerRegistryId: insurer?.id ?? null,
      insurerRegistryNeedsVerification: insurerVerificationNeeded,
      reasonCatalogId: null,
      missingFields: [{ field: "terminationReasonCode", labelCs: "Kód důvodu výpovědi není platný." }],
      reviewRequiredReason: `Neznámý kód důvodu výpovědi: ${input.terminationReasonCode}`,
      confidence: 0,
      _debug: debug,
    };
  }

  // Pokud katalog říká alwaysReview
  if (reason.alwaysReview && outcome !== "review_required") {
    outcome = "review_required";
    reviewReason = `Důvod výpovědi „${reason.labelCs}" vždy vyžaduje ruční posouzení.`;
  }

  // Přílohové požadavky z katalogu
  if (reason.attachmentRequired) {
    attachments.push({
      requirementCode: `catalog_${reason.reasonCode}`,
      label: `Příloha požadovaná pro důvod: ${reason.labelCs}`,
      required: true,
    });
  }

  // Přílohové požadavky z insurer-specific attachment_rules
  if (insurer) {
    const rules = insurer.attachmentRules;
    for (const [code, meta] of Object.entries(rules)) {
      const m = meta as { required?: boolean; label?: string } | string;
      const required = typeof m === "string" ? m === "required" : (m.required ?? false);
      const label = typeof m === "string" ? code : (m.label ?? code);
      attachments.push({ requirementCode: code, label, required });
    }
  }

  // --- 3. Povinná pole z katalogu (DB snake_case → vstup camelCase) ---
  const catalogFieldToInput: Record<string, keyof TerminationRulesInput> = {
    contract_anniversary_date: "contractAnniversaryDate",
    requested_effective_date: "requestedEffectiveDate",
    contract_start_date: "contractStartDate",
  };
  for (const field of reason.requiredFields) {
    const inputKey = catalogFieldToInput[field];
    const value = inputKey != null ? input[inputKey] : (input as unknown as Record<string, unknown>)[field];
    if (value === null || value === undefined || value === "") {
      const labelMap: Record<string, string> = {
        contract_anniversary_date: "Datum výročí smlouvy",
        requested_effective_date: "Požadované datum účinnosti",
        contract_start_date: "Datum počátku smlouvy",
      };
      missingFields.push({ field, labelCs: labelMap[field] ?? field });
    }
  }

  if (missingFields.length > 0 && outcome === "ready") {
    outcome = "awaiting_data";
  }

  // --- 4. Výpočet data ---
  const { computedDate, error: dateError } = computeEffectiveDate({
    computation: reason.defaultDateComputation,
    contractStartDate: input.contractStartDate,
    contractAnniversaryDate: input.contractAnniversaryDate,
    requestedEffectiveDate: input.requestedEffectiveDate,
    today,
  });

  if (dateError) {
    debug.push(`Date compute error: ${dateError}`);
    if (outcome === "ready" || outcome === "awaiting_data") {
      // Rozlišujeme: uplynulá lhůta = hard_fail, chybějící datum = awaiting_data
      if (dateError.includes("uplynula") || dateError.includes("uplynulo")) {
        outcome = "hard_fail";
        reviewReason = dateError;
      } else {
        outcome = "awaiting_data";
        const alreadyHas = missingFields.some((f) =>
          ["requested_effective_date", "contract_start_date", "contract_anniversary_date"].includes(f.field)
        );
        if (!alreadyHas) {
          missingFields.push({ field: "requested_effective_date", labelCs: dateError });
        }
      }
    }
  }

  // --- 5. Výchozí kanál doručení ---
  const defaultDeliveryChannel: TerminationDeliveryChannel =
    allowedChannels.length > 0
      ? (allowedChannels[0] as TerminationDeliveryChannel)
      : "postal_mail";

  // --- 6. Confidence ---
  let confidence: number | null = null;
  if (outcome === "ready") confidence = insurer && !insurerVerificationNeeded ? 0.9 : 0.6;
  else if (outcome === "review_required") confidence = 0.5;
  else if (outcome === "awaiting_data") confidence = null;
  else confidence = 0;

  return {
    outcome,
    computedEffectiveDate: computedDate,
    freeformLetterAllowed,
    requiresOfficialForm,
    requiredAttachments: attachments,
    defaultDeliveryChannel,
    insurerRegistryId: insurer?.id ?? null,
    insurerRegistryNeedsVerification: insurerVerificationNeeded,
    reasonCatalogId: reason.id,
    missingFields,
    reviewRequiredReason: reviewReason,
    confidence,
    _debug: debug,
  };
}

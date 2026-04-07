import { segmentLabel } from "@/app/lib/segment-labels";
import type { TerminationMode } from "./types";
import type { TerminationDocumentBuilderExtras } from "./termination-document-extras";
import { plainTextToLetterHtml } from "./termination-letter-html";
import {
  TERMINATION_DOCUMENT_TYPE,
  type TerminationLetterBuildResult,
  type TerminationLetterDeliveryChannel,
  type TerminationLetterPreviewBadge,
  type TerminationLetterPublishState,
  type TerminationLetterViewModel,
  type TerminationOfficialFormOutput,
} from "./termination-letter-types";

export type TerminationRequestRowLike = {
  insurerName: string;
  contractNumber: string | null;
  productSegment: string | null;
  terminationMode: string;
  terminationReasonCode: string;
  requestedEffectiveDate: string | null;
  computedEffectiveDate: string | null;
  contractStartDate: string | null;
  contractAnniversaryDate: string | null;
  deliveryChannel: string;
  freeformLetterAllowed: boolean | null;
  requiresInsurerForm: boolean | null;
  reviewRequiredReason: string | null;
  status: string;
  deliveryAddressSnapshot: Record<string, unknown> | null;
};

export type ContactRowLike = {
  firstName: string;
  lastName: string;
  title: string | null;
  birthDate: string | null;
  personalId: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  email: string | null;
  phone: string | null;
};

export type ContractRowLike = {
  productName: string | null;
  partnerName: string | null;
};

export type InsurerRegistryRowLike = {
  insurerName: string;
  officialFormName: string | null;
  officialFormNotes: string | null;
  mailingAddress: Record<string, unknown> | null;
};

export type TerminationLetterBuildInput = {
  request: TerminationRequestRowLike;
  contact: ContactRowLike | null;
  contract: ContractRowLike | null;
  insurerRegistry: InsurerRegistryRowLike | null;
  reasonLabel: string;
  attachmentLabels: string[];
  /** Město v záhlaví dopisu; lze doplnit z nastavení tenanta v další iteraci. */
  place?: string;
  advisorNoteForReview?: string | null;
  customReasonText?: string | null;
  claimEventDate?: string | null;
  /** Uložená pole z `termination_requests.document_builder_extras`. */
  documentBuilderExtras?: TerminationDocumentBuilderExtras | null;
};

export function mapDbDeliveryToLetterChannel(db: string): TerminationLetterDeliveryChannel {
  switch (db) {
    case "postal_mail":
      return "post";
    case "email":
      return "email";
    case "data_box":
      return "databox";
    case "insurer_portal":
      return "portal";
    case "in_person":
      return "post";
    case "not_yet_set":
    case "other":
    default:
      return "post";
  }
}

export function terminationModeToLabels(mode: string): { title: string; lower: string } {
  const m = mode as TerminationMode;
  const table: Record<string, { title: string; lower: string }> = {
    end_of_insurance_period: {
      title: "Ke konci pojistného období / výročnímu dni",
      lower: "ke konci pojistného období k uvedenému datu účinnosti",
    },
    fixed_calendar_date: {
      title: "K určitému datu",
      lower: "k uvedenému datu účinnosti",
    },
    within_two_months_from_inception: {
      title: "Do 2 měsíců od sjednání",
      lower: "v zákonné lhůtě do dvou měsíců od sjednání smlouvy",
    },
    after_claim: {
      title: "Po pojistné události",
      lower: "po pojistné události k uvedenému datu účinnosti",
    },
    distance_withdrawal: {
      title: "Odstoupení od smlouvy uzavřené na dálku",
      lower: "odstoupením od smlouvy uzavřené na dálku",
    },
    mutual_agreement: {
      title: "Dohodou",
      lower: "na základě vzájemné dohody k uvedenému datu",
    },
    manual_review_other: {
      title: "Jiný důvod / ruční posouzení",
      lower: "z důvodu uvedeného v této žádosti",
    },
  };
  return (
    table[m] ?? {
      title: mode,
      lower: "v souladu s touto žádostí",
    }
  );
}

export function legalBasisShortForReason(code: string): string | null {
  const map: Record<string, string> = {
    end_of_period_6_weeks: "Výpověď k pojistnému období (typicky k výročnímu dni / sjednané lhůtě).",
    fixed_date_if_contractually_allowed: "Ukončení ke sjednanému datu – ověřit podmínky ve smlouvě.",
    within_2_months_from_inception: "Ukončení ve lhůtě do 2 měsíců od vzniku pojištění.",
    after_claim_event: "Výpověď po pojistné události – ověřit lhůty a dokumentaci.",
    distance_contract_withdrawal: "Odstoupení od smlouvy uzavřené distančním způsobem.",
    mutual_agreement: "Ukončení na základě dohody stran.",
    special_reason_manual_review: "Individuální právní posouzení nutné.",
  };
  return map[code] ?? null;
}

function formatDateCs(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" });
}

function parseMailing(
  raw: Record<string, unknown> | null,
  fallbackInsurerName: string
): {
  department: string | null;
  line1: string;
  line2: string;
  line3: string;
} {
  if (!raw || typeof raw !== "object") {
    return {
      department: null,
      line1: fallbackInsurerName,
      line2: "",
      line3: "",
    };
  }
  const name = typeof raw.name === "string" ? raw.name : fallbackInsurerName;
  const street = typeof raw.street === "string" ? raw.street : "";
  const city = typeof raw.city === "string" ? raw.city : "";
  const zip = typeof raw.zip === "string" ? raw.zip : "";
  const country = typeof raw.country === "string" ? raw.country : "";
  const department = typeof raw.department === "string" ? raw.department : null;
  const line2 = street;
  const line3 = [zip, city, country].filter(Boolean).join(", ");
  return { department, line1: name, line2, line3 };
}

function effectiveDateConfirmed(input: TerminationLetterBuildInput): string | null {
  const r = input.request;
  if (r.computedEffectiveDate) return r.computedEffectiveDate;
  const readyish = new Set([
    "ready_to_generate",
    "document_draft",
    "final_review",
    "dispatch_pending",
    "dispatched",
    "completed",
  ]);
  if (r.requestedEffectiveDate && readyish.has(r.status) && !r.reviewRequiredReason) {
    return r.requestedEffectiveDate;
  }
  return null;
}

function buildAttachmentsSummary(labels: string[]): { list: string[]; summaryText: string } {
  if (labels.length === 0) {
    return {
      list: [],
      summaryText: "",
    };
  }
  return {
    list: labels,
    summaryText: labels.join(", "),
  };
}

function buildMainBodyIntro(vm: TerminationLetterViewModel): string {
  const effDisplay = formatDateCs(vm.computedEffectiveDate ?? vm.requestedEffectiveDate);
  if (vm.policyholderKind === "company") {
    const cn = (vm.policyholderCompanyName ?? vm.policyholderName).trim() || "………………";
    const ap = vm.policyholderAuthorizedPersonName?.trim();
    const role = vm.policyholderAuthorizedPersonRole?.trim();
    const rep = ap ? `${ap}${role ? `, ${role}` : ""}` : "oprávněný zástupce";
    return `Společnost ${cn}, zastoupená ${rep}, tímto jako pojistník žádá o ukončení / výpověď pojistné smlouvy č. ${vm.contractNumber}, vedené u Vaší společnosti na jméno uvedené společnosti.\n\nPožadujeme, aby ukončení této smlouvy nastalo ${vm.terminationModeLabelLower}, a to ke dni ${effDisplay}.`;
  }
  const titleBefore = vm.policyholderTitleBefore ? `${vm.policyholderTitleBefore} ` : "";
  const phName = `${titleBefore}${vm.policyholderName}`.trim();
  return `jako pojistník tímto žádám o ukončení / výpověď pojistné smlouvy č. ${vm.contractNumber}, vedené u Vaší společnosti na jméno ${phName}.\n\nPožaduji, aby ukončení této smlouvy nastalo ${vm.terminationModeLabelLower}, a to ke dni ${effDisplay}.`;
}

function buildLetterSignatureBlock(vm: TerminationLetterViewModel): string {
  const emailLine = vm.policyholderEmail ? `E-mail: ${vm.policyholderEmail}` : "";
  const phoneLine = vm.policyholderPhone ? `Telefon: ${vm.policyholderPhone}` : "";
  if (vm.policyholderKind === "company") {
    const cn = (vm.policyholderCompanyName ?? vm.policyholderName).trim();
    const lines = [
      vm.policyholderAuthorizedPersonName?.trim(),
      vm.policyholderAuthorizedPersonRole?.trim(),
      cn || undefined,
      vm.policyholderAddressLine1,
      vm.policyholderAddressLine2,
      emailLine,
      phoneLine,
    ].filter((x) => x && String(x).trim());
    return `S pozdravem\n\n${lines.join("\n")}\n\n---\nPodpis oprávněné osoby / razítko společnosti\n---`;
  }
  const titleBefore = vm.policyholderTitleBefore ? `${vm.policyholderTitleBefore} ` : "";
  const phName = `${titleBefore}${vm.policyholderName}`.trim();
  return `S pozdravem\n\n${phName}\n${vm.policyholderAddressLine1}\n${vm.policyholderAddressLine2}\n${emailLine}\n${phoneLine}\n\n---\nPodpis pojistníka\n---`;
}

function buildDistanceWithdrawalBody(vm: TerminationLetterViewModel): string {
  if (vm.policyholderKind === "company") {
    const cn = (vm.policyholderCompanyName ?? vm.policyholderName).trim() || "………………";
    const ap = vm.policyholderAuthorizedPersonName?.trim();
    const role = vm.policyholderAuthorizedPersonRole?.trim();
    const rep = ap ? `${ap}${role ? `, ${role}` : ""}` : "oprávněný zástupce";
    return `Společnost ${cn}, zastoupená ${rep}, tímto odstupuje od pojistné smlouvy č. ${vm.contractNumber}, uzavřené na dálku, a žádá o její ukončení v souladu s příslušnými podmínkami a právní úpravou.\n\nŽádáme o potvrzení přijetí tohoto odstoupení a informaci o dalším postupu.`;
  }
  const titleBefore = vm.policyholderTitleBefore ? `${vm.policyholderTitleBefore} ` : "";
  const phName = `${titleBefore}${vm.policyholderName}`.trim();
  return `jako pojistník tímto odstupuji od pojistné smlouvy č. ${vm.contractNumber}, uzavřené na dálku, a žádám o její ukončení v souladu s příslušnými podmínkami a právní úpravou.\n\nŽádám o potvrzení přijetí tohoto odstoupení a informaci o dalším postupu.`;
}

function buildReasonParagraph(vm: TerminationLetterViewModel, hasConfirmedEffectiveDate: boolean): string {
  const eff = formatDateCs(vm.computedEffectiveDate ?? vm.requestedEffectiveDate);
  const code = vm.terminationReasonCode;

  switch (code) {
    case "end_of_period_6_weeks":
      return `Tímto podávám výpověď výše uvedené pojistné smlouvy ke konci pojistného období, resp. k nejbližšímu možnému datu účinnosti podle smluvních a zákonných podmínek, které v tomto případě připadá na den ${eff}.`;
    case "fixed_date_if_contractually_allowed":
      if (!hasConfirmedEffectiveDate) {
        return `Tímto žádám o ukončení výše uvedené pojistné smlouvy ke dni ${eff}. Uvedené datum je předběžné a musí být ověřeno vůči textu pojistné smlouvy a pravidlům pojišťovny; pokud ke dni ${eff} ukončení přípustné není, žádám o sdělení nejbližšího možného data účinnosti v souladu se smlouvou a zákonem.`;
      }
      return `Tímto žádám o ukončení výše uvedené pojistné smlouvy ke dni ${eff}, pokud je tento způsob ukončení podle smluvních a zákonných podmínek přípustný.`;
    case "within_2_months_from_inception":
      return `Tímto podávám výpověď pojistné smlouvy ve lhůtě umožňující ukončení smlouvy do 2 měsíců od jejího sjednání, s účinností ke dni ${eff}.`;
    case "after_claim_event": {
      const claim = vm.claimEventDate ? formatDateCs(vm.claimEventDate) : null;
      const base = `Tímto podávám výpověď pojistné smlouvy po oznámení pojistné události. Žádám o ukončení smlouvy ke dni ${eff}.`;
      if (claim) {
        return `${base}\n\nPojistná událost / oznámení souvisí s datem ${claim}.`;
      }
      return base;
    }
    case "distance_contract_withdrawal":
      return "";
    case "mutual_agreement":
      return `Tímto žádám o ukončení smlouvy na základě vzájemné dohody stran ke dni ${eff}.`;
    default:
      if (vm.customReasonText?.trim()) {
        return vm.customReasonText.trim();
      }
      return `Tímto žádám o ukončení výše uvedené pojistné smlouvy ke dni ${eff}, a to z důvodu: ${vm.terminationReasonLabel}.`;
  }
}

function buildAttachmentsParagraph(vm: TerminationLetterViewModel): string {
  if (vm.attachments.length === 0) {
    return "K této žádosti nepřikládám žádné další přílohy, neboť nejsou pro tento typ ukončení vyžadovány.";
  }
  return `Přílohou této žádosti zasílám následující dokumenty: ${vm.attachmentsSummaryText}.`;
}

export function renderTerminationLetterPlainText(
  vm: TerminationLetterViewModel,
  hasConfirmedEffectiveDate: boolean
): string {
  if (vm.distanceContractWithdrawal || vm.terminationReasonCode === "distance_contract_withdrawal") {
    return renderDistanceWithdrawalLetter(vm);
  }

  const placeDate = `${vm.place}, dne ${vm.generatedAt}`;
  const addrInsurer = [vm.insurerName, vm.insurerDepartment, vm.insurerAddressLine1, vm.insurerAddressLine2, vm.insurerAddressLine3]
    .filter((x) => x && String(x).trim())
    .join("\n");

  const reasonParagraph = buildReasonParagraph(vm, hasConfirmedEffectiveDate);
  const att = buildAttachmentsParagraph(vm);
  const intro = buildMainBodyIntro(vm);
  const sign = buildLetterSignatureBlock(vm);

  return `${placeDate}

${addrInsurer}

Věc: Výpověď pojistné smlouvy č. ${vm.contractNumber}

Vážení,

${intro}

${reasonParagraph}

Žádám Vás o zpracování této žádosti a o potvrzení ukončení smlouvy.

${att}

${sign}
`;
}

function renderDistanceWithdrawalLetter(vm: TerminationLetterViewModel): string {
  const placeDate = `${vm.place}, dne ${vm.generatedAt}`;
  const body = buildDistanceWithdrawalBody(vm);
  const sign = buildLetterSignatureBlock(vm);
  return `${placeDate}

Věc: Odstoupení od pojistné smlouvy č. ${vm.contractNumber}

Vážení,

${body}

${sign}
`;
}

function buildCoveringLetter(vm: TerminationLetterViewModel): string {
  const placeDate = `${vm.place}, dne ${vm.generatedAt}`;
  const addrInsurer = [vm.insurerName, vm.insurerDepartment, vm.insurerAddressLine1, vm.insurerAddressLine2, vm.insurerAddressLine3]
    .filter((x) => x && String(x).trim())
    .join("\n");
  const intro =
    vm.policyholderKind === "company"
      ? `Společnost ${(vm.policyholderCompanyName ?? vm.policyholderName).trim() || "………………"} zasílá v příloze vyplněný formulář k žádosti o ukončení pojistné smlouvy č. ${vm.contractNumber}.`
      : `V příloze zasílám vyplněný formulář Vaší společnosti k žádosti o ukončení pojistné smlouvy č. ${vm.contractNumber}.`;
  const formLine = `Použitý formulář: ${vm.officialFormName ?? "dle pokynů pojišťovny"}.`;
  const sign = buildLetterSignatureBlock(vm);
  const closingAsk = vm.policyholderKind === "company" ? "Žádáme" : "Žádám";
  return `${placeDate}

${addrInsurer}

Věc: Průvodní dopis – ukončení smlouvy ${vm.contractNumber}

Vážení,

${intro}

${formLine}

${closingAsk} o potvrzení přijetí a zpracování.

${sign}`;
}

function buildOfficialFormOutput(vm: TerminationLetterViewModel): TerminationOfficialFormOutput {
  const ch = vm.deliveryChannel;
  const channelLabel =
    ch === "email"
      ? "e-mail"
      : ch === "databox"
        ? "datová schránka"
        : ch === "portal"
          ? "portál pojišťovny"
          : ch === "form"
            ? "oficiální formulář"
            : "poštou / písemně";

  const addr = [vm.insurerAddressLine1, vm.insurerAddressLine2, vm.insurerAddressLine3]
    .filter((x) => x?.trim())
    .join(", ");

  return {
    title: "Pro tuto pojišťovnu je vyžadován oficiální formulář",
    body: `Pro ukončení smlouvy č. ${vm.contractNumber} u pojišťovny ${vm.insurerName} nelze použít standardní volný dopis jako finální odesílaný dokument.\n\nPoužijte oficiální formulář: ${vm.officialFormName ?? "formulář dle pokynů pojišťovny"}.`,
    instructionLines: [
      `Kanál podání: ${channelLabel}`,
      vm.officialFormNotes ? `Poznámka: ${vm.officialFormNotes}` : "",
      addr ? `Adresa / cíl: ${addr}` : "",
    ].filter(Boolean),
    ctaHints: [
      "Otevřít formulář",
      "Stáhnout formulář",
      "Vytvořit průvodní list",
      "Označit jako čeká na podpis",
      "Přesunout do review",
    ],
  };
}

function resolveBadgeAndPublish(
  vm: TerminationLetterViewModel,
  request: TerminationRequestRowLike,
  internalWarnings: string[],
  effectiveConfirmed: string | null
): {
  badge: TerminationLetterPreviewBadge;
  publishState: TerminationLetterPublishState;
  validityReasons: string[];
} {
  const reasons: string[] = [...internalWarnings];

  if (vm.requiresOfficialForm) {
    return {
      badge: "official_form",
      publishState: "draft_only",
      validityReasons: reasons,
    };
  }

  if (request.status === "awaiting_review" || request.reviewRequiredReason) {
    return {
      badge: "review_required",
      publishState: "review_required",
      validityReasons: reasons,
    };
  }

  if (!vm.freeformLetterAllowed) {
    reasons.push("Registr neumožňuje volný dopis bez ověření.");
    return {
      badge: "review_required",
      publishState: "review_required",
      validityReasons: reasons,
    };
  }

  if (request.status === "failed" || request.status === "awaiting_data") {
    return {
      badge: "review_required",
      publishState: "draft_only",
      validityReasons: reasons,
    };
  }

  if (!vm.policyholderName.trim()) reasons.push("Chybí jméno pojistníka.");
  if (!vm.insurerName.trim()) reasons.push("Chybí pojišťovna.");
  if (!(request.contractNumber ?? "").trim()) reasons.push("Chybí číslo smlouvy.");
  if (!effectiveConfirmed) reasons.push("Chybí potvrzené datum účinnosti.");
  const hasDest =
    (vm.insurerAddressLine1 + vm.insurerAddressLine2 + vm.insurerAddressLine3).trim().length > 0;
  if (!hasDest) {
    reasons.push("Chybí cíl doručení (adresa pojišťovny) nebo formulářový režim.");
  }

  if (reasons.length > 0) {
    return {
      badge: "review_required",
      publishState: "draft_only",
      validityReasons: reasons,
    };
  }

  return {
    badge: "free_form",
    publishState: "ready_to_send",
    validityReasons: [],
  };
}

export function buildTerminationLetterResult(input: TerminationLetterBuildInput): TerminationLetterBuildResult {
  const r = input.request;
  const c = input.contact;
  const ct = input.contract;
  const ir = input.insurerRegistry;

  const extras = input.documentBuilderExtras ?? {};
  const contactDisplayName = c ? `${c.firstName} ${c.lastName}`.trim() : "";
  const policyholderAddressLine1 = c?.street?.trim() ?? "";
  const policyholderAddressLine2 = [c?.zip, c?.city].filter(Boolean).join(" ").trim();

  const kind = extras.policyholderKind === "company" ? "company" : "person";
  const companyNameRaw = extras.companyName?.trim() ?? "";
  const policyholderName =
    kind === "company" ? companyNameRaw || contactDisplayName : contactDisplayName;
  const policyholderCompanyName = kind === "company" ? companyNameRaw || null : null;
  const policyholderAuthorizedPersonName =
    kind === "company" ? extras.authorizedPersonName?.trim() || null : null;
  const policyholderAuthorizedPersonRole =
    kind === "company" ? extras.authorizedPersonRole?.trim() || null : null;

  const advisorNoteForReview =
    input.advisorNoteForReview?.trim() || extras.advisorNoteForReview?.trim() || null;
  const claimEventDate =
    input.claimEventDate?.trim() || extras.claimEventDate?.trim() || null;
  const placeHeader = input.place?.trim() || extras.placeOverride?.trim() || "………………";

  const mailing = parseMailing(
    (r.deliveryAddressSnapshot as Record<string, unknown> | null) ??
      ir?.mailingAddress ??
      null,
    r.insurerName
  );

  const officialFormName = ir?.officialFormName ?? null;
  const officialFormNotes = ir?.officialFormNotes ?? null;
  const requiresOfficialForm = r.requiresInsurerForm === true;
  const freeform = r.freeformLetterAllowed !== false;

  const { list: attachments, summaryText } = buildAttachmentsSummary(input.attachmentLabels);

  const modeLabels = terminationModeToLabels(r.terminationMode);
  const productName = ct?.productName ?? ct?.partnerName ?? null;
  const segmentLabelText = r.productSegment ? segmentLabel(r.productSegment) : null;

  const internalWarnings: string[] = [];
  if (r.status === "awaiting_review" || r.reviewRequiredReason) {
    internalWarnings.push(r.reviewRequiredReason ?? "Žádost je v režimu kontroly (review).");
  }
  if (r.status === "failed") {
    internalWarnings.push("Žádost je ve stavu selhání – dokument není finální.");
  }
  if (r.status === "awaiting_data") {
    internalWarnings.push("Chybí vstupní data – dokument pouze jako koncept.");
  }
  if (
    r.requestedEffectiveDate &&
    r.computedEffectiveDate &&
    r.requestedEffectiveDate !== r.computedEffectiveDate
  ) {
    internalWarnings.push(
      `Zadané datum účinnosti (${formatDateCs(r.requestedEffectiveDate)}) se liší od data dopočítaného pravidly (${formatDateCs(r.computedEffectiveDate)}). Před odesláním ověřte správné datum.`
    );
  }
  if (kind === "company" && !companyNameRaw) {
    internalWarnings.push("U firemního pojistníka doplňte obchodní firmu.");
  }
  if (kind === "company" && !policyholderAuthorizedPersonName) {
    internalWarnings.push("Pro firemní podpis doplňte jméno oprávněné osoby.");
  }

  const effectiveConfirmed = effectiveDateConfirmed(input);
  const distance =
    r.terminationReasonCode === "distance_contract_withdrawal" || r.terminationMode === "distance_withdrawal";

  const vm: TerminationLetterViewModel = {
    documentType: TERMINATION_DOCUMENT_TYPE,
    terminationModeLabel: modeLabels.title,
    terminationModeLabelLower: modeLabels.lower,
    generatedAt: formatDateCs(new Date().toISOString().slice(0, 10)),
    place: placeHeader,
    signatureRequired: true,

    policyholderKind: kind,
    policyholderName,
    policyholderCompanyName,
    policyholderAuthorizedPersonName,
    policyholderAuthorizedPersonRole,
    policyholderTitleBefore: c?.title ?? null,
    policyholderTitleAfter: null,
    policyholderBirthDate: c?.birthDate ?? null,
    policyholderPersonalId: c?.personalId ?? null,
    policyholderAddressLine1,
    policyholderAddressLine2,
    policyholderEmail: c?.email ?? null,
    policyholderPhone: c?.phone ?? null,

    insurerName: r.insurerName,
    insurerDepartment: mailing.department,
    insurerAddressLine1: mailing.line1,
    insurerAddressLine2: mailing.line2,
    insurerAddressLine3: mailing.line3,
    deliveryChannel: requiresOfficialForm ? "form" : mapDbDeliveryToLetterChannel(r.deliveryChannel),
    requiresOfficialForm,
    officialFormName,
    officialFormNotes,

    contractNumber: (r.contractNumber ?? "").trim() || "—",
    productName,
    productSegment: segmentLabelText,
    contractStartDate: r.contractStartDate,
    contractAnniversaryDate: r.contractAnniversaryDate,

    terminationReasonCode: r.terminationReasonCode,
    terminationReasonLabel: input.reasonLabel,
    requestedEffectiveDate: r.requestedEffectiveDate,
    computedEffectiveDate: r.computedEffectiveDate,
    legalBasisShort: legalBasisShortForReason(r.terminationReasonCode),
    customReasonText: input.customReasonText ?? null,
    claimEventDate,
    distanceContractWithdrawal: distance,

    attachments,
    attachmentsSummaryText: summaryText,
    advisorNoteForReview,
    internalWarnings,

    freeformLetterAllowed: freeform,
  };

  const { badge, publishState, validityReasons } = resolveBadgeAndPublish(
    vm,
    r,
    internalWarnings,
    effectiveConfirmed
  );

  let letterPlainText: string | null = null;
  let officialForm: TerminationOfficialFormOutput | null = null;
  let coveringLetterPlainText: string | null = null;

  if (requiresOfficialForm) {
    officialForm = buildOfficialFormOutput(vm);
    letterPlainText = null;
    coveringLetterPlainText = buildCoveringLetter(vm);
  } else {
    letterPlainText = renderTerminationLetterPlainText(vm, effectiveConfirmed !== null);
  }

  const letterHtml = letterPlainText ? plainTextToLetterHtml(letterPlainText) : null;
  const coveringLetterHtml = coveringLetterPlainText ? plainTextToLetterHtml(coveringLetterPlainText) : null;

  let previewWatermark: string | null = null;
  if (publishState !== "ready_to_send" || badge === "official_form") {
    previewWatermark =
      badge === "official_form"
        ? "Formulářový režim – průvodní dopis slouží k přípravě podání; finální dokument je formulář pojišťovny."
        : "Náhled pro interní použití – před odesláním ověřte údaje, datum účinnosti a podpis.";
  }

  return {
    viewModel: vm,
    badge,
    publishState,
    letterPlainText,
    officialForm,
    coveringLetterPlainText,
    previewWatermark,
    validityReasons,
    letterHtml,
    coveringLetterHtml,
  };
}

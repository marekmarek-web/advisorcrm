import type {
  ExtractionDocument,
  ExtractedGroup,
  ExtractedField,
  AIRecommendation,
  FieldStatus,
  ExtractionDiagnostics,
  ProcessingStatus,
  ReviewStatus,
  ClientMatchCandidate,
  DraftAction,
  AdvisorReviewViewModel,
} from "./types";
import { buildHumanSummary, buildHumanErrorMessage, getDocumentTypeLabel } from "../ai/document-messages";
import type { PrimaryDocumentType } from "../ai/document-review-types";
import type { DocumentReviewEnvelope } from "../ai/document-review-types";
import type { InputMode } from "../ai/input-mode-detection";
import { formatAiClassifierForAdvisor } from "./czech-labels";
import { advisorFieldPresentation, shouldCountFieldForAttentionBanner } from "./advisor-confidence-policy";
import { buildAdvisorReviewViewModel } from "./advisor-review-view-model";

type ApiReviewDetail = Record<string, unknown>;

function humanPrimaryTypeHeading(raw: string): string {
  if (!raw || raw === "Neznámý typ") return raw;
  const phrase = getDocumentTypeLabel(raw as PrimaryDocumentType);
  if (!phrase) return raw.replace(/_/g, " ");
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

const PROCESSING_STAGE_LABELS_CS: Record<string, string> = {
  document_recognized: "Dokument rozpoznán",
  extracting: "Extrahuji klienta a smlouvu",
  matching_client: "Ověřuji platby a páruji klienta",
  finalizing: "Připravuji návrhy akcí",
};

const SECTION_LABELS: Record<string, string> = {
  contract: "Smlouva",
  client: "Klient",
  institution: "Instituce",
  product: "Produkt",
  paymentDetails: "Platby",
  dates: "Datum",
  coverage: "Krytí",
  risks: "Krytá rizika",
  clientProfile: "Klient",
  contractCore: "Smlouva",
  paymentsCore: "Platby",
  insuredRisks: "Rizika a připojištění",
  intermediary: "Zprostředkovatel",
  investments: "Investice",
  beneficiaries: "Oprávněné osoby",
  parties: "Smluvní strany",
  payment: "Platební údaje",
  other: "Ostatní",
};

const SECTION_ICONS: Record<string, string> = {
  client: "User",
  contract: "FileText",
  institution: "Building2",
  product: "FileText",
  paymentDetails: "FileText",
  dates: "FileText",
  coverage: "Shield",
  risks: "Shield",
  clientProfile: "User",
  contractCore: "FileText",
  paymentsCore: "Building2",
  insuredRisks: "Shield",
  intermediary: "Building2",
  investments: "Heart",
  beneficiaries: "User",
  parties: "User",
  other: "Heart",
};

const FIELD_LABELS: Record<string, string> = {
  contractNumber: "Číslo smlouvy",
  contractNumberOrProposalNumber: "Číslo smlouvy / návrhu",
  proposalNumberOrContractNumber: "Číslo návrhu / smlouvy",
  existingPolicyNumber: "Číslo existující pojistky",
  existingPolicyNumberOrReference: "Číslo pojistky / reference",
  businessCaseNumber: "Číslo obch. případu",
  institutionName: "Pojišťovna / instituce",
  insurer: "Pojišťovna",
  lender: "Poskytovatel úvěru",
  provider: "Poskytovatel",
  platform: "Platforma",
  companyName: "Společnost",
  companyNameOrProvider: "Společnost / poskytovatel",
  productName: "Produkt",
  productType: "Typ produktu",
  productArea: "Oblast produktu",
  productSummary: "Shrnutí produktu",
  serviceType: "Typ služby",
  serviceAgreementStatus: "Stav servisní smlouvy",
  offerType: "Typ nabídky",
  packageName: "Balíček",
  documentType: "Typ dokumentu",
  documentStatus: "Stav dokumentu",
  documentSummary: "Shrnutí dokumentu",
  fullName: "Jméno a příjmení",
  clientFullName: "Jméno klienta",
  clientName: "Klient",
  firstName: "Jméno",
  lastName: "Příjmení",
  email: "E-mail",
  clientEmail: "E-mail klienta",
  phone: "Telefon",
  clientPhone: "Telefon klienta",
  birthDate: "Datum narození",
  personalId: "Rodné číslo",
  maskedPersonalId: "Rodné číslo (maskované)",
  companyId: "IČO",
  ico: "IČO",
  dic: "DIČ",
  address: "Adresa",
  permanentAddress: "Trvalé bydliště",
  officeAddress: "Adresa sídla",
  nationality: "Státní příslušnost",
  issuingAuthority: "Vydávající úřad",
  issuedDate: "Datum vydání",
  expiryDate: "Platnost do",
  documentNumber: "Číslo dokladu",
  communicationPreferences: "Komunikační preference",
  onlineAccessServices: "Online služby",
  fatcaStatus: "FATCA status",
  qualifiedInvestorDeclaration: "Prohlášení kvalifikovaného investora",
  declarationType: "Typ prohlášení",
  startDate: "Počátek smlouvy",
  policyStartDate: "Počátek pojištění",
  policyStartIfIllustrated: "Počátek pojištění (ilustrační)",
  policyEndDate: "Konec pojištění",
  endDate: "Konec smlouvy",
  dateSigned: "Datum podpisu",
  signedDate: "Datum podpisu",
  documentDate: "Datum dokumentu",
  issueDate: "Datum vystavení",
  analysisDate: "Datum analýzy",
  questionnaireDate: "Datum dotazníku",
  offerValidDate: "Platnost nabídky do",
  statementPeriodFrom: "Období od",
  statementPeriodTo: "Období do",
  taxPeriodFrom: "Daňové období od",
  taxPeriodTo: "Daňové období do",
  period: "Období",
  periodMonth: "Měsíc",
  periodYear: "Rok",
  taxOrIncomePeriod: "Daňové / příjmové období",
  firstPaymentDate: "Datum první platby",
  lastPaymentDate: "Datum poslední platby",
  premiumAmount: "Pojistné",
  totalMonthlyPremium: "Celkové měsíční pojistné",
  annualPremium: "Roční pojistné",
  riskPremium: "Rizikové pojistné",
  investmentPremium: "Investiční pojistné",
  premiumFrequency: "Frekvence plateb",
  paymentFrequency: "Frekvence plateb",
  paymentType: "Typ platby",
  paymentPurpose: "Účel platby",
  paymentAccounts: "Platební účty",
  paymentAccountNumber: "Číslo účtu pro platbu",
  bankPaymentInfo: "Platební údaje",
  regularAmount: "Pravidelná částka",
  oneOffAmount: "Jednorázová částka",
  regularContribution: "Pravidelný vklad",
  oneOffContribution: "Jednorázový vklad",
  regularExtraContribution: "Mimořádný pravidelný vklad",
  contributionAmount: "Výše vkladu",
  contributionParticipant: "Příspěvek účastníka",
  contributionEmployer: "Příspěvek zaměstnavatele",
  stateContribution: "Státní příspěvek",
  stateContributionEstimate: "Odhad státního příspěvku",
  currency: "Měna",
  deathBenefit: "Pojistná částka na smrt",
  accidentBenefit: "Plnění pro případ úrazu",
  disabilityBenefit: "Plnění pro případ invalidity",
  hospitalizationBenefit: "Plnění za hospitalizaci",
  seriousIllnessBenefit: "Plnění za závažná onemocnění",
  beneficiary: "Obmyšlená osoba",
  beneficiaries: "Oprávněné osoby",
  vinkulace: "Vinkulace",
  coverages: "Sjednaná rizika",
  selectedCoverages: "Zvolená rizika",
  riders: "Připojištění",
  insuredRisks: "Pojištěná rizika",
  includedRiders: "Zahrnutá připojištění",
  changedCoverages: "Změněná rizika",
  removedCoverages: "Zrušená rizika",
  addedCoverages: "Přidaná rizika",
  requestedChanges: "Požadované změny",
  coverageLimit: "Limit pojistného plnění",
  coverageSummary: "Přehled krytí",
  deductible: "Spoluúčast",
  exclusions: "Výluky",
  insuredObject: "Předmět pojištění",
  insuredAddress: "Adresa pojištěného objektu",
  insuredPersons: "Pojištěné osoby",
  insuredPersonName: "Jméno pojištěné osoby",
  policyholder: "Pojistník",
  participantFullName: "Účastník",
  investorFullName: "Investor",
  investorFullNameOrClientName: "Investor / klient",
  employeeFullNameOrOwnerName: "Zaměstnanec / vlastník",
  employeeName: "Jméno zaměstnance",
  ownerName: "Vlastník",
  ownerNameIfPresent: "Vlastník",
  accountOwner: "Majitel účtu",
  policyDuration: "Doba pojištění",
  investmentStrategy: "Investiční strategie",
  investmentFunds: "Fondy",
  fundAllocation: "Alokace fondů",
  investmentAllocation: "Investiční alokace",
  investmentScenario: "Investiční scénář",
  investmentType: "Typ investice",
  investmentHorizon: "Investiční horizont",
  projectedReturn: "Odhadovaný výnos",
  proposedFunds: "Navržené fondy",
  fundName: "Název fondu",
  feeProjection: "Odhad poplatků",
  feeStructure: "Poplatková struktura",
  premiumRange: "Rozmezí pojistného",
  feeProjectionTotal: "Celkové poplatky",
  loanAmount: "Výše úvěru",
  installmentAmount: "Výše splátky",
  interestRate: "Úroková sazba",
  rpsn: "RPSN",
  installmentCount: "Počet splátek",
  totalPayable: "Celkem k úhradě",
  collateral: "Zajištění",
  accountForRepayment: "Účet pro splácení",
  relatedBankAccount: "Navázaný účet",
  bankAccount: "Číslo účtu",
  iban: "IBAN",
  bic: "SWIFT/BIC",
  bankCode: "Kód banky",
  variableSymbol: "Variabilní symbol",
  constantSymbol: "Konstantní symbol",
  specificSymbol: "Specifický symbol",
  minimumInvestment: "Minimální investice",
  separateInstructionsCZK: "Pokyny pro platbu v CZK",
  separateInstructionsEUR: "Pokyny pro platbu v EUR",
  separateInstructionsUSD: "Pokyny pro platbu v USD",
  contractReference: "Reference smlouvy",
  relatedContractNumber: "Související číslo smlouvy",
  proposalNumber: "Číslo návrhu",
  modelationId: "Číslo modelace",
  modelPremium: "Modelované pojistné",
  policyStartIfPresent: "Počátek pojištění",
  riskProfile: "Rizikový profil",
  riskCategory: "Riziková kategorie",
  occupation: "Povolání",
  sports: "Sporty / rizikové aktivity",
  healthQuestionnairePresent: "Zdravotní dotazník přiložen",
  medicalConsentPresent: "Souhlas se zdravotními údaji",
  paymentProtectionProvider: "Poskytovatel pojištění schopnosti splácet",
  monthlyInsuranceCharge: "Měsíční pojistné za pojištění schopnosti splácet",
  insuranceStart: "Počátek pojištění",
  insuranceEnd: "Konec pojištění",
  claimsConditions: "Podmínky plnění",
  surrenderValue: "Odkupná hodnota",
  taxMode: "Daňový režim",
  taxOptimization: "Daňová optimalizace",
  taxBaseSignals: "Ukazatele daňového základu",
  employerName: "Zaměstnavatel",
  employerStampPresent: "Razítko zaměstnavatele",
  employeeFullName: "Jméno zaměstnance",
  netWage: "Čistá mzda",
  grossWage: "Hrubá mzda",
  deductions: "Srážky",
  wageDeductionsDetail: "Detail srážek",
  bonuses: "Bonusy",
  holidayCompensation: "Náhrady dovolené",
  averageNetIncomeLast3Months: "Průměrný čistý příjem za 3 měsíce",
  averageNetIncomeLast12Months: "Průměrný čistý příjem za 12 měsíců",
  incomeSummary: "Shrnutí příjmů",
  incomeSource: "Zdroj příjmů",
  netIncomeSummary: "Čistý příjem",
  expenseSummary: "Výdaje",
  totalIncome: "Celkové příjmy",
  totalExpenses: "Celkové výdaje",
  existingProducts: "Stávající produkty",
  recommendations: "Doporučení",
  mainBusinessActivity: "Hlavní činnost",
  resultOfOperations: "Výsledek hospodaření",
  paymentToAccountMasked: "Účet pro výplatu (maskovaný)",
  openingBalance: "Počáteční zůstatek",
  closingBalance: "Koncový zůstatek",
  transactionsSummary: "Shrnutí transakcí",
  recurringPayments: "Pravidelné platby",
  detectedLoanPayments: "Rozpoznané splátky úvěrů",
  scheduleRows: "Splátkový kalendář",
  totalPayments: "Celkem plateb",
  advisorName: "Zprostředkovatel",
  brokerName: "Makléř",
  intermediaryName: "Zprostředkovatel",
  intermediaryCode: "Kód zprostředkovatele",
  intermediaryCompany: "Společnost zprostředkovatele",
  requestedDocuments: "Požadované dokumenty",
  requiredDocuments: "Požadované dokumenty",
  serviceNotes: "Servisní poznámky",
  partnerCompany: "Partnerská společnost",
  houseHoldMembers: "Členové domácnosti",
  householdMembers: "Členové domácnosti",
  coinsured: "Spolupojištěné osoby",
  communicationChannel: "Komunikační kanál",
  advisorFiledFlag: "Podáno poradcem",
  signedOrunsigned: "Podepsáno",
  loanLinkedCoverageFlag: "Napojení na úvěr",
  primaryParties: "Hlavní strany dokumentu",
  financialTerms: "Finanční údaje",
};

const FIELD_GROUP_MAP: Record<string, string> = {
  fullName: "clientProfile",
  clientFullName: "clientProfile",
  clientName: "clientProfile",
  firstName: "clientProfile",
  lastName: "clientProfile",
  birthDate: "clientProfile",
  personalId: "clientProfile",
  maskedPersonalId: "clientProfile",
  address: "clientProfile",
  permanentAddress: "clientProfile",
  phone: "clientProfile",
  email: "clientProfile",
  occupation: "clientProfile",
  sports: "clientProfile",
  policyholder: "clientProfile",
  participantFullName: "clientProfile",
  investorFullName: "clientProfile",
  employeeFullName: "clientProfile",
  ownerName: "clientProfile",
  contractNumber: "contractCore",
  contractNumberOrProposalNumber: "contractCore",
  proposalNumberOrContractNumber: "contractCore",
  proposalNumber: "contractCore",
  businessCaseNumber: "contractCore",
  insurer: "contractCore",
  provider: "contractCore",
  lender: "contractCore",
  institutionName: "contractCore",
  productName: "contractCore",
  productType: "contractCore",
  documentStatus: "contractCore",
  startDate: "contractCore",
  endDate: "contractCore",
  policyStartDate: "contractCore",
  policyEndDate: "contractCore",
  policyDuration: "contractCore",
  dateSigned: "contractCore",
  signedDate: "contractCore",
  issueDate: "contractCore",
  coverages: "insuredRisks",
  selectedCoverages: "insuredRisks",
  riders: "insuredRisks",
  insuredRisks: "insuredRisks",
  insuredPersons: "insuredRisks",
  insuredObject: "insuredRisks",
  insuredAddress: "insuredRisks",
  coverageLimit: "insuredRisks",
  deductible: "insuredRisks",
  deathBenefit: "insuredRisks",
  accidentBenefit: "insuredRisks",
  disabilityBenefit: "insuredRisks",
  hospitalizationBenefit: "insuredRisks",
  seriousIllnessBenefit: "insuredRisks",
  paymentAccountNumber: "paymentsCore",
  paymentAccounts: "paymentsCore",
  bankPaymentInfo: "paymentsCore",
  bankAccount: "paymentsCore",
  iban: "paymentsCore",
  bankCode: "paymentsCore",
  variableSymbol: "paymentsCore",
  constantSymbol: "paymentsCore",
  specificSymbol: "paymentsCore",
  paymentFrequency: "paymentsCore",
  paymentType: "paymentsCore",
  paymentPurpose: "paymentsCore",
  totalMonthlyPremium: "paymentsCore",
  annualPremium: "paymentsCore",
  premiumAmount: "paymentsCore",
  riskPremium: "paymentsCore",
  investmentPremium: "paymentsCore",
  regularAmount: "paymentsCore",
  oneOffAmount: "paymentsCore",
  firstPaymentDate: "paymentsCore",
  intermediaryName: "intermediary",
  intermediaryCode: "intermediary",
  intermediaryCompany: "intermediary",
  advisorName: "intermediary",
  brokerName: "intermediary",
  investmentStrategy: "investments",
  investmentFunds: "investments",
  fundAllocation: "investments",
  investmentAllocation: "investments",
  investmentScenario: "investments",
  riskProfile: "investments",
  projectedReturn: "investments",
  proposedFunds: "investments",
  beneficiaries: "beneficiaries",
  beneficiary: "beneficiaries",
};

const HIDDEN_REASON_CODES = new Set([
  "partial_extraction_coerced",
  "partial_extraction_merged_into_stub",
  "critical_review_warning",
  "missing_required_data",
]);

function fieldLabelForPath(field?: string): string | undefined {
  if (!field) return undefined;
  const key = field.replace(/^extractedFields\./, "").split(".").at(-1) ?? field;
  return fieldLabelForKey(key);
}

function toCamelCase(key: string): string {
  if (!key.includes("_") && !key.includes("-")) {
    return key.charAt(0).toLowerCase() + key.slice(1);
  }
  return key
    .trim()
    .toLowerCase()
    .replace(/[-_]+([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

function stripFieldConditionSuffixes(key: string): string {
  return key
    .replace(/_if_[a-z0-9_]+$/i, "")
    .replace(/_or_[a-z0-9_]+$/i, "")
    .replace(/_vs_[a-z0-9_]+$/i, "");
}

function humanizeSnakeOrCamel(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
}

function fieldLabelForKey(rawKey: string): string {
  const candidates = [
    rawKey,
    toCamelCase(rawKey),
    stripFieldConditionSuffixes(rawKey),
    toCamelCase(stripFieldConditionSuffixes(rawKey)),
  ];
  for (const candidate of candidates) {
    if (FIELD_LABELS[candidate]) return FIELD_LABELS[candidate];
  }
  return humanizeSnakeOrCamel(rawKey);
}

function resolveFieldGroupId(rawKey: string): string {
  const candidates = [
    rawKey,
    toCamelCase(rawKey),
    stripFieldConditionSuffixes(rawKey),
    toCamelCase(stripFieldConditionSuffixes(rawKey)),
  ];
  for (const candidate of candidates) {
    if (FIELD_GROUP_MAP[candidate]) return FIELD_GROUP_MAP[candidate];
  }
  const probe = candidates.join(" ").toLowerCase();
  if (/(name|birth|personal|email|phone|address|occupation|sport|nationality|client|policyholder|investor|participant|employee|owner)/.test(probe)) {
    return "clientProfile";
  }
  if (/(intermediary|advisor|broker|partner)/.test(probe)) {
    return "intermediary";
  }
  if (/(beneficiar|obmyš|coinsured|household)/.test(probe)) {
    return "beneficiaries";
  }
  if (/(fund|investment|allocation|scenario|strategy|horizon|portfolio|projection|dip|dps|pp)/.test(probe)) {
    return "investments";
  }
  if (/(coverage|risk|rider|insured|benefit|deductible|health|questionnaire|limit)/.test(probe)) {
    return "insuredRisks";
  }
  if (/(payment|premium|amount|account|iban|bank|symbol|currency|installment|loan|interest|balance|contribution|wage|income|payable)/.test(probe)) {
    return "paymentsCore";
  }
  return "contractCore";
}

function humanizeReasonForAdvisor(reason: string): string | null {
  if (!reason || HIDDEN_REASON_CODES.has(reason)) return null;
  if (reason === "low_confidence") return "AI si výsledkem není dost jistá. Ověřte hlavní údaje oproti dokumentu.";
  if (reason === "scan_or_ocr_unusable") {
    return "OCR nepřečetlo dokument dost spolehlivě. Doplňte údaje ručně nebo použijte kvalitnější PDF.";
  }
  if (reason === "proposal_or_modelation_not_final_contract") {
    return "Dokument působí jako návrh nebo modelace, ne jako finální smlouva.";
  }
  if (reason === "proposal_not_final_contract") {
    return "Rozpoznání ukazuje spíš na návrh než na finální smlouvu.";
  }
  if (reason === "hybrid_contract_signals_detected") {
    return "Dokument obsahuje smluvní údaje, proto byl posouzen jako smlouva i přes modelační prvky.";
  }
  return null;
}

/** Internal pipeline paths that appear in Zod validation messages — advisor-irrelevant noise. */
const INTERNAL_PATH_KEYWORDS = ["documentClassification", "documentMeta", "extractedFields."];

function isInternalStructuralWarning(warning: { code?: string; message: string; field?: string }): boolean {
  if (warning.code === "extraction_schema_validation") {
    return INTERNAL_PATH_KEYWORDS.some((kw) => warning.message.includes(kw));
  }
  if (warning.code === "partial_extraction_coerced" || warning.code === "partial_extraction_merged") {
    return false;
  }
  return false;
}

function humanizeValidationMessage(
  warning: { code?: string; message: string; field?: string }
): { title: string; description: string } | null {
  if (isInternalStructuralWarning(warning)) return null;
  const label = fieldLabelForPath(warning.field);
  if (warning.code === "MISSING_REQUIRED_FIELD" && label) {
    return {
      title: `${label} chybí`,
      description: `Údaj „${label}" se nepodařilo spolehlivě najít. Ověřte ho v PDF nebo doplňte ručně.`,
    };
  }
  if (warning.code === "LOW_EVIDENCE_REQUIRED" && label) {
    return {
      title: `${label} potřebuje ověření`,
      description: `AI našla údaj „${label}", ale má k němu slabý důkaz. Porovnejte ho prosím s dokumentem.`,
    };
  }
  if (warning.code === "extraction_schema_validation") {
    return {
      title: "Struktura extrakce potřebuje kontrolu",
      description: warning.message,
    };
  }
  if (warning.code === "partial_extraction_coerced") {
    return {
      title: "Výsledek byl částečně opraven",
      description: "AI vrátila neúplnou strukturu. Zachovali jsme nalezená pole, ale hodnoty zkontrolujte podle PDF.",
    };
  }
  return {
    title: label ? `Ověřit ${label}` : "Validační upozornění",
    description: warning.message,
  };
}

function fieldConfidence(
  fieldKey: string,
  fieldConfidenceMap: Record<string, number> | undefined,
  globalConfidence: number
): number {
  if (fieldConfidenceMap) {
    for (const [section, val] of Object.entries(fieldConfidenceMap)) {
      if (fieldKey.toLowerCase().includes(section.toLowerCase())) {
        return Math.round(val * 100);
      }
    }
  }
  return Math.round(globalConfidence * 100);
}

function fieldStatus(conf: number, value: unknown): FieldStatus {
  if (!value || value === "—" || value === "Nenalezeno" || value === "Nevyplněno") return "error";
  if (conf < 85) return "warning";
  return "success";
}

export function formatExtractedValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    const parts = v.map((x) => formatExtractedValue(x)).filter((s) => s && s !== "—");
    return parts.length ? parts.join(", ") : "—";
  }
  if (typeof v === "object") {
    try {
      const s = JSON.stringify(v);
      return s.length > 480 ? `${s.slice(0, 477)}…` : s;
    } catch {
      return "—";
    }
  }
  return String(v);
}

function looksLikeDocumentEnvelope(payload: Record<string, unknown>): boolean {
  return (
    payload.documentClassification != null &&
    typeof payload.documentClassification === "object" &&
    payload.extractedFields != null &&
    typeof payload.extractedFields === "object"
  );
}

type ReadabilityCtx = {
  inputMode?: string;
  textCoverageEstimate?: number;
  preprocessStatus?: string;
};

function flattenEnvelopeToGroups(
  envelope: Record<string, unknown>,
  fieldConfidenceMap: Record<string, number> | undefined,
  globalConfidence01: number,
  ctx: ReadabilityCtx
): ExtractedGroup[] {
  const groupedFields = new Map<string, ExtractedField[]>();
  const pushGroupedField = (field: ExtractedField, rawKey: string) => {
    const groupId = resolveFieldGroupId(rawKey);
    const nextField = { ...field, groupId };
    const bucket = groupedFields.get(groupId) ?? [];
    bucket.push(nextField);
    groupedFields.set(groupId, bucket);
  };
  const ef = envelope.extractedFields as
    | Record<string, { value?: unknown; status?: string; confidence?: number }>
    | undefined;
  if (ef && typeof ef === "object") {
    for (const [fKey, fObj] of Object.entries(ef)) {
      if (!fObj || typeof fObj !== "object" || fKey.startsWith("_")) continue;
      const rawVal = fObj.value;
      const strVal = formatExtractedValue(rawVal);
      const conf01 =
        typeof fObj.confidence === "number" && Number.isFinite(fObj.confidence)
          ? fObj.confidence
          : globalConfidence01;
      const confPct = fieldConfidence(fKey, fieldConfidenceMap, globalConfidence01);
      const pres = advisorFieldPresentation(rawVal, fObj.status, conf01, {
        inputMode: ctx.inputMode as InputMode | undefined,
        textCoverageEstimate: ctx.textCoverageEstimate,
        preprocessStatus: ctx.preprocessStatus,
      });
      pushGroupedField({
        id: `extractedFields.${fKey}`,
        groupId: "extractedFields",
        label: fieldLabelForKey(fKey),
        value: strVal,
        confidence: confPct,
        status: pres.status,
        message: pres.message,
        sourceType: "ai",
        isConfirmed: false,
        isEdited: false,
        originalAiValue: strVal,
      }, fKey);
    }
  }

  const parties = envelope.parties as Record<string, unknown> | undefined;
  if (parties && typeof parties === "object" && Object.keys(parties).length > 0) {
    for (const [pk, pv] of Object.entries(parties)) {
      if (pk.startsWith("_")) continue;
      const strVal = formatExtractedValue(pv);
      const confPct = fieldConfidence(pk, fieldConfidenceMap, globalConfidence01);
      const pres = advisorFieldPresentation(pv, "extracted", globalConfidence01, {
        inputMode: ctx.inputMode as InputMode | undefined,
        textCoverageEstimate: ctx.textCoverageEstimate,
        preprocessStatus: ctx.preprocessStatus,
      });
      pushGroupedField({
        id: `parties.${pk}`,
        groupId: "parties",
        label: fieldLabelForKey(pk),
        value: strVal,
        confidence: confPct,
        status: strVal === "—" ? "error" : pres.status,
        message: strVal === "—" ? "Údaj nebyl nalezen nebo chybí v dokumentu." : pres.message,
        sourceType: "ai",
        isConfirmed: false,
        isEdited: false,
        originalAiValue: strVal,
      }, pk);
    }
  }

  const ft = envelope.financialTerms as Record<string, unknown> | undefined;
  if (ft && typeof ft === "object") {
    for (const [k, v] of Object.entries(ft)) {
      if (k.startsWith("_")) continue;
      if (v != null && typeof v === "object" && !Array.isArray(v)) continue;
      const strVal = formatExtractedValue(v);
      if (strVal === "—") continue;
      const confPct = fieldConfidence(k, fieldConfidenceMap, globalConfidence01);
      pushGroupedField({
        id: `financialTerms.${k}`,
        groupId: "financialTerms",
        label: fieldLabelForKey(k),
        value: strVal,
        confidence: confPct,
        status: fieldStatus(confPct, v),
        message:
          fieldStatus(confPct, v) === "warning"
            ? "Ověřte oproti dokumentu."
            : undefined,
        sourceType: "ai",
        isConfirmed: false,
        isEdited: false,
        originalAiValue: strVal,
      }, k);
    }
  }

  const groups: ExtractedGroup[] = [];
  const orderedGroups = [
    "clientProfile",
    "contractCore",
    "insuredRisks",
    "paymentsCore",
    "intermediary",
    "investments",
    "beneficiaries",
    "parties",
    "other",
  ];
  for (const groupId of orderedGroups) {
    const fields = groupedFields.get(groupId);
    if (!fields || fields.length === 0) continue;
    fields.sort((a, b) => a.label.localeCompare(b.label, "cs"));
    groups.push({
      id: groupId,
      name: SECTION_LABELS[groupId] ?? "Další údaje",
      iconName: SECTION_ICONS[groupId] ?? "FileText",
      fields,
    });
  }

  return groups;
}

function flattenPayload(
  payload: Record<string, unknown>,
  fieldConfidenceMap: Record<string, number> | undefined,
  globalConfidence: number,
): ExtractedGroup[] {
  const groupedFields = new Map<string, ExtractedField[]>();
  const pushGroupedField = (field: ExtractedField, rawKey: string) => {
    const groupId = resolveFieldGroupId(rawKey);
    const nextField = { ...field, groupId };
    const bucket = groupedFields.get(groupId) ?? [];
    bucket.push(nextField);
    groupedFields.set(groupId, bucket);
  };

  for (const [sectionKey, sectionVal] of Object.entries(payload)) {
    if (
      sectionKey === "missingFields" ||
      sectionKey === "rawConfidence" ||
      sectionKey === "additionalNotes" ||
      sectionKey.startsWith("_")
    ) continue;

    if (typeof sectionVal === "object" && sectionVal !== null && !Array.isArray(sectionVal)) {
      const section = sectionVal as Record<string, unknown>;

      for (const [fKey, fVal] of Object.entries(section)) {
        if (fKey.startsWith("_")) continue;
        const strVal = fVal == null ? "—" : String(fVal);
        const conf = fieldConfidence(fKey, fieldConfidenceMap, globalConfidence);
        const status = fieldStatus(conf, fVal);
        pushGroupedField({
          id: `${sectionKey}.${fKey}`,
          groupId: sectionKey,
          label: fieldLabelForKey(fKey),
          value: strVal,
          confidence: conf,
          status,
          message: status === "error"
            ? "Údaj nebyl nalezen nebo chybí v dokumentu."
            : status === "warning"
              ? "Nižší jistota čtení. Ověřte prosím oproti originálu dokumentu."
              : undefined,
          sourceType: "ai",
          isConfirmed: false,
          isEdited: false,
          originalAiValue: strVal,
        }, fKey);
      }
    } else if (typeof sectionVal === "string" || typeof sectionVal === "number") {
      const strVal = String(sectionVal);
      const conf = fieldConfidence(sectionKey, fieldConfidenceMap, globalConfidence);
      const status = fieldStatus(conf, sectionVal);
      pushGroupedField({
        id: `root.${sectionKey}`,
        groupId: "__ungrouped",
        label: fieldLabelForKey(sectionKey),
        value: strVal,
        confidence: conf,
        status,
        message: status === "error"
          ? "Údaj nebyl nalezen nebo chybí v dokumentu."
          : status === "warning"
            ? "Nižší jistota čtení. Ověřte prosím oproti originálu dokumentu."
            : undefined,
        sourceType: "ai",
        isConfirmed: false,
        isEdited: false,
        originalAiValue: strVal,
      }, sectionKey);
    }
  }

  const groups: ExtractedGroup[] = [];
  const orderedGroups = [
    "clientProfile",
    "contractCore",
    "insuredRisks",
    "paymentsCore",
    "intermediary",
    "investments",
    "beneficiaries",
    "other",
  ];
  for (const groupId of orderedGroups) {
    const fields = groupedFields.get(groupId);
    if (!fields || fields.length === 0) continue;
    fields.sort((a, b) => a.label.localeCompare(b.label, "cs"));
    groups.push({
      id: groupId,
      name: SECTION_LABELS[groupId] ?? "Další údaje",
      iconName: SECTION_ICONS[groupId] ?? "FileText",
      fields,
    });
  }

  return groups;
}

function buildRecommendations(
  detail: ApiReviewDetail,
  groups: ExtractedGroup[]
): AIRecommendation[] {
  const recs: AIRecommendation[] = [];
  let idx = 0;

  // Track field paths already covered by a MISSING_REQUIRED_FIELD compliance entry
  // to avoid duplicating them in the error-fields warning loop below.
  const fieldPathsCoveredByCompliance = new Set<string>();

  const warnings = (detail.validationWarnings as Array<{ code?: string; message: string; field?: string }> | undefined) ?? [];
  for (const w of warnings) {
    const human = humanizeValidationMessage(w);
    if (!human) continue;
    if (w.field && w.code === "MISSING_REQUIRED_FIELD") {
      fieldPathsCoveredByCompliance.add(w.field);
    }
    recs.push({
      id: `vw-${idx++}`,
      type: "compliance",
      severity: "medium",
      title: human.title,
      description: human.description,
      linkedFieldIds: w.field
        ? groups.flatMap((g) => g.fields).filter((f) => f.id.includes(w.field!)).map((f) => f.id)
        : [],
      actionState: "pending",
      dismissed: false,
      createdAt: new Date().toISOString(),
    });
  }

  const allFields = groups.flatMap((g) => g.fields);
  const errorFields = allFields.filter((f) => f.status === "error");
  for (const f of errorFields) {
    // Skip if a compliance entry already covers this field path
    const fieldPath = `extractedFields.${f.id.replace(/^.*\./, "")}`;
    if (fieldPathsCoveredByCompliance.has(fieldPath) || fieldPathsCoveredByCompliance.has(f.id)) continue;
    recs.push({
      id: `missing-${f.id}`,
      type: "warning",
      severity: "high",
      title: `Chybí: ${f.label}`,
      description: `Údaj „${f.label}" nebyl nalezen v dokumentu. Ověřte prosím s klientem nebo v evidenci.`,
      linkedFieldIds: [f.id],
      actionState: "pending",
      dismissed: false,
      createdAt: new Date().toISOString(),
    });
  }

  return recs;
}

function buildDiagnostics(
  detail: ApiReviewDetail,
  groups: ExtractedGroup[]
): ExtractionDiagnostics {
  const allFields = groups.flatMap((g) => g.fields);
  const warningCount = allFields.filter(shouldCountFieldForAttentionBanner).length;
  const errorCount = allFields.filter((f) => f.status === "error").length;
  const extractedCount = allFields.filter((f) => f.status !== "error").length;
  const totalCount = allFields.length;

  const notes: string[] = [];
  const trace = detail.extractionTrace as { failedStep?: string; warnings?: string[] } | undefined;
  if (trace?.warnings) notes.push(...trace.warnings);
  if (detail.extractionMode) notes.push(`Režim extrakce: ${detail.extractionMode}`);
  if (detail.inputMode) notes.push(`Režim vstupu: ${detail.inputMode}`);
  if (errorCount > 0) notes.push(`${errorCount} údajů nenalezeno`);
  if (warningCount > 0) notes.push(`${warningCount} údajů s nižší jistotou`);

  return {
    ocrQuality: errorCount > 3 ? "poor" : warningCount > 2 ? "fair" : "good",
    extractionCoverage: totalCount > 0 ? Math.round((extractedCount / totalCount) * 100) : 0,
    totalFields: totalCount,
    extractedFields: extractedCount,
    unresolvedFieldCount: errorCount,
    warningCount,
    errorCount,
    conflictingValueCount: 0,
    pagesWithoutReadableText: [],
    notes,
  };
}

function pickClientNameFromPayload(extracted: Record<string, unknown>): string | undefined {
  if (looksLikeDocumentEnvelope(extracted)) {
    const ef = extracted.extractedFields as Record<string, { value?: unknown }> | undefined;
    if (!ef) return undefined;
    const p = (k: string) => {
      const v = ef[k]?.value;
      return v != null && String(v).trim() ? String(v).trim() : "";
    };
    const n = p("fullName") || p("clientFullName") || [p("firstName"), p("lastName")].filter(Boolean).join(" ");
    return n || undefined;
  }
  const client = (extracted.client ?? {}) as Record<string, unknown>;
  const flat = [client.fullName, client.firstName, client.lastName].filter(Boolean).join(" ");
  return flat || undefined;
}

function buildSummary(
  detail: ApiReviewDetail,
  groups: ExtractedGroup[],
  diagnostics: ExtractionDiagnostics
): string {
  const extracted = (detail.extractedPayload ?? {}) as Record<string, unknown>;
  const dc = extracted.documentClassification as Record<string, unknown> | undefined;
  const primaryType =
    (dc?.primaryType as PrimaryDocumentType) ??
    (detail.detectedDocumentType as PrimaryDocumentType) ??
    "generic_financial_document";
  const lifecycle =
    (dc?.lifecycleStatus as string) ?? (detail.lifecycleStatus as string) ?? "unknown";
  const inputMode = (detail.inputMode as InputMode) ?? "text_pdf";
  const confidence = (detail.confidence as number) ?? 0;
  const contentFlags = (extracted.contentFlags ?? {}) as Record<string, boolean>;
  const ef = extracted.extractedFields as Record<string, { value?: unknown }> | undefined;
  const productName =
    (extracted.productName as string | undefined) ?? (ef?.productName?.value != null ? String(ef.productName.value) : undefined);
  const institutionName =
    (extracted.institutionName as string | undefined) ??
    (ef?.institutionName?.value != null ? String(ef.institutionName.value) : undefined) ??
    (ef?.insurer?.value != null ? String(ef.insurer.value) : undefined);
  const contractNumber =
    (extracted.contractNumber as string | undefined) ??
    (ef?.contractNumber?.value != null ? String(ef.contractNumber.value) : undefined);

  const humanSummary = buildHumanSummary({
    primaryType,
    lifecycleStatus: lifecycle as Parameters<typeof buildHumanSummary>[0]["lifecycleStatus"],
    inputMode,
    confidence,
    productName,
    institutionName,
    contractNumber,
    clientName: pickClientNameFromPayload(extracted),
    containsPaymentInstructions: contentFlags.containsPaymentInstructions ?? false,
    reasonsForReview: detail.reasonsForReview as string[] | undefined,
  });

  const techDetail = `AI vytěžila ${diagnostics.extractedFields} z ${diagnostics.totalFields} polí.`;
  return `${humanSummary} ${techDetail}`;
}

/**
 * Apply inline review edits onto the API `extractedPayload` shape (section.key field ids from flattenPayload).
 */
export function mergeFieldEditsIntoExtractedPayload(
  payload: Record<string, unknown>,
  editedFields: Record<string, string>
): { merged: Record<string, unknown>; correctedFields: string[] } {
  const correctedFields: string[] = [];
  let merged: Record<string, unknown>;
  try {
    merged = structuredClone(payload) as Record<string, unknown>;
  } catch {
    merged = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
  }
  for (const [fieldId, value] of Object.entries(editedFields)) {
    const parts = fieldId.split(".");
    if (parts[0] === "extractedFields" && parts.length === 2) {
      const key = parts[1];
      const rootEf = merged.extractedFields;
      if (rootEf && typeof rootEf === "object" && !Array.isArray(rootEf)) {
        const ef = rootEf as Record<string, Record<string, unknown>>;
        const cell = ef[key];
        if (cell && typeof cell === "object" && !Array.isArray(cell)) {
          cell.value = value;
        } else {
          ef[key] = { value, status: "extracted", confidence: 1 };
        }
        correctedFields.push(fieldId);
      }
      continue;
    }
    if (parts.length === 2 && parts[0] !== "root") {
      const [sec, key] = parts;
      const section = merged[sec];
      if (section && typeof section === "object" && section !== null && !Array.isArray(section)) {
        const slot = (section as Record<string, unknown>)[key];
        if (slot && typeof slot === "object" && !Array.isArray(slot) && "value" in (slot as object)) {
          (slot as Record<string, unknown>).value = value;
        } else {
          (section as Record<string, unknown>)[key] = value;
        }
        correctedFields.push(fieldId);
      }
    } else if (parts[0] === "root" && parts.length === 2) {
      merged[parts[1]] = value;
      correctedFields.push(fieldId);
    }
  }
  return { merged, correctedFields };
}

function dedupeDraftActions(actions: DraftAction[]): DraftAction[] {
  const seenByType = new Set<string>();
  const seenByLabel = new Set<string>();
  const out: DraftAction[] = [];
  for (const a of actions) {
    const typeKey = `${a.type}:${a.label}`;
    const labelKey = a.label.trim().toLowerCase();
    if (seenByType.has(typeKey) || seenByLabel.has(labelKey)) continue;
    seenByType.add(typeKey);
    seenByLabel.add(labelKey);
    out.push(a);
  }
  return out;
}

const SYNTH_NOTE = "Interní podklad z metadat obálky — ověřte oproti PDF.";

function appendSyntheticEnvelopeGroups(
  base: ExtractedGroup[],
  envelope: Record<string, unknown>,
  detail: ApiReviewDetail,
  advisorReview: AdvisorReviewViewModel | undefined,
  globalConfidence01: number
): ExtractedGroup[] {
  const out = [...base];
  const confPct = Math.round(globalConfidence01 * 100);
  const mkField = (
    id: string,
    groupId: string,
    label: string,
    value: string,
    status: FieldStatus
  ): ExtractedField => ({
    id,
    groupId,
    label,
    value,
    confidence: confPct,
    status,
    message: status === "success" ? undefined : SYNTH_NOTE,
    sourceType: "ai",
    isConfirmed: false,
    isEdited: false,
    originalAiValue: value,
  });

  // synthetic_recognition and synthetic_meta are technical internals —
  // advisors see document type in the header and metadata in "Technické detaily".
  // Only emit synthetic_status with deduplicated, advisor-useful messages.

  const HIDDEN_REVIEW_WARNING_CODES = new Set([
    "extraction_schema_validation",
    "partial_extraction_coerced",
    "partial_extraction_merged",
    "ai_review_router_manual",
    "not_supported_for_direct_extraction",
    // These produce generic messages that duplicate the per-field "Chybí: X" entries — advisor-irrelevant at this level.
    "missing_required_data",
    "critical_review_warning",
  ]);

  const statusFields: ExtractedField[] = [];
  const seenStatusMessages = new Set<string>();

  const rw = envelope.reviewWarnings as Array<{ code?: string; message?: string; severity?: string }> | undefined;
  if (Array.isArray(rw)) {
    rw.forEach((w, i) => {
      if (!w?.message?.trim()) return;
      if (HIDDEN_REVIEW_WARNING_CODES.has(w.code ?? "")) return;
      const msg = w.message.trim();
      // Skip messages that reference internal JSON paths — not meaningful to advisors.
      if (INTERNAL_PATH_KEYWORDS.some((kw) => msg.includes(kw))) return;
      if (seenStatusMessages.has(msg)) return;
      seenStatusMessages.add(msg);
      statusFields.push(
        mkField(
          `synthetic.rw.${i}`,
          "synthetic_status",
          "Kontrola extrakce",
          msg,
          w.severity === "critical" ? "error" : "warning"
        )
      );
    });
  }
  const reasons = detail.reasonsForReview as string[] | undefined;
  if (Array.isArray(reasons)) {
    reasons.forEach((r, i) => {
      const human = humanizeReasonForAdvisor(String(r));
      if (!human) return;
      if (seenStatusMessages.has(human)) return;
      seenStatusMessages.add(human);
      statusFields.push(
        mkField(`synthetic.reason.${i}`, "synthetic_status", "Co zkontrolovat", human, "warning")
      );
    });
  }
  const vw = detail.validationWarnings as Array<{ code?: string; message: string }> | undefined;
  if (Array.isArray(vw)) {
    vw.forEach((w, i) => {
      if (!w?.message?.trim()) return;
      const human = humanizeValidationMessage(w);
      if (!human) return;
      if (seenStatusMessages.has(human.description)) return;
      seenStatusMessages.add(human.description);
      statusFields.push(
        mkField(
          `synthetic.vw.${i}`,
          "synthetic_status",
          human.title,
          human.description,
          "warning"
        )
      );
    });
  }
  if (statusFields.length > 0) {
    out.push({
      id: "synthetic_status",
      name: "Stav a kontrola",
      iconName: "Shield",
      fields: statusFields,
    });
  }

  if (advisorReview) {
    const lineFields: ExtractedField[] = [
      mkField("synthetic.ar.client", "synthetic_lines", "Klient (souhrn)", advisorReview.client, "warning"),
      mkField("synthetic.ar.product", "synthetic_lines", "Produkt / instituce", advisorReview.product, "warning"),
      mkField("synthetic.ar.payments", "synthetic_lines", "Platby", advisorReview.payments, "warning"),
    ];
    out.push({
      id: "synthetic_lines",
      name: "Souhrn pro poradce",
      iconName: "User",
      fields: lineFields,
    });
  }

  if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.debug("[ai-review-ui] synthetic_envelope_groups", {
      groupCount: out.length - base.length,
      totalGroups: out.length,
    });
  }

  return out;
}

/** True when the review detail should show the main extraction panel (not the empty state). */
export function hasMeaningfulReviewContent(doc: ExtractionDocument): boolean {
  if (doc.groups.length > 0) return true;
  if (doc.advisorReview) return true;
  if (doc.reviewUiMeta?.usedSyntheticGroups) return true;
  const ps = doc.processingStatus;
  if (ps === "extracted" || ps === "review_required" || ps === "blocked") {
    const trace = doc.extractionTrace as Record<string, unknown> | undefined;
    if (
      trace &&
      (trace.aiClassifierJson ||
        trace.documentType ||
        trace.normalizedPipelineClassification ||
        trace.classifierDurationMs != null)
    ) {
      return true;
    }
    if (doc.pipelineInsights?.normalizedPipelineClassification || doc.pipelineInsights?.extractionRoute) {
      return true;
    }
    if (doc.documentType && doc.documentType !== "Neznámý typ") return true;
  }
  return false;
}

export function mapApiToExtractionDocument(
  detail: ApiReviewDetail,
  pdfUrl: string
): ExtractionDocument {
  const extracted = (detail.extractedPayload ?? {}) as Record<string, unknown>;
  const confidence = (detail.confidence as number | null) ?? 0;
  const fieldConfidenceMap = detail.fieldConfidenceMap as Record<string, number> | undefined;
  const processingStatus = (detail.processingStatus as string) ?? "uploaded";
  const reviewStatus = (detail.reviewStatus as string) ?? "pending";
  const processingStage = detail.processingStage as string | undefined;
  const processingStageLabel =
    processingStage && PROCESSING_STAGE_LABELS_CS[processingStage]
      ? PROCESSING_STAGE_LABELS_CS[processingStage]
      : undefined;

  const insights = detail.pipelineInsights as ExtractionDocument["pipelineInsights"] | undefined;
  const readCtx: ReadabilityCtx = {
    inputMode: detail.inputMode as string | undefined,
    textCoverageEstimate: insights?.textCoverageEstimate,
    preprocessStatus: insights?.preprocessStatus,
  };

  let groups =
    Object.keys(extracted).length > 0
      ? looksLikeDocumentEnvelope(extracted)
        ? flattenEnvelopeToGroups(extracted, fieldConfidenceMap, confidence, readCtx)
        : flattenPayload(extracted, fieldConfidenceMap, confidence)
      : [];

  const norm = insights?.normalizedPipelineClassification;
  const baseType = (detail.detectedDocumentType as string) ?? "Neznámý typ";
  const trace = detail.extractionTrace as Record<string, unknown> | undefined;
  const advisorSummary = trace?.advisorDocumentSummary as { text?: unknown } | undefined;
  const llmExecutiveBrief =
    typeof advisorSummary?.text === "string" ? advisorSummary.text : undefined;
  const aiRaw = trace?.aiClassifierJson as Record<string, string> | undefined;
  let documentTypeLabel = humanPrimaryTypeHeading(baseType);
  if (aiRaw && (aiRaw.documentType || aiRaw.productFamily)) {
    documentTypeLabel = formatAiClassifierForAdvisor(aiRaw);
  } else if (norm && norm !== baseType) {
    documentTypeLabel = `${humanPrimaryTypeHeading(baseType)} · ${norm}`;
  }

  const advisorReview = looksLikeDocumentEnvelope(extracted)
    ? buildAdvisorReviewViewModel({
        envelope: extracted as unknown as DocumentReviewEnvelope,
        aiClassifierJson: aiRaw,
        detectedDocumentTypeLabel: documentTypeLabel,
        reasonsForReview: detail.reasonsForReview as string[] | undefined,
        validationWarnings: detail.validationWarnings as
          | Array<{ code?: string; message: string }>
          | undefined,
        extractionTrace: trace,
        llmExecutiveBrief,
      })
    : undefined;

  let usedSyntheticGroups = false;
  if (groups.length === 0 && looksLikeDocumentEnvelope(extracted)) {
    const augmented = appendSyntheticEnvelopeGroups(
      groups,
      extracted,
      detail,
      advisorReview,
      confidence
    );
    if (augmented.length > 0) {
      groups = augmented;
      usedSyntheticGroups = true;
    }
  }

  const diagnostics = buildDiagnostics(detail, groups);
  const recommendations = buildRecommendations(detail, groups);
  const summary = buildSummary(detail, groups, diagnostics);

  const clientName = pickClientNameFromPayload(extracted) ?? "—";

  const apiDrafts = (detail.draftActions as DraftAction[] | undefined) ?? [];
  const mergedDrafts = dedupeDraftActions([
    ...apiDrafts,
    ...(advisorReview?.workActions ?? []),
  ]);

  return {
    id: detail.id as string,
    fileName: detail.fileName as string,
    documentType: documentTypeLabel,
    clientName,
    uploadTime: detail.createdAt
      ? new Date(detail.createdAt as string).toLocaleString("cs-CZ")
      : "—",
    pageCount: 1,
    globalConfidence: Math.round(confidence * 100),
    reviewStatus: reviewStatus as ReviewStatus,
    processingStatus: processingStatus as ProcessingStatus,
    processingStageLabel,
    extractionProvider: "internal",
    uploadSource: "upload",
    lastProcessedAt: detail.updatedAt
      ? new Date(detail.updatedAt as string).toLocaleString("cs-CZ")
      : "—",
    executiveSummary: summary,
    recommendations,
    diagnostics,
    groups,
    extraRecommendations: [],
    pdfUrl,
    errorMessage: detail.errorMessage
      ? buildHumanErrorMessage({
          errorMessage: detail.errorMessage as string,
          primaryType: detail.detectedDocumentType as PrimaryDocumentType | undefined,
          inputMode: detail.inputMode as InputMode | undefined,
        })
      : undefined,
    reasonsForReview: detail.reasonsForReview as string[] | undefined,
    clientMatchCandidates:
      (detail.clientMatchCandidates as ClientMatchCandidate[] | undefined) ?? [],
    draftActions: mergedDrafts,
    inputMode: detail.inputMode as string | undefined,
    advisorReview,
    matchedClientId: detail.matchedClientId as string | undefined,
    createNewClientConfirmed: detail.createNewClientConfirmed as string | undefined,
    isApplied: reviewStatus === "applied",
    applyResultPayload: detail.applyResultPayload as ExtractionDocument["applyResultPayload"],
    extractionTrace: detail.extractionTrace as ExtractionDocument["extractionTrace"],
    validationWarnings: detail.validationWarnings as ExtractionDocument["validationWarnings"],
    classificationReasons: detail.classificationReasons as string[] | undefined,
    fieldConfidenceMap,
    pipelineInsights: insights,
    applyGate: (() => {
      const g = detail.applyGate as ExtractionDocument["applyGate"] | undefined;
      if (!g) return undefined;
      return {
        ...g,
        applyBarrierReasons: g.applyBarrierReasons ?? [],
      };
    })(),
    reviewUiMeta: usedSyntheticGroups ? { usedSyntheticGroups: true } : undefined,
  };
}

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
  MatchVerdict,
} from "./types";
import { buildHumanSummary, buildHumanErrorMessage, getDocumentTypeLabel } from "../ai/document-messages";
import type { PrimaryDocumentType } from "../ai/document-review-types";
import { isDateFieldKey, normalizeDateForAdvisorDisplay } from "../ai/canonical-date-normalize";
import { dedupeCzechAccountTrailingBankCode, formatDomesticAccountDisplayLine, sanitizeVariableSymbolForCanonical } from "../ai/payment-field-contract";
import type { DocumentReviewEnvelope } from "../ai/document-review-types";
import type { InputMode } from "../ai/input-mode-detection";
import {
  formatAiClassifierForAdvisor,
  humanizeReviewReasonLine,
  labelNormalizedPipelineClassification,
  sanitizeAdvisorVisibleText,
} from "./czech-labels";
import { advisorFieldPresentation, advisorFieldPresentationWithEvidence, shouldCountFieldForAttentionBanner } from "./advisor-confidence-policy";
import type { EvidenceTier, SourceKind } from "../ai/document-review-types";
import {
  fieldQualityGate,
  isNameFieldRedundant,
  detectPaymentFrequencyConflict,
  detectContractVsVariableSymbolConflict,
  shouldSuppressGroup,
} from "../ai/field-quality-gate";
import { buildAdvisorReviewViewModel } from "./advisor-review-view-model";
import { deriveFieldApplyPolicy } from "./field-apply-policy";
import { isAiReviewPipelineDebug } from "../ai/ai-review-debug";
import { deriveCanonicalPhase1DetailFields } from "../ai/canonical-detail-fields";

type ApiReviewDetail = Record<string, unknown>;

function coerceMatchVerdict(raw: unknown): MatchVerdict | null {
  if (
    raw === "existing_match" ||
    raw === "near_match" ||
    raw === "ambiguous_match" ||
    raw === "no_match"
  ) {
    return raw;
  }
  return null;
}

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
  insuredRisks: "Rizika",
  lifeInsuredPersons: "Pojištěné osoby",
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
  lifeInsuredPersons: "User",
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
  maskedPersonalId: "Rodné číslo",
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
  policyStartDate: "Datum začátku smlouvy",
  contractStartDate: "Datum začátku smlouvy",
  policyStartIfIllustrated: "Počátek pojištění (ilustrační)",
  policyEndDate: "Konec pojištění",
  endDate: "Konec smlouvy",
  dateSigned: "Datum podpisu",
  signedDate: "Datum podpisu",
  documentDate: "Datum dokumentu",
  /** LLM / legacy anglické klíče → čeština */
  documentIssueDate: "Datum vystavení dokumentu",
  effectiveDate: "Datum účinnosti",
  modelationDate: "Datum modelace",
  subtypeLabel: "Druh produktu (podtyp)",
  subTypeLabel: "Druh produktu (podtyp)",
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
  firstPaymentAmount: "Výše první platby",
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
  investorFullName: "Jméno investora / klienta",
  investorFullNameOrClientName: "Investor / klient",
  employeeFullNameOrOwnerName: "Zaměstnanec / vlastník",
  employeeName: "Jméno zaměstnance",
  ownerName: "Vlastník",
  ownerNameIfPresent: "Vlastník",
  accountOwner: "Majitel účtu",
  policyDuration: "Doba pojištění",
  investmentStrategy: "Investiční strategie",
  fundStrategy: "Investiční strategie",
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
  bankAccount: "Číslo účtu klienta",
  recipientAccount: "Účet instituce / příjemce",
  bankName: "Banka (platební údaje)",
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
  paymentToAccountMasked: "Účet pro výplatu",
  payoutAccount: "Účet pro výplatu",
  secondInsuredName: "Druhý pojištěný",
  secondInsuredPersonalId: "RČ druhého pojištěného",
  secondInsuredBirthDate: "Datum narození 2. pojištěného",
  coBorrowerName: "Spoludlužník",
  manualCoverageNotes: "Krytí — ruční poznámky",
  rawCoverageText: "Krytí — surový text",
  manualFillClientText: "Klient — k ručnímu doplnění",
  manualFillContractText: "Smlouva — k ručnímu doplnění",
  manualFillPaymentText: "Platby — k ručnímu doplnění",
  manualFillCoveragesText: "Krytí — k ručnímu doplnění",
  manualFillIntermediaryText: "Zprostředkovatel — k ručnímu doplnění",
  manualFillNotesText: "Poznámky — k ručnímu doplnění",
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
  idCardNumber: "Číslo dokladu / OP",
  idCardIssuedBy: "Doklad vydal",
  idCardValidUntil: "Platnost dokladu do",
  idCardIssuedAt: "Datum vydání dokladu",
  generalPractitioner: "Praktický lékař",
  resolvedFundId: "Fond (dle knihovny)",
  resolvedFundCategory: "Kategorie fondu",
  fvSourceType: "Zdroj pro výpočet FV",
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
  idCardNumber: "clientProfile",
  idCardIssuedBy: "clientProfile",
  idCardValidUntil: "clientProfile",
  idCardIssuedAt: "clientProfile",
  generalPractitioner: "clientProfile",
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
  insuredPersons: "lifeInsuredPersons",
  insuredPersonName: "lifeInsuredPersons",
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
  recipientAccount: "paymentsCore",
  bankName: "paymentsCore",
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
  secondInsuredName: "lifeInsuredPersons",
  secondInsuredPersonalId: "lifeInsuredPersons",
  secondInsuredBirthDate: "lifeInsuredPersons",
  coBorrowerName: "clientProfile",
  coinsured: "lifeInsuredPersons",
  manualCoverageNotes: "insuredRisks",
  rawCoverageText: "insuredRisks",
  manualFillClientText: "clientProfile",
  manualFillContractText: "contractCore",
  manualFillPaymentText: "paymentsCore",
  manualFillCoveragesText: "insuredRisks",
  manualFillIntermediaryText: "intermediary",
  manualFillNotesText: "other",
  accountForRepayment: "paymentsCore",
  payoutAccount: "paymentsCore",
  firstPaymentAmount: "paymentsCore",
};

/** Úvěrová pole u neúvěrových segmentů (životní, investice, …) nesmí zobrazovat úvěrové labely. */
const LOAN_DOMAIN_FIELD_KEYS = new Set([
  "lender",
  "loanAmount",
  "loanPrincipal",
  "principalAmount",
  "creditAmount",
  "installmentAmount",
  "monthlyInstallment",
  "installmentCount",
  "loanLinkedCoverageFlag",
  "detectedLoanPayments",
  "scheduleRows",
  "loanMaturity",
  "loanEndDate",
  "interestRate",
  "rpsn",
  "accountForRepayment",
  "payoutAccount",
  "totalPayments",
  "recurringPayments",
]);

function isLoanMortgageDocumentContext(primaryType?: string): boolean {
  const pt = primaryType ?? "";
  return (
    pt === "mortgage_document" ||
    pt === "consumer_loan_contract" ||
    pt === "consumer_loan_with_payment_protection"
  );
}

function shouldSuppressLoanFieldForLifeInsurance(
  fKey: string,
  primaryType?: string,
  productFamily?: string,
): boolean {
  if (!LOAN_DOMAIN_FIELD_KEYS.has(fKey)) return false;
  if (isLoanMortgageDocumentContext(primaryType)) return false;
  const pt = primaryType ?? "";
  const pf = (productFamily ?? "").toLowerCase();
  return (
    pt.startsWith("life_insurance") ||
    pt.startsWith("investment") ||
    pf === "life_insurance" ||
    pf === "investment"
  );
}

/** Úvěrové pole `lender` nesmí být u DPS/penze (často duplicita k provider / hlavičce instituce). */
function shouldSuppressLenderForPensionContract(fKey: string, primaryType?: string): boolean {
  return primaryType === "pension_contract" && fKey === "lender";
}

const HIDDEN_REASON_CODES = new Set([
  "partial_extraction_coerced",
  "partial_extraction_merged_into_stub",
  "critical_review_warning",
  "missing_required_data",
  // Pipeline/routing internals — not actionable for advisors
  "leasing_contract_dedicated",
  "leasing_contract_legacy_fallback",
  "supporting_document_review",
  "reference_lane",
  "adobe_preprocess_reused",
  "preprocess_succeeded",
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

/** Veřejné české popisky polí pro UI (enforcement, tabulky) — bez interních cest. */
export function advisorFieldLabelForKey(rawKey: string): string {
  return fieldLabelForKey(rawKey);
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

  // Suppress technical pipeline reasons that are not actionable for advisors
  const SUPPRESS_PIPELINE_REASONS = new Set([
    "leasing_contract_dedicated", "leasing_contract_legacy_fallback",
    "supporting_document_review", "supporting_document_reference",
    "proposal_or_modelation_not_final_contract",  // already in summary
    "proposal_not_final_contract",                 // already in summary
    "hybrid_contract_signals_detected",            // technical classifier detail
    "supporting_doc_family", "reference_lane",
    "adobe_preprocess_reused", "preprocess_succeeded", "preprocess_reused_cached_result",
    "localTemplateFallback", "storedPromptDivergenceDetected",
  ]);
  if (SUPPRESS_PIPELINE_REASONS.has(reason)) return null;

  // Suppress snake_case internal routing codes
  if (/^[a-z][a-z0-9_]*$/.test(reason) && reason.includes("_") && reason.length > 40) return null;

  if (reason === "low_confidence") {
    return sanitizeAdvisorVisibleText(
      "AI si výsledkem není dost jistá. Ověřte hlavní údaje oproti dokumentu.",
    );
  }
  if (reason === "scan_or_ocr_unusable") {
    return sanitizeAdvisorVisibleText(
      "Text dokumentu nebyl spolehlivě rozpoznán. Doplňte údaje ručně nebo použijte kvalitnější PDF.",
    );
  }
  if (reason === "ambiguous_client_match") {
    return sanitizeAdvisorVisibleText("V CRM je více možných klientů — vyberte správného.");
  }
  if (reason === "near_match_advisory") {
    return sanitizeAdvisorVisibleText(
      "Pravděpodobná shoda s klientem — ověřte výběr před zápisem, nebo zvolte jiného klienta.",
    );
  }
  if (reason === "llm_client_match_ambiguous") {
    return sanitizeAdvisorVisibleText(
      "AI si není jistá výběrem klienta v CRM. Vyberte správného kandidáta ručně.",
    );
  }
  if (reason === "incomplete_payment_details") {
    return sanitizeAdvisorVisibleText("Platební údaje nejsou kompletní — doplňte nebo ověřte.");
  }
  if (reason === "policyholder_missing") {
    return sanitizeAdvisorVisibleText(
      "Zkontrolujte pojistníka nebo klienta. Extrakce ho zatím nepotvrdila dost jistě.",
    );
  }
  if (reason === "payment_data_missing") {
    return sanitizeAdvisorVisibleText("Platební údaje se nepodařilo spolehlivě vytěžit. Ověřte je v dokumentu.");
  }
  if (reason === "missing_existing_contract_match") {
    return sanitizeAdvisorVisibleText(
      "Jde o změnový dokument, ale v CRM se nepodařilo najít navázanou existující smlouvu.",
    );
  }
  return humanizeReviewReasonLine(reason);
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
      title: sanitizeAdvisorVisibleText(`${label} chybí`),
      description: sanitizeAdvisorVisibleText(
        `Údaj „${label}" se nepodařilo spolehlivě najít. Ověřte ho v PDF nebo doplňte ručně.`,
      ),
    };
  }
  if (warning.code === "LOW_EVIDENCE_REQUIRED" && label) {
    return {
      title: sanitizeAdvisorVisibleText(`${label} potřebuje ověření`),
      description: sanitizeAdvisorVisibleText(
        `AI našla údaj „${label}", ale má k němu slabý důkaz. Porovnejte ho prosím s dokumentem.`,
      ),
    };
  }
  if (warning.code === "extraction_schema_validation") {
    if (INTERNAL_PATH_KEYWORDS.some((kw) => warning.message.includes(kw))) {
      return null;
    }
    return {
      title: sanitizeAdvisorVisibleText("Struktura výstupu potřebuje kontrolu"),
      description: sanitizeAdvisorVisibleText(
        "Některé údaje nebyly úplné nebo byly neurčité. Ověřte hodnoty podle PDF.",
      ),
    };
  }
  if (warning.code === "partial_extraction_coerced") {
    return {
      title: sanitizeAdvisorVisibleText("Výsledek byl částečně doplněn"),
      description: sanitizeAdvisorVisibleText(
        "Některé údaje chyběly nebo byly nejasné — doplnili jsme je z kontextu. Ověřte je podle PDF.",
      ),
    };
  }
  return {
    title: sanitizeAdvisorVisibleText(label ? `Ověřit ${label}` : "Upozornění ke kontrole"),
    description: sanitizeAdvisorVisibleText(
      INTERNAL_PATH_KEYWORDS.some((kw) => warning.message.includes(kw))
        ? "Automatická kontrola našla nesoulad v údajích. Ověřte dotčené hodnoty podle PDF."
        : humanizeReviewReasonLine(warning.message),
    ),
  };
}

function clampConfTo01(v: number): number {
  if (v > 1 && v <= 100) return v / 100;
  return Math.max(0, Math.min(1, v));
}

function fieldConfidence(
  fieldKey: string,
  fieldConfidenceMap: Record<string, number> | undefined,
  globalConfidence: number
): number {
  if (fieldConfidenceMap) {
    const fkLower = fieldKey.toLowerCase();
    const exact = fieldConfidenceMap[fieldKey] ?? fieldConfidenceMap[fkLower];
    if (typeof exact === "number") return Math.round(clampConfTo01(exact) * 100);

    const dotStripped = fkLower.replace(/^extractedfields\./, "");
    const exact2 = fieldConfidenceMap[dotStripped];
    if (typeof exact2 === "number") return Math.round(clampConfTo01(exact2) * 100);

    let bestLen = 0;
    let bestVal: number | undefined;
    for (const [section, val] of Object.entries(fieldConfidenceMap)) {
      const sLower = section.toLowerCase();
      if (fkLower === sLower || dotStripped === sLower) {
        return Math.round(clampConfTo01(val) * 100);
      }
      if (fkLower.endsWith(`.${sLower}`) || sLower.endsWith(`.${dotStripped}`)) {
        if (sLower.length > bestLen) { bestLen = sLower.length; bestVal = val; }
      }
    }
    if (bestVal != null) return Math.round(clampConfTo01(bestVal) * 100);
  }
  return Math.round(clampConfTo01(globalConfidence) * 100);
}

function fieldStatus(conf: number, value: unknown): FieldStatus {
  if (!value || value === "—" || value === "Nenalezeno" || value === "Nevyplněno") return "error";
  if (conf < 85) return "warning";
  return "success";
}

/**
 * Strip HTML tags and normalize whitespace for safe user-facing display.
 * Prevents raw `<table>`, `<td>`, HTML fragments from reaching UI text fields.
 */
function stripHtmlForDisplay(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function formatExtractedValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "Ano" : "Ne";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    const stripped = stripHtmlForDisplay(v);
    if (!stripped) return "—";
    return stripped;
  }
  if (Array.isArray(v)) {
    const parts = v.map((x) => formatExtractedValue(x)).filter((s) => s && s !== "—");
    return parts.length ? parts.join(", ") : "—";
  }
  if (typeof v === "object" && v !== null) {
    const obj = v as Record<string, unknown>;
    // Extraction envelope cell: {value, confidence, status} — surface the value
    if ("value" in obj) return formatExtractedValue(obj.value);
    // Named objects: surface name/label/title
    const named = obj.name ?? obj.label ?? obj.title ?? obj.text;
    if (named != null) return formatExtractedValue(named);
    // Flat single-key objects: surface that value
    const keys = Object.keys(obj);
    if (keys.length === 1) return formatExtractedValue(obj[keys[0]]);
    // Complex objects — never show raw JSON to advisors
    return "—";
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

/**
 * Insurance-specific field labels that should be replaced for non-insurance document families.
 * Key = original field key, value = label string.
 * Used for investment/dip/dps families and investment primary types.
 */
const INSURANCE_FIELD_LABEL_OVERRIDES_FOR_INVESTMENT: Record<string, string> = {
  insurer: "Správce / instituce",
  institutionName: "Instituce",
  policyStartDate: "Datum zahájení",
  policyEndDate: "Datum ukončení",
  policyDuration: "Investiční horizont",
  existingPolicyNumber: "Číslo smlouvy / reference",
  existingPolicyNumberOrReference: "Číslo smlouvy / reference",
  premiumAmount: "Pravidelná investice",
  totalMonthlyPremium: "Měsíční investice",
  annualPremium: "Roční investice",
  riskPremium: "Rizikové pojistné",
  investmentPremium: "Měsíční investice",
  intendedInvestment: "Celková investovaná částka",
  investmentAmount: "Celková investovaná částka",
  bankAccount: "Účet pro zasílání investice",
  recipientAccount: "Účet pro zasílání investice",
  accountNumber: "Účet pro zasílání investice",
};

/**
 * Pension-specific field label overrides (DPS / PP).
 * These replace insurance vocabulary with pension-appropriate terminology.
 */
const PENSION_FIELD_LABEL_OVERRIDES: Record<string, string> = {
  insurer: "Penzijní společnost",
  institutionName: "Penzijní společnost / instituce",
  provider: "Penzijní společnost",
  totalMonthlyPremium: "Měsíční příspěvek",
  annualPremium: "Roční příspěvek",
  investmentPremium: "Měsíční příspěvek",
  premiumAmount: "Výše příspěvku",
  policyStartDate: "Datum zahájení spoření",
  policyEndDate: "Datum ukončení spoření",
  investmentStrategy: "Strategie / fond",
  participantFullName: "Účastník",
};

const INVESTMENT_FAMILIES = new Set(["investment", "dip", "dps", "pp"]);
const PENSION_PRIMARY_TYPES = new Set(["pension_contract"]);
const INVESTMENT_PRIMARY_TYPES = new Set([
  "investment_subscription_document",
  "investment_service_agreement",
  "investment_modelation",
  "life_insurance_investment_contract",
  "investment_payment_instruction",
]);

// Non-life / auto: payment labels should reflect annual premium semantics
const NONLIFE_PAYMENT_LABEL_OVERRIDES: Record<string, string> = {
  totalMonthlyPremium: "Celkové roční pojistné",
  annualPremium: "Roční pojistné",
  premiumAmount: "Výše platby",
};
const NONLIFE_PRIMARY_TYPES = new Set([
  "nonlife_insurance_contract",
  "liability_insurance_offer",
]);

function fieldLabelForKeyAndFamily(rawKey: string, productFamily?: string, primaryType?: string): string {
  // Pension types get pension-specific vocabulary regardless of productFamily
  if (primaryType && PENSION_PRIMARY_TYPES.has(primaryType)) {
    const override = PENSION_FIELD_LABEL_OVERRIDES[rawKey]
      ?? PENSION_FIELD_LABEL_OVERRIDES[toCamelCase(rawKey)];
    if (override) return override;
  }
  // Non-life / auto insurance: use annual-oriented payment labels
  if (primaryType && NONLIFE_PRIMARY_TYPES.has(primaryType)) {
    const override = NONLIFE_PAYMENT_LABEL_OVERRIDES[rawKey]
      ?? NONLIFE_PAYMENT_LABEL_OVERRIDES[toCamelCase(rawKey)];
    if (override) return override;
  }
  // Investment/DIP/DPS families or investment primary types get investment vocabulary
  const isInvestmentContext =
    (productFamily && INVESTMENT_FAMILIES.has(productFamily)) ||
    (primaryType && INVESTMENT_PRIMARY_TYPES.has(primaryType));
  if (isInvestmentContext) {
    const override = INSURANCE_FIELD_LABEL_OVERRIDES_FOR_INVESTMENT[rawKey]
      ?? INSURANCE_FIELD_LABEL_OVERRIDES_FOR_INVESTMENT[toCamelCase(rawKey)];
    if (override) return override;
  }
  return fieldLabelForKey(rawKey);
}

/**
 * Detect duplicate institution fields showing the same canonical value.
 * Returns the set of field keys that should be suppressed as redundant.
 * Rule: if provider / institutionName / insurer all resolve to the same string,
 * only show the most canonical one (provider > institutionName > insurer).
 */
function getInstitutionDuplicateKeysToSuppress(
  ef: Record<string, { value?: unknown; status?: string } | undefined>,
  primaryType?: string,
): Set<string> {
  const suppress = new Set<string>();
  const INSTITUTION_KEYS =
    primaryType === "pension_contract"
      ? (["provider", "institutionName", "insurer", "lender"] as const)
      : (["provider", "institutionName", "insurer"] as const);
  const vals = INSTITUTION_KEYS.map((k) => {
    const v = ef[k]?.value;
    return v != null ? String(v).trim().toLowerCase() : null;
  });
  // Find the first non-empty canonical value
  const canonical = vals.find((v) => v && v !== "—");
  if (!canonical) return suppress;
  // Suppress duplicate keys that have the same value as the canonical (keep first occurrence)
  let kept = false;
  for (let i = 0; i < INSTITUTION_KEYS.length; i++) {
    if (vals[i] === canonical) {
      if (!kept) {
        kept = true; // keep the first match
      } else {
        suppress.add(INSTITUTION_KEYS[i]);
      }
    }
  }
  return suppress;
}

function flattenEnvelopeToGroups(
  envelope: Record<string, unknown>,
  fieldConfidenceMap: Record<string, number> | undefined,
  globalConfidence01: number,
  ctx: ReadabilityCtx,
  productFamily?: string,
  outputMode?: string,
  primaryType?: string,
): ExtractedGroup[] {
  const groupedFields = new Map<string, ExtractedField[]>();
  const pushGroupedField = (field: ExtractedField, rawKey: string) => {
    const groupId = resolveFieldGroupId(rawKey);
    // Suppress entire groups based on family/output mode
    if (shouldSuppressGroup(groupId, outputMode ?? "", productFamily ?? "")) return;
    const nextField = { ...field, groupId };
    const bucket = groupedFields.get(groupId) ?? [];
    bucket.push(nextField);
    groupedFields.set(groupId, bucket);
  };

  // Pre-scan for payment conflict and contract/VS conflict to add contextual messages
  const efRaw = envelope.extractedFields as Record<string, { value?: unknown; status?: string } | undefined> | undefined;
  const paymentConflict = efRaw ? detectPaymentFrequencyConflict(efRaw) : { hasConflict: false };
  const contractConflict = efRaw ? detectContractVsVariableSymbolConflict(efRaw) : { hasConflict: false };
  // Pre-compute institution dedup: suppress redundant provider/institutionName/insurer fields
  const institutionDupKeys = efRaw ? getInstitutionDuplicateKeysToSuppress(efRaw, primaryType) : new Set<string>();

  // Suppress the standalone bankCode row when bankAccount already embeds the same
  // trailing code — e.g. "626111626/0300" + bankCode "0300" would render as duplicate.
  const suppressBankCodeRow = (() => {
    if (!efRaw) return false;
    const acc = efRaw.bankAccount?.value;
    const bc = efRaw.bankCode?.value;
    if (!acc || !bc) return false;
    const accStr = String(acc).trim().replace(/\s/g, "");
    const bcStr = String(bc).trim().replace(/\s/g, "");
    if (!accStr || !bcStr) return false;
    return accStr.endsWith(`/${bcStr}`);
  })();

  const ef = envelope.extractedFields as
    | Record<string, { value?: unknown; status?: string; confidence?: number }>
    | undefined;
  if (ef && typeof ef === "object") {
    for (const [fKey, fObj] of Object.entries(ef)) {
      if (!fObj || typeof fObj !== "object" || fKey.startsWith("_")) continue;
      if (shouldSuppressLoanFieldForLifeInsurance(fKey, primaryType, productFamily)) continue;
      if (shouldSuppressLenderForPensionContract(fKey, primaryType)) continue;
      const rawVal = fObj.value;

      // Institution dedup: suppress redundant institution labels with identical values
      if (institutionDupKeys.has(fKey)) continue;

      // Bank code dedup: skip bankCode row if bankAccount already embeds "/NNNN"
      if (fKey === "bankCode" && suppressBankCodeRow) continue;

      // Name redundancy: skip inferred firstName/lastName if fullName already covers them
      if (isNameFieldRedundant(fKey, ef as Record<string, { value?: unknown; status?: string; evidenceTier?: EvidenceTier } | undefined>)) continue;

      const evidenceTier = (fObj as Record<string, unknown>).evidenceTier as EvidenceTier | undefined;
      const sourceKind = (fObj as Record<string, unknown>).sourceKind as SourceKind | undefined;
      const sourceLabel = (fObj as Record<string, unknown>).sourceLabel as string | undefined;
      const rawConf01 =
        typeof fObj.confidence === "number" && Number.isFinite(fObj.confidence)
          ? fObj.confidence
          : globalConfidence01;
      const conf01 = clampConfTo01(rawConf01);

      // Field quality gate
      const gateResult = fieldQualityGate(fKey, rawVal, {
        productFamily,
        outputMode,
        primaryType,
        evidenceTier,
        sourceKind,
        extractionStatus: fObj.status,
        confidence: conf01,
      });

      // Suppress fields that fail quality gate
      if (gateResult.level === "suppress_from_main_view" || gateResult.level === "diagnostic_only") continue;

      let strVal = isDateFieldKey(fKey)
        ? normalizeDateForAdvisorDisplay(rawVal == null ? null : String(rawVal)) || formatExtractedValue(rawVal)
        : formatExtractedValue(rawVal);

      if (fKey === "bankAccount") {
        const bc = ef.bankCode?.value != null ? String(ef.bankCode.value).trim() : "";
        strVal = formatDomesticAccountDisplayLine(strVal, bc) || strVal;
      } else if (
        fKey === "accountNumber" ||
        fKey === "paymentAccountNumber" ||
        fKey === "recipientAccount" ||
        fKey === "accountForRepayment" ||
        fKey === "institutionBankAccount" ||
        fKey === "institutionCollectionAccount" ||
        fKey === "collectionAccount"
      ) {
        strVal = dedupeCzechAccountTrailingBankCode(strVal) || strVal;
      }
      if (fKey === "variableSymbol") {
        const sanitized = sanitizeVariableSymbolForCanonical(strVal);
        strVal = sanitized || "—";
      }

      // Skip if display value is empty dash
      if (strVal === "—") continue;

      const confPct = fieldConfidence(fKey, fieldConfidenceMap, globalConfidence01);
      const pres = advisorFieldPresentationWithEvidence(rawVal, fObj.status, conf01, {
        inputMode: ctx.inputMode as InputMode | undefined,
        textCoverageEstimate: ctx.textCoverageEstimate,
        preprocessStatus: ctx.preprocessStatus,
      }, evidenceTier, sourceKind, sourceLabel);

      // Add contextual conflict message to affected fields
      let finalMessage = pres.message;
      if (paymentConflict.hasConflict &&
        (fKey === "paymentFrequency" || fKey === "totalMonthlyPremium" || fKey === "annualPremium")) {
        finalMessage = paymentConflict.reason ?? "Frekvence plateb nebo výše pojistného si odporují — ověřte v dokumentu.";
      }
      if (contractConflict.hasConflict &&
        (fKey === "contractNumber" || fKey === "variableSymbol")) {
        finalMessage = contractConflict.reason ?? "Číslo smlouvy a variabilní symbol si mohou odporovat.";
      }

      // productName anti-hallucination hint — pokud je nízká jistota nebo
      // hodnota obsahuje "— produkt k doplnění" fallback z safeProductNameFallback(),
      // ukážeme amber warning. Prompt rule v SECTION_AWARE_RULES zakazuje vymýšlet
      // název, takže low confidence typicky znamená provider-based návrh.
      if (fKey === "productName") {
        const looksLikeProviderFallback =
          typeof strVal === "string" && /— produkt k doplnění/i.test(strVal);
        const lowConfidence = confPct < 60;
        if (looksLikeProviderFallback || lowConfidence) {
          finalMessage =
            "Navrženo podle poskytovatele — ověřte, zda v dokumentu není konkrétní název produktu.";
        }
      }

      const hasFieldConflict =
        (paymentConflict.hasConflict && (fKey === "paymentFrequency" || fKey === "totalMonthlyPremium" || fKey === "annualPremium")) ||
        (contractConflict.hasConflict && (fKey === "contractNumber" || fKey === "variableSymbol"));

      const applyDecision = deriveFieldApplyPolicy(
        fKey,
        pres.displayStatus,
        outputMode,
        hasFieldConflict,
      );

      // productName s nízkou jistotou / provider fallbackem → force warning,
      // aby UI žlutě označilo „ověřte název produktu".
      const productNameNeedsVerify =
        fKey === "productName" &&
        (confPct < 60 || (typeof strVal === "string" && /— produkt k doplnění/i.test(strVal)));

      pushGroupedField({
        id: `extractedFields.${fKey}`,
        groupId: "extractedFields",
        label: fieldLabelForKeyAndFamily(fKey, productFamily, primaryType),
        value: strVal,
        confidence: confPct,
        status:
          productNameNeedsVerify
            ? "warning"
            : gateResult.level === "displayable_with_review"
              ? "warning"
              : pres.status,
        message: gateResult.level === "displayable_with_review" && !finalMessage
          ? "Ověřte oproti originálu dokumentu."
          : finalMessage,
        sourceType: "ai",
        isConfirmed: false,
        isEdited: false,
        originalAiValue: strVal,
        displayStatus: pres.displayStatus,
        displaySource: pres.displaySource || undefined,
        applyPolicy: applyDecision.policy,
        applyPolicyLabel: applyDecision.label,
        requiresConfirmation: applyDecision.requiresConfirmation,
      }, fKey);
    }
  }

  const parties = envelope.parties as Record<string, unknown> | undefined;
  if (parties && typeof parties === "object" && Object.keys(parties).length > 0) {
    for (const [pk, pv] of Object.entries(parties)) {
      if (pk.startsWith("_")) continue;
      const strVal = formatExtractedValue(pv);
      // Skip empty/null party entries — same behaviour as the extractedFields loop above.
      // Null parties (e.g. parties.insured = null) must NOT generate false "Chybí: Insured"
      // warnings. The policyholder/insured data is canonical in extractedFields instead.
      if (strVal === "—") continue;
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
        status: pres.status,
        message: pres.message,
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
    "lifeInsuredPersons",
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
    "lifeInsuredPersons",
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

/** Nahradí nízkoúrovňové pipeline řetězce v diagnostice (diagnostika extrakce) lidskou češtinou. */
function humanizeAdvisorDiagnosticNote(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  if (s === "text_pdf" || /^text_pdf$/i.test(s)) {
    return sanitizeAdvisorVisibleText("Dokument má textovou vrstvu.");
  }
  if (/page_images:not_implemented|page_images:/i.test(s)) {
    return sanitizeAdvisorVisibleText(
      "Náhled jednotlivých stránek jako obrázků není k dispozici — pracuje se s textem dokumentu.",
    );
  }
  if (/^Režim vstupu:\s*text_pdf/i.test(s)) {
    return sanitizeAdvisorVisibleText("Dokument má textovou vrstvu.");
  }
  if (/^Režim extrakce:/i.test(s)) {
    const rest = s.replace(/^Režim extrakce:\s*/i, "").trim();
    return sanitizeAdvisorVisibleText(`Způsob zpracování: ${humanizeAdvisorDiagnosticNote(rest)}`);
  }
  if (/^Režim vstupu:/i.test(s)) {
    const rest = s.replace(/^Režim vstupu:\s*/i, "").trim();
    return sanitizeAdvisorVisibleText(`Typ vstupu: ${humanizeAdvisorDiagnosticNote(rest)}`);
  }
  return sanitizeAdvisorVisibleText(s);
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
  if (trace?.warnings) {
    for (const w of trace.warnings) {
      const h = humanizeAdvisorDiagnosticNote(w);
      if (h) notes.push(h);
    }
  }
  if (detail.extractionMode) notes.push(humanizeAdvisorDiagnosticNote(`Režim extrakce: ${detail.extractionMode}`));
  if (detail.inputMode) notes.push(humanizeAdvisorDiagnosticNote(String(detail.inputMode)));
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
  _groups: ExtractedGroup[],
  _diagnostics: ExtractionDiagnostics
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
  // Removed tech suffix ("AI vytěžila X z Y polí") — diagnostics shown separately v panelu diagnostiky
  return sanitizeAdvisorVisibleText(humanSummary);
}

/**
 * Collapses duplicate rows with the same advisor-facing label and value (e.g. repeated „Číslo smlouvy“).
 * Preference: canonical contractNumber over composite / proposal / modelation ids.
 */
function dedupeIdenticalLabelValueFieldsInGroups(groups: ExtractedGroup[]): ExtractedGroup[] {
  function slotPriority(fieldId: string): number {
    const leaf = fieldId.includes(".") ? (fieldId.split(".").pop() ?? fieldId) : fieldId;
    if (leaf === "contractNumber") return 0;
    if (leaf.includes("contractNumberOr") || leaf.includes("ProposalNumberOr")) return 1;
    if (leaf === "proposalNumber") return 2;
    if (leaf === "modelationId") return 3;
    return 50;
  }
  return groups.map((g) => {
    const buckets = new Map<string, ExtractedField[]>();
    for (const f of g.fields) {
      const key = `${f.label.trim().toLowerCase()}|||${f.value.trim().replace(/\s+/g, " ")}`;
      const arr = buckets.get(key) ?? [];
      arr.push(f);
      buckets.set(key, arr);
    }
    const keep = new Set<string>();
    for (const arr of buckets.values()) {
      if (arr.length === 1) {
        keep.add(arr[0]!.id);
      } else {
        const sorted = [...arr].sort((a, b) => slotPriority(a.id) - slotPriority(b.id));
        keep.add(sorted[0]!.id);
      }
    }
    return { ...g, fields: g.fields.filter((f) => keep.has(f.id)) };
  });
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
          // F0-2 (C-02): ruční edit musí povýšit status na valid enum
          // (`extracted`) + doplnit marker `source: "manual_edit"`, jinak
          // downstream enforcement (`resolveDisplayStatus` v
          // `apply-policy-enforcement.ts`) vidí původní `missing`/`not_found`
          // a pole označí jako `do_not_apply`, i když advisor hodnotu vyplnil.
          // Používáme `extracted` (Zod-valid) místo vlastního `manual` abychom
          // nerozbili envelope re-parse.
          cell.value = value;
          cell.status = "extracted";
          cell.source = "manual_edit";
          cell.confidence = 1;
          cell.evidenceTier = "direct";
          cell.reviewedAt = new Date().toISOString();
        } else {
          ef[key] = {
            value,
            status: "extracted",
            source: "manual_edit",
            confidence: 1,
            evidenceTier: "direct",
            reviewedAt: new Date().toISOString(),
          };
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
          const slotObj = slot as Record<string, unknown>;
          slotObj.value = value;
          slotObj.status = "extracted";
          slotObj.source = "manual_edit";
          slotObj.confidence = 1;
          slotObj.evidenceTier = "direct";
          slotObj.reviewedAt = new Date().toISOString();
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
    // Source priority violations are handled by field suppression / clearing — no need to surface separately
    "client_field_institution_value",
    "intermediary_institution_value",
    // Technical pipeline internals — shown in trace, not in advisor panel
    "storedPromptDivergenceDetected",
    "multi_section_bundle_detected",
    "missing_prompt_vars",
    "preprocess_warning",
  ]);

  const statusFields: ExtractedField[] = [];
  const seenStatusMessages = new Set<string>();

  const rw = envelope.reviewWarnings as Array<{ code?: string; message?: string; severity?: string }> | undefined;
  if (Array.isArray(rw)) {
    rw.forEach((w, i) => {
      if (!w?.message?.trim()) return;
      if (HIDDEN_REVIEW_WARNING_CODES.has(w.code ?? "")) return;
      const rawMsg = w.message.trim();
      // Skip messages that reference internal JSON paths — not meaningful to advisors.
      if (INTERNAL_PATH_KEYWORDS.some((kw) => rawMsg.includes(kw))) return;
      const msg = humanizeReviewReasonLine(rawMsg);
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

  if (typeof process !== "undefined" && isAiReviewPipelineDebug()) {
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
  const rawConf = (detail.confidence as number | null) ?? 0;
  const confidence = clampConfTo01(rawConf);
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

  const norm = insights?.normalizedPipelineClassification;
  const baseType = (detail.detectedDocumentType as string) ?? "Neznámý typ";
  const trace = detail.extractionTrace as Record<string, unknown> | undefined;
  const matchVerdict = coerceMatchVerdict(
    (detail as Record<string, unknown>).matchVerdict ?? trace?.matchVerdict
  );
  const advisorSummary = trace?.advisorDocumentSummary as { text?: unknown } | undefined;
  const llmExecutiveBrief =
    typeof advisorSummary?.text === "string" ? advisorSummary.text : undefined;
  const aiRaw = trace?.aiClassifierJson as Record<string, string> | undefined;

  const classifierProductFamily = (
    (aiRaw?.productFamily as string | undefined) ??
    ((extracted as Record<string, unknown>).documentClassification as Record<string, unknown> | undefined)
      ?.productFamily as string | undefined
  );

  const envelopePrimaryType = (
    ((extracted as Record<string, unknown>).documentClassification as Record<string, unknown> | undefined)
      ?.primaryType as string | undefined
  ) ?? (detail.detectedDocumentType as string | undefined);

  const envelopeOutputMode = (detail as Record<string, unknown>).outputMode as string | undefined
    ?? (trace as Record<string, unknown> | undefined)?.outputMode as string | undefined;

  let groups =
    Object.keys(extracted).length > 0
      ? looksLikeDocumentEnvelope(extracted)
        ? flattenEnvelopeToGroups(extracted, fieldConfidenceMap, confidence, readCtx, classifierProductFamily, envelopeOutputMode, envelopePrimaryType)
        : flattenPayload(extracted, fieldConfidenceMap, confidence)
      : [];
  let documentTypeLabel = humanPrimaryTypeHeading(baseType);
  if (aiRaw && (aiRaw.documentType || aiRaw.productFamily)) {
    documentTypeLabel = formatAiClassifierForAdvisor(aiRaw);
  } else if (norm && norm !== baseType) {
    documentTypeLabel = `${humanPrimaryTypeHeading(baseType)} · ${labelNormalizedPipelineClassification(norm)}`;
  }
  documentTypeLabel = sanitizeAdvisorVisibleText(documentTypeLabel);

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

  groups = dedupeIdenticalLabelValueFieldsInGroups(groups);

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
    matchVerdict,
    inputMode: detail.inputMode as string | undefined,
    advisorReview,
    matchedClientId: detail.matchedClientId as string | undefined,
    createNewClientConfirmed: detail.createNewClientConfirmed as string | undefined,
    isApplied: reviewStatus === "applied",
    applyResultPayload: detail.applyResultPayload as ExtractionDocument["applyResultPayload"],
    extractionTrace: detail.extractionTrace as ExtractionDocument["extractionTrace"],
    ocrScanPendingPolicy: detail.ocrScanPendingPolicy as ExtractionDocument["ocrScanPendingPolicy"],
    validationWarnings: detail.validationWarnings as ExtractionDocument["validationWarnings"],
    classificationReasons: detail.classificationReasons as string[] | undefined,
    fieldConfidenceMap,
    pipelineInsights: insights,
    applyGate: (() => {
      const g = detail.applyGate as ExtractionDocument["applyGate"] | undefined;
      if (!g) return undefined;
      // ignoredWarnings are stored as advisor-persisted overrides in DB
      const ignored = Array.isArray(detail.ignoredWarnings) ? (detail.ignoredWarnings as string[]) : [];
      return {
        ...g,
        applyBarrierReasons: g.applyBarrierReasons ?? [],
        overriddenReasons: ignored.length > 0 ? ignored : undefined,
      };
    })(),
    reviewUiMeta: usedSyntheticGroups ? { usedSyntheticGroups: true } : undefined,
    productCategory: (detail.productCategory as string | null | undefined) ?? null,
    productSubtypes: (detail.productSubtypes as string[] | null | undefined) ?? null,
    extractionConfidenceLevel: (() => {
      const v = detail.extractionConfidence as string | null | undefined;
      return v === "high" || v === "medium" || v === "low" ? v : null;
    })(),
    needsHumanReview: detail.needsHumanReview === "true",
    missingFields: Array.isArray(detail.missingFields) ? (detail.missingFields as string[]) : undefined,
    proposedAssumptions:
      detail.proposedAssumptions && typeof detail.proposedAssumptions === "object"
        ? (detail.proposedAssumptions as Record<string, unknown>)
        : undefined,
    publishReadiness: (() => {
      if (reviewStatus === "applied") return "published" as const;
      const gate = detail.applyGate as { readiness?: string; blockedReasons?: string[] } | undefined;
      if (gate?.readiness === "blocked_for_apply" || (gate?.blockedReasons?.length ?? 0) > 0) return "blocked" as const;
      if (reviewStatus === "approved") return "ready_for_publish" as const;
      if (reviewStatus === "rejected") return "blocked" as const;
      const processingStatusStr = (detail.processingStatus as string) ?? "";
      if (processingStatusStr === "review_required") return "review_required" as const;
      return "partially_reviewed" as const;
    })(),
    // Phase 2+3: pass through canonical fields from extractedPayload (never raw dump)
    canonicalFields: (() => {
      const phase1 = deriveCanonicalPhase1DetailFields(extracted as Record<string, unknown>);
      const pm = extracted.packetMeta as Record<string, unknown> | null | undefined;
      const ph = extracted.publishHints as Record<string, unknown> | null | undefined;
      const pts = extracted.participants as Array<Record<string, unknown>> | null | undefined;
      const ir = extracted.insuredRisks as Array<Record<string, unknown>> | null | undefined;
      const hq = extracted.healthQuestionnaires as Array<Record<string, unknown>> | null | undefined;
      const inv = extracted.investmentData as Record<string, unknown> | null | undefined;
      const pay = extracted.paymentData as Record<string, unknown> | null | undefined;

      if (!pm && !ph && !pts && !ir && !hq && !inv && !pay && !phase1.identityData && !phase1.fundResolution)
        return undefined;

      return {
        packetMeta: pm ? {
          isBundle: pm.isBundle === true,
          bundleConfidence: typeof pm.bundleConfidence === "number" ? pm.bundleConfidence : undefined,
          primarySubdocumentType: typeof pm.primarySubdocumentType === "string" ? pm.primarySubdocumentType : undefined,
          subdocumentCandidates: Array.isArray(pm.subdocumentCandidates)
            ? (pm.subdocumentCandidates as Array<Record<string, unknown>>).map((c) => ({
                type: String(c.type ?? ""),
                label: String(c.label ?? ""),
                confidence: typeof c.confidence === "number" ? c.confidence : undefined,
              }))
            : undefined,
          hasSensitiveAttachment: pm.hasSensitiveAttachment === true,
          packetWarnings: Array.isArray(pm.packetWarnings) ? (pm.packetWarnings as string[]) : undefined,
        } : null,
        publishHints: ph ? {
          contractPublishable: ph.contractPublishable !== false,
          reviewOnly: ph.reviewOnly === true,
          needsSplit: ph.needsSplit === true,
          needsManualValidation: ph.needsManualValidation === true,
          sensitiveAttachmentOnly: ph.sensitiveAttachmentOnly === true,
          reasons: Array.isArray(ph.reasons) ? (ph.reasons as string[]) : undefined,
        } : null,
        participants: Array.isArray(pts) ? pts.map((p) => ({
          fullName: typeof p.fullName === "string" ? p.fullName : undefined,
          birthDate: typeof p.birthDate === "string" ? p.birthDate : undefined,
          role: typeof p.role === "string" ? p.role : undefined,
          address: typeof p.address === "string" ? p.address : undefined,
          occupation: typeof p.occupation === "string" ? p.occupation : undefined,
        })) : null,
        insuredRisks: Array.isArray(ir) ? ir.map((r) => ({
          linkedParticipant: typeof r.linkedParticipant === "string" ? r.linkedParticipant : undefined,
          riskType: typeof r.riskType === "string" ? r.riskType : undefined,
          riskLabel: typeof r.riskLabel === "string" ? r.riskLabel : undefined,
          insuredAmount: r.insuredAmount as string | number | undefined,
          premium: r.premium as string | number | undefined,
          termEnd: typeof r.termEnd === "string" ? r.termEnd : undefined,
        })) : null,
        healthQuestionnaires: Array.isArray(hq) ? hq.map((q) => ({
          linkedParticipant: typeof q.linkedParticipant === "string" ? q.linkedParticipant : undefined,
          questionnairePresent: q.questionnairePresent === true,
          sectionSummary: typeof q.sectionSummary === "string" ? q.sectionSummary : undefined,
        })) : null,
        investmentData: inv ? {
          strategy: typeof inv.strategy === "string" ? inv.strategy : undefined,
          isModeledData: inv.isModeledData === true,
          funds: Array.isArray(inv.funds)
            ? (inv.funds as Array<Record<string, unknown>>).map((f) => ({
                name: String(f.name ?? ""),
                allocation: f.allocation as string | number | undefined,
              }))
            : undefined,
        } : null,
        paymentData: pay ? {
          variableSymbol: typeof pay.variableSymbol === "string" ? pay.variableSymbol : undefined,
          paymentFrequency: typeof pay.paymentFrequency === "string" ? pay.paymentFrequency : undefined,
          accountNumber: typeof pay.accountNumber === "string" ? pay.accountNumber : undefined,
          bankAccount: typeof pay.bankAccount === "string" ? pay.bankAccount : undefined,
          iban: typeof pay.iban === "string" ? pay.iban : undefined,
          bankCode: typeof pay.bankCode === "string" ? pay.bankCode : undefined,
          paymentMethod: typeof pay.paymentMethod === "string" ? pay.paymentMethod : undefined,
        } : null,
        identityData: phase1.identityData,
        fundResolution: phase1.fundResolution,
      };
    })(),
  };
}

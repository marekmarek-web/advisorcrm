/**
 * User-facing Czech labels for AI Review classifier enums (fallback when model omits labels).
 */

const DOC_TYPE: Record<string, string> = {
  contract: "Smlouva",
  proposal: "Nabídka / návrh",
  modelation: "Modelace",
  amendment: "Dodatek / změna",
  statement: "Výpis",
  payment_instructions: "Platební pokyny",
  supporting_document: "Podpůrný dokument",
  termination_document: "Ukončení / výpověď",
  consent_or_identification_document: "Souhlas / identifikace",
  confirmation_document: "Potvrzení",
  unknown: "Neurčeno",
};

const FAMILY: Record<string, string> = {
  life_insurance: "Životní pojištění",
  non_life_insurance: "Neživotní pojištění",
  investment: "Investice",
  pp: "Penzijní připojištění",
  dps: "Doplňkové důchodové spoření",
  dip: "Dlouhodobý investiční produkt (DIP)",
  building_savings: "Stavební spoření",
  loan: "Úvěr",
  mortgage: "Hypotéka",
  banking: "Bankovnictví",
  legacy_financial_product: "Starší finanční produkt",
  unknown: "Neurčeno",
};

const SUBTYPE: Record<string, string> = {
  risk_life_insurance: "Rizikové životní",
  investment_life_insurance: "Investiční životní",
  capital_life_insurance: "Kapitálové životní",
  car_insurance: "Pojištění vozidla",
  property_insurance: "Majetek",
  household_insurance: "Domácnost",
  home_insurance: "Domácnost / domov",
  liability_insurance: "Odpovědnost",
  travel_insurance: "Cestovní",
  consumer_loan: "Spotřebitelský úvěr",
  mortgage_loan: "Hypoteční úvěr",
  bank_statement_standard: "Bankovní výpis",
  income_payroll: "Výplatní páska",
  income_tax_return: "Daňové přiznání",
  aml_kyc_form: "AML / KYC",
  direct_debit_mandate: "Inkasní mandát",
  confirmation_of_contract: "Potvrzení smlouvy",
  confirmation_of_payment: "Potvrzení platby",
  unknown: "Neurčeno",
};

export function labelDocumentType(code: string): string {
  const k = code.trim().toLowerCase();
  return DOC_TYPE[k] ?? code.replace(/_/g, " ");
}

export function labelProductFamily(code: string): string {
  const k = code.trim().toLowerCase();
  return FAMILY[k] ?? code.replace(/_/g, " ");
}

export function labelProductSubtype(code: string): string {
  const k = code.trim().toLowerCase();
  return SUBTYPE[k] ?? code.replace(/_/g, " ");
}

export type AiClassifierLike = {
  documentType?: string;
  productFamily?: string;
  productSubtype?: string;
  documentTypeLabel?: string;
  productFamilyLabel?: string;
  productSubtypeLabel?: string;
};

export function formatAiClassifierForAdvisor(c: AiClassifierLike): string {
  const dt = c.documentTypeLabel?.trim() || labelDocumentType(c.documentType ?? "");
  const fam = c.productFamilyLabel?.trim() || labelProductFamily(c.productFamily ?? "");
  const sub = c.productSubtypeLabel?.trim() || labelProductSubtype(c.productSubtype ?? "");
  if (sub && sub !== "Neurčeno") return `${dt} · ${fam} · ${sub}`;
  return `${dt} · ${fam}`;
}

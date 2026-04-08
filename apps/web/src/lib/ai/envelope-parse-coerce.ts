/**
 * Coerce LLM JSON toward documentReviewEnvelopeSchema before Zod parse.
 * Reduces soft-fail stubs when the model drifts slightly on enums or empty subtype.
 */

import { PRIMARY_DOCUMENT_TYPES, DOCUMENT_LIFECYCLE_STATUSES, DOCUMENT_INTENTS, EXTRACTION_FIELD_STATUSES } from "./document-review-types";

const PRIMARY_SET = new Set<string>(PRIMARY_DOCUMENT_TYPES);
const LIFECYCLE_SET = new Set<string>(DOCUMENT_LIFECYCLE_STATUSES);
const INTENT_SET = new Set<string>(DOCUMENT_INTENTS);
const SCANNED_VS_DIGITAL_VALUES = new Set(["scanned", "digital", "unknown"]);

/** Lowercase/normalized keys; map to canonical primaryType enum values. */
const PRIMARY_TYPE_ALIASES: Record<string, string> = {
  // general insurance → best guess
  insurance_contract: "life_insurance_contract",
  insurance: "life_insurance_contract",
  // life insurance variants
  life_insurance: "life_insurance_contract",
  life_insurance_final: "life_insurance_final_contract",
  life_insurance_investment: "life_insurance_investment_contract",
  zivotni_pojisteni: "life_insurance_contract",
  životní_pojištění: "life_insurance_contract",
  investicni_zivotni_pojisteni: "life_insurance_investment_contract",
  investiční_životní_pojištění: "life_insurance_investment_contract",
  smlouva_o_zivotnim_pojisteni: "life_insurance_final_contract",
  pojistna_smlouva: "life_insurance_contract",
  pojistná_smlouva: "life_insurance_contract",
  pojistna_smlouva_zivotni: "life_insurance_contract",
  // nonlife
  nonlife_insurance: "nonlife_insurance_contract",
  non_life_insurance_contract: "nonlife_insurance_contract",
  pojistna_smlouva_nelife: "nonlife_insurance_contract",
  neživotní_pojištění: "nonlife_insurance_contract",
  // proposal/change
  life_insurance_change: "life_insurance_change_request",
  amendment: "insurance_policy_change_or_service_doc",
  servisni_dokument: "insurance_policy_change_or_service_doc",
  servisní_dokument: "insurance_policy_change_or_service_doc",
  zmena_smlouvy: "insurance_policy_change_or_service_doc",
  změna_smlouvy: "insurance_policy_change_or_service_doc",
  service_doc: "insurance_policy_change_or_service_doc",
  policy_change: "insurance_policy_change_or_service_doc",
  change_request: "life_insurance_change_request",
  // loan
  loan: "consumer_loan_contract",
  loan_contract: "consumer_loan_contract",
  loan_agreement: "consumer_loan_contract",
  credit_agreement: "consumer_loan_contract",
  uverova_smlouva: "consumer_loan_contract",
  smlouva_o_uveru: "consumer_loan_contract",
  úvěrová_smlouva: "consumer_loan_contract",
  spotrebitelsky_uver: "consumer_loan_contract",
  spotřebitelský_úvěr: "consumer_loan_contract",
  // mortgage
  hypotecni_smlouva: "mortgage_document",
  hypoteční_smlouva: "mortgage_document",
  // investment
  investment: "investment_subscription_document",
  investment_subscription: "investment_subscription_document",
  investicni_smlouva: "investment_subscription_document",
  investiční_smlouva: "investment_subscription_document",
  dip: "investment_subscription_document",
  // payslip
  payslip: "payslip_document",
  vyplatni_listek: "payslip_document",
  výplatní_lístek: "payslip_document",
  // tax
  tax_return: "corporate_tax_return",
  danove_priznani: "corporate_tax_return",
  daňové_přiznání: "corporate_tax_return",
  corporate_tax: "corporate_tax_return",
  // pension
  pension: "pension_contract",
  penzijni_smlouva: "pension_contract",
  penzijní_smlouva: "pension_contract",
  // proposal
  navrh_smlouvy: "life_insurance_proposal",
  návrh_smlouvy: "life_insurance_proposal",
  proposal: "life_insurance_proposal",
  // insurance offer / proposal short forms
  insurance_offer: "life_insurance_proposal",
  nabidka_pojisteni: "life_insurance_proposal",
  nabídka_pojistění: "life_insurance_proposal",
  offer: "life_insurance_proposal",
  proposal: "life_insurance_proposal",
  insurance_proposal: "life_insurance_proposal",
  // tax return variants
  tax_return_corporate_income: "corporate_tax_return",
  corporate_income_tax_return: "corporate_tax_return",
  danove_priznani_po: "corporate_tax_return",
  dppo: "corporate_tax_return",
  // payslip variants
  pay_slip: "payslip_document",
  pay_stub: "payslip_document",
  supporting_document_pay_slip: "payslip_document",
  supporting_document_payslip: "payslip_document",
  payslip: "payslip_document",
  // nonlife / vehicle / property insurance short forms
  car_insurance: "nonlife_insurance_contract",
  vehicle_insurance: "nonlife_insurance_contract",
  property_insurance: "nonlife_insurance_contract",
  home_insurance: "nonlife_insurance_contract",
  liability_insurance: "nonlife_insurance_contract",
  pojisteni_vozidla: "nonlife_insurance_contract",
  pojištění_vozidla: "nonlife_insurance_contract",
  havarijni_pojisteni: "nonlife_insurance_contract",
  havarijní_pojištění: "nonlife_insurance_contract",
  povinne_ruceni: "nonlife_insurance_contract",
  povinné_ručení: "nonlife_insurance_contract",
  majetkove_pojisteni: "nonlife_insurance_contract",
  majetkové_pojištění: "nonlife_insurance_contract",
  pojisteni_majetku: "nonlife_insurance_contract",
  pojištění_majetku: "nonlife_insurance_contract",
  podnikatelske_pojisteni: "nonlife_insurance_contract",
  podnikatelské_pojištění: "nonlife_insurance_contract",
  // service agreement
  smlouva_o_poskytovani_sluzeb: "service_agreement",
  smlouva_o_poskytování_služeb: "service_agreement",
  // investment subscription short forms
  upis: "investment_subscription_document",
  úpis: "investment_subscription_document",
  subscription: "investment_subscription_document",
  // life insurance short Czech forms that the model returns
  izp: "life_insurance_investment_contract",
  životní_pojistka: "life_insurance_contract",
  zivotni_pojistka: "life_insurance_contract",
  life_insurance_policy: "life_insurance_final_contract",
};

/** Lowercase keys; map to canonical lifecycle enum values. */
const LIFECYCLE_ALIASES: Record<string, string> = {
  illustration_phase: "illustration",
  modelace: "modelation",
  návrh: "proposal",
  navrh: "proposal",
  nabidka: "offer",
  nabídka: "offer",
  projekce: "non_binding_projection",
  nezávazná_projekce: "non_binding_projection",
  nezavazna_projekce: "non_binding_projection",
  non_binding: "non_binding_projection",
  nezávazné: "non_binding_projection",
  // Status-like values that models sometimes return for active documents
  active: "final_contract",
  in_force: "final_contract",
  signed: "final_contract",
  platná: "final_contract",
  platna: "final_contract",
  aktuální: "final_contract",
  aktualni: "final_contract",
  // Additional Czech/short form aliases
  smlouva: "final_contract",
  finální_smlouva: "final_contract",
  final: "final_contract",
  confirmed: "confirmation",
  potvrzen: "confirmation",
  potvrzení: "confirmation",
  výpis: "statement",
  vypis: "statement",
  příloha: "annex",
  priloha: "annex",
  srovnání: "comparison",
  srovnani: "comparison",
  žádost_o_změnu: "policy_change_request",
  zadost_o_zmenu: "policy_change_request",
  změna: "policy_change_request",
  zmena: "policy_change_request",
  endorsement: "endorsement_request",
  výplatní_lístek: "payroll_statement",
  payroll: "payroll_statement",
  doklad_o_příjmu: "income_proof",
  income_proof_doc: "income_proof",
  daňové_přiznání: "tax_return",
  danove_priznani: "tax_return",
};

/** Czech/informal status strings the model may return → canonical enum values. */
const FIELD_STATUS_ALIASES: Record<string, string> = {
  nalezeno: "extracted",
  found: "extracted",
  filled: "extracted",
  set: "extracted",
  provided: "extracted",
  extracted_value: "extracted",
  extracted_field: "extracted",
  low_confidence: "inferred_low_confidence",
  inferred: "inferred_low_confidence",
  odvozeno: "inferred_low_confidence",
  chybí: "missing",
  chybi: "missing",
  not_present: "missing",
  nenalezeno: "not_found",
  not_available: "not_found",
  neuvedeno: "not_found",
  neuveden: "not_found",
  not_applicable_value: "not_applicable",
  n_a: "not_applicable",
  "n/a": "not_applicable",
  neaplikovatelné: "not_applicable",
  neaplikovatelne: "not_applicable",
  not_selected: "explicitly_not_selected",
  nevybráno: "explicitly_not_selected",
  nevybrano: "explicitly_not_selected",
};

export type EnvelopeCoerceMode = "light" | "aggressive";

export type CoerceEnvelopeOptions = {
  mode: EnvelopeCoerceMode;
  /** When set and valid, used to fix or align documentClassification.primaryType. */
  expectedPrimaryType?: string;
};

function deepCloneJson<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * Returns a cloned object with documentClassification coerced. Non-objects are returned as-is.
 */
export function coerceReviewEnvelopeParsedJson(input: unknown, options: CoerceEnvelopeOptions): unknown {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }
  const root = deepCloneJson(input) as Record<string, unknown>;
  const dcIn = root.documentClassification;
  if (!dcIn || typeof dcIn !== "object" || Array.isArray(dcIn)) {
    // Create a minimal documentClassification when missing/invalid
    root.documentClassification = {
      primaryType: (options.expectedPrimaryType && PRIMARY_SET.has(options.expectedPrimaryType))
        ? options.expectedPrimaryType
        : "unsupported_or_unknown",
      lifecycleStatus: "unknown",
      documentIntent: "reference_only",
      confidence: 0.5,
      reasons: [],
    };
    // Still fix documentMeta before returning — do NOT early-return here
    // Fall through to documentMeta fix below, then return root.
    const dmInEarly = root.documentMeta;
    if (!dmInEarly || typeof dmInEarly !== "object" || Array.isArray(dmInEarly)) {
      root.documentMeta = { scannedVsDigital: "unknown" };
    }
    return root;
  }
  const dc = { ...(dcIn as Record<string, unknown>) };
  const exp = options.expectedPrimaryType;

  // Model sometimes emits classification fields at the top level instead of nested in documentClassification,
  // or uses alternative key names (type / documentType) inside documentClassification.
  if (dc.primaryType == null) {
    dc.primaryType =
      dc.type ??
      dc.documentType ??        // model uses "documentType" key inside documentClassification
      dc.doc_type ??
      root.primaryType ??
      root.documentType ??
      root.type ??
      root.docType ??
      root.document_type;
  }
  if (dc.lifecycleStatus == null) {
    dc.lifecycleStatus = root.lifecycleStatus ?? root.lifecycle_status;
  }
  if (dc.documentIntent == null) {
    dc.documentIntent = root.documentIntent ?? root.document_intent;
  }
  if (dc.confidence == null) {
    dc.confidence = root.confidence ?? root.classificationConfidence;
  }
  if (dc.reasons == null || (Array.isArray(dc.reasons) && dc.reasons.length === 0)) {
    if (root.reasons != null) dc.reasons = root.reasons;
  }

  const normalizePrimaryType = (raw: unknown): string | null => {
    if (typeof raw !== "string" || !raw.trim()) return null;
    const trimmed = raw.trim();
    if (PRIMARY_SET.has(trimmed)) return trimmed;
    const normalized = trimmed.toLowerCase().replace(/[\s\-\/,;:]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
    if (PRIMARY_SET.has(normalized)) return normalized;
    const aliased = PRIMARY_TYPE_ALIASES[normalized] ?? PRIMARY_TYPE_ALIASES[normalized.replace(/_/g, "")] ?? PRIMARY_TYPE_ALIASES[trimmed.toLowerCase()];
    if (aliased && PRIMARY_SET.has(aliased)) return aliased;
    // Substring match: find a canonical type that is contained in the raw value or vice versa
    for (const candidate of PRIMARY_DOCUMENT_TYPES) {
      if (candidate === "unsupported_or_unknown") continue;
      if (normalized.includes(candidate) || candidate.includes(normalized)) return candidate;
    }
    // Keyword-based fuzzy match for common Czech long-form descriptions.
    // Strip diacritics for easier matching.
    const lower = normalized;
    const ascii = lower
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9_]/g, "_");
    const hasKw = (...kws: string[]) => kws.some((kw) => lower.includes(kw) || ascii.includes(kw));
    if (hasKw("zivotni", "zivotního", "pojistna_smlouva", "pojistne_smlouvy", "pojisteni") || lower.includes("životní") || lower.includes("pojistná")) {
      if (hasKw("dodatek", "zmena", "zmen", "servis", "change")) return "insurance_policy_change_or_service_doc";
      if (hasKw("investicni", "investicnich", "dip", "dps", "investicn")) return "life_insurance_investment_contract";
      if (hasKw("navrh", "nabidka", "offer", "nabidku", "uzavreni", "uzavreni_pojistne")) return "life_insurance_proposal";
      return "life_insurance_contract";
    }
    if (hasKw("uverova", "uver", "spotrebitelsky", "spotrebitelskem", "loan_contract", "loan_agreement", "loan", "credit_agreement", "smlouva_o_uveru")) return "consumer_loan_contract";
    if (hasKw("hypoteka", "hypotecni", "hypotecni", "mortgage")) return "mortgage_document";
    if (hasKw("pojisteni", "pojistna", "pojistne", "insurance", "pojistovaci")) {
      if (hasKw("odpoved", "majet", "vozidl", "ruceni", "podnikat", "nonlife", "nezivotn")) return "nonlife_insurance_contract";
      if (hasKw("navrh", "nabidka", "offer")) return "life_insurance_proposal";
      return "nonlife_insurance_contract";
    }
    if (hasKw("danove_priznani", "dan_z_prijmu", "dan_z_pr", "tax_return", "dppo", "dpfo", "dph")) return "corporate_tax_return";
    if (hasKw("vyplatni", "payslip", "pay_slip", "pay_stub", "mzda", "payroll", "vyplatni_listek")) return "payslip_document";
    if (hasKw("investicni_smlouva", "upis", "investment_subscription", "investicni_sluzb")) return "investment_subscription_document";
    if (hasKw("penzijni", "pension", "dps_smlouva", "pp_smlouva")) return "pension_contract";
    if (hasKw("smlouva_o_poskyto", "service_agreement", "sluzbach")) return "service_agreement";
    return null;
  };

  if (exp && PRIMARY_SET.has(exp)) {
    if (options.mode === "aggressive") {
      dc.primaryType = exp;
    } else {
      const resolved = normalizePrimaryType(dc.primaryType);
      if (!resolved) {
        dc.primaryType = exp;
      } else {
        dc.primaryType = resolved;
      }
    }
  } else {
    // Always try to normalize primaryType using aliases; fall back to unsupported only in aggressive mode
    const resolved = normalizePrimaryType(dc.primaryType);
    if (resolved) {
      dc.primaryType = resolved;
    } else if (options.mode === "aggressive") {
      dc.primaryType = "unsupported_or_unknown";
    }
    // In light mode without exp: leave as-is (will fail Zod if invalid, trigger aggressive)
  }

  if (dc.subtype === "" || dc.subtype === null) {
    delete dc.subtype;
  }

  const lcRaw = dc.lifecycleStatus;
  if (typeof lcRaw === "string") {
    const trimmed = lcRaw.trim();
    const normKey = trimmed.toLowerCase().replace(/\s+/g, "_");
    const aliased = LIFECYCLE_ALIASES[normKey];
    if (aliased && LIFECYCLE_SET.has(aliased)) {
      dc.lifecycleStatus = aliased;
    } else if (LIFECYCLE_SET.has(trimmed)) {
      dc.lifecycleStatus = trimmed;
    } else if (LIFECYCLE_SET.has(normKey)) {
      dc.lifecycleStatus = normKey;
    } else {
      dc.lifecycleStatus = "unknown";
    }
  } else {
    dc.lifecycleStatus = "unknown";
  }

  // Fix documentIntent enum — map common model-invented values to canonical
  const INTENT_ALIASES: Record<string, string> = {
    insurance: "creates_new_product",
    "create_product": "creates_new_product",
    "new_contract": "creates_new_product",
    "modification": "modifies_existing_product",
    "change": "modifies_existing_product",
    "support": "supports_underwriting_or_bonita",
    "income": "supports_income_verification",
    "income_verification": "supports_income_verification",
    "financial_analysis": "supports_financial_analysis",
    "illustrative": "illustrative_only",
    "reference": "reference_only",
    "manual": "manual_review_required",
  };
  if (dc.documentIntent == null || typeof dc.documentIntent !== "string" || !INTENT_SET.has(dc.documentIntent)) {
    const rawIntent = typeof dc.documentIntent === "string" ? dc.documentIntent.trim().toLowerCase().replace(/[\s-]/g, "_") : "";
    dc.documentIntent = (INTENT_ALIASES[rawIntent] ?? (INTENT_SET.has(rawIntent) ? rawIntent : "reference_only"));
  }

  // Ensure confidence is present and valid (required by Zod schema)
  if (dc.confidence == null || typeof dc.confidence !== "number" || !Number.isFinite(dc.confidence as number)) {
    dc.confidence = 0.5;
  } else {
    const rawConf = dc.confidence as number;
    dc.confidence = rawConf > 1 ? Math.min(1, rawConf / 100) : Math.max(0, Math.min(1, rawConf));
  }

  // Ensure reasons is an array (model sometimes returns a string)
  if (!Array.isArray(dc.reasons)) {
    dc.reasons = typeof dc.reasons === "string" && dc.reasons.trim()
      ? [dc.reasons]
      : [];
  }

  root.documentClassification = dc;

  const FIELD_STATUS_VALID = new Set(EXTRACTION_FIELD_STATUSES);

  // Normalize extractedFields: clamp confidence, fix status enum, add missing required fields
  const efIn = root.extractedFields;
  if (efIn && typeof efIn === "object" && !Array.isArray(efIn)) {
    const efOut: Record<string, unknown> = {};
    const ef = efIn as Record<string, unknown>;
    for (const [key, fieldVal] of Object.entries(ef)) {
      if (fieldVal == null) continue;
      if (typeof fieldVal !== "object" || Array.isArray(fieldVal)) {
        // Scalar value — wrap it
        efOut[key] = { value: fieldVal, status: "inferred_low_confidence", confidence: 0.45 };
        continue;
      }
      const rawObj = fieldVal as Record<string, unknown>;
      // Detect "nested data object" pattern: model emitted { fullName: "...", birthDate: "..." }
      // instead of { value: "...", status: "extracted", confidence: 0.9 }
      // Heuristic: if the object has NO "value" key AND has no "status" key but has other non-standard keys,
      // treat the whole object as the value.
      const hasValueKey = "value" in rawObj;
      const hasStatusKey = "status" in rawObj;
      const isNestedDataObject = !hasValueKey && !hasStatusKey && Object.keys(rawObj).length > 0;
      let fObj: Record<string, unknown>;
      if (isNestedDataObject) {
        // Wrap nested object as value; also try to extract a "primary" scalar value if possible.
        // Hoist canonical sub-fields (insurer, contractNumber, etc.) to the top-level extractedFields.
        const nestedEntriesToHoist: [string, unknown][] = [];
        const CANONICAL_NESTED_KEYS = new Set([
          "insurer", "fullName", "contractNumber", "proposalNumber", "totalMonthlyPremium",
          "annualPremium", "bankAccount", "variableSymbol", "productName", "lender",
          "borrowerName", "loanAmount", "installmentAmount", "institutionName",
        ]);
        for (const [nestedKey, nestedVal] of Object.entries(rawObj)) {
          if (CANONICAL_NESTED_KEYS.has(nestedKey) && (typeof nestedVal === "string" || typeof nestedVal === "number")) {
            nestedEntriesToHoist.push([nestedKey, nestedVal]);
          }
        }
        // After main loop, these will be added as canonical extracted fields (see below)
        (efOut as Record<string, unknown>).__pendingHoists = (efOut as Record<string, unknown>).__pendingHoists
          ? [...((efOut as Record<string, unknown>).__pendingHoists as unknown[]), ...nestedEntriesToHoist]
          : nestedEntriesToHoist;

        const primaryScalar = rawObj.fullName ?? rawObj.name ?? rawObj.value ?? rawObj.amount ?? rawObj.number ?? rawObj.contractNumber ?? rawObj.insurer;
        fObj = {
          value: typeof primaryScalar === "string" || typeof primaryScalar === "number" ? primaryScalar : rawObj,
          status: "inferred_low_confidence",
          confidence: 0.5,
          evidenceSnippet: JSON.stringify(rawObj).slice(0, 400),
        };
      } else {
        fObj = { ...rawObj };
      }
      // Fix confidence
      if (typeof fObj.confidence === "number" && Number.isFinite(fObj.confidence)) {
        if (fObj.confidence > 1) {
          fObj.confidence = Math.min(1, fObj.confidence / 100);
        } else if (fObj.confidence < 0) {
          fObj.confidence = 0;
        }
      } else if (fObj.confidence == null) {
        fObj.confidence = 0.5;
      }
      // Fix status enum — try alias map first, then fallback
      const st = fObj.status;
      if (typeof st === "string" && !FIELD_STATUS_VALID.has(st as (typeof EXTRACTION_FIELD_STATUSES)[number])) {
        const normSt = st.trim().toLowerCase().replace(/[\s-]/g, "_");
        const aliasedSt = FIELD_STATUS_ALIASES[normSt] ?? FIELD_STATUS_ALIASES[st.trim().toLowerCase()];
        fObj.status = (aliasedSt && FIELD_STATUS_VALID.has(aliasedSt as (typeof EXTRACTION_FIELD_STATUSES)[number]))
          ? aliasedSt
          : "inferred_low_confidence";
      } else if (typeof st !== "string") {
        fObj.status = "inferred_low_confidence";
      }
      // Normalize sourcePage: must be positive int or absent
      if ("sourcePage" in fObj) {
        const sp = fObj.sourcePage;
        if (sp == null || !Number.isFinite(sp as number) || (sp as number) < 1) {
          delete fObj.sourcePage;
        } else {
          fObj.sourcePage = Math.floor(sp as number);
        }
      }
      // Ensure value is present (even if null)
      if (!("value" in fObj)) {
        fObj.value = null;
      }
      efOut[key] = fObj;
    }
    // Apply pending hoists from nested data objects
    const pendingHoists = efOut.__pendingHoists as [string, unknown][] | undefined;
    delete efOut.__pendingHoists;
    if (pendingHoists) {
      for (const [hoistKey, hoistVal] of pendingHoists) {
        if (!(hoistKey in efOut) || (efOut[hoistKey] as Record<string, unknown> | undefined)?.value == null) {
          efOut[hoistKey] = {
            value: hoistVal,
            status: "inferred_low_confidence",
            confidence: 0.5,
          };
        }
      }
    }
    root.extractedFields = efOut;
  }

  // Fix documentMeta: must always be a valid object. Non-object values (string, number, null) become safe defaults.
  const dmIn = root.documentMeta;
  if (dmIn && typeof dmIn === "object" && !Array.isArray(dmIn)) {
    const dm = { ...(dmIn as Record<string, unknown>) };
    const svd = dm.scannedVsDigital;
    if (typeof svd !== "string" || !SCANNED_VS_DIGITAL_VALUES.has(svd)) {
      dm.scannedVsDigital = "unknown";
    }
    // Clamp overallConfidence to [0, 1]
    if (typeof dm.overallConfidence === "number") {
      dm.overallConfidence =
        dm.overallConfidence > 1
          ? Math.min(1, dm.overallConfidence / 100)
          : Math.max(0, Math.min(1, dm.overallConfidence));
    }
    // pageCount must be a positive integer — remove if invalid
    if ("pageCount" in dm) {
      const pc = dm.pageCount;
      if (pc == null || !Number.isFinite(pc as number) || (pc as number) < 1) {
        delete dm.pageCount;
      } else {
        dm.pageCount = Math.floor(pc as number);
      }
    }
    root.documentMeta = dm;
  } else {
    // documentMeta is missing, null, string, or any non-object — always provide minimal valid shape
    // This covers cases where LLM returns documentMeta as a string or omits it entirely
    root.documentMeta = { scannedVsDigital: "unknown" };
  }

  // Fix sectionSensitivity — remove unknown profile values that would fail the enum
  const SENSITIVITY_VALID = new Set(["standard_personal_data","financial_data","financial_data_high","health_data","special_category_data","identity_document_data","mixed_sensitive_document","high_sensitivity_scan"]);
  if (root.sectionSensitivity && typeof root.sectionSensitivity === "object" && !Array.isArray(root.sectionSensitivity)) {
    const ss = root.sectionSensitivity as Record<string, unknown>;
    const ssOut: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(ss)) {
      if (typeof v === "string" && SENSITIVITY_VALID.has(v)) {
        ssOut[k] = v;
      }
      // Drop invalid values — schema has .default({}) so missing keys are fine
    }
    root.sectionSensitivity = ssOut;
  } else if (root.sectionSensitivity != null && (typeof root.sectionSensitivity !== "object" || Array.isArray(root.sectionSensitivity))) {
    root.sectionSensitivity = {};
  }

  // Fix suggestedActions — model sometimes returns an object instead of array; always coerce to valid array
  if (!Array.isArray(root.suggestedActions)) {
    root.suggestedActions = [];
  } else {
    // Ensure each action has required type and label fields
    root.suggestedActions = (root.suggestedActions as unknown[])
      .filter((v): v is Record<string, unknown> => v != null && typeof v === "object" && !Array.isArray(v))
      .map((v) => ({
        ...v,
        type: typeof v.type === "string" && v.type ? v.type : "review",
        label: typeof v.label === "string" && v.label ? v.label : String(v.type ?? "action"),
      }));
  }

  // Fix reviewWarnings — model sometimes returns an object instead of array
  if (root.reviewWarnings != null && !Array.isArray(root.reviewWarnings)) {
    if (typeof root.reviewWarnings === "object") {
      root.reviewWarnings = [];
    }
  }

  // Fix parties — model sometimes returns an array instead of record
  if (Array.isArray(root.parties)) {
    // Convert array of party objects to a record keyed by role or index
    const partiesArr = root.parties as Record<string, unknown>[];
    const partiesRecord: Record<string, unknown> = {};
    for (let i = 0; i < partiesArr.length; i++) {
      const p = partiesArr[i];
      if (p && typeof p === "object") {
        const role = typeof p.role === "string" ? p.role : `party_${i}`;
        partiesRecord[role] = p;
      }
    }
    root.parties = partiesRecord;
  } else if (root.parties != null && typeof root.parties !== "object") {
    root.parties = {};
  }

  // Fix productsOrObligations — must be array
  if (root.productsOrObligations != null && !Array.isArray(root.productsOrObligations)) {
    root.productsOrObligations = [];
  }

  // Fix evidence — must be array
  if (root.evidence != null && !Array.isArray(root.evidence)) {
    root.evidence = [];
  }

  return root;
}

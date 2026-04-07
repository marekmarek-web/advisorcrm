/**
 * Field-level evidence tagging and source priority enforcement.
 *
 * After the LLM extracts raw fields and alias normalization runs, this pass:
 * 1. Tags each key field with evidenceTier + sourceKind based on heuristics.
 * 2. Enforces hard binding rules (client NOT from insurer header, etc.).
 * 3. Resolves name deduplication (fullName vs firstName/lastName).
 * 4. Prevents explicit fields from being overwritten by inferred ones.
 *
 * Reuse-first: operates on the existing extractedFields record in-place.
 */

import type { DocumentReviewEnvelope, ExtractedField, EvidenceTier, SourceKind } from "./document-review-types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isPresent(f: ExtractedField | undefined): boolean {
  if (!f) return false;
  const v = f.value;
  if (v == null) return false;
  const s = String(v).trim();
  return s !== "" && s !== "—" && s !== "null" && f.status !== "missing" && f.status !== "not_found" && f.status !== "not_applicable";
}

function isExplicit(tier: EvidenceTier | undefined): boolean {
  return tier === "explicit_labeled_field" || tier === "explicit_table_field" || tier === "explicit_section_block";
}

function tagField(
  ef: Record<string, ExtractedField | undefined>,
  key: string,
  tier: EvidenceTier,
  kind: SourceKind,
  label?: string,
): void {
  const f = ef[key];
  if (!f) return;
  // Don't downgrade an already-explicit field to a weaker tier
  if (isExplicit(f.evidenceTier) && !isExplicit(tier)) return;
  ef[key] = { ...f, evidenceTier: tier, sourceKind: kind, ...(label ? { sourceLabel: label } : {}) };
}

function setMissingTag(
  ef: Record<string, ExtractedField | undefined>,
  key: string,
): void {
  const f = ef[key];
  if (!f) return;
  if (!f.evidenceTier) {
    ef[key] = { ...f, evidenceTier: "missing" };
  }
}

// ─── Heuristic tier detection from LLM-set status ────────────────────────────

/**
 * Map the LLM-provided status to a default evidence tier when the field has no tier yet.
 * The LLM sometimes signals confidence through status — we respect that.
 */
function defaultTierFromStatus(f: ExtractedField): EvidenceTier {
  if (f.status === "missing" || f.status === "not_found" || f.status === "not_applicable") {
    return "missing";
  }
  if (f.status === "inferred_low_confidence") {
    return "model_inference_only";
  }
  // extracted / explicitly_not_selected / unknown → treat as explicit if it has a snippet
  if (f.evidenceSnippet && f.evidenceSnippet.length > 0) {
    return "explicit_labeled_field";
  }
  return "explicit_labeled_field";
}

// ─── Source priority rule sets ────────────────────────────────────────────────

/**
 * CLIENT FIELDS — must come from client/policyholder/borrower/investor blocks.
 * These fields must NEVER be sourced from insurer/bank/provider headers.
 */
const CLIENT_IDENTITY_FIELDS = new Set([
  "fullName", "firstName", "lastName",
  "birthDate", "personalId", "address", "permanentAddress",
  "phone", "email", "occupation",
  "clientFullName", "borrowerName", "investorFullName",
  "policyholderName", "customerName",
]);

/**
 * INSTITUTION FIELDS — must come from provider/insurer/bank headers.
 * These must NEVER contain client/person data.
 */
const INSTITUTION_FIELDS = new Set([
  "insurer", "lender", "financingProvider", "institutionName",
  "bank", "provider", "bankName",
]);

/**
 * INTERMEDIARY FIELDS — must come from intermediary/broker blocks.
 * NEVER from signature blocks of the institution.
 */
const INTERMEDIARY_FIELDS = new Set([
  "intermediaryName", "intermediaryCode", "intermediaryCompany",
  "advisorName", "brokerName",
]);

/**
 * PAYMENT FIELDS — should come from payment tables.
 */
const PAYMENT_FIELDS = new Set([
  "bankAccount", "variableSymbol", "iban", "bankCode", "accountForRepayment",
  "paymentFrequency", "totalMonthlyPremium", "annualPremium",
  "installmentAmount", "monthlyInstallment", "riskPremium", "investmentPremium",
  "payoutAccount", "paymentAccountNumber",
]);

/**
 * CONTRACT NUMBER FIELDS — explicit labeled fields only.
 */
const CONTRACT_NUMBER_FIELDS = new Set([
  "contractNumber", "proposalNumber", "policyNumber", "existingPolicyNumber",
]);

// ─── Suspicious institution-name patterns ────────────────────────────────────

const INSTITUTION_PATTERNS = [
  /generali/i, /uniqa/i, /kooperativa/i, /\bnn\b/i, /allianz/i, /česká pojišťovna/i,
  /ergo/i, /metlife/i, /pillow/i, /axa/i, /zurich/i, /direct/i,
  /raiffeisenbank/i, /čsob/i, /moneta/i, /komerční banka/i, /unicredit/i,
  /česká spořitelna/i, /air bank/i, /fio banka/i, /oberbank/i,
  /čsob leasing/i, /s morava leasing/i, /sgef/i,
  /česká republika/i, /finanční správa/i,
];

function looksLikeInstitution(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim();
  return INSTITUTION_PATTERNS.some((p) => p.test(v));
}

// ─── Main pass: tag evidence and enforce source priority ─────────────────────

export function applyFieldSourcePriorityAndEvidence(env: DocumentReviewEnvelope): void {
  const ef = env.extractedFields as Record<string, ExtractedField | undefined>;

  // Step 1: Assign default evidenceTier to all fields that have no tier yet
  for (const [key, f] of Object.entries(ef)) {
    if (!f) continue;
    if (!f.evidenceTier) {
      const tier = defaultTierFromStatus(f);
      ef[key] = { ...f, evidenceTier: tier };
    }
  }

  // Step 2: Tag institution fields
  for (const key of INSTITUTION_FIELDS) {
    const f = ef[key];
    if (isPresent(f)) {
      tagField(ef, key, "explicit_section_block", "provider_header");
    }
  }

  // Step 3: Tag payment fields
  for (const key of PAYMENT_FIELDS) {
    const f = ef[key];
    if (isPresent(f)) {
      // Only tag if not already explicitly tagged stronger
      if (!f?.evidenceTier || f.evidenceTier === "model_inference_only" || f.evidenceTier === "missing") {
        tagField(ef, key, "explicit_table_field", "payment_block", "Platební instrukce");
      }
    }
  }

  // Step 4: Tag contract number fields as explicit
  for (const key of CONTRACT_NUMBER_FIELDS) {
    const f = ef[key];
    if (isPresent(f) && (!f?.evidenceTier || f.evidenceTier === "model_inference_only")) {
      tagField(ef, key, "explicit_labeled_field", "contract_block", "Číslo smlouvy");
    }
  }

  // Step 5: Tag intermediary fields
  for (const key of INTERMEDIARY_FIELDS) {
    const f = ef[key];
    if (isPresent(f) && (!f?.evidenceTier || f.evidenceTier === "model_inference_only")) {
      tagField(ef, key, "explicit_section_block", "intermediary_block", "Zprostředkovatel");
    }
  }

  // Step 6: Enforce CLIENT fields — detect and warn if value looks like an institution
  for (const key of CLIENT_IDENTITY_FIELDS) {
    const f = ef[key];
    if (!isPresent(f)) continue;
    if (looksLikeInstitution(f?.value)) {
      // Poison field: client field contains institution name → clear it and warn
      const snippet = typeof f?.value === "string" ? f.value.slice(0, 80) : "";
      ef[key] = {
        value: null,
        status: "missing",
        evidenceTier: "missing",
        sourceKind: "insurer_header",
        evidenceSnippet: `[source_priority_violation] Hodnota "${snippet}" vypadá jako instituce, ne klient. Pole vynulováno.`,
      };
      // Push a review warning
      env.reviewWarnings = env.reviewWarnings ?? [];
      const alreadyWarned = env.reviewWarnings.some((w) => w.code === "client_field_institution_value" && w.field === key);
      if (!alreadyWarned) {
        env.reviewWarnings.push({
          code: "client_field_institution_value",
          message: `Pole "${key}" obsahovalo hodnotu vypadající jako instituce ("${snippet}"), nikoli klientská data. Pole bylo vynulováno.`,
          field: key,
          severity: "warning",
        });
      }
    } else {
      // Tag as client block if not already tagged more specifically
      const f2 = ef[key];
      if (f2 && (!f2.sourceKind || f2.sourceKind === "unknown")) {
        tagField(ef, key, f2.evidenceTier ?? "explicit_section_block", "client_block", "Klient / Pojistník");
      }
    }
  }

  // Step 7: Enforce INTERMEDIARY — must not come from signature/institution block
  // (We can't fully detect this post-extraction, but we can add a warning if the value
  //  matches an institution name pattern)
  for (const key of INTERMEDIARY_FIELDS) {
    const f = ef[key];
    if (!isPresent(f)) continue;
    if (looksLikeInstitution(f?.value)) {
      env.reviewWarnings = env.reviewWarnings ?? [];
      const alreadyWarned = env.reviewWarnings.some((w) => w.code === "intermediary_institution_value" && w.field === key);
      if (!alreadyWarned) {
        const snippet = typeof f?.value === "string" ? f.value.slice(0, 80) : "";
        env.reviewWarnings.push({
          code: "intermediary_institution_value",
          message: `Pole "${key}" obsahuje hodnotu vypadající jako instituce ("${snippet}"). Zprostředkovatel by měl pocházet z bloku Zprostředkovatel, ne ze signatářů instituce.`,
          field: key,
          severity: "warning",
        });
        // Tag as suspicious but don't clear — could be legitimate in some edge cases
        ef[key] = { ...f!, evidenceTier: "model_inference_only", sourceKind: "signature_block" };
      }
    }
  }

  // Step 8: Name deduplication — ensure fullName is not duplicated via firstName+lastName
  resolveNameFields(ef);

  // Step 9: Tag parties-sourced fields
  tagFromParties(env, ef);
}

// ─── Name deduplication ───────────────────────────────────────────────────────

function resolveNameFields(ef: Record<string, ExtractedField | undefined>): void {
  const fullNameField = ef["fullName"];
  const firstNameField = ef["firstName"];
  const lastNameField = ef["lastName"];

  const hasFullName = isPresent(fullNameField);
  const hasFirstName = isPresent(firstNameField);
  const hasLastName = isPresent(lastNameField);

  if (hasFullName) {
    const fullVal = String(fullNameField!.value ?? "").trim();

    // If fullName already contains both first and last name (≥2 words), and firstName/lastName
    // are just splits of it, remove the split names to avoid duplication
    if (hasFirstName && hasLastName) {
      const firstVal = String(firstNameField!.value ?? "").trim();
      const lastVal = String(lastNameField!.value ?? "").trim();
      const reconstructed = `${firstVal} ${lastVal}`.trim();
      if (reconstructed.toLowerCase() === fullVal.toLowerCase() ||
          fullVal.toLowerCase().includes(firstVal.toLowerCase()) && fullVal.toLowerCase().includes(lastVal.toLowerCase())) {
        // Splits are redundant duplicates of fullName — mark as pipeline_normalized
        ef["firstName"] = { ...firstNameField!, evidenceTier: "local_inference", sourceKind: "pipeline_normalized", sourceLabel: "odvozeno z fullName" };
        ef["lastName"] = { ...lastNameField!, evidenceTier: "local_inference", sourceKind: "pipeline_normalized", sourceLabel: "odvozeno z fullName" };
      }
    }

    // If only firstName without lastName (or vice versa), try to safely split fullName
    if (!hasFirstName && !hasLastName && fullVal.includes(" ")) {
      const parts = fullVal.split(/\s+/);
      if (parts.length === 2) {
        ef["firstName"] = {
          value: parts[0],
          status: "extracted",
          evidenceTier: "local_inference",
          sourceKind: "pipeline_normalized",
          sourceLabel: "odvozeno z fullName",
          confidence: 0.75,
        };
        ef["lastName"] = {
          value: parts[1],
          status: "extracted",
          evidenceTier: "local_inference",
          sourceKind: "pipeline_normalized",
          sourceLabel: "odvozeno z fullName",
          confidence: 0.75,
        };
      }
      // 3+ word names: don't split — too risky (middle names, double surnames)
    }

    // Tag fullName as explicit client block if not already tagged
    if (!fullNameField!.evidenceTier || fullNameField!.evidenceTier === "model_inference_only") {
      tagField(ef, "fullName", "explicit_section_block", "client_block", "Klient / Pojistník");
    }
  } else if (hasFirstName && hasLastName) {
    // Synthesize fullName from parts
    const firstVal = String(firstNameField!.value ?? "").trim();
    const lastVal = String(lastNameField!.value ?? "").trim();
    const synthesized = `${firstVal} ${lastVal}`.trim();
    if (synthesized && !looksLikeInstitution(synthesized)) {
      ef["fullName"] = {
        value: synthesized,
        status: "extracted",
        evidenceTier: "local_inference",
        sourceKind: "pipeline_normalized",
        sourceLabel: "sestaveno z firstName + lastName",
        confidence: 0.80,
      };
    }
  }
}

// ─── Party record → extractedFields enrichment ───────────────────────────────

/**
 * If envelope.parties has a policyholder/client/borrower/investor entry with fullName,
 * and the extractedFields fullName is missing/weaker, copy it with proper source tagging.
 */
function tagFromParties(env: DocumentReviewEnvelope, ef: Record<string, ExtractedField | undefined>): void {
  const parties = env.parties;
  if (!parties || typeof parties !== "object") return;

  // parties can be array or record keyed by role
  const partyList: Array<Record<string, unknown>> = Array.isArray(parties)
    ? (parties as Array<Record<string, unknown>>)
    : Object.values(parties).filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null);

  const CLIENT_ROLES = new Set(["policyholder", "client", "borrower", "owner", "investor", "insured", "customer"]);

  for (const party of partyList) {
    const role = typeof party.role === "string" ? party.role.toLowerCase() : "";
    if (!CLIENT_ROLES.has(role)) continue;

    const partyFullName = typeof party.fullName === "string" ? party.fullName.trim() :
      typeof party.name === "string" ? party.name.trim() : null;
    if (!partyFullName || looksLikeInstitution(partyFullName)) continue;

    const existingFullName = ef["fullName"];
    const shouldEnrich = !isPresent(existingFullName) ||
      (!isExplicit(existingFullName?.evidenceTier) && isPresent({ value: partyFullName, status: "extracted" } as ExtractedField));

    if (shouldEnrich) {
      const sourceKind: SourceKind =
        role === "policyholder" ? "policyholder_block" :
        role === "borrower" ? "borrower_block" :
        role === "investor" ? "investor_block" :
        "client_block";
      ef["fullName"] = {
        value: partyFullName,
        status: "extracted",
        evidenceTier: "explicit_section_block",
        sourceKind,
        sourceLabel: `z účastníků (role: ${role})`,
        confidence: 0.88,
      };
    }

    // Also enrich birthDate / personalId from party if missing in ef
    for (const fieldKey of ["birthDate", "personalId", "address", "phone", "email"] as const) {
      const partyVal = party[fieldKey];
      if (typeof partyVal === "string" && partyVal.trim() && !isPresent(ef[fieldKey])) {
        ef[fieldKey] = {
          value: partyVal.trim(),
          status: "extracted",
          evidenceTier: "explicit_section_block",
          sourceKind: "parties_record",
          sourceLabel: `z účastníků (role: ${role})`,
          confidence: 0.85,
        };
      }
    }
  }
}

// ─── Evidence summary for trace/debug ────────────────────────────────────────

export type FieldEvidenceSummary = {
  key: string;
  evidenceTier: EvidenceTier | undefined;
  sourceKind: SourceKind | undefined;
  sourceLabel: string | undefined;
  displayStatus: "Nalezeno" | "Odvozeno" | "Chybí";
  displaySource: string;
};

export function buildFieldEvidenceSummaries(env: DocumentReviewEnvelope): FieldEvidenceSummary[] {
  const ef = env.extractedFields as Record<string, ExtractedField | undefined>;

  return Object.entries(ef)
    .filter(([, f]) => f != null)
    .map(([key, f]) => ({
      key,
      evidenceTier: f!.evidenceTier,
      sourceKind: f!.sourceKind,
      sourceLabel: f!.sourceLabel,
      displayStatus: getDisplayStatus(f!.evidenceTier),
      displaySource: f!.sourceLabel ?? getDisplaySource(f!.sourceKind),
    }));
}

function getDisplayStatus(tier: EvidenceTier | undefined): "Nalezeno" | "Odvozeno" | "Chybí" {
  if (!tier || tier === "missing") return "Chybí";
  if (
    tier === "explicit_labeled_field" ||
    tier === "explicit_table_field" ||
    tier === "explicit_section_block" ||
    tier === "normalized_alias_match"
  ) return "Nalezeno";
  return "Odvozeno";
}

function getDisplaySource(kind: SourceKind | undefined): string {
  if (!kind) return "";
  const MAP: Record<SourceKind, string> = {
    client_block: "z bloku Klient",
    policyholder_block: "z bloku Pojistník",
    borrower_block: "z bloku Dlužník",
    owner_block: "z bloku Vlastník",
    investor_block: "z bloku Investor",
    intermediary_block: "z bloku Zprostředkovatel",
    insurer_header: "z hlavičky pojišťovny",
    bank_header: "z hlavičky banky",
    provider_header: "z hlavičky poskytovatele",
    signature_block: "z podpisového bloku",
    payment_block: "z tabulky plateb",
    product_block: "z produktového bloku",
    contract_block: "ze smluvní tabulky",
    health_block: "ze zdravotního dotazníku",
    aml_block: "z AML přílohy",
    attachment_block: "z přílohy",
    parties_record: "ze seznamu účastníků",
    pipeline_normalized: "odvozeno z kontextu",
    unknown: "",
  };
  return MAP[kind] ?? "";
}

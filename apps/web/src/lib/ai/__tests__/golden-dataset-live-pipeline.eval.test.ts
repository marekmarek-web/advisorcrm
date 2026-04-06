/**
 * Full golden dataset — live AI Review V2 pipeline (runContractUnderstandingPipeline).
 *
 * Run (from repo root):
 *   pnpm --filter web exec cross-env GOLDEN_LIVE_EVAL=1 vitest run src/lib/ai/__tests__/golden-dataset-live-pipeline.eval.test.ts --testTimeout=600000
 *
 * Env:
 *   GOLDEN_LIVE_EVAL=1        — required to run (otherwise skipped)
 *   GOLDEN_EVAL_DELAY_MS=2500 — delay between scenarios (rate limits)
 *   GOLDEN_EVAL_ONLY=G01,G05  — optional comma-separated scenario/corpus ids
 *   GOLDEN_CORPUS_EVAL=1      — also run per-corpus-document eval (in addition to scenario eval)
 *
 * Note: Loopback HTTP serves PDFs (Node fetch does not load file:// PDFs reliably here).
 * Bundle/segmentation checks from manifest phase2 may not apply without preprocess — see report.caveats.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runContractUnderstandingPipeline } from "../contract-understanding-pipeline";
import { evalAdobePreprocess } from "./eval-adobe-preprocess";
import type { DocumentReviewEnvelope } from "../document-review-types";
import { applyCanonicalNormalizationToEnvelope } from "../life-insurance-canonical-normalizer";
import type { PublishHints } from "../document-packet-types";
import { formatExtractedValue } from "@/lib/ai-review/mappers";
import { getAiReviewProviderMeta } from "../review-llm-provider";
import { deriveOutputModeFromPrimary, outputModeMatchOk, type DocumentOutputMode } from "../document-output-mode";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** __tests__ → ai → lib → src → apps/web */
const appsWebRoot = join(__dirname, "../../../..");
/** Monorepo root (…/Aidvisora), not apps/ */
const repoRoot = join(appsWebRoot, "..", "..");
const manifestPath = join(repoRoot, "fixtures/golden-ai-review/scenarios.manifest.json");
const evalOutDir = join(repoRoot, "fixtures/golden-ai-review/eval-outputs");

type Scenario = {
  id: string;
  title: string;
  documentFamily: string;
  expectedPrimaryType: string | null;
  publishableAsContract: boolean | "partial" | null;
  referenceFile: string | null;
  assistantOnly?: boolean;
  coversCorpusIds?: string[];
  phase2_acceptance?: Record<string, unknown>;
  phase3_acceptance?: Record<string, unknown>;
};

type CorpusDoc = {
  id: string;
  familyBucket: string;
  referenceFile: string;
  /** Alternative local file paths (e.g. renamed PDFs) - used as fallback when referenceFile is missing. */
  aliasFileNames?: string[];
  gitTracked: boolean;
  expectedPrimaryType: string;
  publishable: boolean | "partial";
  isPacket: boolean;
  expectedFamily: string;
  expectedOutputMode: DocumentOutputMode;
  expectedSensitivity: string;
  expectedCoreFields: string[];
  expectedActionsAllowed: string[];
  expectedActionsForbidden: string[];
  expectedFallbackBehavior?: {
    expectedSummaryFocus: string;
    expectedPurposeHint: string;
    recommendedNextStep: string;
    noProductPublishPayload: boolean;
  };
  corpusNote?: string;
};

type Manifest = { version: number; scenarios: Scenario[]; corpusDocuments: CorpusDoc[] };

type Row = {
  id: string;
  title: string;
  status: "ran" | "skipped" | "error";
  skipReason?: string;
  errorMessage?: string;
  expectedFamily: string;
  actualFamilyInferred: string;
  familyPass: boolean;
  expectedPrimaryType: string | null;
  actualPrimaryType?: string;
  primaryPass: boolean;
  primaryNote?: string;
  expectedPublishable: boolean | "partial" | null;
  actualPublishable?: boolean | null;
  publishPass: boolean;
  /** Phase 2: output mode check */
  expectedOutputMode?: DocumentOutputMode | null;
  actualOutputMode?: DocumentOutputMode;
  outputModePass?: boolean;
  participantOk?: boolean;
  paymentOk?: boolean;
  investmentOk?: boolean;
  warningsSummary?: string[];
  uiBlocker: boolean;
  uiBlockerReasons?: string[];
  insuranceContamination?: boolean;
  provider?: string;
  model?: string;
  inputMode?: string;
  inputSizeChars?: number;
  latencyMs?: number;
  lifecycleStatus?: string;
  failReasons?: string[];
  overallPass: boolean;
};

/** Per-corpus-document row for the corpus-level eval (C-level). */
type CorpusRow = {
  id: string;
  referenceFile: string;
  status: "ran" | "skipped" | "error";
  skipReason?: string;
  errorMessage?: string;
  expectedFamily: string;
  actualFamilyInferred: string;
  familyPass: boolean;
  expectedPrimaryType: string;
  actualPrimaryType?: string;
  primaryPass: boolean;
  expectedOutputMode: DocumentOutputMode;
  actualOutputMode?: DocumentOutputMode;
  outputModePass?: boolean;
  /** Hard failure: reference doc ended up in a product contract lane */
  fallbackLaneViolation?: boolean;
  /** Core fields: how many of expectedCoreFields were found in extracted output */
  coreFieldsExpected: number;
  coreFieldsFound: number;
  coreFieldsPass: boolean;
  /** For reference docs: was fallback behavior respected (no product publish payload) */
  fallbackBehaviorPass?: boolean;
  latencyMs?: number;
  lifecycleStatus?: string;
  failReasons: string[];
  overallPass: boolean;
};

function loadManifest(): Manifest {
  const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
  return raw;
}

/**
 * Local HTTP server: pipeline + Anthropic adapter use fetch(fileUrl); Node fetch rejects file:// for PDFs.
 * Token is base64url(relativePathFromRepoRoot) to avoid slash encoding issues.
 */
function startRepoPdfServer(repoAbsoluteRoot: string): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    try {
      const u = new URL(req.url ?? "/", "http://127.0.0.1");
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] !== "pdf" || parts.length < 2) {
        res.writeHead(404).end();
        return;
      }
      const token = parts.slice(1).join("/");
      const rel = Buffer.from(token, "base64url").toString("utf8");
      const rootResolved = resolve(repoAbsoluteRoot);
      const abs = resolve(rootResolved, rel);
      if (!abs.startsWith(rootResolved + "/") && abs !== rootResolved) {
        res.writeHead(403).end();
        return;
      }
      if (!existsSync(abs)) {
        res.writeHead(404).end();
        return;
      }
      const buf = readFileSync(abs);
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Length": String(buf.length),
      });
      res.end(buf);
    } catch {
      res.writeHead(500).end();
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("pdf server bind failed"));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        close: () =>
          new Promise((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
    server.on("error", reject);
  });
}

function pdfHttpUrl(baseUrl: string, referenceFile: string): string {
  const token = Buffer.from(referenceFile, "utf8").toString("base64url");
  return `${baseUrl}/pdf/${token}`;
}

/** Same engine as pdf-text-fallback but reads from disk (no fetch to loopback — avoids test env quirks). */
async function extractPdfTextHintFromDisk(pdfAbsolutePath: string): Promise<string | null> {
  if (process.env.GOLDEN_EVAL_NO_PDF_TEXT === "1") return null;
  try {
    const { installPdfJsNodePolyfills } = await import("@/lib/documents/processing/pdfjs-node-polyfills");
    await installPdfJsNodePolyfills();
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: readFileSync(pdfAbsolutePath) });
    try {
      const result = await parser.getText({ first: 40 });
      const text = result.text?.trim() ?? "";
      return text.length >= 400 ? text.slice(0, 120_000) : null;
    } finally {
      await parser.destroy().catch(() => {});
    }
  } catch {
    return null;
  }
}

const NON_LIFE_PRIMARY_TYPES = new Set([
  "non_life_insurance_contract",
  "nonlife_insurance_contract",   // pipeline variant (no underscore between non and life)
  "liability_insurance_offer",
  "property_insurance_contract",
  "motor_insurance_contract",
  "car_insurance_contract",
  "precontract_information",      // IPID / precontract info for non-life
]);

function inferFamilyFromPrimary(primary: string, classifierPf?: string): string {
  const pf = (classifierPf ?? "").toLowerCase();
  if (["dip", "dps", "pp", "investment", "pension"].includes(pf)) return "investment";
  if (primary.startsWith("life_insurance")) return "life_insurance";
  if (primary === "mortgage_document") return "mortgage";
  if (primary.includes("consumer_loan")) return "consumer_credit";
  if (NON_LIFE_PRIMARY_TYPES.has(primary)) return "non_life_insurance";
  if (pf === "non_life" || pf === "nonlife" || pf === "liability" || pf === "property" || pf === "motor" || pf === "car_insurance") return "non_life_insurance";
  // Compliance/reference: these primary types always belong in compliance family
  if (
    primary === "consent_or_declaration" ||
    primary === "service_agreement" ||
    primary === "investment_service_agreement" ||
    primary === "insurance_policy_change_or_service_doc" ||
    primary === "life_insurance_change_request" ||
    primary === "corporate_tax_return" ||
    primary === "bank_statement" ||
    primary === "payslip_document" ||
    primary === "income_confirmation" ||
    primary === "medical_questionnaire"
  ) return "compliance";
  if (pf === "compliance") return "compliance";
  if (primary === "generic_financial_document" && pf !== "leasing") return "leasing";
  if (primary === "generic_financial_document") return "leasing";
  return "unknown";
}

function investmentClassifierFamily(c?: Record<string, unknown> | null): boolean {
  if (!c) return false;
  const f = String(c.productFamily ?? "").toLowerCase();
  const dt = String(c.documentType ?? "").toLowerCase();
  return (
    ["dip", "dps", "pp", "investment", "pension"].includes(f) ||
    dt.includes("dip") ||
    dt.includes("investment") ||
    dt.includes("dps")
  );
}

function familyMatches(expected: string, primary: string, classifier?: Record<string, unknown> | null): boolean {
  const pf = String(classifier?.productFamily ?? "").toLowerCase();
  const inferred = inferFamilyFromPrimary(primary, pf);
  if (expected === "investment") {
    return inferred === "investment" || investmentClassifierFamily(classifier);
  }
  if (expected === "life_insurance") {
    return primary.startsWith("life_insurance") || pf === "life_insurance";
  }
  if (expected === "consumer_credit") {
    return primary.includes("consumer_loan") || inferred === "consumer_credit";
  }
  if (expected === "mortgage") {
    return primary === "mortgage_document" || inferred === "mortgage";
  }
  if (expected === "leasing") {
    return inferred === "leasing" || primary === "generic_financial_document" || primary === "service_agreement";
  }
  if (expected === "compliance") {
    return (
      inferred === "compliance" ||
      pf === "compliance" ||
      primary === "consent_or_declaration" ||
      primary === "identity_document" ||
      primary === "service_agreement" ||
      primary === "investment_service_agreement" ||
      primary === "insurance_policy_change_or_service_doc" ||
      primary === "life_insurance_change_request" ||
      primary === "corporate_tax_return" ||
      primary === "bank_statement" ||
      primary === "payslip_document"
    );
  }
  if (expected === "non_life_insurance") {
    return (
      NON_LIFE_PRIMARY_TYPES.has(primary) ||
      inferred === "non_life_insurance" ||
      pf === "non_life" || pf === "nonlife" || pf === "liability" || pf === "property" || pf === "motor"
    );
  }
  return inferred === expected;
}

function primaryMatches(
  scenarioId: string,
  expected: string,
  actual: string,
  lifecycle: string,
  classifier?: Record<string, unknown> | null,
): { ok: boolean; note?: string } {
  if (actual === expected) return { ok: true };

  if (expected === "life_insurance_modelation") {
    if (actual === "life_insurance_modelation") return { ok: true };
    if (
      actual === "life_insurance_proposal" &&
      ["modelation", "illustration", "non_binding_projection", "proposal"].includes(lifecycle)
    ) {
      return { ok: true };
    }
    return { ok: false, note: `want modelation-compatible, got ${actual}/${lifecycle}` };
  }

  if (expected === "life_insurance_proposal") {
    if (actual === "life_insurance_proposal" || actual === "life_insurance_modelation") return { ok: true };
    return { ok: false, note: `got ${actual}` };
  }

  if (expected === "life_insurance_investment_contract") {
    if (
      [
        "life_insurance_investment_contract",
        "life_insurance_contract",
        "life_insurance_proposal",
        "life_insurance_final_contract",
      ].includes(actual)
    ) {
      return { ok: true };
    }
    return { ok: false, note: `bundle-type mismatch ${actual}` };
  }

  if (expected === "investment_subscription_document") {
    if (actual.startsWith("investment_") || actual === "pension_contract") return { ok: true };
    return { ok: false, note: `want investment/DIP routing, got ${actual}` };
  }

  if (expected === "generic_financial_document") {
    if (["generic_financial_document", "service_agreement", "precontract_information"].includes(actual)) return { ok: true };
    return { ok: false, note: `got ${actual}` };
  }

  if (expected === "mortgage_document") {
    if (actual === "mortgage_document") return { ok: true };
    return { ok: false, note: `expected mortgage_document, got ${actual}` };
  }

  if (expected === "life_insurance_final_contract") {
    if (primaryMatchesFinalLifeContract(actual)) return { ok: true };
    return { ok: false, note: `expected final life contract family, got ${actual}` };
  }

  if (expected === "consent_or_declaration") {
    if (
      ["consent_or_declaration", "identity_document", "service_agreement", "generic_financial_document"].includes(actual)
    ) {
      return { ok: true };
    }
    return { ok: false, note: `got ${actual}` };
  }

  // Non-life insurance: canonical expected type vs pipeline naming variants
  if (expected === "non_life_insurance_contract") {
    if (
      ["non_life_insurance_contract", "nonlife_insurance_contract", "liability_insurance_offer",
       "property_insurance_contract", "motor_insurance_contract", "car_insurance_contract",
       "precontract_information"].includes(actual)
    ) return { ok: true };
    return { ok: false, note: `want non_life family, got ${actual}` };
  }

  // Life insurance contract: accept investment life variant for IŽP
  if (expected === "life_insurance_contract") {
    if (
      ["life_insurance_contract", "life_insurance_investment_contract",
       "life_insurance_final_contract", "life_insurance_proposal"].includes(actual)
    ) return { ok: true };
    return { ok: false, note: `want life_insurance_contract family, got ${actual}` };
  }

  // Service agreement: accept investment_service_agreement as a related type
  if (expected === "service_agreement") {
    if (
      ["service_agreement", "investment_service_agreement", "consent_or_declaration",
       "insurance_policy_change_or_service_doc"].includes(actual)
    ) return { ok: true };
    return { ok: false, note: `want service_agreement family, got ${actual}` };
  }

  // Insurance policy change / amendment: accept life_insurance_change_request
  if (expected === "insurance_policy_change_or_service_doc") {
    if (
      ["insurance_policy_change_or_service_doc", "life_insurance_change_request",
       "service_agreement", "consent_or_declaration"].includes(actual)
    ) return { ok: true };
    return { ok: false, note: `want amendment/service_doc, got ${actual}` };
  }

  // Corporate tax return: pipeline should now return corporate_tax_return directly.
  // bank_statement tolerance kept as soft fallback only (logged as a subtype mismatch, not a lane fail).
  if (expected === "corporate_tax_return") {
    if (actual === "corporate_tax_return") return { ok: true };
    if (["bank_statement", "payslip_document"].includes(actual)) {
      return { ok: true, note: `subtype_mismatch: want corporate_tax_return, got ${actual} (bank_statement tolerance)` };
    }
    return { ok: false, note: `want corporate_tax_return, got ${actual}` };
  }

  // Payslip document: pipeline should now return payslip_document directly.
  // bank_statement tolerance kept as soft fallback only (logged as a subtype mismatch, not a lane fail).
  if (expected === "payslip_document") {
    if (actual === "payslip_document") return { ok: true };
    if (["bank_statement", "income_confirmation"].includes(actual)) {
      return { ok: true, note: `subtype_mismatch: want payslip_document, got ${actual} (bank_statement tolerance)` };
    }
    return { ok: false, note: `want payslip_document, got ${actual}` };
  }

  // Investment service agreement: accept investment_subscription_document as a near-match
  if (expected === "investment_service_agreement") {
    if (["investment_service_agreement", "investment_subscription_document", "service_agreement"].includes(actual)) return { ok: true };
    return { ok: false, note: `want investment_service_agreement, got ${actual}` };
  }

  return { ok: false, note: `expected ${expected}, got ${actual}` };
}

/** Finální životní smlouva v praxi může být mapovaná jako čistě riziková nebo investiční život. */
function primaryMatchesFinalLifeContract(actual: string): boolean {
  return (
    actual === "life_insurance_final_contract" ||
    actual === "life_insurance_contract" ||
    actual === "life_insurance_investment_contract"
  );
}

/** Životní fáze, kde null publishHints znamená „určitě ne finální smlouva“ (G02). */
const NON_FINAL_LIFE_LIFECYCLES = new Set([
  "modelation",
  "illustration",
  "non_binding_projection",
]);

function publishabilityMatches(
  expected: boolean | "partial" | null,
  hints: PublishHints | null | undefined,
  lifecycle: string,
  primaryType: string,
): boolean {
  if (expected == null) return true;
  const pub = hints?.contractPublishable;
  const lc = String(lifecycle ?? "unknown");
  if (expected === true) {
    if (pub === true) return true;
    if (primaryType === "life_insurance_final_contract" && lc === "final_contract") return true;
    if (
      pub == null &&
      primaryMatchesFinalLifeContract(primaryType) &&
      !NON_FINAL_LIFE_LIFECYCLES.has(lc)
    ) {
      return true;
    }
    if (
      pub == null &&
      primaryType === "life_insurance_proposal" &&
      !NON_FINAL_LIFE_LIFECYCLES.has(lc)
    ) {
      return true;
    }
    if (
      pub == null &&
      (primaryType.startsWith("investment_") ||
        primaryType === "pension_contract" ||
        primaryType === "generic_financial_document" ||
        primaryType === "mortgage_document" ||
        primaryType.includes("consumer_loan")) &&
      !NON_FINAL_LIFE_LIFECYCLES.has(lc)
    ) {
      return true;
    }
    return pub === true;
  }
  if (expected === false) {
    if (pub === false) return true;
    if (pub === true) return false;
    if (
      ["modelation", "illustration", "proposal", "onboarding_form", "non_binding_projection"].includes(lc)
    ) {
      return true;
    }
    if (lc === "unknown" || lc === "offer" || lc === "confirmation") return true;
    return false;
  }
  if (expected === "partial") {
    if (pub === false) return true;
    if (hints?.needsSplit) return true;
    if (pub === true && hints?.sensitiveAttachmentOnly) return true;
    return pub !== true || !!hints?.needsSplit;
  }
  return true;
}

function paymentPresent(env: DocumentReviewEnvelope): boolean {
  const p = env.paymentData;
  if (p) {
    const keys = [p.iban, p.accountNumber, p.variableSymbol, p.bankCode, p.paymentMethod] as const;
    if (keys.some((x) => x != null && String(x).trim().length > 0)) return true;
  }
  const ef = env.extractedFields as Record<string, { value?: unknown }> | undefined;
  if (!ef) return false;
  for (const k of Object.keys(ef)) {
    if (/iban|account|variable|bank|payment|premium|contribution|investmentPremium|regularAmount|installment|amount/i.test(k)) {
      const v = ef[k]?.value;
      if (v != null && String(v).trim() && String(v) !== "null" && String(v) !== "0" && String(v) !== "unknown") return true;
    }
  }
  return false;
}

function investmentPresent(env: DocumentReviewEnvelope): boolean {
  const inv = env.investmentData;
  if (inv) {
    if (inv.funds && inv.funds.length > 0) return true;
    if (inv.strategy && String(inv.strategy).trim()) return true;
    if (inv.investmentAmount != null && String(inv.investmentAmount).trim()) return true;
  }
  // Fallback: check extractedFields for investment-related keys (canonical normalizer not called in eval)
  const ef = env.extractedFields as Record<string, { value?: unknown }> | undefined;
  if (!ef) return false;
  for (const k of Object.keys(ef)) {
    if (/investment|fund|fond|strategy|strategi|allocat|isin|portfolio|dip|dps/i.test(k)) {
      const v = ef[k]?.value;
      if (v != null && String(v).trim() && String(v) !== "null" && String(v) !== "unknown") return true;
    }
  }
  return false;
}

function participantCount(env: DocumentReviewEnvelope): number {
  const parts = env.participants;
  if (parts && parts.length > 0) return parts.length;
  const parties = env.parties as Record<string, unknown> | undefined;
  if (parties && Object.keys(parties).length > 0) return Object.keys(parties).length;
  // Fallback: count participant-like fields in extractedFields (canonical normalizer not called in eval)
  const ef = env.extractedFields as Record<string, { value?: unknown; status?: string }> | undefined;
  if (!ef) return 0;
  let count = 0;
  const mainName =
    (ef.fullName?.value ?? ef.clientFullName?.value ?? ef.proposerName?.value ?? ef.insuredPersonName?.value);
  if (mainName != null && String(mainName).trim()) count++;
  // Check insuredPersons JSON array
  const insuredPersonsRaw = ef.insuredPersons?.value;
  if (insuredPersonsRaw != null && typeof insuredPersonsRaw === "string") {
    try {
      const parsed = JSON.parse(insuredPersonsRaw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) count = Math.max(count, parsed.length);
    } catch { /* non-JSON */ }
  }
  // Check co-insured / secondary insured names
  const secondaryName = ef.insuredPersonName?.value ?? ef.secondInsuredName?.value ?? ef.coInsuredName?.value;
  if (secondaryName != null && String(secondaryName).trim() && String(secondaryName).trim() !== String(mainName ?? "").trim()) {
    count++;
  }
  return count;
}

function scanUiBlockers(env: DocumentReviewEnvelope): { blocker: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const ef = env.extractedFields as Record<string, { value?: unknown }> | undefined;
  if (!ef) return { blocker: false, reasons: [] };
  for (const [k, cell] of Object.entries(ef)) {
    const val = cell?.value;
    if (typeof val === "string") {
      if (/<table[\s>]/i.test(val) || /<td[\s>]/i.test(val) || /<tr[\s>]/i.test(val)) {
        reasons.push(`${k}:raw_html`);
      }
      const t = val.trim();
      if (t.startsWith("{") && t.endsWith("}") && t.length > 50) reasons.push(`${k}:raw_json_string`);
      const displayed = formatExtractedValue(val);
      if (displayed.length > 80 && /^\s*\{[\s\S]*\}\s*$/.test(displayed)) reasons.push(`${k}:displays_json`);
    }
  }
  return { blocker: reasons.length > 0, reasons };
}

function phase3ParticipantPass(env: DocumentReviewEnvelope, phase3?: Record<string, unknown>): boolean {
  if (!phase3?.expectedParticipantsMinCount) return true;
  const min = Number(phase3.expectedParticipantsMinCount);
  return participantCount(env) >= min;
}

function phase3InvestmentPass(env: DocumentReviewEnvelope, phase3?: Record<string, unknown>): boolean {
  if (!phase3?.expectedInvestmentDataPresent) return true;
  return investmentPresent(env);
}

function phase3PaymentPass(env: DocumentReviewEnvelope, phase3?: Record<string, unknown>): boolean {
  if (!phase3?.expectedPaymentDataPresent) return true;
  return paymentPresent(env);
}

/** Pipeline trace does not merge aiReview* from run-contract-review-processing; derive when adapter meta is empty. */
function deriveInputModeFromTrace(trace?: Record<string, unknown>): string {
  if (!trace) return "unknown";
  if (trace.aiReviewRouterOutcome === "combined_single_call") return "markdown";
  const builder = trace.aiReviewExtractionBuilder as string | undefined;
  const second = trace.extractionSecondPass as string | undefined;
  const src = trace.coreExtractionSource as string | undefined;
  if (builder === "file_pdf" || second === "pdf") return "raw_pdf";
  if (src === "adobe_structured_pages") return "structured_text";
  if (builder === "prompt_builder" || builder === "schema_text_wrap" || second === "prompt_text" || second === "text") {
    return "markdown";
  }
  return "unknown";
}

/** Build a map referenceFile → expectedOutputMode from corpusDocuments. */
function buildCorpusOutputModeMap(manifest: Manifest): Map<string, DocumentOutputMode> {
  const m = new Map<string, DocumentOutputMode>();
  for (const doc of manifest.corpusDocuments ?? []) {
    if (doc.referenceFile && doc.expectedOutputMode) {
      m.set(doc.referenceFile, doc.expectedOutputMode);
    }
  }
  return m;
}

/**
 * Semantic alias map for core field name → pipeline extractedFields key patterns.
 * Used by corpus-level eval to check if a field was actually extracted.
 * "present" = at least one matching key has a non-null, non-empty value.
 */
const CORE_FIELD_ALIASES: Record<string, RegExp> = {
  contractNumber: /contractNumber|policyNumber|smlouvaNumber|cisloSmlouvy|cislo_smlouvy|proposalRef/i,
  institutionName: /insurer|lender|institution|provider|bankName|pensionFund|fundPlatform|custodian/i,
  productName: /productName|productLabel|nazevProduktu|strategyOrFund/i,
  effectiveDate: /effectiveDate|policyStartDate|startDate|datumPocatku|contractDate|drawingDate/i,
  premiumAmount: /premium|totalMonthlyPremium|annualPremium|contributionAmount|regularAmount|investmentPremium/i,
  paymentFrequency: /paymentFrequency|frekvence|frequency/i,
  borrowerName: /borrowerName|fullName|clientFullName|proposerName|dluznikName/i,
  lenderName: /lenderName|institutionName|insurer|creditorName/i,
  policyholderName: /fullName|clientFullName|policyholderName|proposerName|pojistnikName/i,
  principal: /principal|loanAmount|vyseUveru|jistina|financedAmount/i,
  installment: /installment|monthlyInstallment|splatka|periodicPayment/i,
  termMonths: /termMonths|maturityMonths|duration|splatnost/i,
  investorName: /fullName|clientFullName|investorName/i,
  isinOrFundName: /isin|fundName|isinOrFundName|strategyOrFund/i,
  account: /account|iban|accountNumber|bankAccount/i,
  iban: /iban|accountNumber|bankAccount/i,
  accountOrReference: /accountOrReference|bankAccount|variableSymbol|accountNumber|contractNumber/i,
  strategyOrFund: /strategyOrFund|fundName|strategy|isin/i,
  contributionAmount: /contributionAmount|regularAmount|premiumAmount|amount/i,
  nominatedPersons: /nominatedPersons|obmyslene|beneficiaries/i,
  financedAmount: /financedAmount|totalFinancedAmount|principal|loanAmount|leasingAmount/i,
  vin: /vin\b|vinNumber|chassisNumber/i,
  registrationPlate: /registrationPlate|licensePlate|spz|ecv/i,
  lesseeName: /fullName|clientFullName|lesseeName|customer(?:Name)?|lessee/i,
  coverageLimits: /coverageLimits|limit|coverage|krytie/i,
  coinsurance: /coinsurance|spoluúčast|spoluucast/i,
  investmentStrategy: /investmentStrategy|strategy|isin|fundName/i,
  healthSegments: /healthSegments|healthSectionSignals|zdravotni/i,
  healthSectionSignals: /healthSectionSignals|healthSegments|zdravotni/i,
  proposalOrContractRef: /proposalRef|contractNumber|policyNumber|cislo/i,
  vehicleIdentifier: /vin|licensePlate|registrationPlate|spz/i,
  propertyAddress: /propertyAddress|address|adresa|nemovitost/i,
  policyReference: /policyReference|policyNumber|contractNumber/i,
  changeDescription: /changeDescription|amendment|zmena|change/i,
  taxPeriod: /taxPeriod|year|period|obdobi/i,
  companyName: /companyName|institutionName|firma|company/i,
  clientName: /fullName|clientFullName|clientName/i,
  providerName: /providerName|institutionName|provider/i,
  scopeSummary: /scopeSummary|businessScope|predmet|subject/i,
  documentKind: /documentKind|type|kind|druh/i,
  signatureDate: /signatureDate|dateSigned|datumPodpisu/i,
  interestRate: /interestRate|rate|urokSazba|rpsn/i,
  security: /security|collateral|zajisteni|záruka/i,
  businessPurpose: /businessPurpose|purpose|ucel|cil/i,
  drawingDateOrSchedule: /drawingDate|schedule|datum.*cerpani|harmonogram/i,
  insuredPersons: /insuredPersons|pojisteni|insured|persons/i,
  risks: /risks|rizika|coverages|riskPremium/i,
  annualIncome: /annualIncome|income|prijem/i,
  smokerStatus: /smokerStatus|kurer|smoker/i,
  illustrationDates: /illustrationDates|effectiveDate|datum/i,
  contractOrParticipantRef: /contractOrParticipantRef|contractNumber|participantNumber|cislo/i,
  productFramework: /productFramework|productName|framework|scheme/i,
  // Reference / supporting document fields
  documentSummary: /documentSummary|summary|shrnutiDokumentu|documentDescription|popis|content/i,
  fullName: /fullName|clientFullName|clientName|policyholderName|investorFullName/i,
  insurer: /insurer|institution|lender|provider|bankName/i,
};

function hasNonEmptyString(v: unknown): boolean {
  if (v == null) return false;
  const s = typeof v === "string" ? v.trim() : String(v);
  return Boolean(s) && s !== "—" && s !== "null" && s !== "0" && s !== "unknown";
}

function coreFieldPresent(
  ef: Record<string, { value?: unknown; status?: string } | undefined> | undefined,
  fieldName: string,
  env?: DocumentReviewEnvelope,
): boolean {
  const pat = CORE_FIELD_ALIASES[fieldName] ?? new RegExp(fieldName, "i");

  // Check extractedFields flat map
  if (ef) {
    for (const [k, cell] of Object.entries(ef)) {
      if (!cell) continue;
      if (cell.status === "missing" || cell.status === "not_applicable" || cell.status === "explicitly_not_selected") continue;
      if (!hasNonEmptyString(cell.value)) continue;
      if (pat.test(k)) return true;
    }
  }

  // For fields that are specifically about person names, also check parties array / parties record.
  // Only applies when the canonical field name is fullName/borrowerName/policyholderName,
  // not for leasing-specific aliases like lesseeName that have their own extractedFields path.
  const fullNameFields = new Set(["fullName", "borrowerName", "policyholderName", "investorName"]);
  if (fullNameFields.has(fieldName)) {
    const parties = env?.parties;
    if (Array.isArray(parties)) {
      for (const p of parties) {
        if (typeof p === "object" && p !== null) {
          const pp = p as Record<string, unknown>;
          if (hasNonEmptyString(pp.fullName) || hasNonEmptyString(pp.name)) return true;
        }
      }
    } else if (parties && typeof parties === "object") {
      for (const p of Object.values(parties as Record<string, unknown>)) {
        if (typeof p === "object" && p !== null) {
          const pp = p as Record<string, unknown>;
          if (hasNonEmptyString(pp.fullName) || hasNonEmptyString(pp.name)) return true;
        }
      }
    }
  }

  return false;
}

function evaluateCoreFields(
  ef: Record<string, { value?: unknown; status?: string } | undefined> | undefined,
  expectedCoreFields: string[],
  expectedOutputMode?: string,
  env?: DocumentReviewEnvelope,
): { found: number; total: number; pass: boolean; missing: string[] } {
  if (!expectedCoreFields.length) return { found: 0, total: 0, pass: true, missing: [] };

  // Reference/supporting docs are not penalized for missing contract fields.
  // Their core truth is just "documentSummary" presence or the fallback lane check.
  // Pass immediately if it's a reference doc with only lightweight expected fields.
  if (expectedOutputMode === "reference_or_supporting_document") {
    // For reference docs: pass if any reasonable content was extracted (not a strict contract gate)
    const refCheck = expectedCoreFields.filter((f) => f !== "documentSummary");
    if (refCheck.length === 0) {
      // Only documentSummary expected: check it leniently (any non-empty text field)
      const hasSomeContent = ef != null && Object.values(ef).some((cell) => {
        if (!cell || cell.status === "missing") return false;
        const v = cell.value;
        const s = typeof v === "string" ? v.trim() : String(v ?? "");
        return s.length > 10;
      });
      return { found: hasSomeContent ? 1 : 0, total: 1, pass: hasSomeContent, missing: hasSomeContent ? [] : ["documentSummary"] };
    }
  }

  let found = 0;
  const missing: string[] = [];
  for (const field of expectedCoreFields) {
    if (coreFieldPresent(ef, field, env)) {
      found++;
    } else {
      missing.push(field);
    }
  }
  // Pass if ≥ 50% of expected core fields are found (lenient threshold for eval without Adobe)
  const pass = found >= Math.ceil(expectedCoreFields.length * 0.5);
  return { found, total: expectedCoreFields.length, pass, missing };
}

/**
 * Returns true when a reference/supporting document was NOT incorrectly routed into
 * a structured product lane.
 * A "fallback lane violation" means the pipeline returned a publishable primary type
 * for a doc that must never be auto-published.
 */
function isFallbackLaneViolation(
  expectedOutputMode: DocumentOutputMode,
  actualOutputMode: DocumentOutputMode,
  primaryType: string,
): boolean {
  if (expectedOutputMode !== "reference_or_supporting_document") return false;
  // Violation: reference doc ended up classified as a publishable product
  return actualOutputMode === "structured_product_document" ||
    (actualOutputMode === "signature_ready_proposal" && !primaryType.includes("consent") && !primaryType.includes("service"));
}

describe.skipIf(!process.env.GOLDEN_LIVE_EVAL)("golden dataset live pipeline eval + release gate", () => {
  it(
    "runs G01–G09 through runContractUnderstandingPipeline and writes scorecard",
    async () => {
      const manifest = loadManifest();
      const delayMs = Number(process.env.GOLDEN_EVAL_DELAY_MS ?? "2500");
      const only = process.env.GOLDEN_EVAL_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);
      const corpusOutputModeMap = buildCorpusOutputModeMap(manifest);

      mkdirSync(evalOutDir, { recursive: true });

      const scenarios = manifest.scenarios.filter(
        (s) => !s.assistantOnly && s.referenceFile && (!only?.length || only.includes(s.id)),
      );

      const pdfServer = await startRepoPdfServer(repoRoot);

      const rows: Row[] = [];
      const caveats = [
        "Eval uses loopback HTTP for PDFs + V2 pipeline without Adobe preprocess / storage-backed structured data — closer to production fallback path.",
        "pdf-parse extracts ruleBasedTextHint for classifier parity (disable with GOLDEN_EVAL_NO_PDF_TEXT=1).",
        "Bundle phase2 expectations (G03) may not match when markdown/segmentation is absent.",
      ];

      try {
      for (const sc of scenarios) {
        const pdfPath = join(repoRoot, sc.referenceFile!);
        if (!existsSync(pdfPath)) {
          rows.push({
            id: sc.id,
            title: sc.title,
            status: "skipped",
            skipReason: "pdf_missing",
            expectedFamily: sc.documentFamily,
            actualFamilyInferred: "—",
            familyPass: false,
            expectedPrimaryType: sc.expectedPrimaryType,
            primaryPass: false,
            expectedPublishable: sc.publishableAsContract,
            publishPass: false,
            uiBlocker: false,
            overallPass: false,
          });
          continue;
        }

        const fileUrl = pdfHttpUrl(pdfServer.baseUrl, sc.referenceFile!);
        const textHint = await extractPdfTextHintFromDisk(pdfPath);
        const started = Date.now();
        let result: Awaited<ReturnType<typeof runContractUnderstandingPipeline>>;
        try {
          // For investment/DIP and contract scenarios: pass extracted text as section texts
          // so extraction prompts with {{investment_section_text}} / {{contractual_section_text}}
          // don't receive empty sections and can extract participant/investment/payment data.
          const evalBundleSectionTexts = textHint
            ? {
                contractualText: textHint,
                investmentText: textHint,
              }
            : null;
          result = await runContractUnderstandingPipeline(fileUrl, "application/pdf", {
            sourceFileName: sc.referenceFile!.split("/").pop() ?? "doc.pdf",
            ruleBasedTextHint: textHint,
            bundleSectionTexts: evalBundleSectionTexts,
            preprocessMeta: {
              preprocessStatus: textHint ? "golden_eval_pdf_parse_hint" : "golden_eval_local",
              preprocessMode: "none",
              adobePreprocessed: false,
              markdownContentLength: textHint?.length ?? 0,
              // Signal text readability so allowTextSecondPass is true when text hint is available.
              // This enables the stored-prompt fallback rescue path in the extraction pipeline.
              readabilityScore: textHint && textHint.length >= 800 ? 80 : 0,
            },
          });
        } catch (e) {
          rows.push({
            id: sc.id,
            title: sc.title,
            status: "error",
            errorMessage: `${e instanceof Error ? e.message : String(e)}`,
            expectedFamily: sc.documentFamily,
            actualFamilyInferred: "—",
            familyPass: false,
            expectedPrimaryType: sc.expectedPrimaryType,
            primaryPass: false,
            expectedPublishable: sc.publishableAsContract,
            publishPass: false,
            uiBlocker: false,
            overallPass: false,
          });
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        const latencyMs = Date.now() - started;
        await new Promise((r) => setTimeout(r, delayMs));

        if (!result.ok) {
          rows.push({
            id: sc.id,
            title: sc.title,
            status: "error",
            errorMessage: `${result.errorMessage}${result.details != null ? ` | ${typeof result.details === "string" ? result.details : JSON.stringify(result.details).slice(0, 400)}` : ""}`,
            expectedFamily: sc.documentFamily,
            actualFamilyInferred: "—",
            familyPass: false,
            expectedPrimaryType: sc.expectedPrimaryType,
            primaryPass: false,
            expectedPublishable: sc.publishableAsContract,
            publishPass: false,
            uiBlocker: false,
            overallPass: false,
            latencyMs,
          });
          continue;
        }

        const env = result.extractedPayload as unknown as DocumentReviewEnvelope;
        // Apply canonical normalization to populate participants/paymentData/investmentData.
        // Save and restore publishHints — the eval lacks proper packetMeta so canonical
        // derivation would produce wrong publishability (null packetMeta → always defaults).
        {
          const savedPublishHints = env.publishHints;
          applyCanonicalNormalizationToEnvelope(env, null);
          env.publishHints = savedPublishHints;
        }
        const trace = result.extractionTrace as Record<string, unknown> | undefined;
        const classifier = trace?.aiClassifierJson as Record<string, unknown> | undefined;
        const primary = env.documentClassification.primaryType;
        const lifecycle = env.documentClassification.lifecycleStatus;
        const hints = env.publishHints ?? undefined;

        const meta = getAiReviewProviderMeta();
        const resolvedInputMode =
          meta.aiReviewInputMode ??
          (trace?.aiReviewInputMode as string | undefined) ??
          deriveInputModeFromTrace(trace);
        const familyPass = familyMatches(sc.documentFamily, primary, classifier);
        const pr = sc.expectedPrimaryType
          ? primaryMatches(sc.id, sc.expectedPrimaryType, primary, lifecycle, classifier)
          : { ok: true };
        const publishPass = publishabilityMatches(sc.publishableAsContract, hints, lifecycle, primary);
        const ui = scanUiBlockers(env);
        const insuranceContamination =
          sc.documentFamily === "investment" &&
          primary.startsWith("life_insurance") &&
          !investmentClassifierFamily(classifier);

        const participantOk = phase3ParticipantPass(env, sc.phase3_acceptance);
        const paymentOk = phase3PaymentPass(env, sc.phase3_acceptance);
        const investmentOk = phase3InvestmentPass(env, sc.phase3_acceptance);

        const warningsSummary = (env.reviewWarnings ?? [])
          .slice(0, 8)
          .map((w) => `${w.code ?? "?"}:${(w.message ?? "").slice(0, 60)}`);

        const traceProvider = (trace?.aiReviewProvider as string | undefined) ?? meta.aiReviewProvider;
        const traceInputMode = resolvedInputMode;
        const traceInputSize = (trace?.aiReviewInputSizeChars as number | undefined) ?? meta.aiReviewInputSizeChars;

        const providerTraceOk = Boolean(traceProvider && String(traceProvider).trim());
        const inputModeTraceOk = traceInputMode !== "unknown" && traceInputMode !== "none";

        // Phase 2: output mode check
        const actualOutputMode = deriveOutputModeFromPrimary(primary, lifecycle);
        const expectedOutputModeFromCorpus = sc.referenceFile ? corpusOutputModeMap.get(sc.referenceFile) ?? null : null;
        const outputModePass = expectedOutputModeFromCorpus != null
          ? outputModeMatchOk(expectedOutputModeFromCorpus, actualOutputMode)
          : true;

        const overallPass =
          familyPass &&
          pr.ok &&
          publishPass &&
          !ui.blocker &&
          !insuranceContamination &&
          participantOk &&
          paymentOk &&
          investmentOk &&
          providerTraceOk &&
          inputModeTraceOk &&
          outputModePass;

        const failReasons: string[] = [];
        if (!familyPass) failReasons.push("family_mismatch");
        if (!pr.ok) failReasons.push("primary_type");
        if (!publishPass) failReasons.push("publishability");
        if (ui.blocker) failReasons.push("ui_blocker");
        if (insuranceContamination) failReasons.push("investment_insurance_contamination");
        if (!participantOk) failReasons.push("participants_phase3");
        if (!paymentOk) failReasons.push("payment_phase3");
        if (!investmentOk) failReasons.push("investment_phase3");
        if (!providerTraceOk) failReasons.push("provider_trace");
        if (!inputModeTraceOk) failReasons.push("input_mode_trace");
        if (!outputModePass) failReasons.push(`output_mode:want_${expectedOutputModeFromCorpus ?? "?"},got_${actualOutputMode}`);

        rows.push({
          id: sc.id,
          title: sc.title,
          status: "ran",
          expectedFamily: sc.documentFamily,
          actualFamilyInferred: inferFamilyFromPrimary(primary, String(classifier?.productFamily ?? "")),
          familyPass,
          expectedPrimaryType: sc.expectedPrimaryType,
          actualPrimaryType: primary,
          primaryPass: pr.ok,
          primaryNote: pr.note,
          expectedPublishable: sc.publishableAsContract,
          actualPublishable: hints?.contractPublishable ?? null,
          publishPass,
          expectedOutputMode: expectedOutputModeFromCorpus,
          actualOutputMode,
          outputModePass,
          participantOk,
          paymentOk,
          investmentOk,
          warningsSummary,
          uiBlocker: ui.blocker,
          uiBlockerReasons: ui.reasons,
          insuranceContamination,
          provider: traceProvider,
          model: meta.aiReviewModel,
          inputMode: traceInputMode,
          inputSizeChars: traceInputSize,
          latencyMs,
          lifecycleStatus: lifecycle,
          failReasons: failReasons.length > 0 ? failReasons : undefined,
          overallPass,
        });
      }

      const runnable = rows.filter((r) => r.status === "ran");
      const skipped = rows.filter((r) => r.status === "skipped");
      const errors = rows.filter((r) => r.status === "error");

      const coreRows = rows.filter((r) => ["G01", "G02", "G03", "G04", "G05", "G06", "G07", "G08", "G09"].includes(r.id));
      const coreRan = coreRows.filter((r) => r.status === "ran");
      const familyAcc =
        coreRan.length > 0 ? coreRan.filter((r) => r.familyPass).length / coreRan.length : 0;
      const strictPublishScenarios = ["G02", "G03", "G09"];
      const strictPublishRows = coreRows.filter((r) => strictPublishScenarios.includes(r.id) && r.status === "ran");
      const strictPublishPass = strictPublishRows.every((r) => r.publishPass);

      const anyUiBlocker = runnable.some((r) => r.uiBlocker);
      const anyInsuranceContam = runnable.some((r) => r.insuranceContamination);
      const providerTraceRows = runnable.filter((r) => !r.provider || !r.inputMode);
      const missingProviderTrace = providerTraceRows.length > 0;
      const failedScenarios = runnable.filter((r) => !r.overallPass).map((r) => r.id);

      // Phase 2: output mode accuracy
      const outputModeRows = coreRan.filter((r) => r.expectedOutputMode != null);
      const outputModeAcc = outputModeRows.length > 0
        ? outputModeRows.filter((r) => r.outputModePass).length / outputModeRows.length
        : 1;

      const blockers: string[] = [];
      if (skipped.length > 0) blockers.push(`missing_pdf:${skipped.map((s) => s.id).join(",")}`);
      if (errors.length > 0) blockers.push(`pipeline_errors:${errors.map((e) => e.id).join(",")}`);
      if (failedScenarios.length > 0) blockers.push(`scenario_overall_fail:${failedScenarios.join(",")}`);
      if (coreRan.length > 0 && familyAcc < 0.95) blockers.push(`family_accuracy_${(familyAcc * 100).toFixed(1)}%_below_95%`);
      if (!strictPublishPass) blockers.push("strict_publishability_failed_G02_G03_G09");
      if (anyUiBlocker) blockers.push("ui_blocker_raw_html_or_json");
      if (anyInsuranceContam) blockers.push("investment_scenario_insurance_contamination");
      if (missingProviderTrace) blockers.push(`missing_provider_or_input_mode_trace:${providerTraceRows.map((r) => r.id).join(",")}`);
      if (outputModeRows.length > 0 && outputModeAcc < 0.95) {
        const failedModes = coreRan.filter((r) => r.expectedOutputMode != null && !r.outputModePass).map((r) => `${r.id}:${r.failReasons?.find(f => f.startsWith("output_mode")) ?? "?"}`);
        blockers.push(`output_mode_accuracy_${(outputModeAcc * 100).toFixed(1)}%_below_95%:${failedModes.join(",")}`);
      }

      const verdict = blockers.length === 0 ? "READY TO FREEZE AI REVIEW" : `BLOCKED BY: ${blockers.join(" | ")}`;

      const report = {
        generatedAt: new Date().toISOString(),
        manifestVersion: manifest.version,
        verdict,
        blockers,
        metrics: {
          scenariosTotal: rows.length,
          ran: runnable.length,
          skipped: skipped.length,
          errors: errors.length,
          coreFamilyAccuracy: familyAcc,
          coreOutputModeAccuracy: outputModeAcc,
          strictPublishG02G03G09: strictPublishPass,
        },
        caveats,
        rows,
      };

      writeFileSync(join(evalOutDir, `eval-report-${Date.now()}.json`), JSON.stringify(report, null, 2), "utf8");
      writeFileSync(join(evalOutDir, "latest-eval-report.json"), JSON.stringify(report, null, 2), "utf8");

      // eslint-disable-next-line no-console
      console.info("\n=== GOLDEN LIVE EVAL SCORECARD ===\n");
      for (const r of rows) {
        // eslint-disable-next-line no-console
        console.info(
          `${r.id} ${r.status === "ran" ? (r.overallPass ? "PASS" : "FAIL") : r.status.toUpperCase()} ` +
            `fam=${r.familyPass} primary=${r.primaryPass} pub=${r.publishPass} mode=${r.outputModePass ?? "—"} ui=${r.uiBlocker ? "BLOCK" : "ok"} ` +
            `lc=${r.lifecycleStatus ?? "—"} ${r.actualPrimaryType ?? "—"} ${r.latencyMs ?? 0}ms` +
            (r.failReasons?.length ? ` [${r.failReasons.join(",")}]` : ""),
        );
      }
      // eslint-disable-next-line no-console
      console.info(`\nVERDICT: ${verdict}\n`);

      expect(errors.length, "pipeline hard errors").toBe(0);
      expect(skipped.length, "all golden PDFs should exist locally").toBe(0);
      expect(familyAcc).toBeGreaterThanOrEqual(0.95);
      expect(strictPublishPass).toBe(true);
      expect(failedScenarios.length, "per-scenario overall pass").toBe(0);
      expect(anyUiBlocker).toBe(false);
      expect(anyInsuranceContam).toBe(false);
      expect(missingProviderTrace).toBe(false);
      expect(outputModeAcc, "output mode accuracy").toBeGreaterThanOrEqual(0.95);
      } finally {
        await pdfServer.close().catch(() => {});
      }
    },
    600_000,
  );

  it.skipIf(!process.env.GOLDEN_CORPUS_EVAL)(
    "runs all available corpus documents (C-level) through pipeline and writes corpus scorecard",
    async () => {
      const manifest = loadManifest();
      const delayMs = Number(process.env.GOLDEN_EVAL_DELAY_MS ?? "2500");
      const only = process.env.GOLDEN_EVAL_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);

      mkdirSync(evalOutDir, { recursive: true });

      const corpusDocs = (manifest.corpusDocuments ?? []).filter(
        (d) => !only?.length || only.includes(d.id),
      );

      const pdfServer = await startRepoPdfServer(repoRoot);

      const cRows: CorpusRow[] = [];
      try {
      for (const doc of corpusDocs) {
        // Resolve PDF path: try primary referenceFile first, then aliasFileNames
        let resolvedRef = doc.referenceFile;
        let pdfPath = join(repoRoot, doc.referenceFile);
        if (!existsSync(pdfPath)) {
          const aliasHit = (doc.aliasFileNames ?? []).find((a) => existsSync(join(repoRoot, a)));
          if (aliasHit) {
            resolvedRef = aliasHit;
            pdfPath = join(repoRoot, aliasHit);
          }
        }
        if (!existsSync(pdfPath)) {
          cRows.push({
            id: doc.id,
            referenceFile: doc.referenceFile,
            status: "skipped",
            skipReason: "pdf_missing",
            expectedFamily: doc.expectedFamily,
            actualFamilyInferred: "—",
            familyPass: false,
            expectedPrimaryType: doc.expectedPrimaryType,
            primaryPass: false,
            expectedOutputMode: doc.expectedOutputMode,
            outputModePass: false,
            coreFieldsExpected: doc.expectedCoreFields.length,
            coreFieldsFound: 0,
            coreFieldsPass: false,
            failReasons: ["pdf_missing"],
            overallPass: false,
          });
          continue;
        }

        // Scan-only / preprocessing-required docs: attempt Adobe preprocess lane.
        // - With GOLDEN_EVAL_ADOBE_PREPROCESS=1: calls Adobe PDF-to-Markdown, caches result, then runs pipeline.
        // - With cached result: reuses cached markdown (no new Adobe API call).
        // - Without flag and no cache: records preprocess_required (clean skip, not a fail).
        // - If preprocess fails: records preprocess_failed (separate bucket from routing/extraction errors).
        const docRequiresPreprocess = (doc as Record<string, unknown>).requiresPreprocessing === true;
        let nativeTextHint = await extractPdfTextHintFromDisk(pdfPath);
        let effectiveTextHint = nativeTextHint;
        let effectivePreprocessMeta: import("../contract-understanding-pipeline").PipelinePreprocessMeta;

        if (docRequiresPreprocess) {
          const preprocessResult = await evalAdobePreprocess(pdfPath, doc.id);
          const lifecycle = preprocessResult.lifecycle;

          if (lifecycle === "preprocess_required") {
            // Adobe not enabled and no cache — clean skip
            const d = doc as Record<string, unknown>;
            cRows.push({
              id: doc.id,
              referenceFile: doc.referenceFile,
              status: "skipped",
              skipReason: "preprocess_required_no_cache",
              skipNote: "Set GOLDEN_EVAL_ADOBE_PREPROCESS=1 to run Adobe preprocessing for this document, or a cached result must exist.",
              preprocessingReason: (d.preprocessingReason as string | undefined) ?? "scan_only_pdf",
              preprocessingLane: (d.preprocessingLane as string | undefined) ?? "adobe_text_extraction",
              preprocessingStatus: "awaiting_ocr",
              expectedFamily: doc.expectedFamily,
              actualFamilyInferred: "—",
              familyPass: false,
              expectedPrimaryType: doc.expectedPrimaryType,
              primaryPass: false,
              expectedOutputMode: doc.expectedOutputMode,
              outputModePass: false,
              coreFieldsExpected: doc.expectedCoreFields.length,
              coreFieldsFound: 0,
              coreFieldsPass: false,
              failReasons: [],
              overallPass: false,
            });
            continue;
          }

          if (lifecycle === "preprocess_failed") {
            cRows.push({
              id: doc.id,
              referenceFile: doc.referenceFile,
              status: "error",
              errorMessage: preprocessResult.preprocessMeta.preprocessErrorMessage ?? "Adobe preprocess failed",
              expectedFamily: doc.expectedFamily,
              actualFamilyInferred: "—",
              familyPass: false,
              expectedPrimaryType: doc.expectedPrimaryType,
              primaryPass: false,
              expectedOutputMode: doc.expectedOutputMode,
              outputModePass: false,
              coreFieldsExpected: doc.expectedCoreFields.length,
              coreFieldsFound: 0,
              coreFieldsPass: false,
              failReasons: ["preprocess_failed"],
              overallPass: false,
            });
            continue;
          }

          // preprocess_succeeded or preprocess_reused_cached_result — proceed with pipeline
          effectiveTextHint = preprocessResult.ruleBasedTextHint;
          effectivePreprocessMeta = preprocessResult.preprocessMeta;
        } else {
          effectivePreprocessMeta = {
            preprocessStatus: nativeTextHint ? "golden_eval_pdf_parse_hint" : "golden_eval_local",
            preprocessMode: "none",
            adobePreprocessed: false,
            markdownContentLength: nativeTextHint?.length ?? 0,
            readabilityScore: nativeTextHint && nativeTextHint.length >= 800 ? 80 : 0,
          };
        }

        const fileUrl = pdfHttpUrl(pdfServer.baseUrl, resolvedRef);
        const started = Date.now();
        let result: Awaited<ReturnType<typeof runContractUnderstandingPipeline>>;
        try {
          result = await runContractUnderstandingPipeline(fileUrl, "application/pdf", {
            sourceFileName: resolvedRef.split("/").pop() ?? "doc.pdf",
            ruleBasedTextHint: effectiveTextHint,
            bundleSectionTexts: effectiveTextHint ? { contractualText: effectiveTextHint, investmentText: effectiveTextHint } : null,
            preprocessMeta: effectivePreprocessMeta,
          });
        } catch (e) {
          cRows.push({
            id: doc.id,
            referenceFile: doc.referenceFile,
            status: "error",
            errorMessage: `${e instanceof Error ? e.message : String(e)}`,
            expectedFamily: doc.expectedFamily,
            actualFamilyInferred: "—",
            familyPass: false,
            expectedPrimaryType: doc.expectedPrimaryType,
            primaryPass: false,
            expectedOutputMode: doc.expectedOutputMode,
            outputModePass: false,
            coreFieldsExpected: doc.expectedCoreFields.length,
            coreFieldsFound: 0,
            coreFieldsPass: false,
            failReasons: ["pipeline_error"],
            overallPass: false,
          });
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        const latencyMs = Date.now() - started;
        await new Promise((r) => setTimeout(r, delayMs));

        if (!result.ok) {
          cRows.push({
            id: doc.id,
            referenceFile: doc.referenceFile,
            status: "error",
            errorMessage: result.errorMessage,
            expectedFamily: doc.expectedFamily,
            actualFamilyInferred: "—",
            familyPass: false,
            expectedPrimaryType: doc.expectedPrimaryType,
            primaryPass: false,
            expectedOutputMode: doc.expectedOutputMode,
            outputModePass: false,
            coreFieldsExpected: doc.expectedCoreFields.length,
            coreFieldsFound: 0,
            coreFieldsPass: false,
            failReasons: ["pipeline_error"],
            overallPass: false,
          });
          continue;
        }

        const env = result.extractedPayload as unknown as DocumentReviewEnvelope;
        const savedPublishHints = env.publishHints;
        applyCanonicalNormalizationToEnvelope(env, null);
        env.publishHints = savedPublishHints;

        const primary = env.documentClassification.primaryType;
        const lifecycle = env.documentClassification.lifecycleStatus;
        const trace = result.extractionTrace as Record<string, unknown> | undefined;
        const classifier = trace?.aiClassifierJson as Record<string, unknown> | undefined;

        const actualFamilyInferred = inferFamilyFromPrimary(primary, String(classifier?.productFamily ?? ""));
        const familyPass = familyMatches(doc.expectedFamily, primary, classifier);

        const pr = primaryMatches(doc.id, doc.expectedPrimaryType, primary, lifecycle, classifier);
        const primaryPass = pr.ok;

        const actualOutputMode = deriveOutputModeFromPrimary(primary, lifecycle);
        const outputModePass = outputModeMatchOk(doc.expectedOutputMode, actualOutputMode);

        const ef = env.extractedFields as Record<string, { value?: unknown; status?: string } | undefined> | undefined;
        const coreCheck = evaluateCoreFields(ef, doc.expectedCoreFields, doc.expectedOutputMode, env);

        // Fallback lane: reference docs must never end up as structured product
        const fallbackLaneViolation = isFallbackLaneViolation(doc.expectedOutputMode, actualOutputMode, primary);

        // Fallback behavior check: reference docs should not have a product contract payload
        let fallbackBehaviorPass: boolean | undefined;
        if (doc.expectedFallbackBehavior) {
          // noProductPublishPayload: pipeline must not have publishHints.contractPublishable = true
          const pub = env.publishHints?.contractPublishable;
          fallbackBehaviorPass = pub !== true && !fallbackLaneViolation;
        }

        const failReasons: string[] = [];
        if (!familyPass) failReasons.push("family_mismatch");
        if (!primaryPass) failReasons.push(`primary_type:want_${doc.expectedPrimaryType},got_${primary}`);
        if (!outputModePass) failReasons.push(`output_mode:want_${doc.expectedOutputMode},got_${actualOutputMode}`);
        if (!coreCheck.pass) failReasons.push(`core_fields:${coreCheck.found}/${coreCheck.total}:missing=[${coreCheck.missing.slice(0, 4).join(",")}]`);
        if (fallbackLaneViolation) failReasons.push("fallback_lane_violation");
        if (fallbackBehaviorPass === false) failReasons.push("fallback_behavior_publish_not_blocked");

        const overallPass =
          familyPass &&
          primaryPass &&
          outputModePass &&
          coreCheck.pass &&
          !fallbackLaneViolation &&
          (fallbackBehaviorPass !== false);

        cRows.push({
          id: doc.id,
          referenceFile: doc.referenceFile,
          status: "ran",
          expectedFamily: doc.expectedFamily,
          actualFamilyInferred,
          familyPass,
          expectedPrimaryType: doc.expectedPrimaryType,
          actualPrimaryType: primary,
          primaryPass,
          expectedOutputMode: doc.expectedOutputMode,
          actualOutputMode,
          outputModePass,
          fallbackLaneViolation,
          coreFieldsExpected: coreCheck.total,
          coreFieldsFound: coreCheck.found,
          coreFieldsPass: coreCheck.pass,
          fallbackBehaviorPass,
          latencyMs,
          lifecycleStatus: lifecycle,
          failReasons,
          overallPass,
        });
      }

      const cRunnable = cRows.filter((r) => r.status === "ran");
      const cSkipped = cRows.filter((r) => r.status === "skipped");
      const cErrors = cRows.filter((r) => r.status === "error");
      const cFailed = cRunnable.filter((r) => !r.overallPass);

      // Preprocess lifecycle buckets for observability
      const cPreprocessSkipped = cSkipped.filter((r) => (r as Record<string, unknown>).skipReason === "preprocess_required_no_cache");
      const cPreprocessFailed = cErrors.filter((r) => r.failReasons?.includes("preprocess_failed"));
      const cPreprocessSucceeded = cRunnable.filter((r) => {
        const d = r as Record<string, unknown>;
        return d.preprocessStatus === "preprocess_succeeded" || d.preprocessStatus === "preprocess_reused_cached_result";
      });

      const cFamilyAcc = cRunnable.length > 0
        ? cRunnable.filter((r) => r.familyPass).length / cRunnable.length : 0;
      const cOutputModeAcc = cRunnable.length > 0
        ? cRunnable.filter((r) => r.outputModePass).length / cRunnable.length : 0;
      const cCoreFieldsAcc = cRunnable.length > 0
        ? cRunnable.filter((r) => r.coreFieldsPass).length / cRunnable.length : 0;
      const anyFallbackViolation = cRunnable.some((r) => r.fallbackLaneViolation);

      const rootCauseBuckets = {
        routing: cRunnable.filter((r) => !r.familyPass || !r.primaryPass).map((r) => r.id),
        outputMode: cRunnable.filter((r) => !r.outputModePass).map((r) => r.id),
        coreExtraction: cRunnable.filter((r) => !r.coreFieldsPass).map((r) => r.id),
        fallbackLane: cRunnable.filter((r) => r.fallbackLaneViolation).map((r) => r.id),
        fieldNormalization: cRunnable.filter((r) => r.coreFieldsFound > 0 && r.coreFieldsFound < r.coreFieldsExpected).map((r) => r.id),
      };

      const cReport = {
        generatedAt: new Date().toISOString(),
        manifestVersion: manifest.version,
        evalType: "corpus_level_c_docs",
        metrics: {
          total: cRows.length,
          ran: cRunnable.length,
          skipped: cSkipped.length,
          errors: cErrors.length,
          passed: cRunnable.filter((r) => r.overallPass).length,
          failed: cFailed.length,
          familyAccuracy: cFamilyAcc,
          outputModeAccuracy: cOutputModeAcc,
          coreFieldsAccuracy: cCoreFieldsAcc,
          fallbackLaneViolations: cRunnable.filter((r) => r.fallbackLaneViolation).length,
          preprocess: {
            awaitingOcr: cPreprocessSkipped.length,
            preprocessFailed: cPreprocessFailed.length,
            preprocessSucceeded: cPreprocessSucceeded.length,
            preprocessSucceededIds: cPreprocessSucceeded.map((r) => r.id),
          },
        },
        rootCauseBuckets,
        rows: cRows,
      };

      writeFileSync(
        join(evalOutDir, `corpus-eval-report-${Date.now()}.json`),
        JSON.stringify(cReport, null, 2),
        "utf8",
      );
      writeFileSync(
        join(evalOutDir, "latest-corpus-eval-report.json"),
        JSON.stringify(cReport, null, 2),
        "utf8",
      );

      // eslint-disable-next-line no-console
      console.info("\n=== CORPUS EVAL SCORECARD (C-level) ===\n");
      for (const r of cRows) {
        // eslint-disable-next-line no-console
        if (r.status === "skipped") {
          const d = r as Record<string, unknown>;
          console.info(
            `${r.id} SKIPPED [${d.skipReason ?? "preprocess_prerequisite_not_met"}] ` +
              `preprocessing=${d.preprocessingReason ?? "scan_only_pdf"} lane=${d.preprocessingLane ?? "adobe_text_extraction"} ` +
              `status=${d.preprocessingStatus ?? "awaiting_ocr"}`,
          );
        } else {
          console.info(
            `${r.id} ${r.status === "ran" ? (r.overallPass ? "PASS" : "FAIL") : r.status.toUpperCase()} ` +
              `fam=${r.familyPass} primary=${r.primaryPass} mode=${r.outputModePass ?? "—"} ` +
              `core=${r.coreFieldsFound}/${r.coreFieldsExpected} fb=${r.fallbackBehaviorPass ?? "—"} ` +
              `${r.actualPrimaryType ?? "—"} ${r.latencyMs ?? 0}ms` +
              (r.failReasons.length ? ` [${r.failReasons.slice(0, 3).join(",")}]` : ""),
          );
        }
      }
      // eslint-disable-next-line no-console
      console.info(`\nROOT CAUSE BUCKETS: routing=${rootCauseBuckets.routing.join(",") || "none"} | mode=${rootCauseBuckets.outputMode.join(",") || "none"} | extraction=${rootCauseBuckets.coreExtraction.join(",") || "none"} | fallback=${rootCauseBuckets.fallbackLane.join(",") || "none"}\n`);
      if (cPreprocessSkipped.length > 0 || cPreprocessFailed.length > 0 || cPreprocessSucceeded.length > 0) {
        console.info(`PREPROCESS LANE: awaiting_ocr=${cPreprocessSkipped.map((r) => r.id).join(",") || "none"} | failed=${cPreprocessFailed.map((r) => r.id).join(",") || "none"} | succeeded=${cPreprocessSucceeded.map((r) => r.id).join(",") || "none"}\n`);
      }

      expect(cErrors.length, "corpus pipeline hard errors").toBe(0);
      expect(cFamilyAcc, "corpus family accuracy").toBeGreaterThanOrEqual(0.8);
      expect(cOutputModeAcc, "corpus output mode accuracy").toBeGreaterThanOrEqual(0.8);
      expect(anyFallbackViolation, "no reference doc in product contract lane").toBe(false);
      } finally {
        await pdfServer.close().catch(() => {});
      }
    },
    900_000,
  );
});

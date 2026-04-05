/**
 * Full golden dataset — live AI Review V2 pipeline (runContractUnderstandingPipeline).
 *
 * Run (from repo root):
 *   pnpm --filter web exec cross-env GOLDEN_LIVE_EVAL=1 vitest run src/lib/ai/__tests__/golden-dataset-live-pipeline.eval.test.ts --testTimeout=600000
 *
 * Env:
 *   GOLDEN_LIVE_EVAL=1        — required to run (otherwise skipped)
 *   GOLDEN_EVAL_DELAY_MS=2500 — delay between scenarios (rate limits)
 *   GOLDEN_EVAL_ONLY=G01,G05  — optional comma-separated scenario ids
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
import type { DocumentReviewEnvelope } from "../document-review-types";
import { applyCanonicalNormalizationToEnvelope } from "../life-insurance-canonical-normalizer";
import type { PublishHints } from "../document-packet-types";
import { formatExtractedValue } from "@/lib/ai-review/mappers";
import { getAiReviewProviderMeta } from "../review-llm-provider";

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
  phase2_acceptance?: Record<string, unknown>;
  phase3_acceptance?: Record<string, unknown>;
};

type Manifest = { version: number; scenarios: Scenario[] };

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

function inferFamilyFromPrimary(primary: string, classifierPf?: string): string {
  const pf = (classifierPf ?? "").toLowerCase();
  if (["dip", "dps", "pp", "investment", "pension"].includes(pf)) return "investment";
  if (primary.startsWith("life_insurance")) return "life_insurance";
  if (primary === "mortgage_document") return "mortgage";
  if (primary.includes("consumer_loan")) return "consumer_credit";
  if (primary === "generic_financial_document" || primary === "service_agreement") return "leasing";
  if (primary === "consent_or_declaration") return "compliance";
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
    return inferred === "compliance" || primary === "consent_or_declaration" || primary === "identity_document";
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

describe.skipIf(!process.env.GOLDEN_LIVE_EVAL)("golden dataset live pipeline eval + release gate", () => {
  it(
    "runs G01–G09 through runContractUnderstandingPipeline and writes scorecard",
    async () => {
      const manifest = loadManifest();
      const delayMs = Number(process.env.GOLDEN_EVAL_DELAY_MS ?? "2500");
      const only = process.env.GOLDEN_EVAL_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);

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
          inputModeTraceOk;

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

      const blockers: string[] = [];
      if (skipped.length > 0) blockers.push(`missing_pdf:${skipped.map((s) => s.id).join(",")}`);
      if (errors.length > 0) blockers.push(`pipeline_errors:${errors.map((e) => e.id).join(",")}`);
      if (failedScenarios.length > 0) blockers.push(`scenario_overall_fail:${failedScenarios.join(",")}`);
      if (coreRan.length > 0 && familyAcc < 0.95) blockers.push(`family_accuracy_${(familyAcc * 100).toFixed(1)}%_below_95%`);
      if (!strictPublishPass) blockers.push("strict_publishability_failed_G02_G03_G09");
      if (anyUiBlocker) blockers.push("ui_blocker_raw_html_or_json");
      if (anyInsuranceContam) blockers.push("investment_scenario_insurance_contamination");
      if (missingProviderTrace) blockers.push(`missing_provider_or_input_mode_trace:${providerTraceRows.map((r) => r.id).join(",")}`);

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
            `fam=${r.familyPass} primary=${r.primaryPass} pub=${r.publishPass} ui=${r.uiBlocker ? "BLOCK" : "ok"} ` +
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
      } finally {
        await pdfServer.close().catch(() => {});
      }
    },
    600_000,
  );
});

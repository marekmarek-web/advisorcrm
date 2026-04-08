/**
 * Anchor Debug Runner — ONE-SHOT RUNTIME TRACE per anchor PDF.
 *
 * Spuštění (z rootu monorepa nebo z apps/web):
 *   pnpm --filter web exec cross-env ANCHOR_DEBUG=1 AI_REVIEW_DEBUG=true \
 *     vitest run src/lib/ai/__tests__/anchor-debug-runner.eval.test.ts \
 *     --testTimeout=600000
 *
 * Output: fixtures/golden-ai-review/eval-outputs/anchor-debug-report-<timestamp>.json
 *
 * Env:
 *   ANCHOR_DEBUG=1            — povinné (jinak skip)
 *   AI_REVIEW_DEBUG=true      — zapne fieldCheckpoint before/after alias normalize
 *   ANCHOR_DELAY_MS=2000      — mezera mezi dokumenty (default 2000ms)
 *   ANCHOR_ONLY=GCP,MAXIMA    — run pouze vybrané anchory (klíč = anchor id)
 */

/* eslint-disable no-console */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { runContractUnderstandingPipeline } from "../contract-understanding-pipeline";
import { buildAdvisorReviewViewModel } from "../../ai-review/advisor-review-view-model";
import type { DocumentReviewEnvelope } from "../document-review-types";

// ─── Paths ───────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __testDir = dirname(__filename);
const appsWebRoot = join(__testDir, "../../../..");
const repoRoot = join(appsWebRoot, "..", "..");
const evalOutDir = join(repoRoot, "fixtures/golden-ai-review/eval-outputs");

// ─── Anchor list ─────────────────────────────────────────────────────────────
const ANCHORS = [
  {
    id: "GCP",
    label: "Čučka zamzam GČP",
    file: "Test AI/Tested preprompt/Čučka zamzam GČP.pdf",
  },
  {
    id: "AMUNDI",
    label: "AMUNDI DIP",
    file: "Test AI/Tested preprompt/AMUNDI DIP.pdf",
  },
  {
    id: "MAXIMA",
    label: "Sebova MAXIMA",
    file: "Test AI/Tested preprompt/Sebova MAXIMA.pdf",
  },
  {
    id: "CSOB",
    label: "ČSOB Spotřebitelský úvěr",
    file: "Test AI/Tested preprompt/Smlouva o ČSOB Spotřebitelském úvěru.pdf",
  },
  {
    id: "PAYSLIP",
    label: "Výplatní lístek",
    file: "Test AI/Tested preprompt/Výplatní lístek za měsíc.pdf",
  },
  {
    id: "TAX",
    label: "Daňové přiznání s.r.o.",
    file: "Test AI/Tested preprompt/Daňové přiznání s.r.o..pdf",
  },
] as const;

// ─── Core fields traced per anchor ────────────────────────────────────────────
const CORE_FIELD_KEYS = [
  "insurer",
  "institutionName",
  "provider",
  "lender",
  "fullName",
  "clientFullName",
  "borrowerName",
  "contractNumber",
  "proposalNumber",
  "proposalNumber_or_contractNumber",
  "existingPolicyNumber",
  "productName",
  "productType",
  "totalMonthlyPremium",
  "annualPremium",
  "premiumAmount",
  "installmentAmount",
  "loanAmount",
  "bankAccount",
  "variableSymbol",
  "iban",
  "paymentFrequency",
  "investmentStrategy",
] as const;

// ─── Local HTTP server for PDFs ───────────────────────────────────────────────
function startRepoPdfServer(root: string) {
  const server = createServer((req, res) => {
    try {
      const u = new URL(req.url ?? "/", "http://127.0.0.1");
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] !== "pdf" || parts.length < 2) { res.writeHead(404).end(); return; }
      const token = parts.slice(1).join("/");
      const rel = Buffer.from(token, "base64url").toString("utf8");
      const rootR = resolve(root);
      const abs = resolve(rootR, rel);
      if (!abs.startsWith(rootR + "/") && abs !== rootR) { res.writeHead(403).end(); return; }
      if (!existsSync(abs)) { res.writeHead(404).end(); return; }
      const buf = readFileSync(abs);
      res.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": String(buf.length) });
      res.end(buf);
    } catch { res.writeHead(500).end(); }
  });
  return new Promise<{ baseUrl: string; close: () => Promise<void> }>((ok, fail) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") { fail(new Error("pdf server bind failed")); return; }
      ok({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((r, e) => server.close((err) => (err ? e(err) : r()))),
      });
    });
    server.on("error", fail);
  });
}

function pdfUrl(baseUrl: string, relPath: string) {
  return `${baseUrl}/pdf/${Buffer.from(relPath, "utf8").toString("base64url")}`;
}

// ─── PDF text extraction (same as golden eval) ────────────────────────────────
async function extractTextHint(pdfPath: string): Promise<string | null> {
  try {
    const { installPdfJsNodePolyfills } = await import("../../documents/processing/pdfjs-node-polyfills");
    await installPdfJsNodePolyfills();
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: readFileSync(pdfPath) });
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

// ─── Field snapshot helper ────────────────────────────────────────────────────
function snapshotCoreFields(ef: Record<string, { value?: unknown; status?: string; confidence?: number } | undefined>) {
  const out: Record<string, { value: unknown; status: string; confidence: number }> = {};
  for (const k of CORE_FIELD_KEYS) {
    const cell = ef[k];
    out[k] = {
      value: cell?.value ?? null,
      status: (cell?.status as string) ?? "missing",
      confidence: typeof cell?.confidence === "number"
        ? (cell.confidence > 1 ? Math.min(1, cell.confidence / 100) : cell.confidence)
        : 0,
    };
  }
  return out;
}

// ─── Missing required fields ──────────────────────────────────────────────────
function missingRequiredFields(envelope: DocumentReviewEnvelope): string[] {
  return (envelope.reviewWarnings ?? [])
    .filter((w) => w.code === "MISSING_REQUIRED_FIELD")
    .map((w) => w.field ?? w.message ?? "?");
}

// ─── Invalid meta flags ───────────────────────────────────────────────────────
function metaFlags(envelope: DocumentReviewEnvelope) {
  const dc = envelope.documentClassification;
  const dm = envelope.documentMeta;
  return {
    primaryType: dc.primaryType,
    lifecycleStatus: dc.lifecycleStatus,
    documentIntent: dc.documentIntent,
    classificationConfidence: typeof dc.confidence === "number" ? dc.confidence : null,
    scannedVsDigital: dm?.scannedVsDigital ?? null,
    extractionRoute: (dm as Record<string, unknown>)?.extractionRoute ?? null,
    pipelineRoute: (dm as Record<string, unknown>)?.pipelineRoute ?? null,
    overallConfidence: typeof (dm as Record<string, unknown>)?.overallConfidence === "number"
      ? (dm as Record<string, unknown>).overallConfidence
      : null,
    isProposalOnly: envelope.contentFlags?.isProposalOnly ?? null,
    isFinalContract: envelope.contentFlags?.isFinalContract ?? null,
    containsPaymentInstructions: envelope.contentFlags?.containsPaymentInstructions ?? null,
  };
}

// ─── Advisor summary ─────────────────────────────────────────────────────────
function buildAdvisorSummary(result: Awaited<ReturnType<typeof runContractUnderstandingPipeline>>) {
  if (!result.ok) return null;
  const envelope = result.extractedPayload as unknown as DocumentReviewEnvelope;
  const trace = result.extractionTrace as Record<string, unknown>;
  try {
    const vm = buildAdvisorReviewViewModel({
      envelope,
      reasonsForReview: result.reasonsForReview,
      validationWarnings: result.validationWarnings,
      extractionTrace: trace,
      llmExecutiveBrief: (trace?.advisorDocumentSummary as Record<string, unknown> | undefined)?.text as string | undefined,
    });
    return {
      recognition: vm.recognition,
      client: vm.client,
      product: vm.product,
      payments: vm.payments,
      manualChecklist: vm.manualChecklist.slice(0, 8),
      paymentSyncStatus: vm.paymentSyncPreview?.status ?? null,
    };
  } catch (e) {
    return { error: String(e) };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
describe.skipIf(!process.env.ANCHOR_DEBUG)("ANCHOR DEBUG RUNNER", () => {
  it(
    "runs all anchors and writes debug report",
    async () => {
      const delayMs = Number(process.env.ANCHOR_DELAY_MS ?? "2000");
      const only = process.env.ANCHOR_ONLY?.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) ?? [];
      const anchors = only.length > 0 ? ANCHORS.filter((a) => only.includes(a.id)) : [...ANCHORS];

      mkdirSync(evalOutDir, { recursive: true });

      const pdfServer = await startRepoPdfServer(repoRoot);

      const report: {
        generatedAt: string;
        anchors: Record<string, unknown>[];
        summary: { pass: string[]; fail: string[]; readyToFreeze: boolean };
      } = {
        generatedAt: new Date().toISOString(),
        anchors: [],
        summary: { pass: [], fail: [], readyToFreeze: false },
      };

      try {
        for (const anchor of anchors) {
          console.info(`\n--- [ANCHOR DEBUG] ${anchor.id}: ${anchor.label} ---`);
          const pdfPath = join(repoRoot, anchor.file);
          if (!existsSync(pdfPath)) {
            console.warn(`  SKIP: file not found: ${anchor.file}`);
            report.anchors.push({ id: anchor.id, label: anchor.label, status: "skipped", skipReason: "pdf_not_found" });
            report.summary.fail.push(anchor.id);
            continue;
          }

          const textHint = await extractTextHint(pdfPath);
          const fileUrl = pdfUrl(pdfServer.baseUrl, anchor.file);
          const started = Date.now();

          let result: Awaited<ReturnType<typeof runContractUnderstandingPipeline>>;
          try {
            result = await runContractUnderstandingPipeline(fileUrl, "application/pdf", {
              sourceFileName: anchor.file.split("/").pop() ?? "doc.pdf",
              ruleBasedTextHint: textHint ?? undefined,
              bundleSectionTexts: textHint ? { contractualText: textHint, investmentText: textHint } : null,
              preprocessMeta: {
                preprocessStatus: textHint ? "anchor_debug_pdf_parse_hint" : "anchor_debug_local",
                preprocessMode: "none",
                adobePreprocessed: false,
                markdownContentLength: textHint?.length ?? 0,
                readabilityScore: textHint && textHint.length >= 800 ? 80 : 0,
              },
            });
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            console.error(`  ERROR: ${errMsg}`);
            report.anchors.push({ id: anchor.id, label: anchor.label, status: "error", error: errMsg, latencyMs: Date.now() - started });
            report.summary.fail.push(anchor.id);
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }

          const latencyMs = Date.now() - started;
          const trace = result.extractionTrace as Record<string, unknown> | undefined;

          if (!result.ok) {
            console.error(`  PIPELINE ERROR: ${result.errorMessage}`);
            report.anchors.push({
              id: anchor.id, label: anchor.label, status: "pipeline_error",
              errorMessage: result.errorMessage, latencyMs,
              trace_failedStep: trace?.failedStep ?? null,
              trace_warnings: trace?.warnings ?? [],
            });
            report.summary.fail.push(anchor.id);
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }

          const envelope = result.extractedPayload as unknown as DocumentReviewEnvelope;
          const ef = envelope.extractedFields as Record<string, { value?: unknown; status?: string; confidence?: number } | undefined>;
          const coreFields = snapshotCoreFields(ef);
          const advisorSummary = buildAdvisorSummary(result);
          const missing = missingRequiredFields(envelope);
          const meta = metaFlags(envelope);
          const confidence = typeof meta.overallConfidence === "number" ? meta.overallConfidence : (result.confidence ?? 0);
          const confidencePercent = Math.round(confidence * 100);

          // ── A/B: classifier + router (from trace.debugTrace)
          const debugTrace = trace?.debugTrace as Record<string, unknown> | undefined;
          const classifierResult = debugTrace?.classifierRaw as Record<string, unknown> | undefined;
          const routerDecision = debugTrace?.routerDecision as Record<string, unknown> | undefined;

          // ── C: after coercion (from trace.fieldCheckpoint_beforeAliasNormalize)
          const afterCoercion = trace?.fieldCheckpoint_beforeAliasNormalize as Record<string, unknown> | undefined;

          // ── D: after alias normalize / validation (from trace.fieldCheckpoint_afterAliasNormalize)
          const afterValidation = trace?.fieldCheckpoint_afterAliasNormalize as Record<string, unknown> | undefined;

          // ── PASS/FAIL determination ──────────────────────────────────────────
          const insurerOk = !!(coreFields.insurer?.value || coreFields.institutionName?.value || coreFields.provider?.value || coreFields.lender?.value);
          const clientOk = !!(coreFields.fullName?.value || coreFields.clientFullName?.value || coreFields.borrowerName?.value);
          const productOk = !!(coreFields.productName?.value || coreFields.productType?.value);
          const paymentsOk = !!(
            coreFields.totalMonthlyPremium?.value ||
            coreFields.annualPremium?.value ||
            coreFields.premiumAmount?.value ||
            coreFields.installmentAmount?.value ||
            coreFields.loanAmount?.value
          );
          const classificationValid = !!meta.primaryType && meta.primaryType !== "unsupported_or_unknown";
          const metaValid = classificationValid && !!meta.lifecycleStatus && meta.lifecycleStatus !== "unknown";
          const confidenceOk = confidencePercent <= 100;
          const notEmptyStub = insurerOk || clientOk || productOk || paymentsOk;

          // ── First loss point detection ───────────────────────────────────────
          const lossPoints: string[] = [];
          if (afterCoercion) {
            if (!afterCoercion.insurer && !afterCoercion.institutionName && !afterCoercion.provider && !afterCoercion.lender) {
              lossPoints.push("insurer/provider missing BEFORE alias normalize (ztrácí se v LLM extraction nebo Zod coercion)");
            }
            if (!afterCoercion.fullName && !afterCoercion.clientFullName) {
              lossPoints.push("client fullName missing BEFORE alias normalize");
            }
            if (!afterCoercion.contractNumber && !afterCoercion.proposalNumber) {
              lossPoints.push("contract/proposal number missing BEFORE alias normalize");
            }
            if (!afterCoercion.totalMonthlyPremium && !afterCoercion.annualPremium && !afterCoercion.premiumAmount) {
              lossPoints.push("payment amount missing BEFORE alias normalize");
            }
          }
          if (afterValidation && afterCoercion) {
            if (!afterValidation.insurer && (afterCoercion.insurer || afterCoercion.institutionName)) {
              lossPoints.push("insurer ztracen BĚHEM alias normalize / source priority");
            }
            if (!afterValidation.fullName && afterCoercion.fullName) {
              lossPoints.push("fullName ztracen BĚHEM alias normalize / source priority");
            }
          }
          if (!insurerOk) lossPoints.push("insurer/provider stále chybí ve final export payload");
          if (!clientOk) lossPoints.push("client stále chybí ve final export payload");
          if (!paymentsOk) lossPoints.push("payments stále chybí ve final export payload");

          const anchorPass = insurerOk && clientOk && productOk && confidenceOk;

          const anchorRow = {
            id: anchor.id,
            label: anchor.label,
            status: anchorPass ? "PASS" : "FAIL",
            latencyMs,
            // A) Classifier
            A_classifierResult: classifierResult ?? "(not in trace — requires AI_REVIEW_DEBUG=true)",
            // B) Router
            B_routerDecision: routerDecision ?? "(not in trace — requires AI_REVIEW_DEBUG=true)",
            // C) Raw model output summary (after coercion, before alias normalize)
            C_afterCoercion: afterCoercion ?? "(not in trace — requires AI_REVIEW_DEBUG=true)",
            // D) After alias normalize (= after validation in v2)
            D_afterValidation: afterValidation ?? "(not in trace — requires AI_REVIEW_DEBUG=true)",
            // E) Final core fields
            E_coreFields: coreFields,
            // F) Advisor summary
            F_advisorSummary: advisorSummary,
            // G) Missing required fields
            G_missingRequiredFields: missing,
            // H) Invalid meta flags
            H_metaFlags: meta,
            // I) Confidence
            I_confidence: { raw: confidence, percent: `${confidencePercent}%`, withinBounds: confidenceOk },
            // Pass/fail per dimension
            checks: {
              insurer_provider_filled: insurerOk,
              client_filled: clientOk,
              product_filled: productOk,
              payments_filled: paymentsOk,
              required_missing_fields: missing,
              documentMeta_valid: metaValid,
              documentClassification_valid: classificationValid,
              confidence_lte_100: confidenceOk,
              unsupported_empty_stub: !notEmptyStub,
            },
            // First loss point
            firstLossPoints: lossPoints,
            traceWarnings: trace?.warnings ?? [],
          };

          // ── Console summary ────────────────────────────────────────────────
          console.info(`  STATUS: ${anchorRow.status}`);
          console.info(`  A) classifier: ${JSON.stringify(classifierResult ?? "(debug off)")}`);
          console.info(`  B) router: ${JSON.stringify(routerDecision ?? "(debug off)")}`);
          console.info(`  C) after coercion (pre-alias): ${JSON.stringify(afterCoercion ?? "(debug off)")}`);
          console.info(`  D) after alias normalize: ${JSON.stringify(afterValidation ?? "(debug off)")}`);
          console.info(`  E) core fields [final]:`);
          for (const k of CORE_FIELD_KEYS) {
            const v = coreFields[k];
            if (v.value !== null) console.info(`     ${k}: ${JSON.stringify(v.value)} [${v.status}, conf=${Math.round(v.confidence * 100)}%]`);
          }
          console.info(`  F) advisor summary: ${JSON.stringify(advisorSummary)}`);
          console.info(`  G) missing required: ${missing.length ? missing.join(", ") : "none"}`);
          console.info(`  H) meta: ${JSON.stringify(meta)}`);
          console.info(`  I) confidence: ${confidencePercent}% (ok: ${confidenceOk})`);
          if (lossPoints.length) {
            console.info(`  ⚠ LOSS POINTS:`);
            for (const lp of lossPoints) console.info(`    - ${lp}`);
          }

          report.anchors.push(anchorRow);
          if (anchorPass) { report.summary.pass.push(anchor.id); } else { report.summary.fail.push(anchor.id); }

          await new Promise((r) => setTimeout(r, delayMs));
        }
      } finally {
        await pdfServer.close().catch(() => {});
      }

      report.summary.readyToFreeze = report.summary.fail.length === 0;

      // ── Write report ────────────────────────────────────────────────────────
      const ts = Date.now();
      const reportPath = join(evalOutDir, `anchor-debug-report-${ts}.json`);
      writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

      console.info("\n=== ANCHOR DEBUG SUMMARY ===");
      console.info(`PASS: ${report.summary.pass.join(", ") || "none"}`);
      console.info(`FAIL: ${report.summary.fail.join(", ") || "none"}`);
      console.info(`READY TO FREEZE CORE EXTRACTION: ${report.summary.readyToFreeze ? "ANO" : "NE"}`);
      console.info(`Report: ${reportPath}`);

      // Test never hard-fails: we always write the report.
      // Use expect to surface failures visibly in vitest output.
      expect(report.summary.fail, `FAILing anchors: ${report.summary.fail.join(", ")}`).toHaveLength(0);
    },
    600_000
  );
});

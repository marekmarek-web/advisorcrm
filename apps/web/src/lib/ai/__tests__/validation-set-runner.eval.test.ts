/**
 * Validation Set Runner — runtime/export blocker test nad přiloženými PDF.
 *
 * Spuštění (z rootu monorepa nebo z apps/web):
 *   pnpm --filter web exec cross-env ANCHOR_DEBUG=1 AI_REVIEW_DEBUG=true \
 *     vitest run src/lib/ai/__tests__/validation-set-runner.eval.test.ts \
 *     --testTimeout=600000
 *
 * Output: fixtures/golden-ai-review/eval-outputs/validation-set-report-<timestamp>.json
 *         fixtures/golden-ai-review/eval-outputs/validation-set-summary-<timestamp>.md
 *
 * Env:
 *   ANCHOR_DEBUG=1            — povinné (jinak skip)
 *   AI_REVIEW_DEBUG=true      — zapne fieldCheckpoint before/after alias normalize
 *   ANCHOR_DELAY_MS=2000      — mezera mezi dokumenty
 *   ANCHOR_ONLY=IZP_UNIQA,PILLOW — run pouze vybrané (klíč = anchor id)
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

const __filename = fileURLToPath(import.meta.url);
const __testDir = dirname(__filename);
const appsWebRoot = join(__testDir, "../../../..");
const repoRoot = join(appsWebRoot, "..", "..");
const evalOutDir = join(repoRoot, "fixtures/golden-ai-review/eval-outputs");

// ─── Validation set ───────────────────────────────────────────────────────────
// Files mapping: exact paths relative to repoRoot
// For missing files we fall back to nearest alternative and note it.
const VALIDATION_SET = [
  {
    id: "IZP_UNIQA",
    label: "IŽP UNIQA",
    file: "Test AI/IŽP UNIQA.PDF",
    requestedFile: "IŽP UNIQA.PDF",
  },
  {
    id: "PILLOW",
    label: "Životní pojištění Pillow",
    file: "Test AI/Tested preprompt/Životní pojištění Pillow.pdf",
    requestedFile: "Životní pojištění Pillow.pdf",
  },
  {
    id: "ZP_UNIQA",
    label: "Životní pojištění Uniqa",
    file: "Test AI/Životní pojištění Uniqa.pdf",
    requestedFile: "Životní pojištění Uniqa.pdf",
  },
  {
    id: "PODNIKATELE",
    label: "Pojištění podnikatelů",
    file: "Test AI/Pojištění podnikatelů.pdf",
    requestedFile: "Pojištění podnikatelů.pdf",
  },
  {
    id: "POV_RUCENI",
    label: "Povinné ručení",
    file: "Test AI/Povinné ručení.pdf",
    requestedFile: "Povinné ručení.pdf",
  },
  {
    id: "UNIQA_MAJETEK",
    label: "Uniqa Majetek",
    file: "Test AI/Tested preprompt/Uniqa Majetek.pdf",
    requestedFile: "Uniqa Majetek.pdf",
  },
  {
    id: "HYPOTEKA",
    label: "Hypotéka",
    file: "Test AI/Tested preprompt/Hypotéka.pdf",
    requestedFile: "Hypotéka.pdf",
  },
  {
    id: "SMLOUVA_UVER",
    label: "SMLOUVA O ÚVĚRU",
    file: "Test AI/Tested preprompt/SMLOUVA O ÚVĚRU.pdf",
    requestedFile: "SMLOUVA O ÚVĚRU.pdf",
  },
  {
    id: "HONZAJK_CPP",
    label: "Honzajk čpp změna",
    file: "Test AI/Tested preprompt/Honzajk čpp změna.pdf",
    requestedFile: "Honzajk čpp změna.pdf",
  },
  {
    // requested: Smlouva-o-poskytovani-sluzeb-Chlumecky-Jiri.pdf
    // nearest available: SMLOUVA O POSKYTOVÁNÍ SLUŽEB.pdf (root)
    id: "SMLOUVA_SLUZEB",
    label: "SMLOUVA O POSKYTOVÁNÍ SLUŽEB (nearest to Smlouva-o-poskytovani-sluzeb-Chlumecky-Jiri.pdf)",
    file: "Test AI/SMLOUVA O POSKYTOVÁNÍ SLUŽEB.pdf",
    requestedFile: "Smlouva-o-poskytovani-sluzeb-Chlumecky-Jiri.pdf",
    note: "Requested file not found in repo; using nearest: SMLOUVA O POSKYTOVÁNÍ SLUŽEB.pdf",
  },
  {
    // requested: Smlouva-o-upisu-CODYAMIX-Chlumecky-Jiri.pdf
    // nearest available: Investiční smlouva Codya.pdf (Tested preprompt)
    id: "CODYAMIX",
    label: "Investiční smlouva Codya (nearest to Smlouva-o-upisu-CODYAMIX-Chlumecky-Jiri.pdf)",
    file: "Test AI/Tested preprompt/Investiční smlouva Codya.pdf",
    requestedFile: "Smlouva-o-upisu-CODYAMIX-Chlumecky-Jiri.pdf",
    note: "Requested file not found in repo; using nearest: Investiční smlouva Codya.pdf",
  },
] as const;

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

function missingRequiredFields(envelope: DocumentReviewEnvelope): string[] {
  return (envelope.reviewWarnings ?? [])
    .filter((w) => w.code === "MISSING_REQUIRED_FIELD")
    .map((w) => w.field ?? w.message ?? "?");
}

// ─── Semantic quality gate ─────────────────────────────────────────────────────
function semanticQualityIssues(envelope: DocumentReviewEnvelope): string[] {
  const issues: string[] = [];
  const ef = envelope.extractedFields as Record<string, { value?: unknown }> | undefined;
  if (!ef) return issues;

  // birthDate must not look like a Czech personalId
  const birthDateVal = String(ef.birthDate?.value ?? "");
  if (/\d{6}\/\d{4}/.test(birthDateVal) || /^\d{9,10}$/.test(birthDateVal.replace(/\D/g, ""))) {
    issues.push(`birthDate obsahuje personalId-like pattern: "${birthDateVal}"`);
  }

  // personalId must not be masked
  const personalIdVal = String(ef.personalId?.value ?? "");
  if (/[X*]{4,}/.test(personalIdVal) || /XX\/XX/.test(personalIdVal)) {
    issues.push(`personalId je maskované: "${personalIdVal}"`);
  }

  // bankAccount must not be masked
  const bankAccountVal = String(ef.bankAccount?.value ?? ef.payoutAccount?.value ?? "");
  if (/[X*]{4,}/.test(bankAccountVal)) {
    issues.push(`bankAccount/payoutAccount je maskované: "${bankAccountVal}"`);
  }

  // variableSymbol must not be masked
  const vsVal = String(ef.variableSymbol?.value ?? "");
  if (/[X*]{4,}/.test(vsVal)) {
    issues.push(`variableSymbol je maskované: "${vsVal}"`);
  }

  return issues;
}

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
describe.skipIf(!process.env.ANCHOR_DEBUG)("VALIDATION SET RUNNER — blocker test nad PDF", () => {
  it(
    "runs all validation set PDFs and writes runtime/export report",
    async () => {
      const delayMs = Number(process.env.ANCHOR_DELAY_MS ?? "2000");
      const only = process.env.ANCHOR_ONLY?.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) ?? [];
      const docs = only.length > 0
        ? VALIDATION_SET.filter((a) => only.includes(a.id))
        : [...VALIDATION_SET];

      mkdirSync(evalOutDir, { recursive: true });

      const pdfServer = await startRepoPdfServer(repoRoot);

      const report: {
        generatedAt: string;
        testSet: string;
        docs: Record<string, unknown>[];
        summary: { pass: string[]; fail: string[]; skipped: string[]; readyToFreeze: boolean };
      } = {
        generatedAt: new Date().toISOString(),
        testSet: "validation-set-2026-04-08",
        docs: [],
        summary: { pass: [], fail: [], skipped: [], readyToFreeze: false },
      };

      try {
        for (const doc of docs) {
          console.info(`\n--- [VALIDATION] ${doc.id}: ${doc.label} ---`);
          if ("note" in doc) console.info(`  NOTE: ${doc.note}`);

          const pdfPath = join(repoRoot, doc.file);
          if (!existsSync(pdfPath)) {
            console.warn(`  SKIP: file not found: ${doc.file}`);
            report.docs.push({
              id: doc.id,
              label: doc.label,
              requestedFile: doc.requestedFile,
              resolvedFile: doc.file,
              status: "skipped",
              skipReason: "pdf_not_found",
            });
            report.summary.skipped.push(doc.id);
            continue;
          }

          const textHint = await extractTextHint(pdfPath);
          const fileUrl = pdfUrl(pdfServer.baseUrl, doc.file);
          const started = Date.now();

          let result: Awaited<ReturnType<typeof runContractUnderstandingPipeline>>;
          try {
            // Threshold aligned with anchor-debug-runner (>= 400) to avoid 407 when OpenAI
            // tries to download the local PDF server URL for shorter but readable PDFs.
            const hasGoodHint = textHint != null && textHint.length >= 400;
            result = await runContractUnderstandingPipeline(fileUrl, "application/pdf", {
              sourceFileName: doc.file.split("/").pop() ?? "doc.pdf",
              ruleBasedTextHint: textHint ?? undefined,
              bundleSectionTexts: textHint ? { contractualText: textHint, investmentText: textHint } : null,
              preprocessMeta: {
                preprocessStatus: textHint ? "validation_set_pdf_parse_hint" : "validation_set_local",
                preprocessMode: hasGoodHint ? "pdf_parse_fallback" : "none",
                adobePreprocessed: false,
                markdownContentLength: textHint?.length ?? 0,
                readabilityScore: hasGoodHint ? 80 : 0,
              },
            });
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            console.error(`  ERROR: ${errMsg}`);
            report.docs.push({
              id: doc.id,
              label: doc.label,
              requestedFile: doc.requestedFile,
              resolvedFile: doc.file,
              status: "error",
              error: errMsg,
              latencyMs: Date.now() - started,
            });
            report.summary.fail.push(doc.id);
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }

          const latencyMs = Date.now() - started;
          const trace = result.extractionTrace as Record<string, unknown> | undefined;

          if (!result.ok) {
            console.error(`  PIPELINE ERROR: ${result.errorMessage}`);
            report.docs.push({
              id: doc.id,
              label: doc.label,
              requestedFile: doc.requestedFile,
              resolvedFile: doc.file,
              status: "pipeline_error",
              errorMessage: result.errorMessage,
              latencyMs,
              trace_failedStep: trace?.failedStep ?? null,
              trace_warnings: trace?.warnings ?? [],
            });
            report.summary.fail.push(doc.id);
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

          const debugTrace = trace?.debugTrace as Record<string, unknown> | undefined;
          const classifierResult = debugTrace?.classifierRaw as Record<string, unknown> | undefined;
          const routerDecision = debugTrace?.routerDecision as Record<string, unknown> | undefined;
          const rawModelOutputHead = (trace?.rawModelOutputHead as string | undefined) ??
            (debugTrace?.rawModelOutputHead as string | undefined) ?? null;
          const rawModelOutputLength = (trace?.rawModelOutputLength as number | undefined) ?? null;
          const afterCoercion = trace?.fieldCheckpoint_beforeAliasNormalize as Record<string, unknown> | undefined;
          const afterValidation = trace?.fieldCheckpoint_afterAliasNormalize as Record<string, unknown> | undefined;

          const primaryType = meta.primaryType ?? "";
          const isSupportingDoc = primaryType === "payslip_document" || primaryType === "corporate_tax_return" || primaryType === "bank_statement";

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

          const efKeys = Object.keys(ef).filter((k) => {
            const v = ef[k];
            return v?.value != null && String(v.value).trim() && String(v.value) !== "null" && v.status !== "missing";
          });
          const hasAnyExtractedField = efKeys.length > 0;

          const notEmptyStub = isSupportingDoc
            ? hasAnyExtractedField
            : (insurerOk || clientOk || productOk || paymentsOk);

          // ── First loss point detection ────────────────────────────────────────
          const lossPoints: string[] = [];
          if (afterCoercion) {
            if (!afterCoercion.insurer && !afterCoercion.institutionName && !afterCoercion.provider && !afterCoercion.lender) {
              lossPoints.push("insurer/provider missing BEFORE alias normalize (ztráta v LLM extraction nebo Zod coercion)");
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
          if (!notEmptyStub) lossPoints.push("export payload je prázdný stub (žádné extrahované pole)");
          if (!insurerOk && !isSupportingDoc) lossPoints.push("insurer/provider stále chybí ve final export payload");
          if (!clientOk && !isSupportingDoc) lossPoints.push("client stále chybí ve final export payload");
          if (!paymentsOk && !isSupportingDoc) lossPoints.push("payments stále chybí ve final export payload");

          // ── Semantic quality gate ──────────────────────────────────────────────
          const semanticIssues = semanticQualityIssues(envelope);
          for (const s of semanticIssues) lossPoints.push(`[SEMANTIC] ${s}`);

          const docPass = isSupportingDoc
            ? (notEmptyStub && classificationValid && confidenceOk && semanticIssues.length === 0)
            : (notEmptyStub && classificationValid && confidenceOk && (insurerOk || clientOk) && semanticIssues.length === 0);

          const docRow: Record<string, unknown> = {
            id: doc.id,
            label: doc.label,
            requestedFile: doc.requestedFile,
            resolvedFile: doc.file,
            ...(("note" in doc) ? { fileSubstitutionNote: doc.note } : {}),
            status: docPass ? "PASS" : "FAIL",
            latencyMs,
            A_classifierResult: classifierResult ?? "(not in trace — AI_REVIEW_DEBUG=true required)",
            B_routerDecision: routerDecision ?? "(not in trace — AI_REVIEW_DEBUG=true required)",
            B2_rawModelOutput: rawModelOutputHead
              ? { head: rawModelOutputHead, length: rawModelOutputLength }
              : "(not in trace — AI_REVIEW_DEBUG=true required)",
            C_afterCoercion: afterCoercion ?? "(not in trace — AI_REVIEW_DEBUG=true required)",
            D_afterValidation: afterValidation ?? "(not in trace — AI_REVIEW_DEBUG=true required)",
            E_coreFields: coreFields,
            F_advisorSummary: advisorSummary,
            G_missingRequiredFields: missing,
            H_metaFlags: meta,
            I_confidence: { raw: confidence, percent: `${confidencePercent}%`, withinBounds: confidenceOk },
            checks: {
              insurer_provider_filled: insurerOk,
              client_filled: clientOk,
              product_filled: productOk,
              payments_filled: paymentsOk,
              any_field_extracted: hasAnyExtractedField,
              extracted_field_keys: efKeys.slice(0, 20),
              required_missing_fields: missing,
              documentMeta_valid: metaValid,
              documentClassification_valid: classificationValid,
              confidence_lte_100: confidenceOk,
              unsupported_empty_stub: !notEmptyStub,
              is_supporting_doc: isSupportingDoc,
              semantic_issues: semanticIssues,
              semantic_ok: semanticIssues.length === 0,
              freeze_gate_pass: docPass,
            },
            firstLossPoints: lossPoints,
            traceWarnings: trace?.warnings ?? [],
          };

          console.info(`  STATUS: ${docRow.status}`);
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
            console.info(`  LOSS POINTS:`);
            for (const lp of lossPoints) console.info(`    - ${lp}`);
          }

          report.docs.push(docRow);
          if (docPass) { report.summary.pass.push(doc.id); } else { report.summary.fail.push(doc.id); }

          await new Promise((r) => setTimeout(r, delayMs));
        }
      } finally {
        await pdfServer.close().catch(() => {});
      }

      report.summary.readyToFreeze = report.summary.fail.length === 0 && report.summary.skipped.length === 0;

      const ts = Date.now();
      const reportPath = join(evalOutDir, `validation-set-report-${ts}.json`);
      writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

      // ── Markdown summary ─────────────────────────────────────────────────────
      const mdLines: string[] = [
        `# Validation Set Runtime/Export Report`,
        ``,
        `**Generated:** ${report.generatedAt}`,
        `**Test set:** ${report.testSet}`,
        ``,
        `## PASS/FAIL per dokument`,
        ``,
        `| ID | Dokument | Requested file | Resolved file | Status | Confidence | Notes |`,
        `|---|---|---|---|---|---|---|`,
      ];
      for (const d of report.docs) {
        const row = d as Record<string, unknown>;
        const statusEmoji = row.status === "PASS" ? "PASS" : row.status === "skipped" ? "SKIP" : "FAIL";
        const conf = (row.I_confidence as { percent?: string } | undefined)?.percent ?? "–";
        const note = (row.fileSubstitutionNote as string | undefined) ?? "";
        mdLines.push(`| ${row.id} | ${row.label} | \`${row.requestedFile}\` | \`${row.resolvedFile}\` | **${statusEmoji}** | ${conf} | ${note} |`);
      }
      mdLines.push(``);
      mdLines.push(`## Summary`);
      mdLines.push(``);
      mdLines.push(`- **PASS:** ${report.summary.pass.join(", ") || "none"}`);
      mdLines.push(`- **FAIL:** ${report.summary.fail.join(", ") || "none"}`);
      mdLines.push(`- **SKIPPED:** ${report.summary.skipped.join(", ") || "none"}`);
      mdLines.push(`- **READY TO FREEZE:** ${report.summary.readyToFreeze ? "ANO" : "NE"}`);
      mdLines.push(``);

      // Per-doc first loss points
      const failDocs = report.docs.filter((d) => (d as Record<string, unknown>).status === "FAIL");
      if (failDocs.length > 0) {
        mdLines.push(`## První místo ztráty dat (FAIL dokumenty)`);
        mdLines.push(``);
        for (const d of failDocs) {
          const row = d as Record<string, unknown>;
          const lp = row.firstLossPoints as string[] | undefined;
          mdLines.push(`### ${row.id} — ${row.label}`);
          if (lp && lp.length > 0) {
            for (const l of lp) mdLines.push(`- ${l}`);
          } else {
            mdLines.push(`- (žádný loss point detekován — viz trace)`);
          }
          mdLines.push(``);
        }
      }

      mdLines.push(`## JSON Report`);
      mdLines.push(``);
      mdLines.push(`\`${reportPath}\``);
      mdLines.push(``);

      const mdPath = join(evalOutDir, `validation-set-summary-${ts}.md`);
      writeFileSync(mdPath, mdLines.join("\n"), "utf8");

      console.info("\n=== VALIDATION SET SUMMARY ===");
      console.info(`PASS: ${report.summary.pass.join(", ") || "none"}`);
      console.info(`FAIL: ${report.summary.fail.join(", ") || "none"}`);
      console.info(`SKIPPED: ${report.summary.skipped.join(", ") || "none"}`);
      console.info(`READY TO FREEZE: ${report.summary.readyToFreeze ? "ANO" : "NE"}`);
      console.info(`JSON report: ${reportPath}`);
      console.info(`MD summary: ${mdPath}`);

      expect(report.summary.fail, `FAILing docs: ${report.summary.fail.join(", ")}`).toHaveLength(0);
    },
    600_000
  );
});

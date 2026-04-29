/**
 * AI Review batch regression lab — reuses production pipeline (`runContractUnderstandingPipeline`)
 * with the same local-PDF HTTP serving strategy as `golden-dataset-live-pipeline.eval.test.ts`.
 *
 * Rule: never fork a parallel extraction pipeline; batch is observability-only over the real V2 path.
 */

import { createServer } from "node:http";
import type { Dirent } from "node:fs";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runContractUnderstandingPipeline } from "@/lib/ai/contract-understanding-pipeline";
import { applyCanonicalNormalizationToEnvelope } from "@/lib/ai/life-insurance-canonical-normalizer";
import { segmentDocumentPacket } from "@/lib/ai/document-packet-segmentation";
import type { DocumentReviewEnvelope } from "@/lib/ai/document-review-types";
import { evaluateApplyReadiness, type ApplyReadiness } from "@/lib/ai/quality-gates";
import { validateBeforeApply } from "@/lib/ai/pre-apply-validation";
import { segmentFromPrimaryType } from "@/lib/ai/canonical-segment-mapping";
import type { ContractReviewRow, ExtractionTrace } from "@/lib/ai/review-queue-repository";
import { getDocumentTypeLabel } from "@/lib/ai/document-messages";
import { isLifecycleNonFinalProjection } from "@/lib/ai/lifecycle-semantics";
import {
  isAiReviewLlmPostprocessEnabled,
  parseAiReviewClientMatchKind,
  runAiReviewClientMatchLlm,
} from "@/lib/ai/ai-review-llm-postprocess";
import { isContractSegmentCode } from "@/lib/contracts/contract-segment-wizard-config";

export type BatchTrafficLight = "GREEN" | "YELLOW" | "RED";

export type SeverityCategory =
  | "structured_form_extraction"
  | "segment_mapping"
  | "finality"
  | "client_matching"
  | "crm_write_through"
  | "ocr"
  | "ui_humanization";

export type BatchFileResult = {
  filename: string;
  relativePath: string;
  documentTypeLabel: string;
  primaryType: string;
  /** Contract segment (ZP, INV, …) or null */
  segment: string | null;
  normalizedPipelineClassification: string | null;
  clientName: string | null;
  institution: string | null;
  productOrFund: string | null;
  contractNumber: string | null;
  accountIbanVs: string | null;
  advisorOrIntermediary: string | null;
  finalityVerdict: string;
  publishEligible: boolean;
  applyReadiness: ApplyReadiness;
  matchVerdict: string | null;
  extractedIdentity: Record<string, unknown>;
  extractedPayment: Record<string, unknown>;
  extractedInvestmentOrInsurance: Record<string, unknown>;
  warnings: string[];
  blockingReasons: string[];
  writeThroughErrors: string[];
  ocrStatus: string;
  rawPipelineError: string | null;
  trafficLight: BatchTrafficLight;
  worstScore: number;
  severityByCategory: Record<SeverityCategory, "ok" | "warn" | "fail">;
  latencyMs: number | null;
  pipelineOk: boolean;
};

export type BatchSummary = {
  generatedAt: string;
  inputRoot: string;
  outputDir: string;
  fileCount: number;
  traffic: { GREEN: number; YELLOW: number; RED: number };
  severitySummary: Record<SeverityCategory, { ok: number; warn: number; fail: number }>;
  top20Worst: { filename: string; relativePath: string; worstScore: number; trafficLight: BatchTrafficLight; reasons: string[] }[];
  results: BatchFileResult[];
};

function startPdfServer(rootDir: string): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const rootResolved = path.resolve(rootDir);
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
      const abs = path.resolve(rootResolved, rel);
      if (!abs.startsWith(rootResolved + path.sep) && abs !== rootResolved) {
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

function pdfHttpUrl(baseUrl: string, pathRelativeToRoot: string): string {
  const token = Buffer.from(pathRelativeToRoot, "utf8").toString("base64url");
  return `${baseUrl}/pdf/${token}`;
}

async function extractPdfTextHintFromDisk(pdfAbsolutePath: string): Promise<string | null> {
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

function collectPdfFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".pdf")) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

function fieldStr(
  ef: Record<string, { value?: unknown } | undefined> | undefined,
  keys: string[]
): string | null {
  if (!ef) return null;
  for (const k of keys) {
    const v = ef[k]?.value;
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return null;
}

function snapshotIdentity(env: DocumentReviewEnvelope): Record<string, unknown> {
  const ef = (env.extractedFields ?? {}) as Record<string, { value?: unknown }>;
  return {
    policyholderName: fieldStr(ef, ["policyholderName", "fullName", "clientName", "participantName"]),
    personalId: fieldStr(ef, ["personalId", "birthNumber", "rc", "clientPersonalId"]),
    birthDate: fieldStr(ef, ["birthDate", "dateOfBirth"]),
    address: fieldStr(ef, ["address", "permanentAddress"]),
    email: fieldStr(ef, ["email", "contactEmail"]),
    phone: fieldStr(ef, ["phone", "mobile", "contactPhone"]),
    participants: env.participants?.slice(0, 5) ?? [],
  };
}

function snapshotPayment(env: DocumentReviewEnvelope): Record<string, unknown> {
  const ef = (env.extractedFields ?? {}) as Record<string, { value?: unknown }>;
  const pd = env.paymentData;
  return {
    iban: pd?.iban ?? fieldStr(ef, ["iban"]),
    accountNumber: pd?.accountNumber ?? fieldStr(ef, ["accountNumber", "bankAccount"]),
    bankCode: pd?.bankCode ?? fieldStr(ef, ["bankCode"]),
    variableSymbol: pd?.variableSymbol ?? fieldStr(ef, ["variableSymbol", "vs"]),
    constantSymbol: fieldStr(ef, ["constantSymbol"]),
    amount: fieldStr(ef, ["premiumAmount", "regularAmount", "totalMonthlyPremium", "amount"]),
    paymentFrequency: pd?.paymentFrequency ?? fieldStr(ef, ["paymentFrequency"]),
  };
}

function snapshotInvestmentInsurance(env: DocumentReviewEnvelope): Record<string, unknown> {
  const inv = env.investmentData;
  const ef = (env.extractedFields ?? {}) as Record<string, { value?: unknown }>;
  return {
    funds: inv?.funds?.slice(0, 8) ?? [],
    strategy: inv?.strategy ?? fieldStr(ef, ["investmentStrategy", "strategy"]),
    investmentAmount: inv?.investmentAmount ?? fieldStr(ef, ["investmentAmount", "singleInvestment"]),
    insurer: fieldStr(ef, ["insurer", "partnerName", "institutionName"]),
    productName: fieldStr(ef, ["productName", "tariffName", "fundName"]),
    insuredRisks: env.insuredRisks?.slice(0, 8) ?? [],
  };
}

function classifyTraffic(
  pipelineOk: boolean,
  readiness: ApplyReadiness
): BatchTrafficLight {
  if (!pipelineOk || readiness === "blocked_for_apply") return "RED";
  if (readiness === "review_required") return "YELLOW";
  return "GREEN";
}

function worstScoreFrom(r: {
  pipelineOk: boolean;
  trafficLight: BatchTrafficLight;
  blockingReasons: string[];
  warnings: string[];
  writeThroughErrors: string[];
}): number {
  let s = 0;
  if (!r.pipelineOk) s += 1000;
  if (r.trafficLight === "RED") s += 500;
  if (r.trafficLight === "YELLOW") s += 200;
  s += r.blockingReasons.length * 40;
  s += r.writeThroughErrors.length * 35;
  s += r.warnings.length * 5;
  return s;
}

function deriveSeverity(r: {
  pipelineOk: boolean;
  rawPipelineError: string | null;
  blockingReasons: string[];
  warnings: string[];
  writeThroughErrors: string[];
  matchVerdict: string | null;
  segment: string | null;
  finalityVerdict: string;
  ocrStatus: string;
  applyReadiness: ApplyReadiness;
}): Record<SeverityCategory, "ok" | "warn" | "fail"> {
  const structured: "ok" | "warn" | "fail" =
    !r.pipelineOk || r.blockingReasons.some((x) => /EXTRACTION|SCHEMA|VALIDATION|FIELD/i.test(x))
      ? "fail"
      : r.warnings.some((w) => /field|extract|form/i.test(w))
        ? "warn"
        : "ok";

  const seg: "ok" | "warn" | "fail" = !r.segment ? "warn" : "ok";

  const lifecycle = r.finalityVerdict;
  const finality: "ok" | "warn" | "fail" = lifecycle.includes("non_final") || lifecycle.includes("projection")
    ? "warn"
    : "ok";

  const client: "ok" | "warn" | "fail" =
    r.matchVerdict === "ambiguous_match"
      ? "fail"
      : r.matchVerdict === "near_match" || r.matchVerdict === "no_match"
        ? "warn"
        : "ok";

  const crm: "ok" | "warn" | "fail" =
    r.writeThroughErrors.length > 0 || r.blockingReasons.length > 0
      ? "fail"
      : r.applyReadiness === "review_required"
        ? "warn"
        : "ok";

  const ocr: "ok" | "warn" | "fail" =
    r.ocrStatus.includes("fail") || r.ocrStatus.includes("LOW")
      ? "fail"
      : r.ocrStatus.includes("warn") || r.ocrStatus.includes("estimate_low")
        ? "warn"
        : "ok";

  const ui: "ok" | "warn" | "fail" =
    r.warnings.some((w) => /human|label|reason_code|english/i.test(w)) ? "warn" : "ok";

  return {
    structured_form_extraction: structured,
    segment_mapping: seg,
    finality,
    client_matching: client,
    crm_write_through: crm,
    ocr,
    ui_humanization: ui,
  };
}

export type RunAiReviewBatchLabOptions = {
  inputRoot: string;
  outputDir: string;
  tenantId?: string | null;
  delayMs?: number;
};

export async function runAiReviewBatchLab(options: RunAiReviewBatchLabOptions): Promise<BatchSummary> {
  const inputRoot = path.resolve(options.inputRoot);
  const outputDir = path.resolve(options.outputDir);
  if (!existsSync(inputRoot)) {
    throw new Error(`Input root does not exist: ${inputRoot}`);
  }
  mkdirSync(outputDir, { recursive: true });

  const pdfs = collectPdfFiles(inputRoot);
  const delayMs =
    options.delayMs ?? Math.max(0, Number(process.env.AI_REVIEW_BATCH_DELAY_MS ?? "400") || 0);
  const tenantId = (options.tenantId ?? process.env.AI_REVIEW_BATCH_TENANT_ID?.trim()) || null;

  const server = await startPdfServer(inputRoot);
  const results: BatchFileResult[] = [];

  try {
    for (const abs of pdfs) {
      const rel = path.relative(inputRoot, abs).split(path.sep).join("/");
      const basename = path.basename(abs);
      const fileUrl = pdfHttpUrl(server.baseUrl, rel);
      const ruleBasedTextHint: string | null = await extractPdfTextHintFromDisk(abs);

      await new Promise((r) => setTimeout(r, delayMs));

      try {
        const preprocessMeta = {
          preprocessStatus: "golden_eval_local" as const,
          preprocessMode: "local_batch_lab",
          preprocessWarnings: ruleBasedTextHint ? [] : ["no_local_pdf_text_hint"],
          ...(typeof ruleBasedTextHint === "string" && ruleBasedTextHint.length > 800
            ? { readabilityScore: 72 }
            : {}),
        };

        const pipelineResult = await runContractUnderstandingPipeline(fileUrl, "application/pdf", {
          ruleBasedTextHint,
          preprocessMeta,
          sourceFileName: basename,
        });

        if (!pipelineResult.ok) {
          const errMsg = pipelineResult.errorMessage ?? "pipeline_failed";
          const trace = pipelineResult.extractionTrace;
          results.push({
            filename: basename,
            relativePath: rel,
            documentTypeLabel: "—",
            primaryType: "—",
            segment: null,
            normalizedPipelineClassification: trace?.normalizedPipelineClassification ?? null,
            clientName: null,
            institution: null,
            productOrFund: null,
            contractNumber: null,
            accountIbanVs: null,
            advisorOrIntermediary: null,
            finalityVerdict: "pipeline_error",
            publishEligible: false,
            applyReadiness: "blocked_for_apply",
            matchVerdict: null,
            extractedIdentity: {},
            extractedPayment: {},
            extractedInvestmentOrInsurance: {},
            warnings: [...(trace?.warnings ?? []), ...(trace?.qualityWarnings ?? [])],
            blockingReasons: ["PIPELINE_FAILED", trace?.failedStep ?? "unknown_step"].filter(Boolean) as string[],
            writeThroughErrors: [],
            ocrStatus: trace?.preprocessStatus === "failed" ? "preprocess_failed" : "unknown",
            rawPipelineError: errMsg,
            trafficLight: "RED",
            worstScore: 1000,
            severityByCategory: {
              structured_form_extraction: "fail",
              segment_mapping: "fail",
              finality: "fail",
              client_matching: "fail",
              crm_write_through: "fail",
              ocr: "fail",
              ui_humanization: "ok",
            },
            latencyMs: trace?.totalPipelineDurationMs ?? null,
            pipelineOk: false,
          });
          continue;
        }

        const data = pipelineResult.extractedPayload as unknown as DocumentReviewEnvelope;
        const seg = segmentDocumentPacket(ruleBasedTextHint ?? "", null, basename);
        applyCanonicalNormalizationToEnvelope(data, seg.packetMeta);
        data.packetMeta = seg.packetMeta;

        const primaryType = String(data.documentClassification?.primaryType ?? "");
        const segment = segmentFromPrimaryType(primaryType as Parameters<typeof segmentFromPrimaryType>[0]);
        const docLabel = getDocumentTypeLabel(primaryType as Parameters<typeof getDocumentTypeLabel>[0]);

        const ef = (data.extractedFields ?? {}) as Record<string, { value?: unknown }>;
        const clientName =
          fieldStr(ef, ["policyholderName", "fullName", "clientName", "participantName", "investorName"]) ??
          null;
        const institution =
          fieldStr(ef, ["insurer", "institutionName", "partnerName", "bankName", "lender", "pensionFundName"]) ??
          null;
        const productOrFund = fieldStr(ef, ["productName", "tariffName", "fundName", "strategyName"]) ?? null;
        const contractNumber =
          fieldStr(ef, ["contractNumber", "proposalNumber", "proposalNumber_or_contractNumber"]) ?? null;
        const accountIbanVs =
          [fieldStr(ef, ["iban"]), fieldStr(ef, ["accountNumber", "bankAccount"]), fieldStr(ef, ["variableSymbol"])]
            .filter(Boolean)
            .join(" / ") || null;
        const advisorOrIntermediary =
          fieldStr(ef, ["advisorName", "intermediaryName", "brokerName", "agentName"]) ?? null;

        const lc = String(data.documentClassification?.lifecycleStatus ?? "");
        const nonFinal = isLifecycleNonFinalProjection(lc);
        const finalityVerdict = nonFinal ? `non_final:${lc}` : `final_or_neutral:${lc}`;

        const trace = pipelineResult.extractionTrace as ExtractionTrace;

        let resolvedMatchVerdict: string | null = null;
        let clientMatchLlmKind: string | null = null;
        if (tenantId) {
          try {
            const { findClientCandidates, computeMatchVerdict } = await import("@/lib/ai/client-matching");
            const candidates = await findClientCandidates(data, { tenantId });
            let verdictResult = computeMatchVerdict(candidates);
            if (isAiReviewLlmPostprocessEnabled()) {
              const llm = await runAiReviewClientMatchLlm({
                extractionPartiesJson: JSON.stringify(data.parties ?? {}),
                dbCandidatesJson: JSON.stringify(
                  candidates.slice(0, 8).map((c) => ({
                    clientId: c.clientId,
                    displayName: c.displayName,
                    score: c.score,
                    reasons: c.reasons,
                  }))
                ),
              });
              if (llm?.ok) {
                clientMatchLlmKind = parseAiReviewClientMatchKind(llm.text);
                if (clientMatchLlmKind === "ambiguous" && verdictResult.verdict === "near_match") {
                  verdictResult = {
                    verdict: "ambiguous_match",
                    autoResolvedClientId: null,
                    reason: "llm_downgrade_near_to_ambiguous",
                  };
                }
              }
            }
            resolvedMatchVerdict = verdictResult.verdict;
          } catch {
            resolvedMatchVerdict = "tenant_lookup_failed";
          }
        } else {
          resolvedMatchVerdict = "skipped_no_tenant_id";
        }

        const row: ContractReviewRow = {
          id: "batch-lab",
          tenantId: tenantId ?? "batch-lab",
          fileName: basename,
          storagePath: rel,
          mimeType: "application/pdf",
          sizeBytes: null,
          processingStatus: pipelineResult.processingStatus,
          processingStage: null,
          errorMessage: null,
          extractedPayload: {
            ...data,
            packetMeta: seg.packetMeta,
          },
          clientMatchCandidates: [],
          draftActions: null,
          confidence: pipelineResult.confidence,
          reasonsForReview: pipelineResult.reasonsForReview,
          reviewStatus: null,
          uploadedBy: null,
          reviewedBy: null,
          reviewedAt: null,
          rejectReason: null,
          appliedBy: null,
          appliedAt: null,
          matchedClientId: null,
          createNewClientConfirmed: null,
          applyResultPayload: null,
          reviewDecisionReason: pipelineResult.reviewDecisionReason ?? null,
          inputMode: pipelineResult.inputMode,
          extractionMode: pipelineResult.extractionMode,
          detectedDocumentType: primaryType,
          detectedDocumentSubtype: null,
          lifecycleStatus: lc,
          documentIntent: String(data.documentClassification?.documentIntent ?? ""),
          userDeclaredDocumentIntent: null,
          extractionTrace: {
            ...trace,
            matchVerdict: resolvedMatchVerdict,
            ...(clientMatchLlmKind ? { llmClientMatchKind: clientMatchLlmKind } : {}),
          },
          validationWarnings: pipelineResult.validationWarnings,
          fieldConfidenceMap: pipelineResult.fieldConfidenceMap,
          classificationReasons: pipelineResult.classificationReasons,
          dataCompleteness: null,
          sensitivityProfile: data.sensitivityProfile ?? null,
          sectionSensitivity: null,
          relationshipInference: null,
          originalExtractedPayload: null,
          correctedPayload: null,
          correctedFields: null,
          correctedDocumentType: null,
          correctedLifecycleStatus: null,
          fieldMarkedNotApplicable: null,
          linkedClientOverride: null,
          linkedDealOverride: null,
          confidenceOverride: null,
          ignoredWarnings: null,
          correctionReason: null,
          correctedBy: null,
          correctedAt: null,
          matchVerdict: resolvedMatchVerdict,
          productCategory: null,
          productSubtypes: null,
          extractionConfidence: null,
          needsHumanReview: null,
          missingFields: null,
          proposedAssumptions: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const gate = evaluateApplyReadiness(row);
        const publishEligible = gate.readiness === "ready_for_apply";

        const preApply =
          segment && isContractSegmentCode(segment)
            ? validateBeforeApply(data, segment)
            : { valid: true, issues: [] as { rule: string; message: string; severity: "error" | "warning" }[] };
        const writeThroughErrors = [
          ...gate.blockedReasons,
          ...gate.applyBarrierReasons,
          ...preApply.issues.filter((i) => i.severity === "error").map((i) => `${i.rule}: ${i.message}`),
        ];

        const warnings = [
          ...gate.warnings,
          ...(data.reviewWarnings?.map((w) => w.message ?? w.code) ?? []),
          ...pipelineResult.validationWarnings.map((w) => w.message ?? w.code),
        ];

        const blockingReasons = [...gate.blockedReasons, ...gate.applyBarrierReasons];

        const ocrConfidence = trace?.ocrConfidenceEstimate;
        const ocrStatus = [
          trace?.preprocessStatus ?? "unknown",
          typeof ocrConfidence === "number" ? `ocr_est=${ocrConfidence.toFixed(2)}` : "ocr_est=n/a",
          trace?.readabilityScore != null ? `readability=${trace.readabilityScore}` : "",
        ]
          .filter(Boolean)
          .join("; ");

        const base: Omit<BatchFileResult, "severityByCategory" | "worstScore" | "trafficLight"> = {
          filename: basename,
          relativePath: rel,
          documentTypeLabel: docLabel,
          primaryType,
          segment,
          normalizedPipelineClassification: trace?.normalizedPipelineClassification ?? null,
          clientName,
          institution,
          productOrFund,
          contractNumber,
          accountIbanVs,
          advisorOrIntermediary,
          finalityVerdict,
          publishEligible,
          applyReadiness: gate.readiness,
          matchVerdict: resolvedMatchVerdict,
          extractedIdentity: snapshotIdentity(data),
          extractedPayment: snapshotPayment(data),
          extractedInvestmentOrInsurance: snapshotInvestmentInsurance(data),
          warnings,
          blockingReasons,
          writeThroughErrors,
          ocrStatus,
          rawPipelineError: null,
          latencyMs: trace?.totalPipelineDurationMs ?? null,
          pipelineOk: true,
        };

        const trafficLight = classifyTraffic(true, gate.readiness);
        const severityByCategory = deriveSeverity({
          pipelineOk: base.pipelineOk,
          rawPipelineError: base.rawPipelineError,
          blockingReasons: base.blockingReasons,
          warnings: base.warnings,
          writeThroughErrors: base.writeThroughErrors,
          matchVerdict: base.matchVerdict,
          segment: base.segment,
          finalityVerdict: base.finalityVerdict,
          ocrStatus: base.ocrStatus,
          applyReadiness: base.applyReadiness,
        });
        const worstScore = worstScoreFrom({
          pipelineOk: true,
          trafficLight,
          blockingReasons,
          warnings,
          writeThroughErrors,
        });

        results.push({ ...base, trafficLight, severityByCategory, worstScore });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({
          filename: basename,
          relativePath: rel,
          documentTypeLabel: "—",
          primaryType: "—",
          segment: null,
          normalizedPipelineClassification: null,
          clientName: null,
          institution: null,
          productOrFund: null,
          contractNumber: null,
          accountIbanVs: null,
          advisorOrIntermediary: null,
          finalityVerdict: "exception",
          publishEligible: false,
          applyReadiness: "blocked_for_apply",
          matchVerdict: null,
          extractedIdentity: {},
          extractedPayment: {},
          extractedInvestmentOrInsurance: {},
          warnings: [],
          blockingReasons: ["UNCAUGHT_EXCEPTION"],
          writeThroughErrors: [msg],
          ocrStatus: "unknown",
          rawPipelineError: msg,
          trafficLight: "RED",
          worstScore: 2000,
          severityByCategory: {
            structured_form_extraction: "fail",
            segment_mapping: "fail",
            finality: "fail",
            client_matching: "fail",
            crm_write_through: "fail",
            ocr: "fail",
            ui_humanization: "ok",
          },
          latencyMs: null,
          pipelineOk: false,
        });
      }
    }
  } finally {
    await server.close();
  }

  const traffic = { GREEN: 0, YELLOW: 0, RED: 0 };
  for (const r of results) {
    traffic[r.trafficLight]++;
  }

  const severitySummary: BatchSummary["severitySummary"] = {
    structured_form_extraction: { ok: 0, warn: 0, fail: 0 },
    segment_mapping: { ok: 0, warn: 0, fail: 0 },
    finality: { ok: 0, warn: 0, fail: 0 },
    client_matching: { ok: 0, warn: 0, fail: 0 },
    crm_write_through: { ok: 0, warn: 0, fail: 0 },
    ocr: { ok: 0, warn: 0, fail: 0 },
    ui_humanization: { ok: 0, warn: 0, fail: 0 },
  };
  const catKeys = Object.keys(severitySummary) as SeverityCategory[];
  for (const r of results) {
    for (const c of catKeys) {
      const v = r.severityByCategory[c];
      severitySummary[c][v]++;
    }
  }

  const top20Worst = [...results]
    .sort((a, b) => b.worstScore - a.worstScore)
    .slice(0, 20)
    .map((r) => ({
      filename: r.filename,
      relativePath: r.relativePath,
      worstScore: r.worstScore,
      trafficLight: r.trafficLight,
      reasons: [
        ...r.blockingReasons.slice(0, 5),
        ...r.writeThroughErrors.slice(0, 3),
        ...(r.rawPipelineError ? [r.rawPipelineError] : []),
      ].filter(Boolean),
    }));

  const summary: BatchSummary = {
    generatedAt: new Date().toISOString(),
    inputRoot,
    outputDir,
    fileCount: results.length,
    traffic,
    severitySummary,
    top20Worst,
    results,
  };

  writeFileSync(path.join(outputDir, "results.json"), JSON.stringify(summary, null, 2), "utf8");

  writeFileSync(path.join(outputDir, "report.md"), renderMarkdownReport(summary), "utf8");

  writeFileSync(path.join(outputDir, "report.html"), renderHtmlReport(summary), "utf8");

  return summary;
}

function renderMarkdownReport(s: BatchSummary): string {
  const lines: string[] = [];
  lines.push(`# AI Review batch lab`);
  lines.push(``);
  lines.push(`- Generated: ${s.generatedAt}`);
  lines.push(`- Input: \`${s.inputRoot}\``);
  lines.push(`- Files: ${s.fileCount}`);
  lines.push(`- Traffic: GREEN=${s.traffic.GREEN}, YELLOW=${s.traffic.YELLOW}, RED=${s.traffic.RED}`);
  lines.push(``);
  lines.push(`## Severity summary (categories)`);
  lines.push(`| Category | ok | warn | fail |`);
  lines.push(`| --- | --- | --- | --- |`);
  for (const [k, v] of Object.entries(s.severitySummary)) {
    lines.push(`| ${k} | ${v.ok} | ${v.warn} | ${v.fail} |`);
  }
  lines.push(``);
  lines.push(`## Top 20 worst`);
  for (const r of s.top20Worst) {
    lines.push(`- **${r.trafficLight}** ${r.relativePath} (score ${r.worstScore})`);
    if (r.reasons.length) lines.push(`  - ${r.reasons.join("; ")}`);
  }
  lines.push(``);
  lines.push(`## Per file`);
  for (const r of s.results) {
    lines.push(`### ${r.trafficLight} — ${r.relativePath}`);
    lines.push(`- Type: ${r.documentTypeLabel} (\`${r.primaryType}\`) · segment: ${r.segment ?? "—"}`);
    lines.push(`- Publish eligible: ${r.publishEligible ? "ano" : "ne"} · match: ${r.matchVerdict ?? "—"}`);
    lines.push(`- OCR: ${r.ocrStatus}`);
    if (r.rawPipelineError) lines.push(`- Pipeline error: ${r.rawPipelineError}`);
    if (r.blockingReasons.length) lines.push(`- Blocking: ${r.blockingReasons.join(", ")}`);
    if (r.writeThroughErrors.length) lines.push(`- Write-through / pre-apply: ${r.writeThroughErrors.join("; ")}`);
  }
  return lines.join("\n");
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtmlReport(s: BatchSummary): string {
  const rows = s.results
    .map((r) => {
      const cls =
        r.trafficLight === "GREEN" ? "green" : r.trafficLight === "YELLOW" ? "yellow" : "red";
      return `<tr class="${cls}"><td>${escHtml(r.relativePath)}</td><td>${r.trafficLight}</td><td>${escHtml(
        r.primaryType
      )}</td><td>${escHtml(r.matchVerdict ?? "—")}</td><td>${r.publishEligible ? "ano" : "ne"}</td><td>${escHtml(
        (r.rawPipelineError ?? "").slice(0, 120)
      )}</td></tr>`;
    })
    .join("\n");

  const sevRows = Object.entries(s.severitySummary)
    .map(
      ([k, v]) =>
        `<tr><td>${escHtml(k)}</td><td>${v.ok}</td><td>${v.warn}</td><td>${v.fail}</td></tr>`
    )
    .join("\n");

  const worst = s.top20Worst
    .map(
      (w) =>
        `<li><strong>${w.trafficLight}</strong> ${escHtml(w.relativePath)} — ${w.worstScore}<br/><small>${escHtml(
          w.reasons.join("; ")
        )}</small></li>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="cs"><head><meta charset="utf-8"/><title>AI Review batch lab</title>
<style>
body{font-family:system-ui,sans-serif;margin:24px;}
.green{background:#e8f5e9;}
.yellow{background:#fff9c4;}
.red{background:#ffebee;}
table{border-collapse:collapse;width:100%;}
td,th{border:1px solid #ccc;padding:6px 8px;font-size:13px;}
h1{font-size:20px;}
</style></head><body>
<h1>AI Review batch lab</h1>
<p>${escHtml(s.generatedAt)} · ${s.fileCount} souborů · GREEN ${s.traffic.GREEN} · YELLOW ${s.traffic.YELLOW} · RED ${s.traffic.RED}</p>
<h2>Severity summary</h2>
<table><thead><tr><th>Category</th><th>ok</th><th>warn</th><th>fail</th></tr></thead><tbody>${sevRows}</tbody></table>
<h2>Top 20 worst</h2><ol>${worst}</ol>
<h2>All files</h2>
<table><thead><tr><th>File</th><th>Traffic</th><th>Primary</th><th>Match</th><th>Publish</th><th>Error</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`;
}

/** @internal */
export const __test__ = { collectPdfFiles };

import type { ContractReviewRow } from "./review-queue-repository";

export type PaymentInstructionPreview = {
  institutionName?: string;
  productName?: string;
  payerName?: string;
  beneficiaryName?: string;
  amount?: string | number;
  currency?: string;
  paymentFrequency?: string;
  dueDate?: string;
  dueDay?: string | number;
  paymentChannel?: string;
  reference?: string;
  variableSymbol?: string;
  constantSymbol?: string;
  specificSymbol?: string;
  confidence?: number;
  needsHumanReview?: boolean;
  ibanHint?: string;
};

/** Advisor-facing pipeline summary (no raw document or full IBAN). */
export type PipelineInsights = {
  normalizedPipelineClassification?: string;
  extractionRoute?: string;
  rawClassification?: string;
  preprocessStatus?: string;
  preprocessMode?: string;
  adobePreprocessed?: boolean;
  adobeWarnings?: string[];
  textCoverageEstimate?: number;
  readabilityScore?: number;
  failedStep?: string;
  paymentPreview?: PaymentInstructionPreview;
  /** Adobe / OCR před LLM (ms). */
  preprocessDurationMs?: number;
  /** LLM + validace po preprocessu (ms). */
  pipelineDurationMs?: number;
  /** Celkem preprocess + pipeline (ms), pokud jsou obě známé. */
  totalProcessingDurationMs?: number;
  /** Druhý krok extrakce: celé PDF vs text z preprocessu vs Prompt Builder nad textem. */
  extractionSecondPass?: "pdf" | "text" | "prompt_text";
};

function maskIbanHint(iban: unknown): string | undefined {
  if (typeof iban !== "string" || !iban.trim()) return undefined;
  const c = iban.replace(/\s/g, "");
  if (c.length < 8) return "••••";
  return `…${c.slice(-4)}`;
}

/** Safe advisor-facing preview (no full IBAN/account). */
export function buildPipelineInsightsFromReviewRow(row: ContractReviewRow): PipelineInsights {
  const trace = row.extractionTrace ?? {};
  const payload =
    row.extractedPayload && typeof row.extractedPayload === "object"
      ? (row.extractedPayload as Record<string, unknown>)
      : null;
  const debug = payload?.debug as Record<string, unknown> | undefined;
  const rawPay = debug?.paymentInstructionExtraction as Record<string, unknown> | undefined;

  let paymentPreview: PaymentInstructionPreview | undefined;
  if (rawPay && typeof rawPay === "object") {
    paymentPreview = {
      institutionName: typeof rawPay.institutionName === "string" ? rawPay.institutionName : undefined,
      productName: typeof rawPay.productName === "string" ? rawPay.productName : undefined,
      payerName: typeof rawPay.payerName === "string" ? rawPay.payerName : undefined,
      beneficiaryName: typeof rawPay.beneficiaryName === "string" ? rawPay.beneficiaryName : undefined,
      amount: rawPay.amount as string | number | undefined,
      currency: typeof rawPay.currency === "string" ? rawPay.currency : undefined,
      paymentFrequency: typeof rawPay.paymentFrequency === "string" ? rawPay.paymentFrequency : undefined,
      dueDate: typeof rawPay.dueDate === "string" ? rawPay.dueDate : undefined,
      dueDay: rawPay.dueDay as string | number | undefined,
      paymentChannel: typeof rawPay.paymentChannel === "string" ? rawPay.paymentChannel : undefined,
      reference: typeof rawPay.reference === "string" ? rawPay.reference : undefined,
      variableSymbol: typeof rawPay.variableSymbol === "string" ? rawPay.variableSymbol : undefined,
      constantSymbol: typeof rawPay.constantSymbol === "string" ? rawPay.constantSymbol : undefined,
      specificSymbol: typeof rawPay.specificSymbol === "string" ? rawPay.specificSymbol : undefined,
      confidence: typeof rawPay.confidence === "number" ? rawPay.confidence : undefined,
      needsHumanReview: typeof rawPay.needsHumanReview === "boolean" ? rawPay.needsHumanReview : undefined,
      ibanHint: maskIbanHint(rawPay.iban),
    };
  }

  const preprocessDurationMs =
    typeof trace.preprocessDurationMs === "number" ? trace.preprocessDurationMs : undefined;
  const pipelineDurationMs =
    typeof trace.pipelineDurationMs === "number" ? trace.pipelineDurationMs : undefined;
  const totalProcessingDurationMs =
    preprocessDurationMs != null && pipelineDurationMs != null
      ? preprocessDurationMs + pipelineDurationMs
      : undefined;

  return {
    normalizedPipelineClassification: trace.normalizedPipelineClassification,
    extractionRoute: trace.extractionRoute,
    rawClassification: trace.rawClassification ?? row.detectedDocumentType ?? undefined,
    preprocessStatus: trace.preprocessStatus,
    preprocessMode: trace.preprocessMode,
    adobePreprocessed: trace.adobePreprocessed,
    adobeWarnings: trace.adobeWarnings,
    textCoverageEstimate: trace.textCoverageEstimate,
    readabilityScore: trace.readabilityScore,
    failedStep: trace.failedStep,
    paymentPreview,
    preprocessDurationMs,
    pipelineDurationMs,
    totalProcessingDurationMs,
    extractionSecondPass: trace.extractionSecondPass,
  };
}

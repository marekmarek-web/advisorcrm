import type {
  DocumentProcessingProvider,
  DocumentProcessingJobType,
  DocumentProcessingStatus,
  DocumentProcessingStage,
  DocumentAiInputSource,
} from "db";

export type ProcessingInput = {
  documentId: string;
  tenantId: string;
  storagePath: string;
  mimeType: string | null;
  fileUrl: string;
  pageCount: number | null;
  isScanLike: boolean | null;
  hasTextLayer: boolean | null;
};

export type ProcessingOutput = {
  success: boolean;
  outputPath?: string;
  outputContent?: string;
  error?: string;
  providerJobId?: string;
  metadata?: Record<string, unknown>;
};

export interface DocumentProcessingProviderInterface {
  readonly name: DocumentProcessingProvider;
  isEnabled(): boolean;
  runOcr(input: ProcessingInput): Promise<ProcessingOutput>;
  runMarkdown(input: ProcessingInput): Promise<ProcessingOutput>;
  runExtract(input: ProcessingInput): Promise<ProcessingOutput>;
}

export type ProcessingDecision = {
  shouldProcess: boolean;
  runOcr: boolean;
  runMarkdown: boolean;
  runExtract: boolean;
  reason: string;
};

export type OrchestratorResult = {
  success: boolean;
  processingStatus: DocumentProcessingStatus;
  processingStage: DocumentProcessingStage;
  aiInputSource: DocumentAiInputSource;
  ocrPdfPath?: string;
  markdownPath?: string;
  markdownContent?: string;
  extractJsonPath?: string;
  error?: string;
};

export { type DocumentProcessingProvider, type DocumentProcessingJobType };

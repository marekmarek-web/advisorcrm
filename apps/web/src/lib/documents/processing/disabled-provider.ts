import type { DocumentProcessingProviderInterface, ProcessingInput, ProcessingOutput } from "./types";

const DISABLED_RESULT: ProcessingOutput = {
  success: true,
  error: undefined,
  metadata: { reason: "processing_disabled" },
};

export class DisabledProvider implements DocumentProcessingProviderInterface {
  readonly name = "disabled" as const;

  isEnabled(): boolean {
    return false;
  }

  async runOcr(_input: ProcessingInput): Promise<ProcessingOutput> {
    return DISABLED_RESULT;
  }

  async runMarkdown(_input: ProcessingInput): Promise<ProcessingOutput> {
    return DISABLED_RESULT;
  }

  async runExtract(_input: ProcessingInput): Promise<ProcessingOutput> {
    return DISABLED_RESULT;
  }
}

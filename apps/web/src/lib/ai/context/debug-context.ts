import { REQUIRED_VARIABLES } from "@/lib/ai/prompt-registry";
import {
  buildClientAiContextRaw,
  renderClientAiPromptVariables,
  type ClientAiContextRaw,
} from "./client-context";
import { computeCompleteness, type ContextCompleteness } from "./completeness";

export type AiContextDebugOutput = {
  rawContext: ClientAiContextRaw;
  renderedVariables: Record<string, string>;
  completeness: ContextCompleteness;
  variableLengths: Record<string, number>;
  missingRequiredVars: string[];
  timestamp: string;
};

export async function buildDebugContext(clientId: string): Promise<AiContextDebugOutput> {
  const rawContext = await buildClientAiContextRaw(clientId);
  const renderedVariables = await renderClientAiPromptVariables(rawContext);
  const completeness = computeCompleteness(rawContext);

  const variableLengths = Object.fromEntries(
    Object.entries(renderedVariables).map(([key, value]) => [key, value?.length ?? 0])
  );

  const required = REQUIRED_VARIABLES.clientSummary;
  const missingRequiredVars = required.filter((name) => !renderedVariables[name]?.trim());

  return {
    rawContext,
    renderedVariables,
    completeness,
    variableLengths,
    missingRequiredVars,
    timestamp: new Date().toISOString(),
  };
}

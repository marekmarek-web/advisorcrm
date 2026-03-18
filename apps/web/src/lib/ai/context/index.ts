export {
  buildClientAiContextRaw,
  renderClientAiPromptVariables,
  type ClientAiContextRaw,
  type ActiveDealSummary,
} from "./client-context";
export {
  buildPreMeetingContextRaw,
  buildPostMeetingContextRaw,
  renderPreMeetingPromptVariables,
  renderPostMeetingPromptVariables,
  type PreMeetingContextRaw,
  type PostMeetingContextRaw,
} from "./meeting-context";
export {
  buildTeamAiContextRaw,
  renderTeamAiPromptVariables,
  type TeamAiContextRaw,
} from "./team-context";
export {
  computeCompleteness,
  renderCompletenessHint,
  type ContextCompleteness,
} from "./completeness";
export { FRESHNESS_THRESHOLDS } from "./freshness-rules";
export { buildDebugContext, type AiContextDebugOutput } from "./debug-context";

/**
 * AI Photo / Image Intake — guardrails.
 *
 * Hard safety rules enforced regardless of classifier/planner output.
 * These protect lane separation, client binding safety and write readiness.
 */

import type {
  ImageInputType,
  ImageOutputMode,
  ClientBindingState,
  ImageIntakeActionCandidate,
  ImageIntakeActionPlan,
  LaneDecisionResult,
  InputClassificationResult,
  ClientBindingResult,
} from "./types";
import { IMAGE_INTAKE_ALLOWED_INTENTS, IMAGE_INTAKE_ALLOWED_WRITE_ACTIONS } from "./types";

// ---------------------------------------------------------------------------
// Guardrail result
// ---------------------------------------------------------------------------

export type GuardrailVerdict = {
  passed: boolean;
  violations: string[];
  /** Actions filtered out by guardrails. */
  strippedActions: ImageIntakeActionCandidate[];
  /** If true, output mode was downgraded (e.g. to ambiguous_needs_input). */
  modeDowngraded: boolean;
  downgradedTo: ImageOutputMode | null;
};

// ---------------------------------------------------------------------------
// G1: Lane separation — communication screenshots must NOT go to AI Review
// ---------------------------------------------------------------------------

function checkLaneSeparation(
  laneDecision: LaneDecisionResult,
  classification: InputClassificationResult | null,
): string[] {
  const violations: string[] = [];

  if (classification?.inputType === "screenshot_client_communication" && laneDecision.lane === "ai_review_handoff_suggestion") {
    violations.push("LANE_VIOLATION: screenshot klientské komunikace nesmí být přesměrován do AI Review lane.");
  }

  return violations;
}

// ---------------------------------------------------------------------------
// G2: Client binding — no confident write-ready plan without binding
// ---------------------------------------------------------------------------

function checkClientBinding(
  binding: ClientBindingResult,
  plan: ImageIntakeActionPlan,
): { violations: string[]; shouldDowngrade: boolean } {
  const violations: string[] = [];
  let shouldDowngrade = false;

  if (plan.outputMode === "identity_contact_intake" || plan.outputMode === "contact_update_from_image") {
    return { violations, shouldDowngrade: false };
  }

  const hasWriteActions = plan.recommendedActions.some((a) => a.writeAction !== null);
  const isWriteReady = hasWriteActions && !plan.needsAdvisorInput;

  if (
    isWriteReady &&
    binding.state !== "bound_client_confident" &&
    binding.state !== "bound_case_confident"
  ) {
    violations.push("BINDING_VIOLATION: write-ready plán bez jistého klientského bindingu.");
    shouldDowngrade = true;
  }

  if (binding.state === "multiple_candidates" && hasWriteActions) {
    violations.push("BINDING_VIOLATION: více kandidátů na klienta — write akce blokována.");
    shouldDowngrade = true;
  }

  return { violations, shouldDowngrade };
}

// ---------------------------------------------------------------------------
// G3: Supporting/reference must not be forced into structured contract fields
// ---------------------------------------------------------------------------

function checkSupportingNotOverstructured(
  classification: InputClassificationResult | null,
  plan: ImageIntakeActionPlan,
): string[] {
  const violations: string[] = [];

  const isSupporting = classification?.inputType === "supporting_reference_image";
  const hasStructuredWrites = plan.recommendedActions.some(
    (a) => a.intentType === "create_task" || a.intentType === "create_client_request",
  );

  if (isSupporting && plan.outputMode === "structured_image_fact_intake" && hasStructuredWrites) {
    violations.push("STRUCTURE_VIOLATION: supporting/reference image nesmí být tlačen do strukturovaných akčních polí.");
  }

  return violations;
}

// ---------------------------------------------------------------------------
// G4: Action surface restriction
// ---------------------------------------------------------------------------

function checkActionSurface(
  plan: ImageIntakeActionPlan,
): { violations: string[]; stripped: ImageIntakeActionCandidate[] } {
  const violations: string[] = [];
  const stripped: ImageIntakeActionCandidate[] = [];

  for (const action of plan.recommendedActions) {
    if (!IMAGE_INTAKE_ALLOWED_INTENTS.has(action.intentType)) {
      violations.push(`ACTION_VIOLATION: intent '${action.intentType}' není povolený pro image intake lane.`);
      stripped.push(action);
    }
    if (action.writeAction && !IMAGE_INTAKE_ALLOWED_WRITE_ACTIONS.has(action.writeAction)) {
      violations.push(`ACTION_VIOLATION: write action '${action.writeAction}' není povolený pro image intake lane.`);
      stripped.push(action);
    }
  }

  return { violations, stripped };
}

// ---------------------------------------------------------------------------
// G5: No direct write execution — must go through preview/confirm
// ---------------------------------------------------------------------------

function checkPreviewRequired(plan: ImageIntakeActionPlan): string[] {
  const violations: string[] = [];

  const hasWriteActions = plan.recommendedActions.some((a) => a.writeAction !== null);
  const allSkipConfirmation = plan.recommendedActions.every((a) => !a.requiresConfirmation);

  if (hasWriteActions && allSkipConfirmation) {
    violations.push("PREVIEW_VIOLATION: image intake nesmí spouštět write execution bez preview/confirm.");
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Main guardrail check
// ---------------------------------------------------------------------------

export function enforceImageIntakeGuardrails(
  laneDecision: LaneDecisionResult,
  classification: InputClassificationResult | null,
  binding: ClientBindingResult,
  plan: ImageIntakeActionPlan,
): GuardrailVerdict {
  const allViolations: string[] = [];
  let strippedActions: ImageIntakeActionCandidate[] = [];
  let modeDowngraded = false;
  let downgradedTo: ImageOutputMode | null = null;

  // G1: Lane separation
  allViolations.push(...checkLaneSeparation(laneDecision, classification));

  // G2: Client binding
  const bindingCheck = checkClientBinding(binding, plan);
  allViolations.push(...bindingCheck.violations);

  // G3: Supporting not over-structured
  allViolations.push(...checkSupportingNotOverstructured(classification, plan));

  // G4: Action surface
  const surfaceCheck = checkActionSurface(plan);
  allViolations.push(...surfaceCheck.violations);
  strippedActions = surfaceCheck.stripped;

  // G5: Preview required
  const previewViolations = checkPreviewRequired(plan);
  allViolations.push(...previewViolations);
  if (previewViolations.length > 0) {
    plan.recommendedActions.forEach((a) => {
      a.requiresConfirmation = true;
    });
  }

  // Downgrade to ambiguous_needs_input when binding fails
  if (
    bindingCheck.shouldDowngrade &&
    plan.outputMode !== "no_action_archive_only" &&
    plan.outputMode !== "identity_contact_intake"
  ) {
    modeDowngraded = true;
    downgradedTo = "ambiguous_needs_input";
  }

  return {
    passed: allViolations.length === 0,
    violations: allViolations,
    strippedActions,
    modeDowngraded,
    downgradedTo,
  };
}

// ---------------------------------------------------------------------------
// Convenience: validate that an output mode is a valid terminal state
// ---------------------------------------------------------------------------

export function isValidTerminalOutputMode(mode: ImageOutputMode): boolean {
  return [
    "client_message_update",
    "structured_image_fact_intake",
    "identity_contact_intake",
    "contact_update_from_image",
    "payment_details_portal_update",
    "supporting_reference_image",
    "ambiguous_needs_input",
    "no_action_archive_only",
  ].includes(mode);
}

// ---------------------------------------------------------------------------
// Convenience: safe output mode when classification is uncertain
// ---------------------------------------------------------------------------

export function safeOutputModeForUncertainInput(
  classification: InputClassificationResult | null,
  binding: ClientBindingResult,
): ImageOutputMode {
  if (!classification) return "ambiguous_needs_input";

  if (classification.inputType === "general_unusable_image") {
    return "no_action_archive_only";
  }

  if (classification.inputType === "mixed_or_uncertain_image") {
    return "ambiguous_needs_input";
  }

  if (
    binding.state === "insufficient_binding" ||
    binding.state === "multiple_candidates"
  ) {
    return "ambiguous_needs_input";
  }

  if (classification.confidence < 0.5) {
    return "ambiguous_needs_input";
  }

  return "ambiguous_needs_input";
}

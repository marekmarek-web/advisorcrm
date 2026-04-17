/**
 * Mapování image intake action plánu na ExecutionPlan a StepPreviewItem pro UI potvrzení.
 * Samostatný modul bez orchestrátoru (ten tahá DB / review fronty přes importy).
 */

import type { StepPreviewItem } from "../assistant-execution-ui";
import type {
  CanonicalIntentType,
  ExecutionPlan,
  ExecutionStep,
  WriteActionType,
} from "../assistant-domain-model";
import type { ImageIntakeActionPlan } from "./types";
import { computeWriteStepPreflight } from "../assistant-execution-plan";

const INTENT_TO_WRITE: Partial<Record<CanonicalIntentType, string>> = {
  create_task: "createTask",
  create_followup: "createFollowUp",
  schedule_meeting: "scheduleCalendarEvent",
  create_note: "createMeetingNote",
  create_internal_note: "createInternalNote",
  create_client_request: "createClientRequest",
  create_contact: "createContact",
  update_contact: "updateContact",
  attach_document: "attachDocumentToClient",
  draft_portal_message: "draftClientPortalMessage",
  save_payment_setup: "savePaymentSetup",
};

/** Navěšení attach kroků na createContact + odstranění interního flagu z parametrů. */
function applyIdentityIntakeStepDependencies(steps: ExecutionStep[]): void {
  const createIdx = steps.findIndex((s) => s.action === "createContact");
  if (createIdx < 0) return;
  const createId = steps[createIdx]!.stepId;
  for (let i = 0; i < steps.length; i++) {
    if (i === createIdx) continue;
    const s = steps[i]!;
    if (s.action !== "attachDocumentToClient") continue;
    const raw = s.params as Record<string, unknown>;
    if (!raw._identityIntakeAttach) continue;
    const { _identityIntakeAttach: _drop, ...rest } = raw;
    s.params = rest;
    s.dependsOn = [createId];
  }
}

export function mapToExecutionPlan(
  intakeId: string,
  actionPlan: ImageIntakeActionPlan,
  clientId: string | null,
  opportunityId: string | null,
): ExecutionPlan {
  const isIdentityIntake = actionPlan.outputMode === "identity_contact_intake";

  const steps: ExecutionStep[] = actionPlan.recommendedActions.map((action, idx) => {
    const writeAction = (action.writeAction ??
      INTENT_TO_WRITE[action.intentType] ??
      "createInternalNote") as ExecutionStep["action"];
    const baseParams: Record<string, unknown> = {
      ...action.params,
      _imageIntakeSource: intakeId,
    };
    // Store inlineInput as a hidden param so mapToPreviewItems can surface it in UI
    if (action.inlineInput) {
      baseParams._inlineInput = action.inlineInput;
    }
    if (action.preflightStatus) {
      baseParams._preflightStatus = action.preflightStatus;
    }
    const rawPlanParams = action.params as Record<string, unknown>;
    const isIdentityIntakeAttach =
      isIdentityIntake &&
      writeAction === "attachDocumentToClient" &&
      Boolean(rawPlanParams._identityIntakeAttach);
    const skipContactId =
      (isIdentityIntake && writeAction === "createContact") || isIdentityIntakeAttach;
    if (!skipContactId) {
      baseParams.contactId = clientId;
    }
    baseParams.opportunityId = opportunityId;

    return {
      stepId: `${intakeId}_s${idx}`,
      action: writeAction,
      params: baseParams,
      label: action.label,
      requiresConfirmation: true,
      isReadOnly: false,
      dependsOn: [],
      status: "requires_confirmation" as const,
      result: null,
    };
  });

  applyIdentityIntakeStepDependencies(steps);

  return {
    planId: intakeId,
    intentType: actionPlan.recommendedActions[0]?.intentType ?? "general_chat",
    productDomain: null,
    contactId: clientId,
    opportunityId,
    steps,
    status: steps.length > 0 ? "awaiting_confirmation" : "completed",
    createdAt: new Date(),
  };
}

/** Krátké české vysvětlení k typu kroku — bez interních názvů funkcí (createTask atd.). */
const WRITE_ACTION_ADVISOR_DESCRIPTION: Partial<Record<WriteActionType, string>> = {
  createInternalNote: "Poznámka se uloží na kartu klienta.",
  createTask: "Úkol přidáte do úkolů u klienta — před potvrzením zkontrolujte znění.",
  createFollowUp: "Následná aktivita se zaznamená u klienta.",
  createContact: "Vytvoří nový kontakt podle předvyplněných údajů z dokladu.",
  updateContact: "Aktualizuje existující kontakt — rozpoznané údaje se propíší do Aidvisory.",
  attachDocumentToClient: "Podklad přiložíte k dokumentům klienta.",
  draftEmail: "Připraví se koncept e-mailu (nic se neodešle bez dalšího kroku).",
  draftClientPortalMessage: "Připraví se koncept zprávy do portálu klienta.",
  createClientRequest: "Vznikne požadavek klienta k dalšímu zpracování.",
  scheduleCalendarEvent: "Navrhne se událost v kalendáři — ověřte čas a účastníky.",
  createMeetingNote: "Záznam ze schůzky nebo poznámku uložíte k klientovi.",
  savePaymentSetup: "Interní záznam platební instrukce — viditelnost pro klienta nastavíte ručně po ověření.",
};

export function mapToPreviewItems(plan: ExecutionPlan): StepPreviewItem[] {
  return plan.steps.map((step) => {
    const stepParams = step.params as Record<string, unknown> | undefined;

    const attachAfterCreate =
      step.action === "attachDocumentToClient" &&
      step.dependsOn.some((depId) => plan.steps.some((s) => s.stepId === depId && s.action === "createContact"));

    const createContactFromScreenshot =
      step.action === "createContact" && stepParams?._createContactDraftSource === "crm_form_screenshot";

    const pf = attachAfterCreate
      ? ({
          preflightStatus: "ready" as const,
          missingFields: [] as string[],
          advisorMessage: undefined,
        })
      : computeWriteStepPreflight(step.action, step.params, plan.productDomain);

    // Prefer planner-supplied preflight status (e.g. needs_input when institution is missing)
    const explicitPreflight = stepParams?._preflightStatus as StepPreviewItem["preflightStatus"] | undefined;
    const effectivePreflightStatus = explicitPreflight ?? pf.preflightStatus;

    const inlineInput = stepParams?._inlineInput as StepPreviewItem["inlineInput"] | undefined;

    const baseDescription =
      createContactFromScreenshot && step.action === "createContact"
        ? "Vytvoří nový kontakt podle údajů rozpoznaných na screenshotu nebo ve formuláři."
        : WRITE_ACTION_ADVISOR_DESCRIPTION[step.action];

    return {
      stepId: step.stepId,
      label: step.label,
      action: step.label,
      description: attachAfterCreate
        ? `${WRITE_ACTION_ADVISOR_DESCRIPTION[step.action] ?? ""} Kontakt bude doplněn automaticky po kroku „Založit klienta".`.trim()
        : baseDescription,
      preflightStatus: effectivePreflightStatus,
      blockedReason: effectivePreflightStatus === "blocked" ? pf.advisorMessage : undefined,
      inlineInput,
    };
  });
}

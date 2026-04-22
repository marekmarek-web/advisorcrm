import type { ActionPayload, ActionType } from "./action-catalog";
import { buildActionPayload } from "./action-catalog";
import type { SuggestedAction } from "./dashboard-types";

/** Mapuje katalogové akce asistenta na tlačítka v UI (dashboard `SuggestedAction`). */
export function mapActionPayloadToSuggestedAction(a: ActionPayload): SuggestedAction | null {
  const id = a.entityId;
  const label = a.label;
  const basePayload = { ...a.payload };

  switch (a.actionType as ActionType) {
    case "open_portal_path": {
      const path = typeof basePayload.path === "string" ? basePayload.path.trim() : "";
      if (!path.startsWith("/portal/")) return null;
      return { type: "open_portal_path", label, payload: { path, ...basePayload } };
    }
    case "open_review":
    case "prepare_contract_apply":
    case "prepare_payment_apply":
      if (a.entityType === "review") {
        return { type: "open_review", label, payload: { reviewId: id, ...basePayload } };
      }
      return null;
    case "create_task_draft":
    case "create_followup_draft":
      return { type: "create_task", label, payload: { taskId: id, ...basePayload } };
    case "create_email_draft":
      return { type: "draft_email", label, payload: { clientId: id, ...basePayload } };
    case "select_client_candidate":
    case "confirm_create_new_client":
      if (a.entityType === "contact" || a.entityType === "client") {
        return { type: "view_client", label, payload: { clientId: id, ...basePayload } };
      }
      return null;
    case "request_missing_data":
    case "show_portal_payment_preview":
      return null;
    default:
      return null;
  }
}

export function mapActionPayloadsToSuggestedActions(actions: ActionPayload[]): SuggestedAction[] {
  const out: SuggestedAction[] = [];
  for (const a of actions) {
    const m = mapActionPayloadToSuggestedAction(a);
    if (m) out.push(m);
  }
  return out;
}

/** Opak `mapActionPayloadToSuggestedAction` — např. fallback akce z dashboard priority do `AssistantResponse`. */
export function mapSuggestedActionToActionPayload(a: SuggestedAction): ActionPayload | null {
  const base = { ...a.payload };
  switch (a.type) {
    case "open_review": {
      const reviewId = typeof base.reviewId === "string" ? base.reviewId : "";
      if (!reviewId) return null;
      return buildActionPayload("open_review", "review", reviewId, base, { label: a.label });
    }
    case "open_portal_path": {
      const path = typeof base.path === "string" ? base.path.trim() : "";
      if (!path.startsWith("/portal/")) return null;
      return buildActionPayload("open_portal_path", "portal", "nav", base, { label: a.label });
    }
    case "view_client": {
      const clientId = typeof base.clientId === "string" ? base.clientId : "";
      if (!clientId) return null;
      return buildActionPayload("select_client_candidate", "client", clientId, base, { label: a.label });
    }
    case "create_task": {
      const taskId = typeof base.taskId === "string" ? base.taskId : "";
      if (!taskId) return null;
      return buildActionPayload("create_task_draft", "task", taskId, base, { label: a.label });
    }
    case "draft_email": {
      const clientId = typeof base.clientId === "string" ? base.clientId : "";
      if (!clientId) return null;
      return buildActionPayload("create_email_draft", "client", clientId, base, { label: a.label });
    }
    case "open_task":
      return buildActionPayload(
        "open_portal_path",
        "portal",
        "tasks",
        { path: "/portal/tasks", ...base },
        { label: a.label },
      );
    default:
      return null;
  }
}

export function mapSuggestedActionsToActionPayloads(actions: SuggestedAction[]): ActionPayload[] {
  const out: ActionPayload[] = [];
  for (const a of actions) {
    const m = mapSuggestedActionToActionPayload(a);
    if (m) out.push(m);
  }
  return out;
}

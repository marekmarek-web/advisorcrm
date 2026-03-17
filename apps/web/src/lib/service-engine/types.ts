/**
 * Service engine types and constants (Phase 5).
 * Servisní signály, doporučení a status klienta – bez DB tabulek v V1, computed from trusted data.
 */

export type ServiceCategory =
  | "contract_anniversary"
  | "mortgage_fixation_end"
  | "periodic_review"
  | "long_no_contact"
  | "outdated_analysis"
  | "post_deal_followup"
  | "active_products_no_service"
  | "stale_task"
  | "reactivation"
  | "retention"
  | "household_service"
  | "service_due";

export type ServicePriority = "high" | "medium" | "low";

export type ServiceUrgency = "overdue" | "due_soon" | "upcoming" | "no_deadline";

export type ServiceActionType =
  | "schedule_meeting"
  | "create_task"
  | "open_task"
  | "open_client"
  | "open_analysis"
  | "update_analysis"
  | "open_contract"
  | "create_opportunity"
  | "create_followup"
  | "mark_resolved"
  | "snooze"
  | "edit_contact";

export type ServiceRecommendationStatus = "active" | "snoozed" | "dismissed" | "completed";

export type ServiceStatusValue =
  | "current"
  | "due_soon"
  | "overdue"
  | "missing"
  | "pending_followup"
  | "pending_review"
  | "no_data";

export interface ServiceSourceSignal {
  source: string;
  id?: string;
  detail?: string;
}

export interface ServiceRecommendation {
  id: string;
  contactId: string;
  householdId: string | null;
  category: ServiceCategory;
  subcategory?: string;
  priority: ServicePriority;
  urgency: ServiceUrgency;
  title: string;
  explanation: string;
  recommendedAction: string;
  recommendedActionType: ServiceActionType;
  dueDate: string | null;
  relevanceWindowEnd: string | null;
  sourceSignals: ServiceSourceSignal[];
  status: ServiceRecommendationStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  isHouseholdLevel?: boolean;
  /** For CTA: contract id, analysis id, task id, opportunity id */
  entityId?: string;
}

export interface ServiceStatus {
  status: ServiceStatusValue;
  lastServiceDate: string | null;
  nextServiceDue: string | null;
  recommendedNextService: string | null;
  signalCount: number;
  /** Optional label for UI */
  label?: string;
}

/** Category → Czech label for UI */
export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  contract_anniversary: "Výročí smlouvy",
  mortgage_fixation_end: "Konec fixace hypotéky",
  periodic_review: "Pravidelná revize",
  long_no_contact: "Dlouho bez kontaktu",
  outdated_analysis: "Zastaralá analýza",
  post_deal_followup: "Follow-up po obchodu",
  active_products_no_service: "Aktivní produkty bez servisu",
  stale_task: "Úkol po termínu",
  reactivation: "Reaktivace",
  retention: "Retence",
  household_service: "Servis domácnosti",
  service_due: "Servis due",
};

/** Action type → Czech label for CTA button */
export const SERVICE_ACTION_LABELS: Record<ServiceActionType, string> = {
  schedule_meeting: "Naplánovat schůzku",
  create_task: "Vytvořit úkol",
  open_task: "Otevřít úkol",
  open_client: "Otevřít klienta",
  open_analysis: "Otevřít analýzu",
  update_analysis: "Aktualizovat analýzu",
  open_contract: "Otevřít smlouvu",
  create_opportunity: "Založit obchod",
  create_followup: "Vytvořit follow-up",
  mark_resolved: "Označit vyřešené",
  snooze: "Odložit",
  edit_contact: "Upravit kontakt",
};

/** Service status → Czech label */
export const SERVICE_STATUS_LABELS: Record<ServiceStatusValue, string> = {
  current: "Servis v pořádku",
  due_soon: "Servis brzy potřeba",
  overdue: "Servis po termínu",
  missing: "Servis chybí",
  pending_followup: "Čeká follow-up",
  pending_review: "Čeká revize",
  no_data: "Nedostatek dat",
};

/** Priority order for sorting (high first) */
export const PRIORITY_ORDER: ServicePriority[] = ["high", "medium", "low"];

/** Urgency order for sorting (overdue first) */
export const URGENCY_ORDER: ServiceUrgency[] = ["overdue", "due_soon", "upcoming", "no_deadline"];

export function compareServiceRecommendations(
  a: ServiceRecommendation,
  b: ServiceRecommendation
): number {
  const ua = URGENCY_ORDER.indexOf(a.urgency);
  const ub = URGENCY_ORDER.indexOf(b.urgency);
  if (ua !== ub) return ua - ub;
  const pa = PRIORITY_ORDER.indexOf(a.priority);
  const pb = PRIORITY_ORDER.indexOf(b.priority);
  if (pa !== pb) return pa - pb;
  const da = a.dueDate ?? "";
  const db = b.dueDate ?? "";
  return da.localeCompare(db);
}

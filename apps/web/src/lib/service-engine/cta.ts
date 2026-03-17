/**
 * Service engine CTA: map recommendation to href and label for UI.
 */

import type { ServiceRecommendation } from "./types";
import { SERVICE_ACTION_LABELS } from "./types";

export function getServiceCtaHref(
  rec: ServiceRecommendation,
  contactId: string
): { href: string; label: string } {
  const base = `/portal/contacts/${contactId}`;
  const label = SERVICE_ACTION_LABELS[rec.recommendedActionType] ?? rec.recommendedAction;
  switch (rec.recommendedActionType) {
    case "schedule_meeting":
      return { href: `/portal/calendar?contactId=${contactId}&newEvent=1`, label };
    case "create_task":
    case "create_followup":
    case "open_task":
      return { href: `${base}#ukoly`, label };
    case "open_client":
      return { href: base, label };
    case "open_analysis":
      return {
        href: rec.entityId
          ? `/portal/analyses/financial?id=${rec.entityId}`
          : `/portal/analyses/financial?clientId=${contactId}`,
        label,
      };
    case "update_analysis":
      return {
        href: rec.entityId
          ? `/portal/analyses/financial?id=${rec.entityId}`
          : `${base}#prehled`,
        label,
      };
    case "open_contract":
      return { href: `${base}#smlouvy`, label };
    case "create_opportunity":
      return { href: `${base}#obchody`, label };
    case "edit_contact":
      return { href: `${base}/edit`, label };
    default:
      return { href: base, label };
  }
}

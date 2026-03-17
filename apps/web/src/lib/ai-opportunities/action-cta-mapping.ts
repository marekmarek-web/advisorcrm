/**
 * Maps recommendedActionType and entityIds to CTA href and label.
 * All links are contact-scoped and tenant-safe (use current contactId from page).
 */

import type { RecommendedActionType, AiOpportunity } from "./types";

export type CtaLink = {
  href: string;
  label: string;
  /** If true, open in same tab; else may be used for modal or new tab */
  sameTab?: boolean;
};

/**
 * Build CTA link for an opportunity. contactId is required; basePath optional (e.g. /portal).
 */
export function getCtaForOpportunity(
  opportunity: AiOpportunity,
  contactId: string,
  basePath: string = ""
): CtaLink {
  const prefix = basePath || "";
  const { recommendedActionType, entityIds } = opportunity;

  switch (recommendedActionType) {
    case "open_analysis":
    case "complete_analysis": {
      const analysisId = entityIds?.analysisId;
      if (analysisId) {
        return {
          href: `${prefix}/portal/analyses/financial?id=${encodeURIComponent(analysisId)}`,
          label: opportunity.recommendedAction,
          sameTab: true,
        };
      }
      return {
        href: `${prefix}/portal/analyses/financial?clientId=${contactId}`,
        label: opportunity.recommendedAction,
        sameTab: true,
      };
    }
    case "create_analysis":
      return {
        href: `${prefix}/portal/analyses/financial?clientId=${contactId}`,
        label: opportunity.recommendedAction,
        sameTab: true,
      };
    case "schedule_meeting":
      return {
        href: `${prefix}/portal/calendar?contactId=${contactId}&newEvent=1`,
        label: opportunity.recommendedAction,
        sameTab: true,
      };
    case "create_task":
      if (opportunity.type === "ask_referral") {
        return {
          href: `${prefix}/portal/contacts/${contactId}#doporučení`,
          label: opportunity.recommendedAction,
          sameTab: true,
        };
      }
      return {
        href: `${prefix}/portal/contacts/${contactId}?tab=ukoly&newTask=1`,
        label: opportunity.recommendedAction,
        sameTab: true,
      };
    case "create_opportunity": {
      const segment = entityIds?.segmentCode ?? "";
      const caseType = entityIds?.caseType ?? "";
      const q = new URLSearchParams();
      if (contactId) q.set("contactId", contactId);
      if (segment) q.set("segment", segment);
      if (caseType) q.set("caseType", caseType);
      return {
        href: `${prefix}/portal/contacts/${contactId}?tab=obchody&newOpportunity=1${segment ? `&segment=${encodeURIComponent(segment)}` : ""}${caseType ? `&caseType=${encodeURIComponent(caseType)}` : ""}`,
        label: opportunity.recommendedAction,
        sameTab: true,
      };
    }
    case "open_opportunity": {
      const opportunityId = entityIds?.opportunityId;
      if (opportunityId) {
        return {
          href: `${prefix}/portal/pipeline/${opportunityId}`,
          label: opportunity.recommendedAction,
          sameTab: true,
        };
      }
      return {
        href: `${prefix}/portal/contacts/${contactId}?tab=obchody`,
        label: opportunity.recommendedAction,
        sameTab: true,
      };
    }
    case "open_contract": {
      const contractId = entityIds?.contractId;
      if (contractId) {
        return {
          href: `${prefix}/portal/contacts/${contactId}?tab=smlouvy&contractId=${contractId}`,
          label: opportunity.recommendedAction,
          sameTab: true,
        };
      }
      return {
        href: `${prefix}/portal/contacts/${contactId}?tab=smlouvy`,
        label: opportunity.recommendedAction,
        sameTab: true,
      };
    }
    case "open_document":
      return {
        href: `${prefix}/portal/contacts/${contactId}?tab=dokumenty`,
        label: opportunity.recommendedAction,
        sameTab: true,
      };
    case "open_timeline":
      return {
        href: `${prefix}/portal/contacts/${contactId}?tab=aktivita`,
        label: opportunity.recommendedAction,
        sameTab: true,
      };
    case "start_service_review": {
      const contractId = entityIds?.contractId;
      if (contractId) {
        return {
          href: `${prefix}/portal/contacts/${contactId}?tab=smlouvy&contractId=${contractId}`,
          label: opportunity.recommendedAction,
          sameTab: true,
        };
      }
      return {
        href: `${prefix}/portal/contacts/${contactId}?tab=smlouvy`,
        label: opportunity.recommendedAction,
        sameTab: true,
      };
    }
    default:
      return {
        href: `${prefix}/portal/contacts/${contactId}`,
        label: opportunity.recommendedAction,
        sameTab: true,
      };
  }
}

/** Default labels per action type when opportunity text is generic */
export const DEFAULT_CTA_LABELS: Record<RecommendedActionType, string> = {
  open_analysis: "Otevřít analýzu",
  create_analysis: "Založit finanční analýzu",
  complete_analysis: "Dokončit analýzu",
  schedule_meeting: "Naplánovat schůzku",
  create_task: "Vytvořit úkol",
  create_opportunity: "Založit obchod",
  open_opportunity: "Otevřít obchod",
  open_contract: "Otevřít smlouvu",
  open_document: "Otevřít dokumenty",
  open_timeline: "Zobrazit aktivitu",
  start_service_review: "Zahájit servisní revizi",
};

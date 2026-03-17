/**
 * Service engine rules: compute ServiceRecommendation[] and ServiceStatus from ServiceInputData.
 * Deterministic and heuristic rules over trusted data only.
 */

import type {
  ServiceRecommendation,
  ServiceStatus,
  ServiceStatusValue,
  ServicePriority,
  ServiceUrgency,
} from "./types";
import { compareServiceRecommendations } from "./types";
import type { ServiceInputData, ServiceInputContract } from "./data";
import {
  getEffectiveLastContactDate,
  getPrimaryAnalysis,
  SERVICE_ENGINE_CONSTANTS,
} from "./data";
import { segmentLabel } from "@/app/lib/segment-labels";

const NOW = () => new Date().toISOString().slice(0, 19) + "Z";

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function monthsBetween(a: Date, b: Date): number {
  return daysBetween(a, b) / 30;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Build recommendations and status for one contact. Deduplicates by (category, entityId).
 */
export function computeServiceRecommendations(
  contactId: string,
  householdId: string | null,
  data: ServiceInputData
): ServiceRecommendation[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toDateStr(today);
  const recommendations: ServiceRecommendation[] = [];
  const seen = new Set<string>();

  function add(r: Omit<ServiceRecommendation, "createdAt" | "updatedAt" | "resolvedAt" | "status">) {
    const key = `${r.category}-${r.entityId ?? contactId}`;
    if (seen.has(key)) return;
    seen.add(key);
    recommendations.push({
      ...r,
      status: "active",
      createdAt: NOW(),
      updatedAt: NOW(),
      resolvedAt: null,
    });
  }

  const contact = data.contact;
  const lastContact = getEffectiveLastContactDate(data);
  const primaryAnalysis = getPrimaryAnalysis(data);

  // --- Service due (nextServiceDue) ---
  if (contact?.nextServiceDue) {
    const due = contact.nextServiceDue;
    const overdue = due < todayStr;
    const dueIn7 = daysBetween(today, new Date(due)) <= 7 && !overdue;
    if (overdue || dueIn7) {
      add({
        id: `service_due-${contactId}`,
        contactId,
        householdId,
        category: "service_due",
        priority: overdue ? "high" : "medium",
        urgency: overdue ? "overdue" : "due_soon",
        title: overdue ? "Servis po termínu" : "Servis brzy due",
        explanation: overdue
          ? `Příští servis byl ${due}. Naplánujte servisní schůzku.`
          : `Příští servis ${due}. Doporučujeme naplánovat schůzku.`,
        recommendedAction: "Naplánovat schůzku",
        recommendedActionType: "schedule_meeting",
        dueDate: due,
        relevanceWindowEnd: due,
        sourceSignals: [{ source: "contacts", id: contactId, detail: "nextServiceDue" }],
      });
    }
  }

  // --- Contract anniversary ---
  for (const c of data.contractsWithAnniversaryInWindow) {
    const ann = c.anniversaryDate!;
    const daysTo = daysBetween(today, new Date(ann));
    const overdue = ann < todayStr;
    add({
      id: `contract_anniversary-${contactId}-${c.id}`,
      contactId,
      householdId,
      category: "contract_anniversary",
      subcategory: c.segment,
      priority: daysTo <= 7 || overdue ? "high" : "medium",
      urgency: overdue ? "overdue" : daysTo <= 14 ? "due_soon" : "upcoming",
      title: `Výročí smlouvy – ${segmentLabel(c.segment)}`,
      explanation: `${c.partnerName ?? segmentLabel(c.segment)} – výročí ${ann}. Revize smlouvy.`,
      recommendedAction: "Otevřít smlouvu",
      recommendedActionType: "open_contract",
      dueDate: ann,
      relevanceWindowEnd: ann,
      sourceSignals: [{ source: "contracts", id: c.id, detail: ann }],
      entityId: c.id,
    });
  }

  // --- Mortgage / HYPO (use anniversary as proxy for fixation in V1) ---
  const hypoInWindow = data.contractsWithAnniversaryInWindow.filter((c) => c.segment === "HYPO");
  for (const c of hypoInWindow) {
    const ann = c.anniversaryDate!;
    const daysTo = daysBetween(today, new Date(ann));
    add({
      id: `mortgage_fixation_end-${contactId}-${c.id}`,
      contactId,
      householdId,
      category: "mortgage_fixation_end",
      subcategory: "HYPO",
      priority: daysTo <= 90 ? "high" : "medium",
      urgency: daysTo <= 30 ? "due_soon" : "upcoming",
      title: "Hypotéka – revize / konec fixace",
      explanation: `Hypotéka – výročí ${ann}. Zkontrolovat podmínky a fixaci.`,
      recommendedAction: "Otevřít smlouvu",
      recommendedActionType: "open_contract",
      dueDate: ann,
      relevanceWindowEnd: ann,
      sourceSignals: [{ source: "contracts", id: c.id, detail: "HYPO" }],
      entityId: c.id,
    });
  }

  // --- Stale task (overdue > 7 days) ---
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = toDateStr(sevenDaysAgo);
  for (const t of data.openTasks) {
    if (t.dueDate && t.dueDate < sevenDaysAgoStr) {
      add({
        id: `stale_task-${contactId}-${t.id}`,
        contactId,
        householdId,
        category: "stale_task",
        priority: "high",
        urgency: "overdue",
        title: "Úkol po termínu",
        explanation: `Úkol „${t.title}“ byl splnit do ${t.dueDate}. Dokončete nebo přeplánujte.`,
        recommendedAction: "Otevřít úkol",
        recommendedActionType: "open_task",
        dueDate: t.dueDate,
        relevanceWindowEnd: t.dueDate,
        sourceSignals: [{ source: "tasks", id: t.id, detail: t.dueDate ?? undefined }],
        entityId: t.id,
      });
    }
  }

  // --- Outdated / missing analysis ---
  const analysisStaleThreshold = new Date(today);
  analysisStaleThreshold.setMonth(analysisStaleThreshold.getMonth() - SERVICE_ENGINE_CONSTANTS.ANALYSIS_STALE_MONTHS);
  if (!primaryAnalysis || primaryAnalysis.status === "draft") {
    add({
      id: `outdated_analysis-${contactId}`,
      contactId,
      householdId,
      category: "outdated_analysis",
      priority: "medium",
      urgency: "no_deadline",
      title: primaryAnalysis ? "Rozpracovaná finanční analýza" : "Chybí finanční analýza",
      explanation: primaryAnalysis
        ? "Dokončete nebo aktualizujte finanční analýzu."
        : "Doporučujeme vytvořit finanční analýzu pro klienta.",
      recommendedAction: primaryAnalysis ? "Aktualizovat analýzu" : "Otevřít analýzu",
      recommendedActionType: primaryAnalysis ? "update_analysis" : "open_analysis",
      dueDate: null,
      relevanceWindowEnd: null,
      sourceSignals: [{ source: "financial_analyses", id: primaryAnalysis?.id }],
      entityId: primaryAnalysis?.id,
    });
  } else if (primaryAnalysis.updatedAt < analysisStaleThreshold) {
    add({
      id: `outdated_analysis-${contactId}-${primaryAnalysis.id}`,
      contactId,
      householdId,
      category: "outdated_analysis",
      priority: "medium",
      urgency: "no_deadline",
      title: "Zastaralá finanční analýza",
      explanation: `Analýza nebyla aktualizována přes ${SERVICE_ENGINE_CONSTANTS.ANALYSIS_STALE_MONTHS} měsíců. Doporučujeme revizi.`,
      recommendedAction: "Aktualizovat analýzu",
      recommendedActionType: "update_analysis",
      dueDate: null,
      relevanceWindowEnd: null,
      sourceSignals: [{ source: "financial_analyses", id: primaryAnalysis.id }],
      entityId: primaryAnalysis.id,
    });
  }

  // --- Post-deal follow-up ---
  const latestClosed = data.opportunitiesClosedRecently[0];
  if (latestClosed?.closedAt) {
    const closedAt = new Date(latestClosed.closedAt);
    const hadContactAfter =
      (lastContact && lastContact > closedAt) ||
      (data.lastEventDate && data.lastEventDate > closedAt) ||
      (data.lastMeetingNoteDate && data.lastMeetingNoteDate > closedAt);
    if (!hadContactAfter) {
      add({
        id: `post_deal_followup-${contactId}-${latestClosed.id}`,
        contactId,
        householdId,
        category: "post_deal_followup",
        priority: "medium",
        urgency: "due_soon",
        title: "Follow-up po uzavření obchodu",
        explanation: `Obchod „${latestClosed.title}“ byl uzavřen. Doporučujeme následný kontakt.`,
        recommendedAction: "Vytvořit follow-up",
        recommendedActionType: "create_followup",
        dueDate: toDateStr(closedAt),
        relevanceWindowEnd: toDateStr(new Date(closedAt.getTime() + 180 * 86400000)),
        sourceSignals: [{ source: "opportunities", id: latestClosed.id, detail: "closedAs=won" }],
        entityId: latestClosed.id,
      });
    }
  }

  // --- Long no contact (has contracts, last contact > 6 months) ---
  const longNoContactMonths = SERVICE_ENGINE_CONSTANTS.LONG_NO_CONTACT_MONTHS;
  if (data.contracts.length > 0 && lastContact) {
    const monthsSince = monthsBetween(lastContact, today);
    if (monthsSince >= longNoContactMonths) {
      add({
        id: `long_no_contact-${contactId}`,
        contactId,
        householdId,
        category: "long_no_contact",
        priority: "medium",
        urgency: "no_deadline",
        title: "Dlouho bez kontaktu",
        explanation: `Poslední kontakt před ${Math.floor(monthsSince)} měsíci. Klient má aktivní smlouvy.`,
        recommendedAction: "Naplánovat schůzku",
        recommendedActionType: "schedule_meeting",
        dueDate: null,
        relevanceWindowEnd: null,
        sourceSignals: [
          { source: "events", detail: "lastEventDate" },
          { source: "meeting_notes", detail: "lastMeetingNoteDate" },
        ],
      });
    }
  }

  // --- Active products, long without service (> 12 months) ---
  const serviceStaleMonths = 12;
  if (data.contracts.length > 0 && lastContact) {
    const monthsSince = monthsBetween(lastContact, today);
    if (monthsSince >= serviceStaleMonths) {
      const hasServiceDue = recommendations.some((r) => r.category === "service_due");
      if (!hasServiceDue) {
        add({
          id: `active_products_no_service-${contactId}`,
          contactId,
          householdId,
          category: "active_products_no_service",
          priority: "high",
          urgency: "overdue",
          title: "Aktivní produkty bez servisu",
          explanation: `Klient má smlouvy a přes ${serviceStaleMonths} měsíců neměl servisní schůzku.`,
          recommendedAction: "Naplánovat servisní schůzku",
          recommendedActionType: "schedule_meeting",
          dueDate: null,
          relevanceWindowEnd: null,
          sourceSignals: [
            { source: "contacts", detail: "lastServiceDate" },
            { source: "contracts" },
          ],
        });
      }
    }
  }

  // --- Reactivation (had activity, no contact > 12 months) ---
  const reactivationMonths = SERVICE_ENGINE_CONSTANTS.REACTIVATION_MONTHS;
  if (lastContact) {
    const monthsSince = monthsBetween(lastContact, today);
    if (monthsSince >= reactivationMonths) {
      const already = recommendations.some(
        (r) =>
          r.category === "long_no_contact" || r.category === "active_products_no_service"
      );
      if (!already) {
        add({
          id: `reactivation-${contactId}`,
          contactId,
          householdId,
          category: "reactivation",
          priority: "low",
          urgency: "no_deadline",
          title: "Reaktivace klienta",
          explanation: `Klient dlouho bez kontaktu (${Math.floor(monthsSince)} měsíců). Zvážit reaktivaci.`,
          recommendedAction: "Naplánovat schůzku",
          recommendedActionType: "schedule_meeting",
          dueDate: null,
          relevanceWindowEnd: null,
          sourceSignals: [
            { source: "events" },
            { source: "meeting_notes" },
          ],
        });
      }
    }
  }

  recommendations.sort(compareServiceRecommendations);
  return recommendations;
}

/**
 * Compute service status for the contact from data and recommendations.
 */
export function computeServiceStatus(
  data: ServiceInputData,
  recommendations: ServiceRecommendation[]
): ServiceStatus {
  const contact = data.contact;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toDateStr(today);

  const hasFollowup = recommendations.some((r) => r.category === "post_deal_followup");
  const hasReview = recommendations.some((r) =>
    ["contract_anniversary", "mortgage_fixation_end", "periodic_review", "service_due"].includes(
      r.category
    )
  );

  if (hasFollowup) {
    return {
      status: "pending_followup",
      lastServiceDate: contact?.lastServiceDate ?? null,
      nextServiceDue: contact?.nextServiceDue ?? null,
      recommendedNextService: null,
      signalCount: recommendations.length,
      label: "Čeká follow-up",
    };
  }

  if (hasReview) {
    const overdue = recommendations.some((r) => r.urgency === "overdue");
    const dueSoon = recommendations.some((r) => r.urgency === "due_soon");
    const status: ServiceStatusValue = overdue ? "overdue" : dueSoon ? "due_soon" : "pending_review";
    return {
      status,
      lastServiceDate: contact?.lastServiceDate ?? null,
      nextServiceDue: contact?.nextServiceDue ?? null,
      recommendedNextService: contact?.nextServiceDue ?? null,
      signalCount: recommendations.length,
      label:
        status === "overdue"
          ? "Servis po termínu"
          : status === "due_soon"
            ? "Servis brzy potřeba"
            : "Čeká revize",
    };
  }

  if (!contact && data.contracts.length === 0 && !getEffectiveLastContactDate(data)) {
    return {
      status: "no_data",
      lastServiceDate: null,
      nextServiceDue: null,
      recommendedNextService: null,
      signalCount: 0,
      label: "Nedostatek dat",
    };
  }

  if (contact?.nextServiceDue) {
    const due = contact.nextServiceDue;
    if (due < todayStr) {
      return {
        status: "overdue",
        lastServiceDate: contact.lastServiceDate ?? null,
        nextServiceDue: due,
        recommendedNextService: due,
        signalCount: recommendations.length,
        label: "Servis po termínu",
      };
    }
    const daysTo = daysBetween(today, new Date(due));
    if (daysTo <= 14) {
      return {
        status: "due_soon",
        lastServiceDate: contact.lastServiceDate ?? null,
        nextServiceDue: due,
        recommendedNextService: due,
        signalCount: recommendations.length,
        label: "Servis brzy potřeba",
      };
    }
    return {
      status: "current",
      lastServiceDate: contact.lastServiceDate ?? null,
      nextServiceDue: due,
      recommendedNextService: due,
      signalCount: recommendations.length,
      label: "Servis v pořádku",
    };
  }

  if (data.contracts.length > 0 || recommendations.length > 0) {
    return {
      status: "missing",
      lastServiceDate: contact?.lastServiceDate ?? null,
      nextServiceDue: contact?.nextServiceDue ?? null,
      recommendedNextService: null,
      signalCount: recommendations.length,
      label: "Servis chybí",
    };
  }

  return {
    status: "no_data",
    lastServiceDate: contact?.lastServiceDate ?? null,
    nextServiceDue: contact?.nextServiceDue ?? null,
    recommendedNextService: null,
    signalCount: 0,
    label: "Nedostatek dat",
  };
}

/**
 * Multi-window assistant context builder (Plan 5).
 * Builds sanitized, provenance-tagged context payloads for different assistant scenarios.
 */

import { computePriorityItems, getTasksDueAndOverdue, getClientsNeedingAttention } from "./dashboard-priority";
import { listContractReviews, getContractReviewById } from "./review-queue-repository";
import type { ContractReviewRow } from "./review-queue-repository";
import { evaluateApplyReadiness, type ApplyGateResult } from "./quality-gates";
import { buildPipelineInsightsFromReviewRow } from "./pipeline-review-insights";
import type { UrgentItem } from "./dashboard-types";

export type ContextSourceReference = {
  sourceType: "review" | "client" | "payment" | "task" | "priority" | "pipeline";
  sourceId: string;
  freshness: "live" | "cached";
  confidence?: number;
  visibilityScope: "tenant" | "user";
};

export type AssistantContextPayload = {
  summaryText: string;
  structuredFacts: StructuredFact[];
  warnings: string[];
  suggestedQuestions: string[];
  recommendedActions: string[];
  sourceReferences: ContextSourceReference[];
};

export type StructuredFact = {
  key: string;
  value: string | number | boolean;
  category: string;
};

/** P6: limit prompt size; client/review builders stay lazy/best-effort and avoid raw blob text. */
const MAX_CONTEXT_CHARS = 5500;

function trimLine(s: string, maxLen: number): string {
  const t = s.trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 3) + "...";
}

export function maskIban(iban: string | null | undefined): string {
  if (!iban) return "";
  const clean = iban.replace(/\s/g, "");
  if (clean.length < 6) return "***";
  return "..." + clean.slice(-4);
}

export function maskPersonalId(pid: string | null | undefined): string {
  if (!pid) return "";
  const clean = pid.replace(/\s/g, "");
  if (clean.length < 4) return "***";
  return "XX/" + clean.slice(-4);
}

export function sanitizeContext(payload: AssistantContextPayload): AssistantContextPayload {
  const ibanPattern = /\b[A-Z]{2}\d{2}[\dA-Z]{11,30}\b/g;
  const pidPattern = /\b\d{6}[\/]?\d{3,4}\b/g;

  function scrub(text: string): string {
    return text
      .replace(ibanPattern, (m) => maskIban(m))
      .replace(pidPattern, (m) => maskPersonalId(m));
  }

  return {
    ...payload,
    summaryText: scrub(payload.summaryText),
    structuredFacts: payload.structuredFacts.map((f) => ({
      ...f,
      value: typeof f.value === "string" ? scrub(f.value) : f.value,
    })),
    warnings: payload.warnings.map(scrub),
  };
}

export async function buildDashboardContext(tenantId: string): Promise<AssistantContextPayload> {
  const [priorityItems, pendingReviews, tasksData, clientsNeeding] = await Promise.all([
    computePriorityItems(tenantId),
    listContractReviews(tenantId, { reviewStatus: "pending", limit: 10 }),
    getTasksDueAndOverdue(tenantId),
    getClientsNeedingAttention(tenantId),
  ]);

  const facts: StructuredFact[] = [
    { key: "urgentCount", value: priorityItems.length, category: "summary" },
    { key: "pendingReviews", value: pendingReviews.length, category: "reviews" },
    { key: "tasksDueToday", value: tasksData.tasksDueToday.length, category: "tasks" },
    { key: "overdueTasks", value: tasksData.overdueTasks.length, category: "tasks" },
    { key: "clientsNeedingAttention", value: clientsNeeding.length, category: "clients" },
  ];

  const sections: string[] = [];
  const topUrgent = priorityItems.slice(0, 5);
  if (topUrgent.length > 0) {
    sections.push(
      "Urgentní položky:\n" +
        topUrgent.map((u: UrgentItem) =>
          `- [${u.type}] ${trimLine(u.title, 60)}: ${trimLine(u.recommendedAction ?? u.description, 80)}`
        ).join("\n"),
    );
  }

  if (pendingReviews.length > 0) {
    const names = pendingReviews.slice(0, 3).map((r) => trimLine(r.fileName, 50));
    sections.push(`Smlouvy čekající na review: ${pendingReviews.length}. Soubory: ${names.join(", ")}.`);
  }

  if (tasksData.overdueTasks.length > 0) {
    sections.push(`Úkoly po termínu: ${tasksData.overdueTasks.length}.`);
  }

  if (clientsNeeding.length > 0) {
    sections.push(`Klienti vyžadující pozornost: ${clientsNeeding.length}.`);
  }

  const summaryText = sections.join("\n\n") || "Žádná speciální data k zobrazení.";

  const warnings: string[] = [];
  if (tasksData.overdueTasks.length > 3) warnings.push("Vysoký počet úkolů po termínu.");
  if (pendingReviews.length > 5) warnings.push("Hromadí se nevyřízené review položky.");

  const suggestedQuestions = [
    "Které smlouvy čekají na review?",
    "Co je dnes nejurgentnější?",
    "Kterým klientům mám napsat?",
  ];

  const recommendedActions: string[] = [];
  if (pendingReviews.length > 0) recommendedActions.push("Otevřít nejstarší pending review.");
  if (tasksData.overdueTasks.length > 0) recommendedActions.push("Vyřešit zpožděné úkoly.");

  const refs: ContextSourceReference[] = [
    { sourceType: "priority", sourceId: tenantId, freshness: "live", visibilityScope: "tenant" },
  ];

  return sanitizeContext({
    summaryText: summaryText.slice(0, MAX_CONTEXT_CHARS),
    structuredFacts: facts,
    warnings,
    suggestedQuestions,
    recommendedActions,
    sourceReferences: refs,
  });
}

export async function buildClientDetailContext(
  tenantId: string,
  contactId: string,
): Promise<AssistantContextPayload> {
  const facts: StructuredFact[] = [];
  const warnings: string[] = [];
  const refs: ContextSourceReference[] = [];

  let clientName = "Klient";
  try {
    const { getClientAiContext } = await import("../client-ai-context");
    const ctx = await getClientAiContext(contactId, tenantId);
    if (ctx) {
      clientName = ctx.display_name ?? "Klient";
      facts.push(
        { key: "clientName", value: clientName, category: "profile" },
        { key: "email", value: ctx.email ?? "", category: "profile" },
        { key: "phone", value: ctx.phone ?? "", category: "profile" },
        { key: "contractCount", value: ctx.active_contracts_count ?? 0, category: "contracts" },
        { key: "openOpportunities", value: ctx.open_opportunities_count ?? 0, category: "pipeline" },
        { key: "openTasks", value: ctx.open_tasks_count ?? 0, category: "tasks" },
      );
      if (ctx.next_service_due) {
        facts.push({ key: "nextServiceDue", value: ctx.next_service_due, category: "service" });
      }
    } else {
      facts.push({ key: "clientName", value: clientName, category: "profile" });
      warnings.push("Detailní kontext klienta nedostupný.");
    }
    refs.push({ sourceType: "client", sourceId: contactId, freshness: "live", visibilityScope: "tenant" });
  } catch {
    facts.push({ key: "clientName", value: clientName, category: "profile" });
    warnings.push("Detailní kontext klienta nedostupný.");
  }

  let clientReviews: ContractReviewRow[] = [];
  try {
    clientReviews = (await listContractReviews(tenantId, { limit: 10 }))
      .filter((r) => r.matchedClientId === contactId);
  } catch { /* best-effort */ }

  if (clientReviews.length > 0) {
    facts.push({ key: "reviewsForClient", value: clientReviews.length, category: "reviews" });
    const pending = clientReviews.filter((r) => r.reviewStatus === "pending");
    if (pending.length > 0) facts.push({ key: "pendingReviewsForClient", value: pending.length, category: "reviews" });
  }

  const sections = [
    `Klient: ${clientName}`,
    ...facts.filter((f) => f.category !== "profile").map((f) => `${f.key}: ${f.value}`),
  ];

  return sanitizeContext({
    summaryText: sections.join("\n"),
    structuredFacts: facts,
    warnings,
    suggestedQuestions: [
      "Co chybí u tohoto klienta?",
      "Jsou nějaké pending review?",
      "Připrav follow-up email.",
    ],
    recommendedActions: [],
    sourceReferences: refs,
  });
}

export async function buildReviewDetailContext(
  tenantId: string,
  reviewId: string,
): Promise<AssistantContextPayload> {
  const facts: StructuredFact[] = [];
  const warnings: string[] = [];
  const refs: ContextSourceReference[] = [];

  const row = await getContractReviewById(reviewId, tenantId);
  if (!row) {
    return {
      summaryText: "Review položka nenalezena.",
      structuredFacts: [],
      warnings: ["Review neexistuje nebo nemáte přístup."],
      suggestedQuestions: [],
      recommendedActions: [],
      sourceReferences: [],
    };
  }

  facts.push(
    { key: "fileName", value: row.fileName, category: "review" },
    { key: "processingStatus", value: row.processingStatus, category: "review" },
    { key: "reviewStatus", value: row.reviewStatus ?? "pending", category: "review" },
    { key: "confidence", value: row.confidence ?? 0, category: "review" },
    { key: "documentType", value: row.detectedDocumentType ?? "unknown", category: "review" },
  );

  let gate: ApplyGateResult | null = null;
  try {
    gate = evaluateApplyReadiness(row);
    facts.push({ key: "applyReadiness", value: gate.readiness, category: "quality" });
    if (gate.blockedReasons.length > 0) {
      facts.push({ key: "blockedReasons", value: gate.blockedReasons.join(", "), category: "quality" });
    }
    if (gate.applyBarrierReasons.length > 0) {
      facts.push({
        key: "applyBarrierReasons",
        value: gate.applyBarrierReasons.join(", "),
        category: "quality",
      });
    }
    warnings.push(...gate.warnings);
  } catch { /* best-effort */ }

  const insights = buildPipelineInsightsFromReviewRow(row);
  if (insights.extractionRoute) {
    facts.push({ key: "extractionRoute", value: insights.extractionRoute, category: "pipeline" });
  }
  if (insights.normalizedPipelineClassification) {
    facts.push({ key: "classification", value: insights.normalizedPipelineClassification, category: "pipeline" });
  }

  // Phase 2+3: enrich context with canonical fields from extracted payload
  try {
    const payload = row.extractedPayload as Record<string, unknown> | null | undefined;
    if (payload && typeof payload === "object") {
      // Packet meta — bundle detection
      const packetMeta = payload.packetMeta as Record<string, unknown> | null | undefined;
      if (packetMeta?.isBundle) {
        facts.push({ key: "isBundle", value: true, category: "packet" });
        const candidateCount = typeof packetMeta.candidateCount === "number" ? packetMeta.candidateCount : 0;
        if (candidateCount > 0) {
          facts.push({ key: "bundleSubdocumentCount", value: candidateCount, category: "packet" });
        }
        if (packetMeta.hasSensitiveAttachment) {
          facts.push({ key: "hasSensitiveAttachment", value: true, category: "packet" });
          warnings.push("Upload obsahuje citlivou přílohu (zdravotní dotazník, AML). Zkontrolujte před apply.");
        }
        if (typeof packetMeta.primarySubdocumentType === "string") {
          facts.push({ key: "primarySubdocumentType", value: packetMeta.primarySubdocumentType, category: "packet" });
        }
      }

      // Publish hints
      const publishHints = payload.publishHints as Record<string, unknown> | null | undefined;
      if (publishHints) {
        const contractPublishable = publishHints.contractPublishable === true;
        const needsSplit = publishHints.needsSplit === true;
        const sensitiveAttachmentOnly = publishHints.sensitiveAttachmentOnly === true;
        facts.push({ key: "contractPublishable", value: contractPublishable, category: "publish" });
        if (!contractPublishable) {
          const reasons = Array.isArray(publishHints.reasons)
            ? (publishHints.reasons as string[]).join(", ")
            : "";
          warnings.push(
            `Smlouva není označena jako publikovatelná${reasons ? ` (${reasons})` : ""}. Apply bude vyžadovat ruční schválení.`
          );
        }
        if (needsSplit) {
          facts.push({ key: "needsSplit", value: true, category: "publish" });
          warnings.push("Dokument obsahuje více sekcí — doporučeno zpracovat zvlášť před apply.");
        }
        if (sensitiveAttachmentOnly) {
          facts.push({ key: "sensitiveAttachmentOnly", value: true, category: "publish" });
          warnings.push("Dokument je vhodný pouze pro trezor — nepublikovat jako smlouvu klienta.");
        }
      }

      // Participants — structured multi-person
      const participants = payload.participants as Array<Record<string, unknown>> | null | undefined;
      if (Array.isArray(participants) && participants.length > 0) {
        facts.push({ key: "participantCount", value: participants.length, category: "participants" });
        const roles = [...new Set(participants.map((p) => String(p.role ?? "other")))];
        facts.push({ key: "participantRoles", value: roles.join(", "), category: "participants" });
        const names = participants
          .slice(0, 3)
          .map((p) => `${String(p.fullName ?? "")} (${String(p.role ?? "")})`)
          .filter((n) => n.trim() !== " ()");
        if (names.length > 0) {
          facts.push({ key: "participantNames", value: names.join("; "), category: "participants" });
        }
      }

      // Insured risks — structured per-person
      const insuredRisks = payload.insuredRisks as Array<Record<string, unknown>> | null | undefined;
      if (Array.isArray(insuredRisks) && insuredRisks.length > 0) {
        facts.push({ key: "insuredRisksCount", value: insuredRisks.length, category: "risks" });
        const riskLabels = insuredRisks.slice(0, 5).map((r) => String(r.riskLabel ?? r.riskType ?? "—"));
        facts.push({ key: "insuredRiskLabels", value: riskLabels.join(", "), category: "risks" });
      }

      // Investment data
      const investmentData = payload.investmentData as Record<string, unknown> | null | undefined;
      if (investmentData?.strategy) {
        facts.push({ key: "investmentStrategy", value: String(investmentData.strategy), category: "investment" });
      }
      if (investmentData?.isModeledData) {
        facts.push({ key: "investmentIsModeled", value: true, category: "investment" });
      }

      // Payment data
      const paymentData = payload.paymentData as Record<string, unknown> | null | undefined;
      if (paymentData) {
        if (paymentData.variableSymbol) {
          facts.push({ key: "variableSymbol", value: String(paymentData.variableSymbol), category: "payment" });
        }
        if (paymentData.paymentFrequency) {
          facts.push({ key: "paymentFrequency", value: String(paymentData.paymentFrequency), category: "payment" });
        }
      }

      // Health questionnaires
      const healthQs = payload.healthQuestionnaires as Array<Record<string, unknown>> | null | undefined;
      if (Array.isArray(healthQs) && healthQs.some((q) => q.questionnairePresent)) {
        facts.push({ key: "healthQuestionnairePresent", value: true, category: "health" });
        warnings.push("Dokument obsahuje zdravotní dotazník — sekce je citlivá a nesmí být přenášena jako část smlouvy.");
      }
    }
  } catch {
    // Phase 2+3 enrichment is best-effort; never block the context response
  }

  refs.push({ sourceType: "review", sourceId: reviewId, freshness: "live", visibilityScope: "tenant" });

  const suggestedQuestions = [
    "Je tato smlouva připravená k apply?",
    "Proč je blokovaná?",
    "Co chybí?",
  ];

  const recommendedActions: string[] = [];
  if (gate?.readiness === "ready_for_apply") recommendedActions.push("Aplikovat review do CRM.");
  if (gate?.readiness === "blocked_for_apply") recommendedActions.push("Zkontrolovat důvody blokace.");
  if ((gate?.applyBarrierReasons?.length ?? 0) > 0) {
    recommendedActions.push("Dokument nelze aplikovat jako finální smlouvu bez override — zkontrolujte typ (návrh/modelace).");
  }
  if (row.reviewStatus === "pending") recommendedActions.push("Schválit nebo zamítnout review.");

  return sanitizeContext({
    summaryText: facts.map((f) => `${f.key}: ${f.value}`).join("\n"),
    structuredFacts: facts,
    warnings,
    suggestedQuestions,
    recommendedActions,
    sourceReferences: refs,
  });
}

export async function buildPaymentDetailContext(
  tenantId: string,
  contactId: string,
): Promise<AssistantContextPayload> {
  const facts: StructuredFact[] = [];
  const warnings: string[] = [];
  const refs: ContextSourceReference[] = [];

  let paymentSetups: Array<Record<string, unknown>> = [];
  try {
    const { db } = await import("db");
    const { clientPaymentSetups } = await import("db");
    const { eq, and } = await import("db");
    paymentSetups = await db
      .select()
      .from(clientPaymentSetups)
      .where(and(eq(clientPaymentSetups.tenantId, tenantId), eq(clientPaymentSetups.contactId, contactId)));
  } catch {
    warnings.push("Platební údaje nedostupné.");
  }

  facts.push({ key: "paymentSetupsCount", value: paymentSetups.length, category: "payments" });

  const blocked = paymentSetups.filter((p) => p.needsHumanReview === true);
  if (blocked.length > 0) {
    facts.push({ key: "blockedPaymentSetups", value: blocked.length, category: "payments" });
    warnings.push(`${blocked.length} platebních nastavení vyžaduje ruční kontrolu.`);
  }

  for (const p of paymentSetups.slice(0, 3)) {
    const label = (p.providerName as string) ?? (p.productName as string) ?? "Platba";
    const amount = p.amount != null ? `${p.amount} ${(p.currency as string) ?? "CZK"}` : "neuvedeno";
    facts.push({ key: `payment_${p.id}`, value: `${label}: ${amount}`, category: "payments" });
  }

  refs.push({ sourceType: "payment", sourceId: contactId, freshness: "live", visibilityScope: "tenant" });

  return sanitizeContext({
    summaryText: facts.map((f) => `${f.key}: ${f.value}`).join("\n"),
    structuredFacts: facts,
    warnings,
    suggestedQuestions: [
      "Které platby jsou blokované?",
      "Co chybí u platebních údajů?",
    ],
    recommendedActions: blocked.length > 0 ? ["Zkontrolovat blokované platby."] : [],
    sourceReferences: refs,
  });
}

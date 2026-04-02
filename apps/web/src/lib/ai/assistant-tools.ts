/**
 * Assistant tool definitions for OpenAI function-calling / structured dispatch (Plan 5B.1).
 */

import type { ContextSourceReference } from "./assistant-context-builder";

export type ToolResult = {
  data: Record<string, unknown>;
  sourceReferences: ContextSourceReference[];
  warnings: string[];
};

export type ToolHandlerContext = {
  tenantId: string;
  userId: string;
  roleName: string;
};

export type AssistantTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (params: Record<string, unknown>, context: ToolHandlerContext) => Promise<ToolResult>;
  requiredPermission?: string;
};

async function handleGetDashboardSummary(
  _params: Record<string, unknown>,
  ctx: ToolHandlerContext,
): Promise<ToolResult> {
  const { buildDashboardContext } = await import("./assistant-context-builder");
  const payload = await buildDashboardContext(ctx.tenantId);
  return {
    data: {
      summaryText: payload.summaryText,
      facts: payload.structuredFacts,
      recommendedActions: payload.recommendedActions,
    },
    sourceReferences: payload.sourceReferences,
    warnings: payload.warnings,
  };
}

async function handleGetClientSummary(
  params: Record<string, unknown>,
  ctx: ToolHandlerContext,
): Promise<ToolResult> {
  const contactId = params.contactId as string;
  if (!contactId) return { data: { error: "contactId required" }, sourceReferences: [], warnings: [] };
  const { buildClientDetailContext } = await import("./assistant-context-builder");
  const payload = await buildClientDetailContext(ctx.tenantId, contactId);
  return {
    data: {
      summaryText: payload.summaryText,
      facts: payload.structuredFacts,
      recommendedActions: payload.recommendedActions,
    },
    sourceReferences: payload.sourceReferences,
    warnings: payload.warnings,
  };
}

async function handleGetReviewDetail(
  params: Record<string, unknown>,
  ctx: ToolHandlerContext,
): Promise<ToolResult> {
  const reviewId = params.reviewId as string;
  if (!reviewId) return { data: { error: "reviewId required" }, sourceReferences: [], warnings: [] };
  const { buildReviewDetailContext } = await import("./assistant-context-builder");
  const payload = await buildReviewDetailContext(ctx.tenantId, reviewId);
  return {
    data: {
      summaryText: payload.summaryText,
      facts: payload.structuredFacts,
      recommendedActions: payload.recommendedActions,
    },
    sourceReferences: payload.sourceReferences,
    warnings: payload.warnings,
  };
}

async function handleGetPaymentSetupDetail(
  params: Record<string, unknown>,
  ctx: ToolHandlerContext,
): Promise<ToolResult> {
  const contactId = params.contactId as string;
  if (!contactId) return { data: { error: "contactId required" }, sourceReferences: [], warnings: [] };
  const { buildPaymentDetailContext } = await import("./assistant-context-builder");
  const payload = await buildPaymentDetailContext(ctx.tenantId, contactId);
  return {
    data: {
      summaryText: payload.summaryText,
      facts: payload.structuredFacts,
    },
    sourceReferences: payload.sourceReferences,
    warnings: payload.warnings,
  };
}

async function handleListBlockedReviews(
  _params: Record<string, unknown>,
  ctx: ToolHandlerContext,
): Promise<ToolResult> {
  const { getBlockedReviews } = await import("./dashboard-priority");
  const items = await getBlockedReviews(ctx.tenantId);
  return {
    data: { blockedReviews: items },
    sourceReferences: [{ sourceType: "review", sourceId: ctx.tenantId, freshness: "live", visibilityScope: "tenant" }],
    warnings: [],
  };
}

async function handleListBlockedPayments(
  _params: Record<string, unknown>,
  ctx: ToolHandlerContext,
): Promise<ToolResult> {
  const { getBlockedPaymentSetups } = await import("./dashboard-priority");
  const items = await getBlockedPaymentSetups(ctx.tenantId);
  return {
    data: { blockedPayments: items },
    sourceReferences: [{ sourceType: "payment", sourceId: ctx.tenantId, freshness: "live", visibilityScope: "tenant" }],
    warnings: [],
  };
}

async function handleCreateTaskDraft(
  params: Record<string, unknown>,
  _ctx: ToolHandlerContext,
): Promise<ToolResult> {
  const { createTaskDraft } = await import("./assistant-actions");
  const draft = createTaskDraft({
    title: (params.title as string) ?? "Úkol",
    description: params.description as string | undefined,
    contactId: params.contactId as string | undefined,
    dueDate: params.dueDate as string | undefined,
  });
  return {
    data: { draft },
    sourceReferences: [],
    warnings: [],
  };
}

async function handleCreateEmailDraft(
  params: Record<string, unknown>,
  ctx: ToolHandlerContext,
): Promise<ToolResult> {
  const contactId = params.contactId as string;
  if (!contactId) return { data: { error: "contactId required" }, sourceReferences: [], warnings: [] };
  const { draftClientEmail } = await import("./assistant-actions");
  const result = await draftClientEmail(contactId, ctx.tenantId, {
    subject: params.subject as string | undefined,
    context: params.context as string | undefined,
  });
  if (!result.ok) {
    return { data: { error: result.error }, sourceReferences: [], warnings: [result.error] };
  }
  return {
    data: { subject: result.subject, body: result.body },
    sourceReferences: [{ sourceType: "client", sourceId: contactId, freshness: "live", visibilityScope: "tenant" }],
    warnings: [],
  };
}

async function handleSearchContacts(
  params: Record<string, unknown>,
  ctx: ToolHandlerContext,
): Promise<ToolResult> {
  const query = typeof params.query === "string" ? params.query : "";
  if (!query.trim()) {
    return { data: { error: "query required", matches: [] }, sourceReferences: [], warnings: [] };
  }
  const { searchContactsForAssistant } = await import("./assistant-contact-search");
  const matches = await searchContactsForAssistant(ctx.tenantId, query.trim(), 12);
  return {
    data: {
      count: matches.length,
      matches: matches.map((m) => ({
        contactId: m.id,
        displayName: m.displayName,
        hint: m.hint,
      })),
    },
    sourceReferences: matches.slice(0, 3).map((m) => ({
      sourceType: "client" as const,
      sourceId: m.id,
      freshness: "live" as const,
      visibilityScope: "tenant" as const,
    })),
    warnings: [],
  };
}

async function handlePrepareContractApply(
  params: Record<string, unknown>,
  ctx: ToolHandlerContext,
): Promise<ToolResult> {
  const reviewId = params.reviewId as string;
  if (!reviewId) return { data: { error: "reviewId required" }, sourceReferences: [], warnings: [] };
  const { getContractReviewById } = await import("./review-queue-repository");
  const row = await getContractReviewById(reviewId, ctx.tenantId);
  if (!row) return { data: { error: "Review not found" }, sourceReferences: [], warnings: ["Review nenalezena."] };
  const { evaluateApplyReadiness } = await import("./quality-gates");
  const gate = evaluateApplyReadiness(row);
  return {
    data: {
      readiness: gate.readiness,
      blockedReasons: gate.blockedReasons,
      applyBarrierReasons: gate.applyBarrierReasons,
      warnings: gate.warnings,
    },
    sourceReferences: [{ sourceType: "review", sourceId: reviewId, freshness: "live", visibilityScope: "tenant" }],
    warnings: gate.warnings,
  };
}

export const ASSISTANT_TOOLS: AssistantTool[] = [
  {
    name: "getDashboardSummary",
    description: "Získá shrnutí dashboardu poradce: urgentní položky, review, úkoly, blokované platby.",
    parameters: {},
    handler: handleGetDashboardSummary,
  },
  {
    name: "searchContacts",
    description:
      "Vyhledá kontakty podle jména nebo části jména, e-mailu či telefonu v rámci tenantu. Při více shodách vrať seznam s krátkým rozlišením (hint); uživatele nenuť zadávat UUID.",
    parameters: { query: { type: "string", description: "Hledaný text (jméno, příjmení, e-mail, telefon)" } },
    handler: handleSearchContacts,
  },
  {
    name: "getClientSummary",
    description: "Získá shrnutí profilu klienta: kontakt, smlouvy, úkoly, servis.",
    parameters: { contactId: { type: "string", description: "ID kontaktu" } },
    handler: handleGetClientSummary,
  },
  {
    name: "getReviewDetail",
    description: "Získá detail review dokumentu/smlouvy: status, confidence, kvalitní brána, klasifikace.",
    parameters: { reviewId: { type: "string", description: "ID review položky" } },
    handler: handleGetReviewDetail,
  },
  {
    name: "getPaymentSetupDetail",
    description: "Získá platební údaje klienta: nastavení plateb, blokované položky.",
    parameters: { contactId: { type: "string", description: "ID kontaktu" } },
    handler: handleGetPaymentSetupDetail,
  },
  {
    name: "listBlockedReviews",
    description: "Seznam review položek, které jsou blokovány pro apply (kvalitní brána).",
    parameters: {},
    handler: handleListBlockedReviews,
  },
  {
    name: "listBlockedPayments",
    description: "Seznam platebních nastavení vyžadujících ruční kontrolu.",
    parameters: {},
    handler: handleListBlockedPayments,
  },
  {
    name: "createTaskDraft",
    description: "Vytvoří draft nového úkolu. Poradce musí potvrdit.",
    parameters: {
      title: { type: "string", description: "Název úkolu" },
      description: { type: "string", description: "Popis úkolu" },
      contactId: { type: "string", description: "ID kontaktu (volitelné)" },
      dueDate: { type: "string", description: "Termín (YYYY-MM-DD, volitelné)" },
    },
    handler: handleCreateTaskDraft,
    requiredPermission: "assistant:create_draft",
  },
  {
    name: "createEmailDraft",
    description: "Vytvoří návrh emailu pro klienta. Poradce musí schválit a odeslat.",
    parameters: {
      contactId: { type: "string", description: "ID kontaktu" },
      subject: { type: "string", description: "Předmět emailu (volitelné)" },
      context: { type: "string", description: "Kontext/instrukce pro obsah (volitelné)" },
    },
    handler: handleCreateEmailDraft,
    requiredPermission: "assistant:create_draft",
  },
  {
    name: "prepareContractApply",
    description: "Vyhodnotí připravenost review k aplikaci do CRM (kvalitní brána). Neaplikuje.",
    parameters: { reviewId: { type: "string", description: "ID review položky" } },
    handler: handlePrepareContractApply,
  },
];

export function getToolByName(name: string): AssistantTool | undefined {
  return ASSISTANT_TOOLS.find((t) => t.name === name);
}

export function getToolDescriptions(): { name: string; description: string; parameters: Record<string, unknown> }[] {
  return ASSISTANT_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

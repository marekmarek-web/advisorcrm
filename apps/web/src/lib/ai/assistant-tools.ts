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
  const matches = await searchContactsForAssistant(ctx.tenantId, query.trim(), 12, {
    match: "all",
  });
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

async function handlePrepareTerminationRequest(
  params: Record<string, unknown>,
  _ctx: ToolHandlerContext,
): Promise<ToolResult> {
  const contactId = typeof params.contactId === "string" ? params.contactId.trim() : "";
  const contractId = typeof params.contractId === "string" ? params.contractId.trim() : "";
  const insurerName = typeof params.insurerName === "string" ? params.insurerName.trim() : "";
  const requestedEffectiveDate =
    typeof params.requestedEffectiveDate === "string" ? params.requestedEffectiveDate.trim() : "";
  const sourceDocumentId = typeof params.sourceDocumentId === "string" ? params.sourceDocumentId.trim() : "";

  if (!contactId && !contractId && !insurerName) {
    return {
      data: {
        error: "missing_context",
        hint: "Zadejte contactId nebo contractId, případně alespoň insurerName pro manuální intak.",
      },
      sourceReferences: [],
      warnings: [
        "Bez kontaktu, smlouvy nebo názvu pojišťovny nelze sestavit užitečný odkaz do průvodce výpovědi.",
      ],
    };
  }

  const qs = new URLSearchParams();
  if (contactId) qs.set("contactId", contactId);
  if (contractId) qs.set("contractId", contractId);
  if (insurerName) qs.set("insurerName", insurerName);
  if (requestedEffectiveDate) qs.set("requestedEffectiveDate", requestedEffectiveDate);
  if (sourceDocumentId) qs.set("sourceDocumentId", sourceDocumentId);
  qs.set("source", "ai_chat");

  const wizardPath = `/portal/terminations/new?${qs.toString()}`;
  return {
    data: {
      wizardPath,
      instructions:
        "Otevřete cestu v portálu. Po odeslání průvodce vznikne záznam žádosti a proběhne rules engine. Finální znění vždy zkontrolujte; AI nenahrazuje právní posouzení.",
      prefill: {
        contactId: contactId || null,
        contractId: contractId || null,
        insurerName: insurerName || null,
        requestedEffectiveDate: requestedEffectiveDate || null,
        sourceDocumentId: sourceDocumentId || null,
      },
    },
    sourceReferences: contactId
      ? [{ sourceType: "client", sourceId: contactId, freshness: "live", visibilityScope: "tenant" }]
      : [],
    warnings: [],
  };
}

async function handleCreateTerminationIntakeDraft(
  params: Record<string, unknown>,
  _ctx: ToolHandlerContext,
): Promise<ToolResult> {
  const { saveTerminationIntakePartialAction } = await import("@/app/actions/terminations");
  type Mode = import("@/lib/db/schema-for-client").TerminationMode;
  type Reason = import("@/lib/db/schema-for-client").TerminationReasonCode;

  const contactId = typeof params.contactId === "string" ? params.contactId.trim() : "";
  const contractId = typeof params.contractId === "string" ? params.contractId.trim() : "";
  const insurerName = typeof params.insurerName === "string" ? params.insurerName.trim() : "";
  const partialRequestId =
    typeof params.partialRequestId === "string" ? params.partialRequestId.trim() : "";
  const sourceDocumentId =
    typeof params.sourceDocumentId === "string" ? params.sourceDocumentId.trim() : "";

  if (!partialRequestId && !contactId && !contractId && !insurerName) {
    return {
      data: {
        error: "missing_context",
        hint: "Po potvrzení uživatele zadejte contactId, contractId nebo insurerName — nebo partialRequestId pro aktualizaci konceptu.",
      },
      sourceReferences: [],
      warnings: [],
    };
  }

  const terminationMode = (params.terminationMode as Mode) || "end_of_insurance_period";
  const terminationReasonCode = (params.terminationReasonCode as Reason) || "end_of_period_6_weeks";

  const res = await saveTerminationIntakePartialAction({
    sourceKind: "ai_chat",
    contactId: contactId || null,
    contractId: contractId || null,
    sourceDocumentId: sourceDocumentId || null,
    sourceConversationId: null,
    insurerName,
    contractNumber:
      typeof params.contractNumber === "string" && params.contractNumber.trim()
        ? params.contractNumber.trim()
        : null,
    productSegment:
      typeof params.productSegment === "string" && params.productSegment.trim()
        ? params.productSegment.trim()
        : null,
    contractStartDate:
      typeof params.contractStartDate === "string" && params.contractStartDate.trim()
        ? params.contractStartDate.trim()
        : null,
    contractAnniversaryDate:
      typeof params.contractAnniversaryDate === "string" && params.contractAnniversaryDate.trim()
        ? params.contractAnniversaryDate.trim()
        : null,
    requestedEffectiveDate:
      typeof params.requestedEffectiveDate === "string" && params.requestedEffectiveDate.trim()
        ? params.requestedEffectiveDate.trim()
        : null,
    terminationMode,
    terminationReasonCode,
    uncertainInsurer: Boolean(params.uncertainInsurer),
    documentBuilderExtras: {},
    partialRequestId: partialRequestId || null,
  });

  if (!res.ok) {
    return {
      data: { error: res.error },
      sourceReferences: [],
      warnings: [res.error],
    };
  }

  const qs = new URLSearchParams();
  qs.set("draftId", res.requestId);
  qs.set("source", "ai_chat");
  if (contactId) qs.set("contactId", contactId);
  if (contractId) qs.set("contractId", contractId);

  return {
    data: {
      requestId: res.requestId,
      continueWizardPath: `/portal/terminations/new?${qs.toString()}`,
      instructions:
        "Koncept je v CRM (stav intake). Otevřete continueWizardPath, doplňte údaje a dokončete průvodcem — proběhne rules engine.",
    },
    sourceReferences: contactId
      ? [{ sourceType: "client", sourceId: contactId, freshness: "live", visibilityScope: "tenant" }]
      : [],
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
  {
    name: "prepare_termination_request",
    description:
      "Masterplan intent: sestaví odkaz do průvodce „Výpověď smlouvy“ s předvyplněnými parametry (klient, smlouva, pojišťovna, datum, zdrojový dokument). Nevytváří záznam v DB — ten vznikne po uložení průvodce a projde rules engine. (Dříve prepareTerminationIntake.)",
    parameters: {
      contactId: { type: "string", description: "UUID kontaktu (volitelné)" },
      contractId: { type: "string", description: "UUID smlouvy z CRM (volitelné)" },
      insurerName: { type: "string", description: "Název pojišťovny pro manuální intak (volitelné)" },
      requestedEffectiveDate: { type: "string", description: "Požadované datum účinnosti YYYY-MM-DD (volitelné)" },
      sourceDocumentId: { type: "string", description: "UUID nahraného dokumentu ve stejném tenantu (volitelné)" },
    },
    handler: handlePrepareTerminationRequest,
  },
  {
    name: "createTerminationIntakeDraft",
    description:
      "Po výslovném potvrzení uživatele vytvoří nebo aktualizuje rozepsaný koncept žádosti o výpověď (stav intake, bez rules engine). Vrací odkaz k pokračování v průvodci. Nevolejte bez potvrzení.",
    parameters: {
      contactId: { type: "string", description: "UUID kontaktu (volitelné)" },
      contractId: { type: "string", description: "UUID smlouvy (volitelné)" },
      insurerName: { type: "string", description: "Název pojišťovny (volitelné u nového konceptu)" },
      contractNumber: { type: "string", description: "Číslo smlouvy (volitelné)" },
      productSegment: { type: "string", description: "Segment např. ZP (volitelné)" },
      contractStartDate: { type: "string", description: "YYYY-MM-DD (volitelné)" },
      contractAnniversaryDate: { type: "string", description: "YYYY-MM-DD (volitelné)" },
      requestedEffectiveDate: { type: "string", description: "YYYY-MM-DD (volitelné)" },
      terminationMode: { type: "string", description: "Režim wizardu (volitelné, výchozí end_of_insurance_period)" },
      terminationReasonCode: { type: "string", description: "Kód důvodu z katalogu (volitelné)" },
      uncertainInsurer: { type: "boolean", description: "Nejistá pojišťovna → review" },
      sourceDocumentId: { type: "string", description: "UUID dokumentu (volitelné)" },
      partialRequestId: { type: "string", description: "UUID existujícího konceptu k přepsání (volitelné)" },
    },
    handler: handleCreateTerminationIntakeDraft,
    requiredPermission: "assistant:create_draft",
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

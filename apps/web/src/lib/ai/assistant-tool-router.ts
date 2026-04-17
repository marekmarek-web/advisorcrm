/**
 * Assistant tool router — intent-first CRM writes, optional tools, no default dashboard.
 */

import { createResponseSafe, createResponseStructuredWithImage, createResponseStructuredWithImages } from "@/lib/openai";
import { getToolByName, getToolDescriptions, type ToolResult, type ToolHandlerContext } from "./assistant-tools";
import { buildDashboardContext, buildClientDetailContext, buildReviewDetailContext, buildPaymentDetailContext } from "./assistant-context-builder";
import {
  type AssistantSession,
  type ActiveContext,
  updateSessionContext,
  incrementMessageCount,
  lockAssistantClient,
  clearAssistantClientLock,
} from "./assistant-session";
import { buildSuggestedActionsFromUrgent, computePriorityItems } from "./dashboard-priority";
import type { ActionPayload } from "./action-catalog";
import { extractAssistantIntent, extractCanonicalIntent } from "./assistant-intent-extract";
import { formatProactiveHintsBlock, loadProactiveHintsForContact } from "./assistant-proactive-hints";
import {
  intentWantsCrmWrites,
  intentWantsDashboard,
  shouldUseMortgageVerifiedBundle,
  canonicalIntentToMortgageAssistantIntent,
} from "./assistant-intent";
import { executeMortgageDealAndFollowUpTask } from "./assistant-crm-writes";
import { searchContactsForAssistant } from "./assistant-contact-search";
import type { SuggestedNextStepItem } from "./suggested-next-step-types";
import type { RoleName } from "@/shared/rolePermissions";
import type { AssistantIntent } from "./assistant-intent";
import type { CanonicalIntent, ExecutionPlan, ExecutionStep, VerifiedAssistantResult } from "./assistant-domain-model";
import { resolveEntities, patchIntentWithResolutions, emptyEntityResolution } from "./assistant-entity-resolution";
import {
  buildExecutionPlan,
  buildPostUploadReviewPlan,
  confirmAllSteps,
  allStepsReady,
  getPlanSummary,
  getStepsAwaitingConfirmation,
  applyConfirmationSelection,
  productDomainChipLabel,
  buildStepDescription,
  buildValidationWarnings,
  computeWriteStepPreflight,
} from "./assistant-execution-plan";
import { formatDisplayDateCs } from "@/lib/date/format-display-cs";
import { executePlan, buildVerifiedResult } from "./assistant-execution-engine";
import {
  verifyWriteContextSafety,
  verifyTenantConsistency,
} from "./assistant-context-safety";
import { mapErrorForAdvisor } from "./assistant-error-mapping";
import { getPlaybookGuidanceLines } from "./playbooks";
import { AssistantTelemetryAction, logAssistantTelemetry } from "./assistant-telemetry";
import { tryRatingLookupReply } from "./ratings/toplists";
import type { ImageAssetPayload } from "./assistant-chat-request";

import type { StepPreviewItem } from "./assistant-execution-ui";

export type { StepPreviewItem } from "./assistant-execution-ui";

export type StepOutcomeSummary = {
  label: string;
  status: "succeeded" | "failed" | "skipped" | "idempotent_hit" | "requires_input";
  entityId?: string | null;
  error?: string | null;
  retryable?: boolean;
};

function stepPreviewContextHint(step: ExecutionStep): string | undefined {
  return productDomainChipLabel(step.params.productDomain as string | undefined);
}

function buildStepPreviewItems(plan: ExecutionPlan): StepPreviewItem[] {
  return plan.steps.map((step) => {
    const pf = computeWriteStepPreflight(step.action, step.params, plan.productDomain);
    const baseWarnings = buildValidationWarnings(step.action, step.params);
    const extraWarnings =
      pf.preflightStatus === "needs_input" && pf.advisorMessage && pf.missingFields.length === 0
        ? [pf.advisorMessage]
        : [];
    return {
      stepId: step.stepId,
      label: step.label,
      action: step.label,
      contextHint: stepPreviewContextHint(step),
      description: buildStepDescription(step.action, step.params),
      domainGroup: productDomainChipLabel(step.params.productDomain as string | undefined) ?? null,
      validationWarnings: [...baseWarnings, ...extraWarnings],
      preflightStatus: pf.preflightStatus,
      blockedReason: pf.preflightStatus === "blocked" ? pf.advisorMessage : undefined,
    };
  });
}

function buildDraftPlanMessage(clientLabel: string, plan: ExecutionPlan): string {
  const needsInput = plan.steps
    .map((step) => {
      const pf = computeWriteStepPreflight(step.action, step.params, plan.productDomain);
      if (pf.preflightStatus !== "needs_input") return null;
      if (pf.advisorMessage) return `- ${step.label}: ${pf.advisorMessage}`;
      const details = buildValidationWarnings(step.action, step.params)
        .map((warning) => warning.replace(/^Chybí:\s*/, ""))
        .join(", ");
      return details ? `- ${step.label}: chybí ${details}` : `- ${step.label}: chybí doplnění údajů`;
    })
    .filter(Boolean);

  const blocked = plan.steps
    .map((step) => {
      const pf = computeWriteStepPreflight(step.action, step.params, plan.productDomain);
      if (pf.preflightStatus !== "blocked" || !pf.advisorMessage) return null;
      return `- ${step.label}: ${pf.advisorMessage}`;
    })
    .filter(Boolean);

  const sections = [`Abych mohl připravit bezpečné akce pro **${clientLabel}**, potřebuji ještě doplnit nebo upřesnit:`];
  if (needsInput.length > 0) sections.push(needsInput.join("\n"));
  if (blocked.length > 0) sections.push(`Blokované kroky:\n${blocked.join("\n")}`);
  sections.push("Jakmile údaje doplníte, připravím stejný canonical plán k potvrzení.");
  return sections.join("\n\n");
}

function ratingSourcesSummaryFromReply(reply: string): string[] {
  return /\bEUCS\b/i.test(reply)
    ? ["EUCS rating (interní podklad)"]
    : ["Top seznamy (seed v2)"];
}

export type { SuggestedNextStepItem, SuggestedNextStepItemKind } from "./suggested-next-step-types";

export type AssistantResponse = {
  message: string;
  referencedEntities: { type: string; id: string; label?: string }[];
  suggestedActions: ActionPayload[];
  warnings: string[];
  confidence: number;
  sourcesSummary: string[];
  sessionId: string;
  executionState?: {
    status: "draft" | "awaiting_confirmation" | "executing" | "completed" | "partial_failure";
    planId?: string;
    totalSteps?: number;
    pendingSteps?: number;
    /** Structured step list for pre-confirmation preview. Only present when status === "awaiting_confirmation" or "draft". */
    stepPreviews?: StepPreviewItem[];
    /** Display name of the client for UX context, if resolved. */
    clientLabel?: string;
  } | null;
  contextState?: {
    channel: string | null;
    lockedClientId: string | null;
    /** Display name of the locked client, if available. */
    lockedClientLabel?: string | null;
  } | null;
  stepOutcomes?: StepOutcomeSummary[];
  suggestedNextSteps?: string[];
  /** Strukturované kroky (hint / focus / send). Když jsou přítomné, UI je preferuje vedle `suggestedNextSteps`. */
  suggestedNextStepItems?: SuggestedNextStepItem[];
  hasPartialFailure?: boolean;
};

type ToolCall = {
  name: string;
  params: Record<string, unknown>;
};

type RecentAssistantPromptMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ResolvedAssistantContextInput = {
  activeClientId?: string | null;
  lockedClientId?: string | null;
  recentMessages?: RecentAssistantPromptMessage[];
  conversationDigest?: string | null;
  pendingImageIntent?: boolean;
  lastImagePreviewSummary?: string | null;
};

function buildResolvedContextBlock(ctx: ResolvedAssistantContextInput | undefined): string {
  if (!ctx) return "";
  const lines = [
    ctx.activeClientId ? `Aktivní klient v UI: ${ctx.activeClientId}` : "",
    ctx.lockedClientId ? `Zamčený klient v session: ${ctx.lockedClientId}` : "",
    ctx.pendingImageIntent ? "Čeká nevyřešený image-intake dotaz klienta nebo záměru." : "",
    ctx.lastImagePreviewSummary ? `Poslední multimodální náhled: ${sanitizePromptLine(ctx.lastImagePreviewSummary, 240)}` : "",
    ctx.conversationDigest?.trim() ? `Stručný digest vlákna: ${sanitizePromptLine(ctx.conversationDigest, 400)}` : "",
  ].filter(Boolean);
  return lines.length > 0 ? `[Sjednocený kontext]\n${lines.join("\n")}` : "";
}

type VisionAssistantReply = {
  reply: string;
};

const VISION_ASSISTANT_REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply"],
  properties: {
    reply: { type: "string" },
  },
} as const;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizePromptLine(text: string, limit = 500): string {
  return text.replace(/\s+/g, " ").trim().slice(0, limit);
}

function buildRecentConversationBlock(messages: RecentAssistantPromptMessage[] | undefined): string {
  if (!messages || messages.length === 0) return "";
  const lines = messages
    .filter((m) => m.content.trim().length > 0)
    .map((m) => `${m.role === "assistant" ? "Asistent" : m.role === "system" ? "Systém" : "Uživatel"}: ${sanitizePromptLine(m.content)}`)
    .slice(-8);
  return lines.length > 0 ? `Poslední průběh konverzace:\n${lines.join("\n")}` : "";
}

function extractVisionUrls(imageAssets: ImageAssetPayload[] | undefined): string[] {
  if (!imageAssets) return [];
  return imageAssets
    .map((asset) => (typeof asset.url === "string" ? asset.url.trim() : ""))
    .filter((url) => url.length > 0)
    .slice(0, 3);
}

async function createGeneralAssistantReply(params: {
  fullPrompt: string;
  imageAssets?: ImageAssetPayload[];
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const imageUrls = extractVisionUrls(params.imageAssets);
  if (imageUrls.length === 0) {
    return createResponseSafe(params.fullPrompt, { routing: { category: "advisor_chat" } });
  }

  try {
    const multimodal = imageUrls.length === 1
      ? await createResponseStructuredWithImage<VisionAssistantReply>(
          imageUrls[0]!,
          params.fullPrompt,
          VISION_ASSISTANT_REPLY_SCHEMA,
          { routing: { category: "advisor_chat" }, schemaName: "advisor_chat_vision_reply" },
        )
      : await createResponseStructuredWithImages<VisionAssistantReply>(
          imageUrls,
          params.fullPrompt,
          VISION_ASSISTANT_REPLY_SCHEMA,
          { routing: { category: "advisor_chat" }, schemaName: "advisor_chat_vision_reply", maxImages: 3 },
        );
    const reply = multimodal.parsed?.reply?.trim();
    if (!reply) return { ok: false, error: "Prázdná vision odpověď." };
    return { ok: true, text: reply };
  } catch (err) {
    const fallback = await createResponseSafe(params.fullPrompt, { routing: { category: "advisor_chat" } });
    if (fallback.ok) return fallback;
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Vision odpověď selhala.",
    };
  }
}

/** Active assistant channel for API payloads — `AssistantSession` has no `context`; use locks + top-level fields. */
function assistantSessionChannelForUi(session: AssistantSession): string | null {
  return session.activeChannel ?? session.contextLock.activeChannel ?? null;
}

/** Robust [TOOL:name {...}] parser — supports nested JSON objects. */
export function parseModelToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const prefix = "[TOOL:";
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf(prefix, i);
    if (start === -1) break;
    const afterPrefix = start + prefix.length;
    const spaceIdx = text.indexOf(" ", afterPrefix);
    const closeBracket = text.indexOf("]", afterPrefix);
    let nameEnd = spaceIdx;
    if (spaceIdx === -1 || (closeBracket !== -1 && closeBracket < spaceIdx)) {
      nameEnd = closeBracket;
    }
    const name = text.slice(afterPrefix, nameEnd).trim();
    if (!name || !/^\w+$/.test(name)) {
      i = start + 1;
      continue;
    }
    const jsonStart = text.indexOf("{", nameEnd);
    if (jsonStart === -1 || (closeBracket !== -1 && closeBracket < jsonStart)) {
      calls.push({ name, params: {} });
      i = closeBracket !== -1 ? closeBracket + 1 : start + prefix.length + name.length;
      continue;
    }
    let depth = 0;
    let j = jsonStart;
    for (; j < text.length; j++) {
      const ch = text[j];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    let params: Record<string, unknown> = {};
    try {
      params = JSON.parse(text.slice(jsonStart, j)) as Record<string, unknown>;
    } catch {
      params = {};
    }
    calls.push({ name, params });
    i = j;
  }
  return calls;
}

export function formatToolResultForModel(toolName: string, result: ToolResult): string {
  const data = JSON.stringify(result.data, null, 1);
  const warn = result.warnings.length > 0 ? `\nWarnings: ${result.warnings.join("; ")}` : "";
  return `[RESULT:${toolName}] ${data}${warn}`;
}

function buildToolInstructions(): string {
  const descs = getToolDescriptions();
  const lines = descs.map((t) => {
    const paramKeys = Object.keys(t.parameters);
    const paramStr = paramKeys.length > 0 ? ` params: {${paramKeys.join(", ")}}` : "";
    return `- ${t.name}: ${t.description}${paramStr}`;
  });
  return `Dostupné nástroje:\n${lines.join("\n")}\n\nPro použití nástroje vlož: [TOOL:nazev {\"param\": \"hodnota\"}]`;
}

async function buildAssistantChatContext(
  tenantId: string,
  activeContext?: ActiveContext,
  opts?: { includeDashboard?: boolean },
): Promise<string> {
  const sections: string[] = [];
  if (opts?.includeDashboard) {
    const dashboard = await buildDashboardContext(tenantId);
    sections.push(dashboard.summaryText);
  }
  if (activeContext?.clientId) {
    const client = await buildClientDetailContext(tenantId, activeContext.clientId);
    sections.push(`\nKontext klienta:\n${client.summaryText}`);
  }
  if (activeContext?.reviewId) {
    const review = await buildReviewDetailContext(tenantId, activeContext.reviewId);
    sections.push(`\nKontext review:\n${review.summaryText}`);
  }
  if (activeContext?.paymentContactId) {
    const payment = await buildPaymentDetailContext(tenantId, activeContext.paymentContactId);
    sections.push(`\nKontext plateb:\n${payment.summaryText}`);
  }
  return sections.length > 0
    ? sections.join("\n")
    : "(Žádný dodatečný kontext — dashboard se nepřikládá, pokud o něj uživatel nepožádá.)";
}

async function resolveContactForAssistantWrites(
  session: AssistantSession,
  intent: AssistantIntent,
  tenantId: string,
): Promise<{ contactId: string } | { error: string }> {
  const ref = intent.clientRef?.trim();
  if (ref) {
    const matches = await searchContactsForAssistant(tenantId, ref, 12, { match: "name_only" });
    if (matches.length === 0) {
      return { error: `Nenašel jsem kontakt pro „${ref}“. Upřesněte jméno nebo otevřete kartu klienta.` };
    }
    if (matches.length > 1) {
      return { error: `Více shod pro „${ref}“ — vyberte jednoznačně klienta (e-mail/město) nebo použijte kontakt z URL.` };
    }
    lockAssistantClient(session, matches[0].id);
    return { contactId: matches[0].id };
  }
  if (session.lockedClientId) {
    return { contactId: session.lockedClientId };
  }
  if (session.activeClientId) {
    lockAssistantClient(session, session.activeClientId);
    return { contactId: session.activeClientId };
  }
  return { error: "Chybí klient — otevřete kartu kontaktu v portálu nebo uveďte celé jméno klienta ve zprávě." };
}


export async function routeAssistantMessage(
  message: string,
  session: AssistantSession,
  activeContext?: ActiveContext,
  options?: {
    roleName?: RoleName;
    skipIncrement?: boolean;
    recentMessages?: RecentAssistantPromptMessage[];
    imageAssets?: ImageAssetPayload[];
  },
): Promise<AssistantResponse> {
  if (!options?.skipIncrement) {
    incrementMessageCount(session);
  }

  const intent = await extractAssistantIntent(message);
  logAssistantTelemetry(AssistantTelemetryAction.LEGACY_INTENT_EXTRACTED, {
    actionTags: Array.isArray(intent.actions) ? intent.actions.slice(0, 12) : [],
    switchClient: intent.switchClient,
  });
  const roleName = options?.roleName ?? "Advisor";

  if (intent.switchClient) {
    clearAssistantClientLock(session);
  }

  const skipClientFromUi = Boolean(session.lockedClientId) && !intent.switchClient;
  updateSessionContext(session, activeContext, { skipClientIdFromUi: skipClientFromUi });

  if (!session.lockedClientId && session.activeClientId) {
    lockAssistantClient(session, session.activeClientId);
  }

  const tenantId = session.tenantId;
  const handlerCtx: ToolHandlerContext = {
    tenantId,
    userId: session.userId,
    roleName,
  };

  const effectiveContext: ActiveContext = {
    clientId: session.activeClientId,
    reviewId: session.activeReviewId,
    paymentContactId: session.activePaymentContactId,
  };

  if (intentWantsCrmWrites(intent)) {
    const resolved = await resolveContactForAssistantWrites(session, intent, tenantId);
    if ("error" in resolved) {
      return {
        message: resolved.error,
        referencedEntities: [],
        suggestedActions: [],
        warnings: [],
        confidence: 0.5,
        sourcesSummary: [],
        sessionId: session.sessionId,
      };
    }

    const write = await executeMortgageDealAndFollowUpTask({
      tenantId,
      userId: session.userId,
      roleName,
      contactId: resolved.contactId,
      intent,
    });

    if (!write.ok) {
      logAssistantTelemetry(AssistantTelemetryAction.MORTGAGE_BUNDLE_WRITE, { path: "legacy", ok: false });
      return {
        message: `Propsání do Aidvisory se nepodařilo: ${mapErrorForAdvisor(write.error ?? "", null, "legacy-crm-write")}`,
        referencedEntities: [],
        suggestedActions: [],
        warnings: [],
        confidence: 0.35,
        sourcesSummary: [],
        sessionId: session.sessionId,
      };
    }

    session.lockedDealId = write.dealId;
    logAssistantTelemetry(AssistantTelemetryAction.MORTGAGE_BUNDLE_WRITE, { path: "legacy", ok: true });

    const lines = [
      "Propsání do Aidvisory proběhlo.",
      "✓ Obchod vytvořen",
      "✓ Úkol vytvořen",
      write.dueDate ? `Termín: ${formatDisplayDateCs(write.dueDate) || write.dueDate}` : "",
    ].filter(Boolean);
    if (intent.noEmail) {
      lines.push("E-mail nebyl generován (dle zadání).");
    }

    return {
      message: lines.join("\n"),
      referencedEntities: [
        { type: "opportunity", id: write.dealId },
        { type: "task", id: write.taskId },
      ],
      suggestedActions: [],
      warnings: [],
      confidence: 1,
      sourcesSummary: [],
      sessionId: session.sessionId,
    };
  }

  const context = await buildAssistantChatContext(tenantId, effectiveContext, {
    includeDashboard: intentWantsDashboard(intent),
  });
  const toolInstructions = buildToolInstructions();

  const activeContactLine =
    effectiveContext.clientId != null && effectiveContext.clientId !== ""
      ? `Aktivní kontakt v CRM (contactId pro nástroje getClientSummary, createEmailDraft, getPaymentSetupDetail, createTaskDraft): ${effectiveContext.clientId}. Nepiš uživateli, aby ručně zadával UUID — použij toto ID v [TOOL:...].`
      : "Aktivní kontakt z URL není k dispozici — pokud potřebuješ ID kontaktu, zavolej nejdřív [TOOL:searchContacts {\"query\": \"...\"}]. Při více shodách vyber s pomocí hintů nebo nech uživatele vybrat podle e-mailu/města; nikdy nežádej o technické UUID.";

  const noEmailLine = intent.noEmail
    ? "Uživatel zakázal řešit e-mail — negeneruj obsah e-mailu a nepoužívej nástroj createEmailDraft."
    : "";

  const hardRules = [
    "Nikdy netvrď, že je něco „zavedeno“ nebo uloženo v CRM, pokud nemáš potvrzený výsledek zápisu (dealId/taskId) z tohoto běhu.",
    "Dashboard souhrn není náhrada za zápis do CRM.",
    noEmailLine,
  ]
    .filter(Boolean)
    .join("\n");

  const system = [
    "Jsi asistent poradce v CRM Aidvisora. Odpovídej stručně a v češtině.",
    "Můžeš navrhovat konkrétní kroky a používat nástroje.",
    "Fotky a screenshoty v tomto chatu zpracovává samostatná image-intake vrstva: když uživatel nahrál obrázek a ptá se na údaje z něj, napiš že údaje bere z posledního náhledu kroků / potvrzení plánu, nebo ho nasměruj na znovunahrání s krátkým textem (jméno klienta, záměr). Nevymýšlej konkrétní údaje z OP, které v tomto textovém kroku nevidíš.",
    "Běžné úkoly: vyhledat klienta (searchContacts), shrnutí klienta, návrh e-mailu, úkol, příprava textů k výpovědi — vždy přes nástroje nebo kanonický plán potvrzení, ne prázdné sliby o zápisu do CRM.",
    hardRules,
    activeContactLine,
    toolInstructions,
  ].join("\n\n");
  const historyBlock = buildRecentConversationBlock(options?.recentMessages);
  const fullPrompt = [
    system,
    `Kontext:\n${context}`,
    historyBlock,
    `Uživatel: ${message}`,
    "Asistent:",
  ]
    .filter(Boolean)
    .join("\n\n");

  const allWarnings: string[] = [];
  const allSources: string[] = [];
  const referencedEntities: { type: string; id: string; label?: string }[] = [];
  let responseMessage = "";
  let confidence = 0.8;

  const result = await createGeneralAssistantReply({
    fullPrompt,
    imageAssets: options?.imageAssets,
  });

  if (result.ok) {
    responseMessage = result.text.trim();

    const toolCalls = parseModelToolCalls(responseMessage);

    for (const tc of toolCalls) {
      const tool = getToolByName(tc.name);
      if (!tool) continue;

      if (tc.name === "createEmailDraft" && intent.noEmail) {
        responseMessage = responseMessage.replace(
          new RegExp(`\\[TOOL:${escapeRegExp(tc.name)}[^\\]]*\\]`),
          "[RESULT:createEmailDraft] {\"skipped\":true,\"reason\":\"uživatel zakázal e-mail\"}",
        );
        continue;
      }

      try {
        const toolResult = await tool.handler(tc.params, handlerCtx);
        allWarnings.push(...toolResult.warnings);
        allSources.push(...toolResult.sourceReferences.map((r) => `${r.sourceType}:${r.sourceId}`));

        const formatted = formatToolResultForModel(tc.name, toolResult);
        responseMessage = responseMessage.replace(
          new RegExp(`\\[TOOL:${escapeRegExp(tc.name)}[^\\]]*\\]`),
          formatted,
        );
      } catch {
        responseMessage = responseMessage.replace(
          new RegExp(`\\[TOOL:${escapeRegExp(tc.name)}[^\\]]*\\]`),
          `[Nástroj ${tc.name} selhal]`,
        );
      }
    }

    const refMatches = responseMessage.match(/\[(review|task|client|payment):([a-f0-9-]+)\]/gi);
    if (refMatches) {
      for (const r of refMatches) {
        const m = r.match(/\[(review|task|client|payment):([a-f0-9-]+)\]/i);
        if (m) referencedEntities.push({ type: m[1], id: m[2] });
      }
    }
  } else {
    confidence = 0;
    const urgentItems = await computePriorityItems(tenantId);
    const fallbackActions = buildSuggestedActionsFromUrgent(urgentItems);

    session.lastSuggestedActions = fallbackActions;
    session.lastWarnings = ["Služba AI dočasně nedostupná."];

    return {
      message: "Odpověď není k dispozici. Zkuste to později nebo vyberte akci níže.",
      referencedEntities: [],
      suggestedActions: [],
      warnings: ["Služba AI dočasně nedostupná."],
      confidence: 0,
      sourcesSummary: [],
      sessionId: session.sessionId,
    };
  }

  return {
    message: responseMessage.slice(0, 3000),
    referencedEntities,
    suggestedActions: [],
    warnings: allWarnings,
    confidence,
    sourcesSummary: [...new Set(allSources)],
    sessionId: session.sessionId,
  };
}

const CONFIRM_PATTERNS = /^(ano|potvrď|proveď|ok|spusť|potvrzuji|souhlasím|confirmed?)\s*$/i;
const CANCEL_PATTERNS = /^(ne|zruš|stornuj|cancel|skip)\s*$/i;

function isConfirmation(message: string): boolean {
  return CONFIRM_PATTERNS.test(message.trim());
}

function isCancellation(message: string): boolean {
  return CANCEL_PATTERNS.test(message.trim());
}

export type AssistantConfirmationPayload = {
  cancel: boolean;
  /** Když undefined (a ne cancel): potvrdí všechny čekající kroky — kompatibilní s textem „ano". */
  selectedStepIds?: string[];
  /** Inline param overrides from advisor UI — merged into step params before execution. */
  stepParamOverrides?: Record<string, Record<string, string>>;
};

/** 6F: explicitní potvrzení / zrušení bez nutnosti psát „ano" do inputu. Volá se z API těla i z textových aliasů. */
export async function handleAssistantAwaitingConfirmation(
  session: AssistantSession,
  body: AssistantConfirmationPayload,
  ctx: { tenantId: string; userId: string; roleName: RoleName },
): Promise<AssistantResponse | null> {
  const plan = session.lastExecutionPlan;
  if (!plan || plan.status !== "awaiting_confirmation") return null;

  if (session._confirmationInProgress) {
    return {
      message: "Potvrzení se právě provádí. Vyčkejte prosím.",
      referencedEntities: [],
      suggestedActions: [],
      warnings: [],
      confidence: 1,
      sourcesSummary: [],
      sessionId: session.sessionId,
    };
  }

  if (body.cancel) {
    logAssistantTelemetry(AssistantTelemetryAction.CONFIRMATION_CANCELLED, {
      planId: plan.planId,
    });
    session.lastExecutionPlan = undefined;
    return {
      message: "Plán zrušen. Jak vám mohu pomoci?",
      referencedEntities: [],
      suggestedActions: [],
      warnings: [],
      confidence: 1,
      sourcesSummary: [],
      sessionId: session.sessionId,
    };
  }

  if (
    plan.contactId &&
    session.lockedClientId &&
    plan.contactId !== session.lockedClientId
  ) {
    logAssistantTelemetry(AssistantTelemetryAction.CONTEXT_SAFETY_BLOCKED, {
      planId: plan.planId,
      reason: "plan_client_mismatch",
    });
    session.lastExecutionPlan = undefined;
    return {
      message:
        "Plán akcí se vztahoval k jinému klientovi než aktuální kontext. Z bezpečnostních důvodů byl zrušen. Zadejte požadavek znovu.",
      referencedEntities: [],
      suggestedActions: [],
      warnings: ["Nesoulad klienta mezi plánem a aktuálním kontextem."],
      confidence: 0.3,
      sourcesSummary: [],
      sessionId: session.sessionId,
    };
  }

  if (!session.lockedClientId && plan.contactId) {
    lockAssistantClient(session, plan.contactId);
  }

  let prepared: ExecutionPlan;
  if (body.selectedStepIds === undefined) {
    prepared = confirmAllSteps(plan);
  } else {
    const awaiting = getStepsAwaitingConfirmation(plan).map((s) => s.stepId);
    const picked = body.selectedStepIds.filter((id) => awaiting.includes(id));
    if (picked.length === 0) {
      logAssistantTelemetry(AssistantTelemetryAction.CONFIRMATION_CANCELLED, {
        planId: plan.planId,
      });
      session.lastExecutionPlan = undefined;
      return {
        message:
          "Nebyly vybrány žádné akce k provedení. Plán byl zrušen. Můžete zadat nový požadavek nebo upravit zadání.",
        referencedEntities: [],
        suggestedActions: [],
        warnings: [],
        confidence: 1,
        sourcesSummary: [],
        sessionId: session.sessionId,
      };
    }
    prepared = applyConfirmationSelection(plan, picked);
  }

  const confirmedCount = prepared.steps.filter((s) => s.status === "confirmed").length;
  if (confirmedCount === 0) {
    session.lastExecutionPlan = undefined;
    return {
      message: "Nebyly vybrány žádné akce k provedení. Plán byl zrušen.",
      referencedEntities: [],
      suggestedActions: [],
      warnings: [],
      confidence: 1,
      sourcesSummary: [],
      sessionId: session.sessionId,
    };
  }

  // Apply inline param overrides from the advisor UI before running the plan
  if (body.stepParamOverrides && Object.keys(body.stepParamOverrides).length > 0) {
    prepared = {
      ...prepared,
      steps: prepared.steps.map((step) => {
        const overrides = body.stepParamOverrides![step.stepId];
        if (!overrides) return step;
        return { ...step, params: { ...step.params, ...overrides } };
      }),
    };
  }

  session._confirmationInProgress = true;
  try {
    logAssistantTelemetry(AssistantTelemetryAction.CONFIRMATION_EXECUTED, {
      planId: prepared.planId,
    });
    const executed = await executePlan(prepared, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      sessionId: session.sessionId,
      roleName: ctx.roleName,
    });
    session.lastExecutionPlan = executed;
    const verified = buildVerifiedResult("Akce provedeny.", executed);
    return verifiedToResponse(verified, session.sessionId);
  } finally {
    session._confirmationInProgress = false;
  }
}

async function respondPostUploadReviewBootstrap(
  session: AssistantSession,
  reviewId: string,
): Promise<AssistantResponse> {
  // Phase 2+3: load publish hints and packet meta from the review row
  let publishHints: import("./assistant-execution-plan").PostUploadReviewPlanOptions["publishHints"] = null;
  let packetIsBundle = false;
  let hasSensitiveAttachment = false;
  try {
    const { getContractReviewById } = await import("./review-queue-repository");
    const row = await getContractReviewById(reviewId, session.tenantId);
    const payload = row?.extractedPayload as Record<string, unknown> | null | undefined;
    if (payload) {
      const hints = payload.publishHints as Record<string, unknown> | null | undefined;
      if (hints) {
        publishHints = {
          contractPublishable: hints.contractPublishable !== false,
          needsSplit: hints.needsSplit === true,
          sensitiveAttachmentOnly: hints.sensitiveAttachmentOnly === true,
          needsManualValidation: hints.needsManualValidation === true,
          reasons: Array.isArray(hints.reasons) ? (hints.reasons as string[]) : [],
        };
      }
      const pm = payload.packetMeta as Record<string, unknown> | null | undefined;
      if (pm) {
        packetIsBundle = pm.isBundle === true;
        hasSensitiveAttachment = pm.hasSensitiveAttachment === true;
      }
    }
  } catch {
    // best-effort; proceed with default (publishable) plan
  }

  const plan = buildPostUploadReviewPlan(session, reviewId, {
    publishHints,
    packetIsBundle,
    hasSensitiveAttachment,
  });
  session.lastExecutionPlan = plan;

  const resolution = emptyEntityResolution();
  const tenantCheck = verifyTenantConsistency(session, plan);
  if (!tenantCheck.safe) {
    return {
      message: tenantCheck.warnings.join("\n"),
      referencedEntities: [],
      suggestedActions: [],
      warnings: tenantCheck.warnings,
      confidence: 0.25,
      sourcesSummary: [],
      sessionId: session.sessionId,
    };
  }

  const ctxSafety = verifyWriteContextSafety(session, resolution, plan);
  if (!ctxSafety.safe) {
    return {
      message: ctxSafety.warnings.join("\n"),
      referencedEntities: [],
      suggestedActions: [],
      warnings: ctxSafety.warnings,
      confidence: 0.25,
      sourcesSummary: [],
      sessionId: session.sessionId,
    };
  }

  const awaiting = getStepsAwaitingConfirmation(plan);
  if (awaiting.length === 0) {
    return {
      message: "Nepodařilo se připravit kroky pro tuto kontrolu.",
      referencedEntities: [],
      suggestedActions: [],
      warnings: [],
      confidence: 0.3,
      sourcesSummary: [],
      sessionId: session.sessionId,
    };
  }

  logAssistantTelemetry(AssistantTelemetryAction.AWAITING_CONFIRMATION, {
    planId: plan.planId,
    pendingSteps: awaiting.length,
    path: "bootstrap_post_upload_review",
  });

  const stepPreviews: StepPreviewItem[] = plan.steps.map((s) => {
    const pf = computeWriteStepPreflight(s.action, s.params);
    const baseVw = buildValidationWarnings(s.action, s.params);
    const extra =
      pf.preflightStatus === "needs_input" && pf.advisorMessage && pf.missingFields.length === 0
        ? [pf.advisorMessage]
        : [];
    return {
      stepId: s.stepId,
      label: s.label,
      action: s.label,
      contextHint: stepPreviewContextHint(s),
      description: buildStepDescription(s.action, s.params),
      domainGroup: productDomainChipLabel(s.params.productDomain as string | undefined) ?? null,
      validationWarnings: [...baseVw, ...extra],
      preflightStatus: pf.preflightStatus,
      blockedReason: pf.preflightStatus === "blocked" ? pf.advisorMessage : undefined,
    };
  });

  const clientLabel = "Smlouva z AI kontroly";

  return {
    message:
      "Níže vyberte kroky a potvrďte je tlačítkem „Potvrdit a provést“ (po schválení se zapíší do CRM a propojí dokument).",
    referencedEntities: [{ type: "contract_review", id: reviewId, label: clientLabel }],
    suggestedActions: [],
    warnings: [...resolution.warnings, ...ctxSafety.warnings],
    confidence: 0.9,
    sourcesSummary: [],
    sessionId: session.sessionId,
    executionState: {
      status: "awaiting_confirmation",
      planId: plan.planId,
      totalSteps: plan.steps.length,
      pendingSteps: awaiting.length,
      stepPreviews,
      clientLabel,
    },
    contextState: {
      channel: assistantSessionChannelForUi(session),
      lockedClientId: session.lockedClientId ?? null,
      lockedClientLabel: null,
    },
  };
}

/**
 * V2 canonical pipeline: intent → entity resolution → execution plan → confirm → execute → verified result.
 * Falls back to legacy router for read-only / general_chat intents.
 */
export async function routeAssistantMessageCanonical(
  message: string,
  session: AssistantSession,
  activeContext?: ActiveContext,
  options?: {
    roleName?: RoleName;
    bootstrapPostUploadReviewPlan?: boolean;
    /** P5: prepended to the model prompt only (short rolling digest from prior turns). */
    intentPromptAugment?: string;
    recentMessages?: RecentAssistantPromptMessage[];
    imageAssets?: ImageAssetPayload[];
    resolvedContextBlock?: string;
  },
): Promise<AssistantResponse> {
  incrementMessageCount(session);
  const roleName = options?.roleName ?? "Advisor";
  const tenantId = session.tenantId;

  if (session.lastExecutionPlan && session.lastExecutionPlan.status === "awaiting_confirmation") {
    if (isConfirmation(message)) {
      const out = await handleAssistantAwaitingConfirmation(
        session,
        { cancel: false },
        { tenantId, userId: session.userId, roleName },
      );
      if (out) return out;
    }
    if (isCancellation(message)) {
      const out = await handleAssistantAwaitingConfirmation(
        session,
        { cancel: true },
        { tenantId, userId: session.userId, roleName },
      );
      if (out) return out;
    }
  }

  const incomingClientId = activeContext?.clientId ?? undefined;
  const lockedDiffers = Boolean(
    session.lockedClientId && incomingClientId && session.lockedClientId !== incomingClientId,
  );
  if (lockedDiffers) {
    clearAssistantClientLock(session);
    session.lastExecutionPlan = undefined;
  }
  const skipClientFromUi = Boolean(session.lockedClientId) && !lockedDiffers;
  updateSessionContext(session, activeContext, { skipClientIdFromUi: skipClientFromUi });

  if (options?.bootstrapPostUploadReviewPlan) {
    const rid = activeContext?.reviewId?.trim();
    if (rid) {
      logAssistantTelemetry(AssistantTelemetryAction.ROUTE_CANONICAL, {
        path: "bootstrap_post_upload_review",
      });
      return respondPostUploadReviewBootstrap(session, rid);
    }
  }

  const ratingReply = tryRatingLookupReply(message);
  if (ratingReply) {
    logAssistantTelemetry(AssistantTelemetryAction.ROUTE_CANONICAL, { path: "rating_seed_lookup" });
    return {
      message: ratingReply,
      referencedEntities: [],
      suggestedActions: [],
      warnings: [],
      confidence: 0.95,
      sourcesSummary: ratingSourcesSummaryFromReply(ratingReply),
      sessionId: session.sessionId,
    };
  }

  const canonicalIntent = await extractCanonicalIntent(message, {
    historyPrefix: options?.intentPromptAugment,
    recentMessages: options?.recentMessages,
    resolvedContextBlock: options?.resolvedContextBlock,
  });

  const hasPendingDisambiguation = Boolean(session.pendingClientDisambiguation);
  const intentHasExplicitClient = Boolean(canonicalIntent.targetClient?.ref);
  const explicitClientRef = canonicalIntent.targetClient?.ref?.trim() ?? null;

  if (
    !session.lockedClientId &&
    session.activeClientId &&
    !hasPendingDisambiguation &&
    !intentHasExplicitClient
  ) {
    lockAssistantClient(session, session.activeClientId);
  }
  logAssistantTelemetry(AssistantTelemetryAction.CANONICAL_INTENT_EXTRACTED, {
    intentType: canonicalIntent.intentType,
    switchClient: canonicalIntent.switchClient,
    requiresConfirmation: canonicalIntent.requiresConfirmation,
  });

  if (canonicalIntent.switchClient) {
    clearAssistantClientLock(session);
    session.lastExecutionPlan = undefined;
  } else if (explicitClientRef && session.lockedClientId) {
    // Explicit client mention in a new message should not be shadowed by a stale lock.
    clearAssistantClientLock(session);
    session.lastExecutionPlan = undefined;
  }

  const READ_ONLY_INTENTS = new Set([
    "general_chat", "dashboard_summary", "search_contacts",
    "summarize_client", "prepare_meeting_brief", "review_extraction", "switch_client",
  ]);

  if (READ_ONLY_INTENTS.has(canonicalIntent.intentType)) {
    return routeAssistantMessage(message, session, activeContext, {
      roleName: options?.roleName,
      skipIncrement: true,
      recentMessages: options?.recentMessages,
      imageAssets: options?.imageAssets,
    });
  }

  const resolution = await resolveEntities(tenantId, canonicalIntent, session);
  logAssistantTelemetry(AssistantTelemetryAction.ENTITY_RESOLUTION, {
    ambiguousClient: Boolean(resolution.client?.ambiguous),
    clientResolved: Boolean(resolution.client?.entityId),
    warningCount: resolution.warnings.length,
  });

  if (shouldUseMortgageVerifiedBundle(canonicalIntent)) {
    if (resolution.client?.ambiguous) {
      session.pendingClientDisambiguation = true;
      const altLines = resolution.client.alternatives.map((a, i) => `${i + 1}. ${a.label}`).join("\n");
      return {
        message: `Nalezeno více klientů. Upřesněte prosím:\n\n${resolution.client.displayLabel}\n${altLines}`,
        referencedEntities: [],
        suggestedActions: [],
        warnings: resolution.warnings,
        confidence: 0.5,
        sourcesSummary: [],
        sessionId: session.sessionId,
      };
    }
    const contactId =
      resolution.client?.entityId ?? session.lockedClientId ?? session.activeClientId ?? null;
    if (!contactId) {
      return {
        message:
          "Pro založení hypotéky a follow-upu chybí klient — otevřete kartu kontaktu nebo uveďte celé jméno ve zprávě.",
        referencedEntities: [],
        suggestedActions: [],
        warnings: resolution.warnings,
        confidence: 0.45,
        sourcesSummary: [],
        sessionId: session.sessionId,
      };
    }
    lockAssistantClient(session, contactId);
    session.pendingClientDisambiguation = false;
    const legacyIntent = canonicalIntentToMortgageAssistantIntent(canonicalIntent, {
      resolvedContactId: contactId,
    });
    const write = await executeMortgageDealAndFollowUpTask({
      tenantId,
      userId: session.userId,
      roleName,
      contactId,
      intent: legacyIntent,
    });
    if (!write.ok) {
      logAssistantTelemetry(AssistantTelemetryAction.MORTGAGE_BUNDLE_WRITE, { path: "canonical", ok: false });
      return {
        message: `Propsání do Aidvisory se nepodařilo: ${mapErrorForAdvisor(write.error ?? "", null, "canonical-crm-write")}`,
        referencedEntities: [],
        suggestedActions: [],
        warnings: [],
        confidence: 0.35,
        sourcesSummary: [],
        sessionId: session.sessionId,
      };
    }
    session.lockedDealId = write.dealId;
    logAssistantTelemetry(AssistantTelemetryAction.MORTGAGE_BUNDLE_WRITE, { path: "canonical", ok: true });
    const lines = [
      "Propsání do Aidvisory proběhlo.",
      "✓ Obchod vytvořen",
      "✓ Úkol vytvořen",
      write.dueDate ? `Termín: ${formatDisplayDateCs(write.dueDate) || write.dueDate}` : "",
    ].filter(Boolean);
    if (legacyIntent.noEmail) lines.push("E-mail nebyl generován (dle zadání).");
    return {
      message: lines.join("\n"),
      referencedEntities: [
        { type: "opportunity", id: write.dealId },
        { type: "task", id: write.taskId },
      ],
      suggestedActions: [],
      warnings: [],
      confidence: 1,
      sourcesSummary: [],
      sessionId: session.sessionId,
    };
  }

  if (resolution.client?.ambiguous) {
    session.pendingClientDisambiguation = true;
    const altLines = resolution.client.alternatives
      .map((a, i) => `${i + 1}. ${a.label}`)
      .join("\n");
    return {
      message: `Našel jsem více klientů pro toto zadání. Upřesněte prosím, kterého máte na mysli:\n\n1. ${resolution.client.displayLabel}\n${altLines}`,
      referencedEntities: [],
      suggestedActions: [],
      warnings: resolution.warnings,
      confidence: 0.5,
      sourcesSummary: [],
      sessionId: session.sessionId,
    };
  }

  if (!resolution.client && canonicalIntent.targetClient) {
    return {
      message: `Klienta „${canonicalIntent.targetClient.ref}“ jsem nenašel. Zkontrolujte jméno nebo otevřete správnou kartu klienta.`,
      referencedEntities: [],
      suggestedActions: [],
      warnings: resolution.warnings,
      confidence: 0.4,
      sourcesSummary: [],
      sessionId: session.sessionId,
    };
  }

  if (resolution.client && !resolution.client.ambiguous) {
    lockAssistantClient(session, resolution.client.entityId);
    session.pendingClientDisambiguation = false;
  }

  const patchedIntent = patchIntentWithResolutions(canonicalIntent, resolution);
  const plan = buildExecutionPlan(patchedIntent, resolution, session);
  logAssistantTelemetry(AssistantTelemetryAction.EXECUTION_PLAN_BUILT, {
    planId: plan.planId,
    stepCount: plan.steps.length,
    planStatus: plan.status,
    intentType: plan.intentType,
  });

  if (plan.steps.length === 0) {
    logAssistantTelemetry(AssistantTelemetryAction.CANONICAL_FALLBACK_LEGACY_CHAT, { reason: "empty_plan" });
    return routeAssistantMessage(message, session, activeContext, {
      roleName: options?.roleName,
      skipIncrement: true,
    });
  }

  const tenantSafety = verifyTenantConsistency(session, plan);
  if (!tenantSafety.safe) {
    logAssistantTelemetry(AssistantTelemetryAction.CONTEXT_SAFETY_BLOCKED, {
      planId: plan.planId,
      reason: tenantSafety.blockedReason,
    });
    return {
      message: tenantSafety.warnings.join("\n"),
      referencedEntities: [],
      suggestedActions: [],
      warnings: tenantSafety.warnings,
      confidence: 0.2,
      sourcesSummary: [],
      sessionId: session.sessionId,
    };
  }

  const ctxSafety = verifyWriteContextSafety(session, resolution, plan);
  if (!ctxSafety.safe) {
    logAssistantTelemetry(AssistantTelemetryAction.CONTEXT_SAFETY_BLOCKED, {
      planId: plan.planId,
      reason: ctxSafety.blockedReason,
    });
    return {
      message: ctxSafety.warnings.join("\n"),
      referencedEntities: [],
      suggestedActions: [],
      warnings: ctxSafety.warnings,
      confidence: 0.3,
      sourcesSummary: [],
      sessionId: session.sessionId,
    };
  }
  if (
    ctxSafety.requiresConfirmation &&
    plan.status !== "awaiting_confirmation" &&
    plan.status !== "draft"
  ) {
    logAssistantTelemetry(AssistantTelemetryAction.CONTEXT_SAFETY_CROSS_ENTITY, {
      planId: plan.planId,
      warningCount: ctxSafety.warnings.length,
    });
    for (const s of plan.steps) {
      if (s.status !== "requires_confirmation") {
        (s as { status: string }).status = "requires_confirmation";
      }
    }
    (plan as { status: string }).status = "awaiting_confirmation";
  }

  const awaiting = getStepsAwaitingConfirmation(plan);
  if (plan.status === "awaiting_confirmation" && awaiting.length > 0) {
    logAssistantTelemetry(AssistantTelemetryAction.AWAITING_CONFIRMATION, {
      planId: plan.planId,
      pendingSteps: awaiting.length,
    });
    session.lastExecutionPlan = plan;
    const summary = getPlanSummary(plan);
    const clientLabel = resolution.client?.displayLabel ?? "neznámý klient";
    const playbookLines = getPlaybookGuidanceLines(patchedIntent, message);
    const playbookBlock = playbookLines.length > 0 ? `\n\n${playbookLines.join("\n")}` : "";
    const proactiveHints =
      resolution.client?.entityId && !resolution.client.ambiguous
        ? await loadProactiveHintsForContact(tenantId, resolution.client.entityId)
        : [];
    const proactiveBlock = formatProactiveHintsBlock(proactiveHints);
    const stepPreviews = buildStepPreviewItems(plan);
    return {
      message: `Připravuji akce pro **${clientLabel}**:\n\n${summary}${playbookBlock}${proactiveBlock}\n\nVyberte kroky v náhledu a potvrďte tlačítkem „Potvrdit a provést“ (popř. zrušte).`,
      referencedEntities: resolution.client ? [{ type: "contact", id: resolution.client.entityId, label: resolution.client.displayLabel }] : [],
      suggestedActions: [],
      warnings: resolution.warnings,
      confidence: 0.85,
      sourcesSummary: [],
      sessionId: session.sessionId,
      executionState: {
        status: "awaiting_confirmation",
        planId: plan.planId,
        totalSteps: plan.steps.length,
        pendingSteps: awaiting.length,
        stepPreviews,
        clientLabel: resolution.client?.displayLabel,
      },
      contextState: {
        channel: assistantSessionChannelForUi(session),
        lockedClientId: session.lockedClientId ?? null,
        lockedClientLabel: resolution.client?.displayLabel ?? null,
      },
    };
  }

  if (plan.status === "draft") {
    session.lastExecutionPlan = plan;
    const clientLabel = resolution.client?.displayLabel ?? "neznámý klient";
    return {
      message: buildDraftPlanMessage(clientLabel, plan),
      referencedEntities: resolution.client ? [{ type: "contact", id: resolution.client.entityId, label: resolution.client.displayLabel }] : [],
      suggestedActions: [],
      warnings: resolution.warnings,
      confidence: 0.75,
      sourcesSummary: [],
      sessionId: session.sessionId,
      executionState: {
        status: "draft",
        planId: plan.planId,
        totalSteps: plan.steps.length,
        pendingSteps: 0,
        stepPreviews: buildStepPreviewItems(plan),
        clientLabel: resolution.client?.displayLabel,
      },
      contextState: {
        channel: assistantSessionChannelForUi(session),
        lockedClientId: session.lockedClientId ?? null,
        lockedClientLabel: resolution.client?.displayLabel ?? null,
      },
    };
  }

  const confirmed = confirmAllSteps(plan);
  const executed = await executePlan(confirmed, {
    tenantId,
    userId: session.userId,
    sessionId: session.sessionId,
    roleName,
  });
  session.lastExecutionPlan = executed;
  const verified = buildVerifiedResult("Akce provedeny.", executed);
  return verifiedToResponse(verified, session.sessionId);
}

function verifiedToResponse(verified: VerifiedAssistantResult, sessionId: string): AssistantResponse {
  const suggestedNextStepItems: SuggestedNextStepItem[] | undefined =
    verified.suggestedNextSteps.length > 0
      ? verified.suggestedNextSteps.map((label) => ({ label, kind: "hint" }))
      : undefined;

  return {
    message: verified.message,
    referencedEntities: verified.referencedEntities,
    suggestedActions: [],
    warnings: verified.warnings,
    confidence: verified.confidence,
    sourcesSummary: [],
    sessionId,
    executionState: verified.plan ? {
      status: verified.plan.status,
      planId: verified.plan.planId,
      totalSteps: verified.plan.steps.length,
      pendingSteps: verified.plan.steps.filter(s => s.status === "requires_confirmation").length,
    } : null,
    stepOutcomes: verified.stepOutcomes.map(o => ({
      label: o.label,
      status: o.status,
      error: o.error,
      retryable: o.retryable,
    })),
    suggestedNextSteps: undefined,
    suggestedNextStepItems,
    hasPartialFailure: verified.hasPartialFailure || undefined,
    contextState: null,
  };
}

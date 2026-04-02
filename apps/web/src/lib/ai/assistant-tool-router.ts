/**
 * Assistant tool router â€” intent-first CRM writes, optional tools, no default dashboard.
 */

import { createResponseSafe } from "@/lib/openai";
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
import {
  intentWantsCrmWrites,
  intentWantsDashboard,
  shouldUseMortgageVerifiedBundle,
  canonicalIntentToMortgageAssistantIntent,
} from "./assistant-intent";
import { executeMortgageDealAndFollowUpTask } from "./assistant-crm-writes";
import { searchContactsForAssistant } from "./assistant-contact-search";
import type { RoleName } from "@/shared/rolePermissions";
import type { AssistantIntent } from "./assistant-intent";
import type { CanonicalIntent, ExecutionPlan, VerifiedAssistantResult } from "./assistant-domain-model";
import { resolveEntities, patchIntentWithResolutions } from "./assistant-entity-resolution";
import { buildExecutionPlan, confirmAllSteps, allStepsReady, getPlanSummary, getStepsAwaitingConfirmation } from "./assistant-execution-plan";
import { executePlan, buildVerifiedResult } from "./assistant-execution-engine";
import { getPlaybookGuidanceLines } from "./playbooks";

export type AssistantResponse = {
  message: string;
  referencedEntities: { type: string; id: string; label?: string }[];
  suggestedActions: ActionPayload[];
  warnings: string[];
  confidence: number;
  sourcesSummary: string[];
  sessionId: string;
};

type ToolCall = {
  name: string;
  params: Record<string, unknown>;
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Robust [TOOL:name {...}] parser â€” supports nested JSON objects. */
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
  return `DostupnĂ© nĂˇstroje:\n${lines.join("\n")}\n\nPro pouĹľitĂ­ nĂˇstroje vloĹľ: [TOOL:nazev {\"param\": \"hodnota\"}]`;
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
  return sections.length > 0 ? sections.join("\n") : "(Ĺ˝ĂˇdnĂ˝ dodateÄŤnĂ˝ kontext â€” dashboard se nepĹ™iklĂˇdĂˇ, pokud o nÄ›j uĹľivatel nepoĹľĂˇdĂˇ.)";
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
  options?: { roleName?: RoleName; skipIncrement?: boolean },
): Promise<AssistantResponse> {
  if (!options?.skipIncrement) {
    incrementMessageCount(session);
  }

  const intent = await extractAssistantIntent(message);
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
      return {
        message: `ZĂˇpis do CRM se nepodaĹ™il: ${write.error}`,
        referencedEntities: [],
        suggestedActions: [],
        warnings: [],
        confidence: 0.35,
        sourcesSummary: [],
        sessionId: session.sessionId,
      };
    }

    session.lockedDealId = write.dealId;

    const lines = [
      "ZĂˇznam do CRM probÄ›hl (ovÄ›Ĺ™enĂ© identifikĂˇtory z databĂˇze).",
      `dealId: ${write.dealId}`,
      `taskId: ${write.taskId}`,
      `TermĂ­n Ăşkolu (datum, 10:00 Europe/Prague): ${write.dueDate}`,
    ];
    if (intent.noEmail) {
      lines.push("E-mail nebyl generovĂˇn (dle zadĂˇnĂ­).");
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
      ? `AktivnĂ­ kontakt v CRM (contactId pro nĂˇstroje getClientSummary, createEmailDraft, getPaymentSetupDetail, createTaskDraft): ${effectiveContext.clientId}. NepiĹˇ uĹľivateli, aby ruÄŤnÄ› zadĂˇval UUID â€” pouĹľij toto ID v [TOOL:...].`
      : "AktivnĂ­ kontakt z URL nenĂ­ k dispozici â€” pokud potĹ™ebujeĹˇ ID kontaktu, zavolej nejdĹ™Ă­v [TOOL:searchContacts {\"query\": \"...\"}]. PĹ™i vĂ­ce shodĂˇch vyber s pomocĂ­ hintĹŻ nebo nech uĹľivatele vybrat podle e-mailu/mÄ›sta; nikdy neĹľĂˇdej o technickĂ© UUID.";

  const noEmailLine = intent.noEmail
    ? "UĹľivatel zakĂˇzal Ĺ™eĹˇit e-mail â€” negeneruj obsah e-mailu a nepouĹľĂ­vej nĂˇstroj createEmailDraft."
    : "";

  const hardRules = [
    "Nikdy netvrÄŹ, Ĺľe je nÄ›co â€žzavedenoâ€ś nebo uloĹľeno v CRM, pokud nemĂˇĹˇ potvrzenĂ˝ vĂ˝sledek zĂˇpisu (dealId/taskId) z tohoto bÄ›hu.",
    "Dashboard souhrn nenĂ­ nĂˇhrada za zĂˇpis do CRM.",
    noEmailLine,
  ]
    .filter(Boolean)
    .join("\n");

  const system = [
    "Jsi asistent poradce v CRM. OdpovĂ­dej struÄŤnÄ› a v ÄŤeĹˇtinÄ›.",
    "MĹŻĹľeĹˇ navrhovat konkrĂ©tnĂ­ kroky a pouĹľĂ­vat nĂˇstroje.",
    hardRules,
    activeContactLine,
    toolInstructions,
  ].join("\n\n");

  const fullPrompt = `${system}\n\nKontext:\n${context}\n\nUĹľivatel: ${message}\n\nAsistent:`;

  const allWarnings: string[] = [];
  const allSources: string[] = [];
  const referencedEntities: { type: string; id: string; label?: string }[] = [];
  let responseMessage = "";
  let confidence = 0.8;

  const result = await createResponseSafe(fullPrompt);

  if (result.ok) {
    responseMessage = result.text.trim();

    const toolCalls = parseModelToolCalls(responseMessage);

    for (const tc of toolCalls) {
      const tool = getToolByName(tc.name);
      if (!tool) continue;

      if (tc.name === "createEmailDraft" && intent.noEmail) {
        responseMessage = responseMessage.replace(
          new RegExp(`\\[TOOL:${escapeRegExp(tc.name)}[^\\]]*\\]`),
          "[RESULT:createEmailDraft] {\"skipped\":true,\"reason\":\"uĹľivatel zakĂˇzal e-mail\"}",
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
          `[NĂˇstroj ${tc.name} selhal]`,
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
    session.lastWarnings = ["SluĹľba AI doÄŤasnÄ› nedostupnĂˇ."];

    return {
      message: "OdpovÄ›ÄŹ nenĂ­ k dispozici. Zkuste to pozdÄ›ji nebo vyberte akci nĂ­Ĺľe.",
      referencedEntities: [],
      suggestedActions: [],
      warnings: ["SluĹľba AI doÄŤasnÄ› nedostupnĂˇ."],
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

/**
 * V2 canonical pipeline: intent → entity resolution → execution plan → confirm → execute → verified result.
 * Falls back to legacy router for read-only / general_chat intents.
 */
export async function routeAssistantMessageCanonical(
  message: string,
  session: AssistantSession,
  activeContext?: ActiveContext,
  options?: { roleName?: RoleName },
): Promise<AssistantResponse> {
  incrementMessageCount(session);
  const roleName = options?.roleName ?? "Advisor";
  const tenantId = session.tenantId;

  if (session.lastExecutionPlan && session.lastExecutionPlan.status === "awaiting_confirmation") {
    if (isConfirmation(message)) {
      const confirmed = confirmAllSteps(session.lastExecutionPlan);
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
    if (isCancellation(message)) {
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
  }

  const skipClientFromUi = Boolean(session.lockedClientId);
  updateSessionContext(session, activeContext, { skipClientIdFromUi: skipClientFromUi });

  if (!session.lockedClientId && session.activeClientId) {
    lockAssistantClient(session, session.activeClientId);
  }

  const canonicalIntent = await extractCanonicalIntent(message);

  if (canonicalIntent.switchClient) {
    clearAssistantClientLock(session);
  }

  const READ_ONLY_INTENTS = new Set([
    "general_chat", "dashboard_summary", "search_contacts",
    "summarize_client", "prepare_meeting_brief", "review_extraction", "switch_client",
  ]);

  if (READ_ONLY_INTENTS.has(canonicalIntent.intentType)) {
    return routeAssistantMessage(message, session, activeContext, {
      roleName: options?.roleName,
      skipIncrement: true,
    });
  }

  const resolution = await resolveEntities(tenantId, canonicalIntent, session);

  if (shouldUseMortgageVerifiedBundle(canonicalIntent)) {
    if (resolution.client?.ambiguous) {
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
      return {
        message: `Zápis do CRM se nepodařil: ${write.error}`,
        referencedEntities: [],
        suggestedActions: [],
        warnings: [],
        confidence: 0.35,
        sourcesSummary: [],
        sessionId: session.sessionId,
      };
    }
    session.lockedDealId = write.dealId;
    const lines = [
      "Záznam do CRM proběhl (ověřené identifikátory z databáze).",
      `dealId: ${write.dealId}`,
      `taskId: ${write.taskId}`,
      `Termín úkolu (datum, 10:00 Europe/Prague): ${write.dueDate}`,
    ];
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
    const altLines = resolution.client.alternatives
      .map((a, i) => `${i + 1}. ${a.label}`)
      .join("\n");
    return {
      message: `Nalezeno více klientů. Upřesněte prosím:\n\n${resolution.client.displayLabel} (vybraný)\n${altLines}`,
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
      message: `Klient „${canonicalIntent.targetClient.ref}" nebyl nalezen. Zkontrolujte jméno nebo otevřete kartu klienta.`,
      referencedEntities: [],
      suggestedActions: [],
      warnings: resolution.warnings,
      confidence: 0.4,
      sourcesSummary: [],
      sessionId: session.sessionId,
    };
  }

  const patchedIntent = patchIntentWithResolutions(canonicalIntent, resolution);
  const plan = buildExecutionPlan(patchedIntent, resolution);

  if (plan.steps.length === 0) {
    return routeAssistantMessage(message, session, activeContext, {
      roleName: options?.roleName,
      skipIncrement: true,
    });
  }

  const awaiting = getStepsAwaitingConfirmation(plan);
  if (awaiting.length > 0) {
    session.lastExecutionPlan = plan;
    const summary = getPlanSummary(plan);
    const clientLabel = resolution.client?.displayLabel ?? "neznámý klient";
    const playbookLines = getPlaybookGuidanceLines(patchedIntent, message);
    const playbookBlock = playbookLines.length > 0 ? `\n\n${playbookLines.join("\n")}` : "";
    return {
      message: `Připravuji akce pro **${clientLabel}**:\n\n${summary}${playbookBlock}\n\nPotvrďte provedení odpovědí „ano" nebo zrušte odpovědí „ne".`,
      referencedEntities: resolution.client ? [{ type: "contact", id: resolution.client.entityId, label: resolution.client.displayLabel }] : [],
      suggestedActions: [],
      warnings: resolution.warnings,
      confidence: 0.85,
      sourcesSummary: [],
      sessionId: session.sessionId,
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
  return {
    message: verified.message + (verified.suggestedNextSteps.length > 0 ? `\n\n${verified.suggestedNextSteps.join("\n")}` : ""),
    referencedEntities: verified.referencedEntities,
    suggestedActions: [],
    warnings: verified.warnings,
    confidence: verified.confidence,
    sourcesSummary: [],
    sessionId,
  };
}

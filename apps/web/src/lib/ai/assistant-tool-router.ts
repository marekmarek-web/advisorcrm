/**
 * Assistant tool router (Plan 5B.2).
 * Orchestrates context building, model calls, and tool dispatch.
 */

import { createResponseSafe } from "@/lib/openai";
import { ASSISTANT_TOOLS, getToolByName, getToolDescriptions, type ToolResult, type ToolHandlerContext } from "./assistant-tools";
import { buildDashboardContext, buildClientDetailContext, buildReviewDetailContext, buildPaymentDetailContext } from "./assistant-context-builder";
import { type AssistantSession, type ActiveContext, updateSessionContext, incrementMessageCount } from "./assistant-session";
import { buildSuggestedActionsFromUrgent, computePriorityItems } from "./dashboard-priority";
import type { ActionPayload } from "./action-catalog";

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

export function parseModelToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const pattern = /\[TOOL:(\w+)\s*(\{[^}]*\})?\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const name = match[1];
    let params: Record<string, unknown> = {};
    if (match[2]) {
      try { params = JSON.parse(match[2]); } catch { /* ignore */ }
    }
    calls.push({ name, params });
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
  return `Dostupné nástroje:\n${lines.join("\n")}\n\nPro použití nástroje vlož: [TOOL:nazev {param: "hodnota"}]`;
}

async function buildContextForMessage(
  tenantId: string,
  activeContext?: ActiveContext,
): Promise<string> {
  const sections: string[] = [];

  const dashboard = await buildDashboardContext(tenantId);
  sections.push(dashboard.summaryText);

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

  return sections.join("\n");
}

export async function routeAssistantMessage(
  message: string,
  session: AssistantSession,
  activeContext?: ActiveContext,
): Promise<AssistantResponse> {
  updateSessionContext(session, activeContext);
  incrementMessageCount(session);

  const tenantId = session.tenantId;
  const handlerCtx: ToolHandlerContext = {
    tenantId,
    userId: session.userId,
    roleName: "Advisor",
  };

  const effectiveContext: ActiveContext = {
    clientId: session.activeClientId,
    reviewId: session.activeReviewId,
    paymentContactId: session.activePaymentContactId,
  };

  const context = await buildContextForMessage(tenantId, effectiveContext);
  const toolInstructions = buildToolInstructions();

  const activeContactLine =
    effectiveContext.clientId != null && effectiveContext.clientId !== ""
      ? `Aktivní kontakt v CRM (contactId pro nástroje getClientSummary, createEmailDraft, getPaymentSetupDetail, createTaskDraft): ${effectiveContext.clientId}. Nepiš uživateli, aby ručně zadával UUID — použij toto ID v [TOOL:...].`
      : "Aktivní kontakt z URL není k dispozici — pokud potřebuješ ID kontaktu, zavolej nejdřív [TOOL:searchContacts {\"query\": \"...\"}]. Při více shodách vyber s pomocí hintů nebo nech uživatele vybrat podle e-mailu/města; nikdy nežádej o technické UUID.";

  const system = [
    "Jsi asistent poradce v CRM. Odpovídej stručně a v češtině.",
    "Můžeš navrhovat konkrétní kroky a používat nástroje.",
    activeContactLine,
    toolInstructions,
  ].join("\n\n");

  const fullPrompt = `${system}\n\nKontext:\n${context}\n\nUživatel: ${message}\n\nAsistent:`;

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

      try {
        const toolResult = await tool.handler(tc.params, handlerCtx);
        allWarnings.push(...toolResult.warnings);
        allSources.push(...toolResult.sourceReferences.map((r) => `${r.sourceType}:${r.sourceId}`));

        const formatted = formatToolResultForModel(tc.name, toolResult);
        responseMessage = responseMessage.replace(
          `[TOOL:${tc.name}${tc.params && Object.keys(tc.params).length > 0 ? ` ${JSON.stringify(tc.params)}` : ""}]`,
          formatted,
        );
      } catch {
        responseMessage = responseMessage.replace(
          new RegExp(`\\[TOOL:${tc.name}[^\\]]*\\]`),
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

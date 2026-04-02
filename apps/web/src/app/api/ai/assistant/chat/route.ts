import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getOrCreateSession, lockAssistantClient } from "@/lib/ai/assistant-session";
import {
  routeAssistantMessage,
  routeAssistantMessageCanonical,
  type AssistantResponse,
} from "@/lib/ai/assistant-tool-router";
import {
  appendConversationMessage,
  loadConversationHydration,
  loadResumableExecutionPlanSnapshot,
  upsertConversationFromSession,
} from "@/lib/ai/assistant-conversation-repository";
import { ASSISTANT_CHANNELS, type AssistantChannel, type AssistantMode } from "@/lib/ai/assistant-domain-model";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const USER_ID_HEADER = "x-user-id";

const SSE_CHUNK = 48;

function normalizeChannel(raw: unknown, hasClientContext: boolean): AssistantChannel {
  if (typeof raw === "string" && ASSISTANT_CHANNELS.includes(raw as AssistantChannel)) {
    return raw as AssistantChannel;
  }
  return hasClientContext ? "contact_detail" : "web_drawer";
}

function assistantResponseToSseStream(response: AssistantResponse): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const text = response.message ?? "";

  return new ReadableStream({
    async start(controller) {
      try {
        for (let i = 0; i < text.length; i += SSE_CHUNK) {
          const slice = text.slice(i, i + SSE_CHUNK);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "text", text: slice })}\n\n`),
          );
          await new Promise((r) => setTimeout(r, 0));
        }
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "complete" as const, ...response })}\n\n`,
          ),
        );
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });
}

export async function POST(request: Request) {
  try {
    let userId: string | null = request.headers.get(USER_ID_HEADER);
    if (!userId) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      userId = user.id;
    }
    const membership = await getMembership(userId);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const rate = checkRateLimit(request, "ai-assistant-chat", userId, {
      windowMs: 60_000,
      maxRequests: 20,
    });
    if (!rate.ok) {
      return NextResponse.json(
        { error: "Příliš mnoho požadavků. Zkuste to znovu později." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } },
      );
    }

    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return NextResponse.json({ error: "Chybí zpráva." }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const useStream = searchParams.get("stream") === "1";

    const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
    const activeContext = body.activeContext ?? {};
    const channel = normalizeChannel(body.channel, Boolean(activeContext?.clientId));

    const tenantId = membership.tenantId;
    const session = getOrCreateSession(sessionId, tenantId, userId);
    const hydrated = await loadConversationHydration(session.sessionId, tenantId, userId);
    if (hydrated) {
      if (hydrated.lockedContactId) {
        lockAssistantClient(session, hydrated.lockedContactId);
      }
      if (hydrated.channel) {
        session.activeChannel = hydrated.channel;
        session.contextLock.activeChannel = hydrated.channel;
      }
      if (hydrated.assistantMode) {
        session.assistantMode = hydrated.assistantMode as AssistantMode;
        session.contextLock.assistantMode = session.assistantMode;
      }
    }

    const resumablePlan = await loadResumableExecutionPlanSnapshot(session.sessionId);
    if (resumablePlan) {
      session.lastExecutionPlan = resumablePlan;
    }
    session.activeChannel = channel;
    session.contextLock.activeChannel = channel;

    const orchestration =
      body.orchestration === "canonical" || body.useCanonicalOrchestration === true
        ? "canonical"
        : "legacy";
    const response: AssistantResponse =
      orchestration === "canonical"
        ? await routeAssistantMessageCanonical(message, session, activeContext, {
            roleName: membership.roleName,
          })
        : await routeAssistantMessage(message, session, activeContext, { roleName: membership.roleName });

    const conflictWarnings = [...(response.warnings ?? [])];
    if (
      typeof activeContext?.clientId === "string" &&
      session.lockedClientId &&
      activeContext.clientId !== session.lockedClientId
    ) {
      conflictWarnings.push(
        "Asistent je stále zamčený na původního klienta. Pro bezpečné přepnutí použijte příkaz „přepni klienta\".",
      );
    }
    const plan = session.lastExecutionPlan;
    const pendingSteps = plan?.steps.filter((s) => s.status === "requires_confirmation").length ?? 0;
    const executionState: AssistantResponse["executionState"] = plan
      ? {
          status: plan.status === "draft" ? "draft" : plan.status,
          planId: plan.planId,
          totalSteps: plan.steps.length,
          pendingSteps,
        }
      : null;
    const persistedResponse: AssistantResponse = {
      ...response,
      warnings: [...new Set(conflictWarnings)],
      executionState,
      contextState: {
        channel: session.activeChannel ?? null,
        lockedClientId: session.lockedClientId ?? null,
      },
    };

    await upsertConversationFromSession(session, {
      channel,
      metadata: {
        orchestration,
        messageCount: session.messageCount,
      },
    });
    await appendConversationMessage({
      conversationId: session.sessionId,
      role: "user",
      content: message,
      meta: { channel, activeContext },
    });
    await appendConversationMessage({
      conversationId: session.sessionId,
      role: "assistant",
      content: persistedResponse.message ?? "",
      executionPlanSnapshot: session.lastExecutionPlan ?? null,
      referencedEntities: persistedResponse.referencedEntities ?? [],
      meta: {
        warnings: persistedResponse.warnings ?? [],
        confidence: persistedResponse.confidence,
      },
    });
    await logAudit({
      tenantId,
      userId,
      action: "assistant.conversation_message",
      entityType: "assistant_conversation",
      entityId: session.sessionId,
      meta: {
        channel,
        orchestration,
        messageCount: session.messageCount,
      },
    }).catch(() => {});

    if (useStream) {
      return new Response(assistantResponseToSseStream(persistedResponse), {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    return NextResponse.json(persistedResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Odeslání zprávy selhalo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


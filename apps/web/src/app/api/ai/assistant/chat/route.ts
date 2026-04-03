import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getOrCreateSession, lockAssistantClient } from "@/lib/ai/assistant-session";
import {
  runWithAssistantRunStore,
  getAssistantRunStore,
} from "@/lib/ai/assistant-run-context";
import { AssistantTelemetryAction, logAssistantTelemetry } from "@/lib/ai/assistant-telemetry";
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
import { captureAssistantApiError } from "@/lib/observability/assistant-sentry";

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

function correlationHeaders(traceId: string, assistantRunId: string): Record<string, string> {
  return {
    "x-trace-id": traceId,
    "x-assistant-run-id": assistantRunId,
  };
}

export async function POST(request: Request) {
  const traceId =
    request.headers.get("x-trace-id")?.trim() ||
    request.headers.get("x-request-id")?.trim() ||
    randomUUID();
  const assistantRunId = randomUUID();
  let tenantIdForSentry: string | undefined;

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

    const tenantId = membership.tenantId;
    tenantIdForSentry = tenantId;

    return await runWithAssistantRunStore(
      { traceId, assistantRunId, tenantId, userId },
      async () => {
        try {
          logAssistantTelemetry(AssistantTelemetryAction.RUN_START);

          const body = await request.json().catch(() => ({}));
          const message = typeof body.message === "string" ? body.message.trim() : "";
          if (!message) {
            return NextResponse.json(
              { error: "Chybí zpráva." },
              { status: 400, headers: correlationHeaders(traceId, assistantRunId) },
            );
          }

          const { searchParams } = new URL(request.url);
          const useStream = searchParams.get("stream") === "1";

          const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
          const activeContext = body.activeContext ?? {};
          const channel = normalizeChannel(body.channel, Boolean(activeContext?.clientId));

          const session = getOrCreateSession(sessionId, tenantId, userId);
          const runStore = getAssistantRunStore();
          if (runStore) {
            runStore.sessionId = session.sessionId;
            runStore.channel = channel;
          }

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

          logAssistantTelemetry(AssistantTelemetryAction.HYDRATE_DONE, {
            hadHydrationRow: Boolean(hydrated),
            resumedPlan: Boolean(resumablePlan),
          });

          const orchestration =
            body.orchestration === "canonical" || body.useCanonicalOrchestration === true
              ? "canonical"
              : "legacy";
          if (runStore) {
            runStore.orchestration = orchestration;
          }

          if (orchestration === "canonical") {
            logAssistantTelemetry(AssistantTelemetryAction.ROUTE_CANONICAL);
          } else {
            logAssistantTelemetry(AssistantTelemetryAction.ROUTE_LEGACY);
          }

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
          const fromPlan = plan
            ? {
                status: (plan.status === "draft" ? "draft" : plan.status) as NonNullable<
                  AssistantResponse["executionState"]
                >["status"],
                planId: plan.planId,
                totalSteps: plan.steps.length,
                pendingSteps,
              }
            : null;
          // Merge: router may attach stepPreviews / clientLabel (3H); session plan supplies authoritative counts.
          const rEs = response.executionState;
          type ExecutionStateBody = NonNullable<AssistantResponse["executionState"]>;
          const executionState: AssistantResponse["executionState"] =
            !fromPlan && !rEs
              ? null
              : {
                  ...(rEs ?? {}),
                  ...(fromPlan ?? {}),
                  status: (fromPlan?.status ?? rEs?.status ?? "draft") as ExecutionStateBody["status"],
                };
          const persistedResponse: AssistantResponse = {
            ...response,
            warnings: [...new Set(conflictWarnings)],
            executionState,
            contextState: {
              channel: session.activeChannel ?? null,
              lockedClientId: session.lockedClientId ?? null,
              lockedClientLabel: response.contextState?.lockedClientLabel ?? null,
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
            meta: {
              channel,
              activeContext,
              traceId,
              assistantRunId,
            },
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
              traceId,
              assistantRunId,
            },
          });
          await logAudit({
            tenantId,
            userId,
            action: "assistant.conversation_message",
            entityType: "assistant_conversation",
            entityId: session.sessionId,
            request,
            meta: {
              channel,
              orchestration,
              messageCount: session.messageCount,
              traceId,
              assistantRunId,
            },
          }).catch(() => {});

          const corr = correlationHeaders(traceId, assistantRunId);

          if (useStream) {
            return new Response(assistantResponseToSseStream(persistedResponse), {
              status: 200,
              headers: {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
                ...corr,
              },
            });
          }

          return NextResponse.json(persistedResponse, { headers: corr });
        } catch (innerErr) {
          logAssistantTelemetry(AssistantTelemetryAction.RUN_ERROR, {
            code: "assistant_handler",
            message: innerErr instanceof Error ? innerErr.message : "unknown",
          });
          throw innerErr;
        } finally {
          logAssistantTelemetry(AssistantTelemetryAction.RUN_COMPLETE);
        }
      },
    );
  } catch (err) {
    const runStore = getAssistantRunStore();
    captureAssistantApiError(err, {
      traceId,
      assistantRunId,
      tenantId: tenantIdForSentry,
      channel: runStore?.channel ?? undefined,
      orchestration: runStore?.orchestration ?? undefined,
    });
    const message = err instanceof Error ? err.message : "Odeslání zprávy selhalo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


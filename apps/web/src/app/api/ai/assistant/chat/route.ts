import { randomUUID } from "node:crypto";
import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  getOrCreateSession,
  lockAssistantClient,
  clearAssistantClientLock,
  appendToConversationDigest,
  incrementMessageCount,
} from "@/lib/ai/assistant-session";
import {
  runWithAssistantRunStore,
  getAssistantRunStore,
} from "@/lib/ai/assistant-run-context";
import { AssistantTelemetryAction, logAssistantTelemetry } from "@/lib/ai/assistant-telemetry";
import {
  routeAssistantMessage,
  routeAssistantMessageCanonical,
  handleAssistantAwaitingConfirmation,
  type AssistantResponse,
} from "@/lib/ai/assistant-tool-router";
import {
  appendConversationMessage,
  loadConversationHydration,
  loadRecentConversationMessagesForUser,
  loadResumableExecutionPlanSnapshot,
  upsertConversationFromSession,
} from "@/lib/ai/assistant-conversation-repository";
import { ASSISTANT_CHANNELS, type AssistantChannel, type AssistantMode } from "@/lib/ai/assistant-domain-model";
import { logAudit } from "@/lib/audit";
import { captureAssistantApiError } from "@/lib/observability/assistant-sentry";
import { sanitizeAssistantMessageForAdvisor, sanitizeWarningForAdvisor } from "@/lib/ai/assistant-message-sanitizer";
import { detectPromptInjectionHeuristics } from "@/lib/ai/assistant-prompt-injection-heuristics";
import {
  isImageIntakeEnabled,
  parseImageAssetsFromBodyResult,
  handleImageIntakeFromChatRoute,
} from "@/lib/ai/image-intake";
import {
  hasPendingImageIntakeResolution,
  resumeImageIntakeWithClientResolution,
  INTAKE_RESUME_FALLTHROUGH,
} from "@/lib/ai/image-intake/client-resolution";
import {
  applyPendingImageIntakeFromConversationMetadata,
  PENDING_IMAGE_INTAKE_METADATA_KEY,
} from "@/lib/ai/image-intake/pending-resolution-metadata";
import { buildImageAssetsForUserMessageMeta } from "@/lib/ai/assistant-user-message-images-meta";
import type { ResolvedAssistantContext } from "@/lib/ai/image-intake/types";
import { assertCapability, getSessionEmailForUserId } from "@/lib/billing/plan-access-guards";
import { assertQuotaAvailable } from "@/lib/billing/subscription-usage";
import { nextResponseFromPlanOrQuotaError } from "@/lib/billing/plan-access-http";
import { createResponseStreaming } from "@/lib/openai";

export const dynamic = "force-dynamic";

function classifyAssistantError(message: string): string {
  if (!message) return "unknown";
  const lower = message.toLowerCase();
  if (lower.includes("nesoulad") || lower.includes("forbidden")) return "auth_error";
  if (lower.includes("rate limit") || lower.includes("too many")) return "rate_limit";
  if (lower.includes("timeout") || lower.includes("timed out")) return "timeout";
  if (lower.includes("plán") || lower.includes("plan")) return "plan_error";
  if (lower.includes("session")) return "session_error";
  return "internal_error";
}

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

function encodeAssistantSseEvent(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

const LIVE_GENERAL_CHAT_BLOCKLIST =
  /\b(vytvoř|vytvor|zapiš|zapis|ulož|uloz|najdi|vyhledej|hledej|klient|kontakt|email|e-mail|úkol|ukol|smlouv|review|platb|hypot|obchod|přepni|prepni|schval|zamít|zamit|nahraj|upload)\b/i;

function shouldUseLiveGeneralChatStream(params: {
  useStream: boolean;
  message: string;
  hasActiveContext: boolean;
  hasImages: boolean;
  hasPendingImageIntake: boolean;
  confirmExecution: boolean;
  cancelExecution: boolean;
  bootstrapPostUpload: boolean;
}): boolean {
  const text = params.message.trim();
  return (
    params.useStream &&
    text.length > 0 &&
    text.length <= 700 &&
    !params.hasActiveContext &&
    !params.hasImages &&
    !params.hasPendingImageIntake &&
    !params.confirmExecution &&
    !params.cancelExecution &&
    !params.bootstrapPostUpload &&
    !LIVE_GENERAL_CHAT_BLOCKLIST.test(text)
  );
}

function buildLiveGeneralChatPrompt(params: {
  message: string;
  recentMessages: Array<{ role: string; content: string }>;
}): string {
  const history = params.recentMessages
    .slice(-4)
    .map((row) => `${row.role === "assistant" ? "Asistent" : "Uživatel"}: ${row.content.slice(0, 800)}`)
    .join("\n");
  return [
    "Jsi interní AI asistent v CRM Aidvisora pro finanční poradce.",
    "Odpovídej česky, stručně a prakticky. Výstup je pouze informativní interní podklad pro poradce; nejde o doporučení klientovi.",
    "Nepředstírej zápis do CRM, vyhledání klienta ani práci s dokumenty. Když je potřeba CRM akce nebo konkrétní data, řekni krátce, že má poradce upřesnit kontext nebo použít konkrétní akci v Aidvisoře.",
    history ? `Nedávný kontext konverzace:\n${history}` : "",
    `Uživatel: ${params.message}`,
    "Asistent:",
  ].filter(Boolean).join("\n\n");
}

function correlationHeaders(traceId: string, assistantRunId: string): Record<string, string> {
  return {
    "x-trace-id": traceId,
    "x-assistant-run-id": assistantRunId,
  };
}

function buildResolvedAssistantContext(params: {
  activeContext: Record<string, unknown>;
  session: ReturnType<typeof getOrCreateSession>;
  recentMessages: Array<{ role: "user" | "assistant" | "system"; content: string; meta?: Record<string, unknown> | null }>;
}): ResolvedAssistantContext {
  const lastUserMessage = [...params.recentMessages].reverse().find((m) => m.role === "user");
  const lastAssistantMessage = [...params.recentMessages].reverse().find((m) => m.role === "assistant");
  return {
    activeClientId: typeof params.activeContext?.clientId === "string" ? params.activeContext.clientId : null,
    lockedClientId: params.session.lockedClientId ?? null,
    recentMessages: params.recentMessages
      .slice(-8)
      .filter((m): m is { role: "user" | "assistant"; content: string } => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content })),
    conversationDigest: params.session.conversationDigest ?? null,
    pendingImageIntent: Boolean(params.session.pendingImageIntakeResolution),
    lastUserGoal: lastUserMessage?.content ?? null,
    lastClientReference:
      typeof params.activeContext?.clientId === "string" ? params.activeContext.clientId
      : params.session.lockedClientId ?? null,
    lastImagePreviewSummary: lastAssistantMessage?.content ?? null,
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
    // H13: always derive user from the authenticated session. If a header is
    // present, require it to match; otherwise reject to prevent header-spoof IDOR
    // on paths that might bypass the proxy header overwrite.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const headerUserId = request.headers.get(USER_ID_HEADER)?.trim() || null;
    if (headerUserId && headerUserId !== user.id) {
      captureAssistantApiError(new Error("assistant_user_id_header_mismatch"), {
        traceId,
        assistantRunId,
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId: string = user.id;
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

    const sessionEmail = await getSessionEmailForUserId(userId);
    try {
      await assertCapability({
        tenantId,
        userId,
        email: sessionEmail,
        capability: "ai_assistant_basic",
      });
      await assertQuotaAvailable({
        tenantId,
        userId,
        email: sessionEmail,
        dimension: "assistant_actions",
      });
    } catch (e) {
      const r = nextResponseFromPlanOrQuotaError(e);
      if (r) return r;
      throw e;
    }

    return await runWithAssistantRunStore(
      { traceId, assistantRunId, tenantId, userId },
      async () => {
        try {
          logAssistantTelemetry(AssistantTelemetryAction.RUN_START);

          const body = await request.json().catch(() => ({}));
          const message = typeof body.message === "string" ? body.message.trim() : "";
          const confirmExecution = body.confirmExecution === true;
          const cancelExecution = body.cancelExecution === true;
          const bootstrapPostUpload = body.bootstrapPostUploadReviewPlan === true;
          const selectedStepIdsRaw = body.selectedStepIds;
          const selectedStepIds = Array.isArray(selectedStepIdsRaw)
            ? selectedStepIdsRaw.filter((x: unknown): x is string => typeof x === "string" && x.length > 0)
            : undefined;

          const stepParamOverridesRaw = body.stepParamOverrides;
          const stepParamOverrides: Record<string, Record<string, string>> | undefined =
            stepParamOverridesRaw && typeof stepParamOverridesRaw === "object" && !Array.isArray(stepParamOverridesRaw)
              ? (stepParamOverridesRaw as Record<string, Record<string, string>>)
              : undefined;

          const orchestration =
            body.orchestration === "canonical" || body.useCanonicalOrchestration === true
              ? "canonical"
              : "legacy";

          const hasImageAssets =
            Array.isArray((body as Record<string, unknown>).imageAssets) &&
            ((body as Record<string, unknown>).imageAssets as unknown[]).length > 0;

          if (!message && !confirmExecution && !cancelExecution && !bootstrapPostUpload && !hasImageAssets) {
            return NextResponse.json(
              { error: "Chybí zpráva." },
              { status: 400, headers: correlationHeaders(traceId, assistantRunId) },
            );
          }

          // L9 / B3.4: advisory prompt-injection detection. We do NOT block or
          // edit the message — the advisor may legitimately paste adversarial-
          // looking text for review. Logging is sufficient to spot abuse or
          // accidentally copy-pasted jailbreak fragments in real traffic.
          //
          // B3.4 — použít dedikovaný `PROMPT_INJECTION_DETECTED` event (místo
          // promptInjectionHit meta na RUN_START), ať umí Sentry zapnout
          // samostatný alert a dashboard bez šumu z každého běhu.
          if (message) {
            const injectionHits = detectPromptInjectionHeuristics(message);
            if (injectionHits.length > 0) {
              logAssistantTelemetry(AssistantTelemetryAction.PROMPT_INJECTION_DETECTED, {
                patterns: injectionHits.map((h) => h.pattern),
                messageLength: message.length,
                hitCount: injectionHits.length,
              });
            }
          }

          if ((confirmExecution || cancelExecution) && orchestration !== "canonical") {
            return NextResponse.json(
              { error: "Potvrzení plánu je dostupné jen v kanonickém režimu asistenta." },
              { status: 400, headers: correlationHeaders(traceId, assistantRunId) },
            );
          }

          const { searchParams } = new URL(request.url);
          const useStream = searchParams.get("stream") === "1";

          const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
          const activeContext = body.activeContext ?? {};

          if (bootstrapPostUpload) {
            const rid =
              typeof activeContext?.reviewId === "string" ? activeContext.reviewId.trim() : "";
            if (!rid) {
              return NextResponse.json(
                { error: "Chybí reviewId pro návrh kroků po nahrání smlouvy." },
                { status: 400, headers: correlationHeaders(traceId, assistantRunId) },
              );
            }
            if (orchestration !== "canonical") {
              return NextResponse.json(
                {
                  error:
                    "Návrh kroků po nahrání smlouvy je dostupný jen v kanonickém režimu asistenta.",
                },
                { status: 400, headers: correlationHeaders(traceId, assistantRunId) },
              );
            }
            try {
              await assertCapability({
                tenantId,
                userId,
                email: sessionEmail,
                capability: "ai_review",
              });
            } catch (e) {
              const r = nextResponseFromPlanOrQuotaError(e);
              if (r) return r;
              throw e;
            }
          }

          const channel = normalizeChannel(body.channel, Boolean(activeContext?.clientId));

          const session = getOrCreateSession(sessionId, tenantId, userId);
          const runStore = getAssistantRunStore();
          if (runStore) {
            runStore.sessionId = session.sessionId;
            runStore.channel = channel;
          }

          const [hydrated, recentMessages, resumablePlan] = await Promise.all([
            loadConversationHydration(session.sessionId, tenantId, userId),
            loadRecentConversationMessagesForUser(
              session.sessionId,
              tenantId,
              userId,
              8,
            ),
            loadResumableExecutionPlanSnapshot(session.sessionId),
          ]);
          const incomingClientId = typeof activeContext?.clientId === "string" ? activeContext.clientId : undefined;
          if (hydrated) {
            const hydratedClientMismatch =
              hydrated.lockedContactId &&
              incomingClientId &&
              hydrated.lockedContactId !== incomingClientId;

            if (hydratedClientMismatch) {
              clearAssistantClientLock(session);
              session.lastExecutionPlan = undefined;
            } else if (hydrated.lockedContactId) {
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
            // Cross-request / serverless: restore pending image intake ambiguity from DB metadata.
            applyPendingImageIntakeFromConversationMetadata(session, hydrated.metadata);
          }

          if (resumablePlan && !session.lastExecutionPlan) {
            session.lastExecutionPlan = resumablePlan;
          }
          session.activeChannel = channel;
          session.contextLock.activeChannel = channel;
          const resolvedAssistantContext = buildResolvedAssistantContext({
            activeContext,
            session,
            recentMessages,
          });
          const resolvedContextBlock = [
            resolvedAssistantContext.activeClientId ? `Aktivní klient v UI: ${resolvedAssistantContext.activeClientId}` : "",
            resolvedAssistantContext.lockedClientId ? `Zamčený klient v session: ${resolvedAssistantContext.lockedClientId}` : "",
            resolvedAssistantContext.pendingImageIntent ? "Čeká nedořešený image-intake kontext." : "",
            resolvedAssistantContext.lastImagePreviewSummary ? `Poslední odpověď asistenta: ${resolvedAssistantContext.lastImagePreviewSummary.slice(0, 220)}` : "",
          ].filter(Boolean).join("\n");

          logAssistantTelemetry(AssistantTelemetryAction.HYDRATE_DONE, {
            hadHydrationRow: Boolean(hydrated),
            resumedPlan: Boolean(resumablePlan),
          });

          if (runStore) {
            runStore.orchestration = orchestration;
          }

          if (orchestration === "canonical") {
            logAssistantTelemetry(AssistantTelemetryAction.ROUTE_CANONICAL);
            try {
              await assertCapability({
                tenantId,
                userId,
                email: sessionEmail,
                capability: "ai_assistant_multi_step",
              });
            } catch (e) {
              const r = nextResponseFromPlanOrQuotaError(e);
              if (r) return r;
              throw e;
            }
          } else {
            logAssistantTelemetry(AssistantTelemetryAction.ROUTE_LEGACY);
          }

          // --- Image Intake lane detection ---
          // Cheap-first: parse assets from body before any model call.
          // Text-only requests are completely unaffected (imageAssets absent → 0 assets).
          const { assets: rawImageAssets, truncated: imageAssetsTruncated } = parseImageAssetsFromBodyResult(body);
          const imageIntakeEnvOn = isImageIntakeEnabled();
          const isImageRequest = rawImageAssets.length > 0 && imageIntakeEnvOn;

          if (isImageRequest) {
            try {
              await assertCapability({
                tenantId,
                userId,
                email: sessionEmail,
                capability: "ai_assistant_image_intake",
              });
              await assertQuotaAvailable({
                tenantId,
                userId,
                email: sessionEmail,
                dimension: "image_intake",
              });
            } catch (e) {
              const r = nextResponseFromPlanOrQuotaError(e);
              if (r) return r;
              throw e;
            }
          }

          const debugImageIntakeResume = process.env.DEBUG_IMAGE_INTAKE_RESUME === "true";
          const pendingAfterHydrate = Boolean(session.pendingImageIntakeResolution);
          const pendingEffective = hasPendingImageIntakeResolution(session);

          if (shouldUseLiveGeneralChatStream({
            useStream,
            message,
            hasActiveContext: Boolean(activeContext?.clientId || activeContext?.reviewId || activeContext?.paymentContactId),
            hasImages: rawImageAssets.length > 0,
            hasPendingImageIntake: pendingEffective,
            confirmExecution,
            cancelExecution,
            bootstrapPostUpload,
          })) {
            incrementMessageCount(session);
            const corr = correlationHeaders(traceId, assistantRunId);
            const recentForPrompt = recentMessages.map((row) => ({
              role: row.role,
              content: row.content,
            }));

            return new Response(
              new ReadableStream<Uint8Array>({
                async start(controller) {
                  try {
                    const fullPrompt = buildLiveGeneralChatPrompt({
                      message,
                      recentMessages: recentForPrompt,
                    });
                    const streamedText = await createResponseStreaming(fullPrompt, {
                      routing: { category: "advisor_chat_fast", maxOutputTokens: 450 },
                      onTextDelta: (delta) => {
                        controller.enqueue(encodeAssistantSseEvent({ type: "text", text: delta }));
                      },
                    });
                    const persistedResponse: AssistantResponse = {
                      message: sanitizeAssistantMessageForAdvisor(streamedText),
                      referencedEntities: [],
                      suggestedActions: [],
                      warnings: [],
                      confidence: 0.75,
                      sourcesSummary: [],
                      sessionId: session.sessionId,
                      contextState: {
                        channel: session.activeChannel ?? null,
                        lockedClientId: session.lockedClientId ?? null,
                        lockedClientLabel: null,
                      },
                    };

                    after(async () => {
                      try {
                        await upsertConversationFromSession(session, {
                          channel,
                          metadata: {
                            orchestration,
                            messageCount: session.messageCount,
                            liveGeneralChatStream: true,
                            [PENDING_IMAGE_INTAKE_METADATA_KEY]: session.pendingImageIntakeResolution ?? null,
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
                          executionPlanSnapshot: null,
                          referencedEntities: [],
                          meta: {
                            warnings: [],
                            confidence: persistedResponse.confidence,
                            traceId,
                            assistantRunId,
                            liveGeneralChatStream: true,
                          },
                        });
                        if (orchestration === "canonical") {
                          appendToConversationDigest(session, message);
                        }
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
                            liveGeneralChatStream: true,
                          },
                        });
                      } catch (persistErr) {
                        console.error(
                          "[assistant-chat] live stream persistence failed",
                          { traceId, assistantRunId, tenantId, userId, sessionId: session.sessionId },
                          persistErr,
                        );
                        captureAssistantApiError(persistErr, {
                          traceId,
                          assistantRunId,
                          tenantId,
                          channel,
                          orchestration,
                        });
                      }
                    });

                    controller.enqueue(encodeAssistantSseEvent({
                      type: "complete",
                      ...persistedResponse,
                    }));
                    controller.close();
                  } catch (streamErr) {
                    logAssistantTelemetry(AssistantTelemetryAction.RUN_ERROR, {
                      code: "assistant_live_stream",
                      message: streamErr instanceof Error ? streamErr.message : "unknown",
                    });
                    controller.enqueue(encodeAssistantSseEvent({
                      type: "error",
                      error: "Odpověď asistenta se nepodařilo dokončit.",
                    }));
                    controller.close();
                  } finally {
                    logAssistantTelemetry(AssistantTelemetryAction.RUN_COMPLETE);
                  }
                },
              }),
              {
                status: 200,
                headers: {
                  "Content-Type": "text/event-stream; charset=utf-8",
                  "Cache-Control": "no-cache, no-transform",
                  Connection: "keep-alive",
                  ...corr,
                },
              },
            );
          }

          if (process.env.DEBUG_ASSISTANT_IMAGE_PASTE === "true") {
            console.info("[assistant-image-pipeline][api:lane]", {
              traceId,
              parsedImageAssetCount: rawImageAssets.length,
              imageIntakeEnabled: imageIntakeEnvOn,
              entersImageIntakeLane: isImageRequest,
              skipReason:
                rawImageAssets.length === 0
                  ? "no_assets_in_body"
                  : !imageIntakeEnvOn
                    ? "IMAGE_INTAKE_ENABLED_not_true"
                    : null,
            });
          }

          let response: AssistantResponse;

          // Pending client clarification must run before image intake so accompanying text + image
          // does not re-run the full pipeline and replay the same ambiguity block.
          if (
            !confirmExecution &&
            !cancelExecution &&
            !bootstrapPostUpload &&
            message &&
            pendingEffective
          ) {
            if (debugImageIntakeResume) {
              console.info("[assistant-image-pipeline][api:resume_branch]", {
                traceId,
                hadPendingRawAfterHydrate: pendingAfterHydrate,
                messageLen: message.length,
                isImageRequest,
                fallthroughIfNotNameLike: true,
              });
            }
            const resumeResult = await resumeImageIntakeWithClientResolution(
              message,
              session,
              tenantId,
            );
            if (resumeResult.message === INTAKE_RESUME_FALLTHROUGH) {
              if (debugImageIntakeResume) {
                console.info("[assistant-image-pipeline][api:resume_fallthrough]", {
                  traceId,
                  reason: "message_not_client_name_like",
                  next: isImageRequest ? "image_intake_lane" : "generic_text",
                });
              }
              if (isImageRequest && !confirmExecution && !cancelExecution) {
                response = await handleImageIntakeFromChatRoute(
                  rawImageAssets,
                  session,
                  activeContext,
                  {
                    tenantId,
                    userId,
                    channel,
                    accompanyingText: message || null,
                    assetsTruncated: imageAssetsTruncated,
                    resolvedContext: resolvedAssistantContext,
                  },
                );
              } else {
                response =
                  orchestration === "canonical"
                    ? await routeAssistantMessageCanonical(message, session, activeContext, {
                        roleName: membership.roleName,
                        bootstrapPostUploadReviewPlan: bootstrapPostUpload,
                        intentPromptAugment: session.conversationDigest?.trim()
                          ? `[Předchozí zkrácené dotazy ve vlákně]\n${session.conversationDigest}`
                          : undefined,
                        recentMessages: recentMessages.map((row) => ({
                          role: row.role,
                          content: row.content,
                        })),
                        resolvedContextBlock,
                        imageAssets: rawImageAssets.map((asset) => ({
                          url: asset.url ?? "",
                          mimeType: asset.mimeType,
                          filename: asset.filename,
                          sizeBytes: asset.sizeBytes,
                        })).filter((asset) => asset.url),
                      })
                    : await routeAssistantMessage(message, session, activeContext, {
                        roleName: membership.roleName,
                        recentMessages: recentMessages.map((row) => ({
                          role: row.role,
                          content: row.content,
                        })),
                        imageAssets: rawImageAssets.map((asset) => ({
                          url: asset.url ?? "",
                          mimeType: asset.mimeType,
                          filename: asset.filename,
                          sizeBytes: asset.sizeBytes,
                        })).filter((asset) => asset.url),
                      });
              }
            } else {
              response = resumeResult;
            }
          } else if (isImageRequest && !confirmExecution && !cancelExecution) {
            if (debugImageIntakeResume) {
              console.info("[assistant-image-pipeline][api:image_lane]", {
                traceId,
                pendingEffective,
                skipResumeBecause: !message
                  ? "empty_message"
                  : !pendingEffective
                    ? "no_pending"
                    : confirmExecution || cancelExecution
                      ? "confirm_cancel"
                      : bootstrapPostUpload
                        ? "bootstrap_post_upload"
                        : "unknown",
              });
            }
            // Route to image intake lane (feature-flagged).
            // Starting a new image intake always clears any pending client resolution state
            // (handled inside route-handler when the new result is not client-ambiguous).
            response = await handleImageIntakeFromChatRoute(
              rawImageAssets,
              session,
              activeContext,
              {
                tenantId,
                userId,
                channel,
                accompanyingText: message || null,
                assetsTruncated: imageAssetsTruncated,
                resolvedContext: resolvedAssistantContext,
              },
            );
          } else if (orchestration === "canonical" && (confirmExecution || cancelExecution)) {
            // L10: propagate client IP from forwarded headers so the audit row
            // for each confirmed plan step records who fired it from where.
            const xff = request.headers.get("x-forwarded-for") ?? "";
            const clientIp = xff.split(",")[0]?.trim() || undefined;
            const confirmOut = await handleAssistantAwaitingConfirmation(
              session,
              {
                cancel: cancelExecution,
                selectedStepIds: confirmExecution ? selectedStepIds : undefined,
                stepParamOverrides: confirmExecution ? stepParamOverrides : undefined,
              },
              { tenantId, userId, roleName: membership.roleName, ipAddress: clientIp },
            );
            if (!confirmOut) {
              return NextResponse.json(
                { error: "Není aktivní plán čekající na potvrzení." },
                { status: 400, headers: correlationHeaders(traceId, assistantRunId) },
              );
            }
            response = confirmOut;
          } else {
            if (debugImageIntakeResume) {
              console.info("[assistant-image-pipeline][api:generic_text]", {
                traceId,
                pendingEffective,
                messageLen: message.length,
              });
            }
            response =
              orchestration === "canonical"
                ? await routeAssistantMessageCanonical(message, session, activeContext, {
                    roleName: membership.roleName,
                    bootstrapPostUploadReviewPlan: bootstrapPostUpload,
                    intentPromptAugment: session.conversationDigest?.trim()
                      ? `[Předchozí zkrácené dotazy ve vlákně]\n${session.conversationDigest}`
                      : undefined,
                    recentMessages: recentMessages.map((row) => ({
                      role: row.role,
                      content: row.content,
                    })),
                    resolvedContextBlock,
                    imageAssets: rawImageAssets.map((asset) => ({
                      url: asset.url ?? "",
                      mimeType: asset.mimeType,
                      filename: asset.filename,
                      sizeBytes: asset.sizeBytes,
                    })).filter((asset) => asset.url),
                  })
                : await routeAssistantMessage(message, session, activeContext, {
                    roleName: membership.roleName,
                    recentMessages: recentMessages.map((row) => ({
                      role: row.role,
                      content: row.content,
                    })),
                    imageAssets: rawImageAssets.map((asset) => ({
                      url: asset.url ?? "",
                      mimeType: asset.mimeType,
                      filename: asset.filename,
                      sizeBytes: asset.sizeBytes,
                    })).filter((asset) => asset.url),
                  });
          }

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
            message: sanitizeAssistantMessageForAdvisor(response.message ?? ""),
            warnings: [...new Set(conflictWarnings)].map(sanitizeWarningForAdvisor).filter(Boolean),
            executionState,
            contextState: {
              channel: session.activeChannel ?? null,
              lockedClientId: session.lockedClientId ?? null,
              lockedClientLabel: response.contextState?.lockedClientLabel ?? null,
            },
          };

          const corr = correlationHeaders(traceId, assistantRunId);

          // DB writes and audit happen after the response is sent — client gets the answer immediately.
          after(async () => {
            try {
              const persistedUserImages = buildImageAssetsForUserMessageMeta(rawImageAssets);
              await upsertConversationFromSession(session, {
                channel,
                metadata: {
                  orchestration,
                  messageCount: session.messageCount,
                  [PENDING_IMAGE_INTAKE_METADATA_KEY]: session.pendingImageIntakeResolution ?? null,
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
                  ...(persistedUserImages.imageAssets.length > 0
                    ? { imageAssets: persistedUserImages.imageAssets }
                    : {}),
                  ...(persistedUserImages.chatImagesTruncatedForStorage
                    ? { chatImagesTruncatedForStorage: true }
                    : {}),
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
                  stepOutcomes: persistedResponse.stepOutcomes ?? null,
                  suggestedNextSteps: persistedResponse.suggestedNextSteps ?? null,
                  suggestedNextStepItems: persistedResponse.suggestedNextStepItems ?? null,
                  suggestedActions: persistedResponse.suggestedActions ?? null,
                  hasPartialFailure: persistedResponse.hasPartialFailure ?? null,
                  traceId,
                  assistantRunId,
                },
              });
              if (orchestration === "canonical") {
                appendToConversationDigest(session, message);
              }
              try {
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
                });
              } catch (auditErr) {
                // C4: surface audit failures to Sentry + log, never swallow silently.
                console.error(
                  "[assistant-chat] logAudit failed",
                  { traceId, assistantRunId, tenantId, userId },
                  auditErr,
                );
                logAssistantTelemetry(AssistantTelemetryAction.RUN_ERROR, {
                  code: "assistant_audit_write_failed",
                  message: auditErr instanceof Error ? auditErr.message : "unknown",
                });
                captureAssistantApiError(auditErr, {
                  traceId,
                  assistantRunId,
                  tenantId,
                  channel,
                  orchestration,
                });
              }
            } catch (persistErr) {
              // C4/M28: persistence failure must not affect the client response, but
              // must be observable: emit Sentry capture, telemetry and a console error.
              console.error(
                "[assistant-chat] after() persistence failed",
                { traceId, assistantRunId, tenantId, userId, sessionId: session.sessionId },
                persistErr,
              );
              logAssistantTelemetry(AssistantTelemetryAction.RUN_ERROR, {
                code: "assistant_persistence_failed",
                message: persistErr instanceof Error ? persistErr.message : "unknown",
              });
              captureAssistantApiError(persistErr, {
                traceId,
                assistantRunId,
                tenantId,
                channel,
                orchestration,
              });
            }
          });

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
    const rawMessage = err instanceof Error ? err.message : "";
    const errorCode = classifyAssistantError(rawMessage);
    console.error("[assistant-chat] Unhandled error:", rawMessage);
    const safeMessage =
      errorCode === "rate_limit"
        ? "Příliš mnoho požadavků. Zkuste to znovu později."
        : errorCode === "timeout"
          ? "Požadavek trval příliš dlouho. Zkuste to znovu."
          : "Interní chyba asistenta. Zkuste to prosím znovu.";
    return NextResponse.json({ error: safeMessage, errorCode }, { status: 500 });
  }
}


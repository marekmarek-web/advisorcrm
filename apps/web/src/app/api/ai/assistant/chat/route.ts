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
          const confirmExecution = body.confirmExecution === true;
          const cancelExecution = body.cancelExecution === true;
          const bootstrapPostUpload = body.bootstrapPostUploadReviewPlan === true;
          const selectedStepIdsRaw = body.selectedStepIds;
          const selectedStepIds = Array.isArray(selectedStepIdsRaw)
            ? selectedStepIdsRaw.filter((x: unknown): x is string => typeof x === "string" && x.length > 0)
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
          }

          const channel = normalizeChannel(body.channel, Boolean(activeContext?.clientId));

          const session = getOrCreateSession(sessionId, tenantId, userId);
          const runStore = getAssistantRunStore();
          if (runStore) {
            runStore.sessionId = session.sessionId;
            runStore.channel = channel;
          }

          const hydrated = await loadConversationHydration(session.sessionId, tenantId, userId);
          const recentMessages = await loadRecentConversationMessagesForUser(
            session.sessionId,
            tenantId,
            userId,
            8,
          );
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

          const resumablePlan = await loadResumableExecutionPlanSnapshot(session.sessionId);
          if (resumablePlan && !session.lastExecutionPlan) {
            session.lastExecutionPlan = resumablePlan;
          }
          session.activeChannel = channel;
          session.contextLock.activeChannel = channel;

          logAssistantTelemetry(AssistantTelemetryAction.HYDRATE_DONE, {
            hadHydrationRow: Boolean(hydrated),
            resumedPlan: Boolean(resumablePlan),
          });

          if (runStore) {
            runStore.orchestration = orchestration;
          }

          if (orchestration === "canonical") {
            logAssistantTelemetry(AssistantTelemetryAction.ROUTE_CANONICAL);
          } else {
            logAssistantTelemetry(AssistantTelemetryAction.ROUTE_LEGACY);
          }

          // --- Image Intake lane detection ---
          // Cheap-first: parse assets from body before any model call.
          // Text-only requests are completely unaffected (imageAssets absent → 0 assets).
          const { assets: rawImageAssets, truncated: imageAssetsTruncated } = parseImageAssetsFromBodyResult(body);
          const imageIntakeEnvOn = isImageIntakeEnabled();
          const isImageRequest = rawImageAssets.length > 0 && imageIntakeEnvOn;

          const debugImageIntakeResume = process.env.DEBUG_IMAGE_INTAKE_RESUME === "true";
          const pendingAfterHydrate = Boolean(session.pendingImageIntakeResolution);
          const pendingEffective = hasPendingImageIntakeResolution(session);

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
              },
            );
          } else if (orchestration === "canonical" && (confirmExecution || cancelExecution)) {
            const confirmOut = await handleAssistantAwaitingConfirmation(
              session,
              {
                cancel: cancelExecution,
                selectedStepIds: confirmExecution ? selectedStepIds : undefined,
              },
              { tenantId, userId, roleName: membership.roleName },
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
                },
              }).catch(() => {});
            } catch {
              // Persistence failure must not affect the client response.
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


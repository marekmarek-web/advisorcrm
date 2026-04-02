import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getOrCreateSession } from "@/lib/ai/assistant-session";
import {
  routeAssistantMessage,
  routeAssistantMessageCanonical,
  type AssistantResponse,
} from "@/lib/ai/assistant-tool-router";

export const dynamic = "force-dynamic";

const USER_ID_HEADER = "x-user-id";

const SSE_CHUNK = 48;

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

    const tenantId = membership.tenantId;
    const session = getOrCreateSession(sessionId, tenantId, userId);

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

    if (useStream) {
      return new Response(assistantResponseToSseStream(response), {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Odeslání zprávy selhalo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


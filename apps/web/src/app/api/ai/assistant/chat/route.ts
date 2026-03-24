import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getOrCreateSession } from "@/lib/ai/assistant-session";
import { routeAssistantMessage, type AssistantResponse } from "@/lib/ai/assistant-tool-router";

export const dynamic = "force-dynamic";

const USER_ID_HEADER = "x-user-id";

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

    const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
    const activeContext = body.activeContext ?? {};

    const tenantId = membership.tenantId;
    const session = getOrCreateSession(sessionId, tenantId, userId);

    const response: AssistantResponse = await routeAssistantMessage(
      message,
      session,
      activeContext,
    );

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Odeslání zprávy selhalo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

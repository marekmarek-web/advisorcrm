import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership, hasPermission, type RoleName } from "@/lib/auth/get-membership";
import { createResponseSafe } from "@/lib/openai";
import { logOpenAICall } from "@/lib/openai";
import { buildAssistantContext } from "@/lib/ai/assistant-context";
import {
  computePriorityItems,
  buildSuggestedActionsFromUrgent,
} from "@/lib/ai/dashboard-priority";
import { checkRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const USER_ID_HEADER = "x-user-id";

function maskForLog(s: string, maxLen: number): string {
  const t = s.trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen) + "...";
}

export async function POST(request: Request) {
  const start = Date.now();
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
    if (!membership || !hasPermission(membership.roleName as RoleName, "documents:read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const rate = checkRateLimit(request, "ai-assistant-chat", userId, {
      windowMs: 60_000,
      maxRequests: 20,
    });
    if (!rate.ok) {
      return NextResponse.json(
        { error: "Příliš mnoho požadavků. Zkuste to znovu později." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return NextResponse.json({ error: "Chybí zpráva." }, { status: 400 });
    }

    const tenantId = membership.tenantId;
    const context = await buildAssistantContext(tenantId);

    const system =
      "Jsi asistent poradce v CRM. Odpovídej stručně a v češtině. Můžeš navrhovat konkrétní kroky (otevřít review smlouvy, úkoly, klienty, návrh e-mailu). Nepiš dlouhé odstavce.";
    const fullPrompt = `${system}\n\nKontext:\n${context}\n\nUživatel: ${message}\n\nAsistent:`;

    const result = await createResponseSafe(fullPrompt);

    if (result.ok) {
      const text = result.text.trim();
      const suggestedActions: Array<{ type: string; label: string; payload: Record<string, unknown> }> = [];
      const refMatches = text.match(/\[(review|task|client):([a-f0-9-]+)\]/gi);
      const referencedEntities = refMatches
        ? refMatches.map((r) => {
            const m = r.match(/\[(review|task|client):([a-f0-9-]+)\]/i);
            return m ? { type: m[1], id: m[2] } : null;
          }).filter((x): x is { type: string; id: string } => x != null)
        : [];

      logOpenAICall({
        endpoint: "assistant/chat",
        model: "—",
        latencyMs: Date.now() - start,
        success: true,
      });

      return NextResponse.json({
        message: text.slice(0, 2000),
        referencedEntities,
        suggestedActions,
        warnings: [],
      });
    }

    const urgentItems = await computePriorityItems(tenantId);
    const fallbackActions = buildSuggestedActionsFromUrgent(urgentItems);
    const failError = (result as { error?: string }).error ?? "";
    logOpenAICall({
      endpoint: "assistant/chat",
      model: "—",
      latencyMs: Date.now() - start,
      success: false,
      error: maskForLog(failError, 80),
    });

    const errLower = failError.toLowerCase();
    const keyMissing =
      errLower.includes("openai_api_key") ||
      errLower.includes("openai key") ||
      errLower.includes("api key");

    return NextResponse.json({
      message: "Odpověď není k dispozici. Zkuste to později nebo vyberte akci níže.",
      referencedEntities: [],
      suggestedActions: fallbackActions,
      warnings: keyMissing
        ? [
            "Na serveru chybí nebo je neplatný OPENAI_API_KEY (Vercel → Environment Variables → Production → Redeploy).",
          ]
        : ["Služba AI dočasně nedostupná."],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Odeslání zprávy selhalo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

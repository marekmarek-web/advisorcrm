import { NextResponse } from "next/server";
import { requireAuthInAction } from "@/lib/auth/require-auth";
import { createResponseSafe, logOpenAICall } from "@/lib/openai";
import { getClientRequests } from "@/app/actions/client-portal-requests";
import { getPortalNotificationsForClient } from "@/app/actions/portal-notifications";
import { getUnreadAdvisorMessagesForClientCount } from "@/app/actions/messages";
import { getDocumentsForClient } from "@/app/actions/documents";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { CLIENT_PORTAL_AI_SYSTEM_PROMPT_CS } from "@/lib/ai/compliance-prompt-suffix";
import { createClient } from "@/lib/supabase/server";
import { assertCapability } from "@/lib/billing/plan-access-guards";
import { assertQuotaAvailable } from "@/lib/billing/subscription-usage";
import { nextResponseFromPlanOrQuotaError } from "@/lib/billing/plan-access-http";

export const dynamic = "force-dynamic";

function buildClientContextSummary(params: {
  requestsCount: number;
  unreadMessages: number;
  unreadNotifications: number;
  documentCount: number;
}) {
  return [
    `Požadavky: ${params.requestsCount}`,
    `Nepřečtené zprávy od poradce: ${params.unreadMessages}`,
    `Nepřečtené notifikace: ${params.unreadNotifications}`,
    `Dokumenty: ${params.documentCount}`,
  ].join("\n");
}

export async function POST(request: Request) {
  const start = Date.now();
  try {
    if (process.env.NEXT_PUBLIC_DISABLE_CLIENT_PORTAL_AI === "true") {
      return NextResponse.json({ error: "Tato funkce je vypnutá." }, { status: 403 });
    }
    const auth = await requireAuthInAction();
    if (auth.roleName !== "Client" || !auth.contactId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const email = user?.id === auth.userId ? user.email ?? null : null;
    try {
      await assertCapability({
        tenantId: auth.tenantId,
        userId: auth.userId,
        email,
        capability: "ai_assistant_basic",
      });
      await assertCapability({
        tenantId: auth.tenantId,
        userId: auth.userId,
        email,
        capability: "client_portal_documents",
      });
      await assertQuotaAvailable({
        tenantId: auth.tenantId,
        userId: auth.userId,
        email,
        dimension: "assistant_actions",
      });
    } catch (e) {
      const r = nextResponseFromPlanOrQuotaError(e);
      if (r) return r;
      throw e;
    }

    const rate = checkRateLimit(request, "ai-client-assistant-chat", auth.userId, {
      windowMs: 60_000,
      maxRequests: 10,
    });
    if (!rate.ok) {
      return NextResponse.json(
        { error: "Příliš mnoho požadavků. Zkuste to znovu za chvíli." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return NextResponse.json({ error: "Chybí zpráva." }, { status: 400 });
    }

    const [requests, notifications, unreadMessages, documents] = await Promise.all([
      getClientRequests().catch(() => []),
      getPortalNotificationsForClient().catch(() => []),
      getUnreadAdvisorMessagesForClientCount().catch(() => 0),
      getDocumentsForClient(auth.contactId).catch(() => []),
    ]);

    const context = buildClientContextSummary({
      requestsCount: requests.length,
      unreadMessages,
      unreadNotifications: notifications.filter((n) => !n.readAt).length,
      documentCount: documents.length,
    });

    const fullPrompt = `${CLIENT_PORTAL_AI_SYSTEM_PROMPT_CS}\n\nStav v portálu (jen počty, bez rad):\n${context}\n\nDotaz uživatele: ${message}\n\nOdpověď (pouze nápověda k aplikaci, bez finančního poradenství):`;
    const ai = await createResponseSafe(fullPrompt);

    if (!ai.ok) {
      logOpenAICall({
        endpoint: "client-assistant/chat",
        model: "—",
        latencyMs: Date.now() - start,
        success: false,
        error: ai.error,
      });
      return NextResponse.json({
        message: "Teď se nepodařilo připravit AI odpověď. Zkuste to prosím znovu.",
        suggestions: [
          { id: "openMessages", label: "Napsat poradci", href: "/client/messages" },
          { id: "openRequests", label: "Vytvořit požadavek", href: "/client/requests" },
          { id: "openDocuments", label: "Nahrát dokument", href: "/client/documents" },
        ],
        warnings: ["AI služba je dočasně nedostupná."],
      });
    }

    const baseSuggestions = [
      { id: "openMessages", label: "Napsat poradci", href: "/client/messages" },
      { id: "openRequests", label: "Vytvořit požadavek", href: "/client/requests" },
      { id: "openDocuments", label: "Nahrát dokument", href: "/client/documents" },
    ];

    logOpenAICall({
      endpoint: "client-assistant/chat",
      model: "—",
      latencyMs: Date.now() - start,
      success: true,
    });

    return NextResponse.json({
      message: ai.text.slice(0, 2000),
      suggestions: baseSuggestions,
      warnings: [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI požadavek selhal.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

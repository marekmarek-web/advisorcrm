import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createResponseSafe } from "@/lib/openai";
import { getClientDetails } from "@/lib/ai/assistant-actions";

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

    const limiter = checkRateLimit(request, "ai-draft-email", `${membership.tenantId}:${userId}`, { windowMs: 60_000, maxRequests: 15 });
    if (!limiter.ok) {
      return NextResponse.json({ error: "Too many requests. Please retry later." }, { status: 429, headers: { "Retry-After": String(limiter.retryAfterSec) } });
    }

    const body = await request.json().catch(() => ({}));
    const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    const contextType = (body.context as string) || "follow_up";

    if (!clientId) {
      return NextResponse.json({ error: "Chybí clientId." }, { status: 400 });
    }

    const client = await getClientDetails(clientId, membership.tenantId);
    if (!client.ok) {
      return NextResponse.json({ error: client.error }, { status: 404 });
    }

    let prompt: string;
    if (contextType === "post_meeting") {
      const meetingSummary = typeof body.meetingSummary === "string" ? body.meetingSummary.slice(0, 800) : "";
      const keyPoints = Array.isArray(body.keyPoints) ? body.keyPoints.join(", ") : (typeof body.keyPoints === "string" ? body.keyPoints : "");
      const agreedItems = Array.isArray(body.agreedItems) ? body.agreedItems.join(", ") : (typeof body.agreedItems === "string" ? body.agreedItems : "");
      const contextParts = [meetingSummary, keyPoints && `Klíčové body: ${keyPoints}`, agreedItems && `Domluveno: ${agreedItems}`].filter(Boolean);
      prompt = `Napiš krátký profesionální e-mail klientovi ${client.name} po schůzce. Kontext schůzky: ${contextParts.join(". ") || "obecná schůzka"}. E-mail má obsahovat: poděkování za schůzku, krátké shrnutí toho co se řešilo, další krok (co pošle poradce, co čeká od klienta), návrh dalšího kontaktu nebo termínu. 2–4 odstavce. Bez oslovení na konci, jen tělo. Česky.`;
    } else {
      prompt =
        contextType === "reminder"
          ? `Napiš krátký e-mail (2–3 věty) klientovi ${client.name} jako připomenutí. Bez oslovení na konci, jen tělo. Česky.`
          : contextType === "missing_data"
            ? `Napiš krátký e-mail klientovi ${client.name} s žádostí o doplnění údajů. 2–3 věty. Česky.`
            : `Napiš krátký follow-up e-mail klientovi ${client.name}. Přátelský tón, 2–3 věty. Česky.`;
    }

    const result = await createResponseSafe(prompt);
    if (!result.ok) {
      return NextResponse.json({
        fallback: true,
        subject: contextType === "post_meeting" ? `Shrnutí schůzky – ${client.name}` : `Follow-up – ${client.name}`,
        body: `Dobrý den,\n\nDěkujeme za spolupráci.\n\nS pozdravem`,
      });
    }

    const bodyText = result.text.trim().slice(0, 1500);
    const subject =
      contextType === "reminder"
        ? `Připomenutí – ${client.name}`
        : contextType === "missing_data"
          ? `Doplnění údajů – ${client.name}`
          : contextType === "post_meeting"
            ? `Shrnutí schůzky – ${client.name}`
            : `Follow-up – ${client.name}`;

    let draftId: string | null = null;
    if (body.persist === true) {
      try {
        const { db, communicationDrafts } = await import("db");
        const [row] = await db
          .insert(communicationDrafts)
          .values({
            tenantId: membership.tenantId,
            createdBy: userId,
            contactId: clientId,
            draftType: contextType === "post_meeting" ? "followup_after_review" : contextType === "missing_data" ? "request_missing_data_email" : "client_reminder_email",
            subject,
            body: bodyText,
          })
          .returning();
        draftId = row.id;
      } catch { /* persist is best-effort */ }
    }

    return NextResponse.json({ subject, body: bodyText, draftId });
  } catch {
    return NextResponse.json(
      { error: "Generování návrhu selhalo." },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { hasPermission, type RoleName } from "@/lib/auth/permissions";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createResponseSafe } from "@/lib/openai";
import { logOpenAICall } from "@/lib/openai";
import { ADVISOR_AI_INTERNAL_SCOPE_CS } from "@/lib/ai/compliance-prompt-suffix";

export const dynamic = "force-dynamic";

const USER_ID_HEADER = "x-user-id";

export async function POST(request: Request) {
  const start = Date.now();
  try {
    let userId: string | null = request.headers.get(USER_ID_HEADER);
    if (!userId) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: "Nejste přihlášeni." }, { status: 401 });
      userId = user.id;
    }

    const membership = await getMembership(userId);
    if (!membership || !hasPermission(membership.roleName as RoleName, "opportunities:read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const limiter = checkRateLimit(
      request,
      "ai-client-request-brief",
      `${membership.tenantId}:${userId}`,
      { windowMs: 60_000, maxRequests: 12 }
    );
    if (!limiter.ok) {
      return NextResponse.json(
        { error: "Příliš mnoho požadavků. Zkuste to za chvíli znovu." },
        { status: 429, headers: { "Retry-After": String(limiter.retryAfterSec) } }
      );
    }

    const body = (await request.json()) as {
      subject?: string;
      caseTypeLabel?: string;
      bodyText?: string | null;
    };
    const subject = body.subject?.trim() ?? "";
    const caseTypeLabel = body.caseTypeLabel?.trim() ?? "";
    const detail = body.bodyText?.trim() ?? "";

    if (!subject && !detail) {
      return NextResponse.json({ error: "Chybí text požadavku." }, { status: 400 });
    }

    const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim());
    if (!hasKey) {
      return NextResponse.json({
        brief: "AI shrnutí není k dispozici (chybí konfigurace). Použijte text požadavku níže.",
      });
    }

    const prompt = `Jsi interní asistent pro finančního poradce v CRM. Z níže uvedeného textu klientského požadavku napiš krátké interní shrnutí (3–5 vět): co klient řeší, jaké údaje mohou chybět, oblasti k ověření poradcem a navržené administrativní kroky v CRM (úkoly, dokumenty, schůzka). Nepiš doporučení konkrétního produktu ani finanční radu klientovi.

Kategorie: ${caseTypeLabel || "—"}
Předmět: ${subject || "—"}
Text od klienta:
${detail || "(bez popisu)"}

${ADVISOR_AI_INTERNAL_SCOPE_CS}`;

    const result = await createResponseSafe(prompt);
    if (result.ok) {
      logOpenAICall({
        endpoint: "client-request-brief",
        model: "—",
        latencyMs: Date.now() - start,
        success: true,
      });
      return NextResponse.json({
        brief: result.text.slice(0, 1200).trim(),
      });
    }

    logOpenAICall({
      endpoint: "client-request-brief",
      model: "—",
      latencyMs: Date.now() - start,
      success: false,
      error: (result as { error?: string }).error?.slice(0, 80),
    });
    return NextResponse.json({
      brief: "Shrnutí se nepodařilo vygenerovat. Zkuste to znovu nebo přečtěte si celý text požadavku.",
    });
  } catch (err) {
    console.error("[client-request-brief]", err);
    return NextResponse.json({ error: "Chyba serveru." }, { status: 500 });
  }
}

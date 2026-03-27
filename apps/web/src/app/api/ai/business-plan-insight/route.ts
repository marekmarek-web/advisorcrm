import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createResponseSafe, logOpenAICall } from "@/lib/openai";
import { ADVISOR_AI_INTERNAL_SCOPE_CS } from "@/lib/ai/compliance-prompt-suffix";

export const dynamic = "force-dynamic";

function buildFallbackInsight(
  productionActual: number,
  productionTarget: number,
  meetingsActual: number,
  meetingsTarget: number
): string {
  if (productionTarget <= 0 && meetingsTarget <= 0) {
    return "Nastav cíle produkce a schůzek — poté můžeš vygenerovat informativní interní přehled aktivity.";
  }
  const pctProd = productionTarget > 0 ? Math.round((productionActual / productionTarget) * 100) : 0;
  const pctMeet = meetingsTarget > 0 ? Math.round((meetingsActual / meetingsTarget) * 100) : 0;
  const parts: string[] = [];
  if (pctProd < 100 && productionTarget > 0) parts.push(`Produkce je na ${pctProd} %.`);
  if (pctMeet < 100 && meetingsTarget > 0) parts.push(`Schůzky na ${pctMeet} %.`);
  if (parts.length === 0) return "Cíle plníš dobře. Pokračuj v nastaveném tempu.";
  return parts.join(" ") + " Věnuj čas telefonování a domluvení schůzek.";
}

export async function POST(request: Request) {
  const start = Date.now();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const membership = await getMembership(user.id);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const limiter = checkRateLimit(request, "ai-business-plan-insight", `${membership.tenantId}:${user.id}`, { windowMs: 60_000, maxRequests: 10 });
    if (!limiter.ok) {
      return NextResponse.json({ error: "Too many requests. Please retry later." }, { status: 429, headers: { "Retry-After": String(limiter.retryAfterSec) } });
    }

    const body = await request.json().catch(() => ({}));
    const periodLabel = String(body.periodLabel ?? "");
    const targets = body.targets ?? {};
    const actuals = body.actuals ?? {};
    const recommendations = Array.isArray(body.recommendations) ? body.recommendations : [];

    const productionTarget = Number(targets.production) || 0;
    const meetingsTarget = Number(targets.meetings) || 0;
    const productionActual = Number(actuals.production) || 0;
    const meetingsActual = Number(actuals.meetings) || 0;

    const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim());
    let insight: string;

    if (hasKey) {
      const recText = recommendations
        .slice(0, 3)
        .map((r: { title?: string; description?: string }) => `${r.title ?? ""}: ${r.description ?? ""}`)
        .filter(Boolean)
        .join(". ");
      const context = `Období: ${periodLabel}. Cíle: produkce ${productionTarget} Kč, schůzky ${meetingsTarget}. Skutečnost: produkce ${productionActual} Kč, schůzky ${meetingsActual}. ${recText ? `Poznámky z plánu: ${recText}` : ""}`;
      const prompt = `Jsi interní analytický nástroj pro poradce (ne rada klientovi). Stručně (1–2 věty, max 200 znaků) shrň oblasti k prověření v práci poradce v tomto období. Kontext: ${context}. Odpověz pouze textem, bez odrážek, v češtině.\n\n${ADVISOR_AI_INTERNAL_SCOPE_CS}`;
      const result = await createResponseSafe(prompt);
      if (result.ok) {
        insight = result.text.slice(0, 400).trim();
      } else {
        logOpenAICall({
          endpoint: "business-plan-insight",
          model: "—",
          latencyMs: Date.now() - start,
          success: false,
          error: (result as { error?: string }).error?.slice(0, 80),
        });
        insight = buildFallbackInsight(productionActual, productionTarget, meetingsActual, meetingsTarget);
      }
    } else {
      insight = buildFallbackInsight(productionActual, productionTarget, meetingsActual, meetingsTarget);
    }

    return NextResponse.json({ insight });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generování insightu selhalo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

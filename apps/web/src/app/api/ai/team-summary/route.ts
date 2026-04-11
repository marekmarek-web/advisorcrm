import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { hasPermission, type RoleName } from "@/lib/auth/permissions";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createResponseSafe } from "@/lib/openai";
import { logOpenAICall } from "@/lib/openai";
import { resolveScopeForRole, type TeamOverviewScope } from "@/lib/team-hierarchy-types";
import {
  getTeamOverviewKpis,
  getTeamMemberMetrics,
  getNewcomerAdaptation,
  listTeamMembersWithNames,
} from "@/app/actions/team-overview";
import { buildTeamAlertsFromMemberMetrics } from "@/lib/team-overview-alerts";
import type { TeamOverviewPeriod } from "@/app/actions/team-overview";
import { assertCapability, getSessionEmailForUserId } from "@/lib/billing/plan-access-guards";
import { assertQuotaAvailable } from "@/lib/billing/subscription-usage";
import { nextResponseFromPlanOrQuotaError } from "@/lib/billing/plan-access-http";

export const dynamic = "force-dynamic";

const USER_ID_HEADER = "x-user-id";

export async function GET(request: Request) {
  const start = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") as TeamOverviewPeriod) || "month";
    const requestedScope = (searchParams.get("scope") as TeamOverviewScope | null) ?? null;

    let userId: string | null = request.headers.get(USER_ID_HEADER);
    if (!userId) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      userId = user.id;
    }

    const membership = await getMembership(userId);
    if (!membership || !hasPermission(membership.roleName as RoleName, "team_overview:read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sessionEmail = await getSessionEmailForUserId(userId);
    try {
      await assertCapability({
        tenantId: membership.tenantId,
        userId,
        email: sessionEmail,
        capability: "team_overview",
      });
      await assertQuotaAvailable({
        tenantId: membership.tenantId,
        userId,
        email: sessionEmail,
        dimension: "assistant_actions",
      });
    } catch (e) {
      const r = nextResponseFromPlanOrQuotaError(e);
      if (r) return r;
      throw e;
    }

    const limiter = checkRateLimit(request, "ai-team-summary", `${membership.tenantId}:${userId}`, { windowMs: 60_000, maxRequests: 10 });
    if (!limiter.ok) {
      return NextResponse.json({ error: "Too many requests. Please retry later." }, { status: 429, headers: { "Retry-After": String(limiter.retryAfterSec) } });
    }

    const defaultScope: TeamOverviewScope =
      membership.roleName === "Advisor" || membership.roleName === "Viewer"
        ? "me"
        : membership.roleName === "Director" || membership.roleName === "Admin"
          ? "full"
          : "my_team";
    const scope = resolveScopeForRole(membership.roleName as RoleName, requestedScope ?? defaultScope);

    const [kpis, metrics, newcomers, members] = await Promise.all([
      getTeamOverviewKpis(period, scope),
      getTeamMemberMetrics(period, scope),
      getNewcomerAdaptation(scope),
      listTeamMembersWithNames(scope),
    ]);
    const alerts = buildTeamAlertsFromMemberMetrics(metrics);

    const memberNames = new Map(members.map((m) => [m.userId, m.displayName || "Člen týmu"]));

    const topPerformers = [...metrics].sort((a, b) => b.unitsThisPeriod - a.unitsThisPeriod).slice(0, 3);
    const risky = metrics.filter((m) => m.riskLevel !== "ok");
    const stagnant = metrics.filter((m) => m.unitsTrend <= 0 && m.activityCount < 5 && m.unitsThisPeriod < 2);

    const contextParts: string[] = [];
    if (kpis) {
      contextParts.push(
        `Tým: ${kpis.memberCount} členů, aktivních ${kpis.activeMemberCount}. Jednotky za ${kpis.periodLabel}: ${kpis.unitsThisPeriod} (trend ${kpis.unitsTrend >= 0 ? "+" : ""}${kpis.unitsTrend}). Produkce: ${kpis.productionThisPeriod}. Schůzky tento týden: ${kpis.meetingsThisWeek}. Nováčci v adaptaci: ${kpis.newcomersInAdaptation}. Rizikoví: ${kpis.riskyMemberCount}.`
      );
    }
    if (topPerformers.length) {
      contextParts.push(
        "Nejlepší podle jednotek: " +
          topPerformers.map((m) => `${memberNames.get(m.userId) ?? m.userId} (${m.unitsThisPeriod} j.)`).join(", ")
      );
    }
    if (risky.length) {
      contextParts.push(
        "Rizikoví nebo varování: " +
          risky.map((m) => `${memberNames.get(m.userId) ?? m.userId} (${m.riskLevel})`).join(", ")
      );
    }
    if (alerts.length) {
      contextParts.push(
        "Upozornění: " +
          alerts.slice(0, 5).map((a) => `${memberNames.get(a.memberId) ?? a.memberId}: ${a.title}`).join(". ")
      );
    }
    if (newcomers.length) {
      contextParts.push(
        "Nováčci: " +
          newcomers.map((n) => `${memberNames.get(n.userId) ?? n.userId} – ${n.adaptationScore} %, ${n.adaptationStatus}`).join(". ")
      );
    }
    if (stagnant.length) {
      contextParts.push(
        "Nízká aktivita / stagnace: " +
          stagnant.map((m) => memberNames.get(m.userId) ?? m.userId).join(", ")
      );
    }

    const context = contextParts.join(" ");
    const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim());
    let summary: string;

    if (hasKey && context) {
      const prompt = `Jsi manažerský asistent. Na základě těchto dat o týmu napiš krátké shrnutí (2–4 věty) pro manažera: kdo roste, kdo stagnuje, kdo je rizikový, koho pochválit, koho coacheovat, který nováček potřebuje podporu. Piš stručně, v češtině, bez odrážek. Data: ${context}`;
      const result = await createResponseSafe(prompt);
      if (result.ok) {
        summary = result.text.slice(0, 800).trim();
      } else {
        logOpenAICall({
          endpoint: "team-summary",
          model: "—",
          latencyMs: Date.now() - start,
          success: false,
          error: (result as { error?: string }).error?.slice(0, 80),
        });
        summary = "Shrnutí se nepodařilo vygenerovat. Prohlédněte si KPI a seznam členů níže.";
      }
    } else {
      summary = context || "Zatím není dostatek dat pro shrnutí. Přidejte členy a aktivity.";
    }

    return NextResponse.json({ summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Načtení shrnutí selhalo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

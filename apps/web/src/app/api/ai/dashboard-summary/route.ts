import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createResponseSafe } from "@/lib/openai";
import { logOpenAICall } from "@/lib/openai";
import {
  computePriorityItems,
  getTasksDueAndOverdue,
  getClientsNeedingAttention,
  buildSuggestedActionsFromUrgent,
} from "@/lib/ai/dashboard-priority";
import { listContractReviews } from "@/lib/ai/review-queue-repository";
import type {
  DashboardSummary,
  ContractWaitingForReview,
  MissingDataWarning,
} from "@/lib/ai/dashboard-types";

export const dynamic = "force-dynamic";

function buildFallbackSummary(
  urgentCount: number,
  reviewCount: number,
  overdueCount: number,
  dueTodayCount: number
): string {
  const parts: string[] = [];
  if (overdueCount > 0) parts.push(`${overdueCount} úkolů po termínu`);
  if (dueTodayCount > 0) parts.push(`${dueTodayCount} úkolů na dnes`);
  if (reviewCount > 0) parts.push(`${reviewCount} smluv ke kontrole`);
  if (urgentCount > 0 && parts.length === 0) parts.push(`${urgentCount} prioritních položek`);
  if (parts.length === 0) return "Dnes nemáte urgentní položky. Prohlédněte si kalendář nebo úkoly.";
  return `Máte ${parts.join(", ")}. Doporučujeme nejdříve vyřešit ${overdueCount > 0 ? "zpožděné úkoly" : reviewCount > 0 ? "review smluv" : "dnešní agendu"}.`;
}

const USER_ID_HEADER = "x-user-id";

export async function GET(request: Request) {
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
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const limiter = checkRateLimit(request, "ai-dashboard-summary", `${membership.tenantId}:${userId}`, { windowMs: 60_000, maxRequests: 15 });
    if (!limiter.ok) {
      return NextResponse.json({ error: "Too many requests. Please retry later." }, { status: 429, headers: { "Retry-After": String(limiter.retryAfterSec) } });
    }

    const tenantId = membership.tenantId;

    const [
      urgentItems,
      pendingReviews,
      tasksData,
      clientsNeedingAttention,
    ] = await Promise.all([
      computePriorityItems(tenantId),
      listContractReviews(tenantId, { reviewStatus: "pending", limit: 20 }),
      getTasksDueAndOverdue(tenantId),
      getClientsNeedingAttention(tenantId),
    ]);

    const contractsWaitingForReview: ContractWaitingForReview[] = pendingReviews.map((r) => ({
      id: r.id,
      fileName: r.fileName,
      createdAt: r.createdAt.toISOString(),
      confidence: r.confidence ?? null,
      processingStatus: r.processingStatus,
    }));

    const missingDataWarnings: MissingDataWarning[] = [];
    for (const r of pendingReviews) {
      const payload = r.extractedPayload as { missingFields?: string[] } | null;
      const hasMissing = payload?.missingFields?.length;
      const lowConf = r.confidence != null && r.confidence < 0.7;
      if (hasMissing || lowConf) {
        missingDataWarnings.push({
          source: "contract_review",
          entityId: r.id,
          message: hasMissing
            ? `Chybějící pole: ${(payload!.missingFields as string[]).slice(0, 3).join(", ")}`
            : lowConf
              ? "Nízká confidence extrakce"
              : "Vyžaduje kontrolu",
        });
      }
    }

    const suggestedActions = buildSuggestedActionsFromUrgent(urgentItems);

    let assistantSummaryText: string;
    const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim());
    if (hasKey) {
      const context = [
        `Urgentní: ${urgentItems.length}, Review: ${pendingReviews.length}, Úkoly po termínu: ${tasksData.overdueTasks.length}, Dnes: ${tasksData.tasksDueToday.length}.`,
        urgentItems
          .slice(0, 5)
          .map((u) => `${u.type}: ${u.title} (${u.recommendedAction})`)
          .join(". "),
      ].join(" ");
      const prompt = `Jsi asistent poradce v CRM. Stručně (1-2 věty) shrň prioritní práci na dnešek. Kontext: ${context}. Odpověz pouze textem, bez odrážek.`;
      const result = await createResponseSafe(prompt);
      if (result.ok) {
        assistantSummaryText = result.text.slice(0, 500).trim();
      } else {
        logOpenAICall({
          endpoint: "dashboard-summary",
          model: "—",
          latencyMs: Date.now() - start,
          success: false,
          error: (result as { error?: string }).error?.slice(0, 80),
        });
        assistantSummaryText = buildFallbackSummary(
          urgentItems.length,
          pendingReviews.length,
          tasksData.overdueTasks.length,
          tasksData.tasksDueToday.length
        );
      }
    } else {
      assistantSummaryText = buildFallbackSummary(
        urgentItems.length,
        pendingReviews.length,
        tasksData.overdueTasks.length,
        tasksData.tasksDueToday.length
      );
    }

    const summary: DashboardSummary = {
      urgentItems,
      contractsWaitingForReview,
      tasksDueToday: tasksData.tasksDueToday,
      overdueTasks: tasksData.overdueTasks,
      clientsNeedingAttention,
      missingDataWarnings,
      suggestedActions,
      assistantSummaryText,
    };

    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Načtení shrnutí selhalo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

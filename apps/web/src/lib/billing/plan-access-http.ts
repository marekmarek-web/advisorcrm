import { NextResponse } from "next/server";
import { PlanAccessError } from "@/lib/billing/plan-access-errors";
import { QuotaExceededError } from "@/lib/billing/quota-errors";

export function nextResponseFromPlanOrQuotaError(e: unknown): NextResponse | null {
  if (PlanAccessError.is(e)) {
    return NextResponse.json(
      {
        error: e.message,
        code: "PLAN_ACCESS_DENIED" as const,
        planAccess: e.detail,
      },
      { status: 403 },
    );
  }
  if (QuotaExceededError.is(e)) {
    return NextResponse.json(
      {
        error: e.message,
        code: "QUOTA_EXCEEDED" as const,
        quota: e.detail,
      },
      { status: 403 },
    );
  }
  return null;
}

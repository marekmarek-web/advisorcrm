import { logAudit } from "@/lib/audit";

export async function logAiAutomationEvent(params: {
  tenantId: string;
  userId: string;
  event: "execute" | "conflict" | "reject" | "retry";
  surface: string;
  generationId?: string;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}) {
  await logAudit({
    tenantId: params.tenantId,
    userId: params.userId,
    action: `ai_automation_${params.event}`,
    entityType: params.entityType ?? "ai_generation",
    entityId: params.entityId ?? params.generationId ?? params.tenantId,
    meta: {
      sourceSurface: params.surface,
      generationId: params.generationId,
      ...params.meta,
    },
  }).catch(() => {});
}

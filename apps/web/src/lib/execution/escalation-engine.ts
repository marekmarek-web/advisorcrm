/**
 * Escalation engine (Plan 6C.3).
 * Evaluates SLA breaches and creates escalation events.
 */

import { checkSLABreaches, type SLABreachItem } from "./sla-policies";
import { emitNotification } from "./notification-center";

export type EscalationEvent = {
  id: string;
  tenantId: string;
  policyCode: string;
  entityType: string;
  entityId: string;
  triggerReason: string;
  thresholdCrossed: string;
  escalatedTo: string;
  status: "pending" | "acknowledged" | "resolved";
  acknowledgedAt?: Date;
  resolvedAt?: Date;
};

export async function evaluateEscalations(
  tenantId: string,
  items: { entityType: string; entityId: string; ageHours: number }[],
  escalationTargetUserId: string,
): Promise<EscalationEvent[]> {
  const breaches = checkSLABreaches(items);
  if (breaches.length === 0) return [];

  const events: EscalationEvent[] = [];

  for (const breach of breaches) {
    const dedupKey = `${tenantId}:${breach.policyCode}:${breach.entityId}`;
    if (await isAlreadyEscalated(dedupKey)) continue;

    const event: EscalationEvent = {
      id: `esc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      tenantId,
      policyCode: breach.policyCode,
      entityType: breach.entityType,
      entityId: breach.entityId,
      triggerReason: `SLA ${breach.level}: ${breach.policyCode} (${Math.round(breach.ageHours)}h)`,
      thresholdCrossed: breach.level,
      escalatedTo: escalationTargetUserId,
      status: "pending",
    };

    events.push(event);
    await persistEscalation(event);

    await emitNotification({
      tenantId,
      type: "escalation",
      title: `Eskalace: ${breach.policyCode}`,
      body: event.triggerReason,
      severity: breach.level === "breach" ? "urgent" : "warning",
      targetUserId: escalationTargetUserId,
      channels: ["in_app", "push"],
      relatedEntityType: breach.entityType,
      relatedEntityId: breach.entityId,
      groupKey: `escalation:${breach.policyCode}:${breach.entityId}`,
    });
  }

  return events;
}

async function isAlreadyEscalated(dedupKey: string): Promise<boolean> {
  try {
    const parts = dedupKey.split(":");
    const [tenantId, policyCode, entityId] = parts;
    const { db, escalationEvents, eq, and } = await import("db");
    const [row] = await db.select({ id: escalationEvents.id })
      .from(escalationEvents)
      .where(and(
        eq(escalationEvents.tenantId, tenantId),
        eq(escalationEvents.policyCode, policyCode),
        eq(escalationEvents.entityId, entityId),
        eq(escalationEvents.status, "pending"),
      ))
      .limit(1);
    return !!row;
  } catch {
    return false;
  }
}

async function persistEscalation(event: EscalationEvent): Promise<void> {
  try {
    const { db, escalationEvents } = await import("db");
    await db.insert(escalationEvents).values({
      tenantId: event.tenantId,
      policyCode: event.policyCode,
      entityType: event.entityType,
      entityId: event.entityId,
      triggerReason: event.triggerReason,
      thresholdCrossed: event.thresholdCrossed,
      escalatedTo: event.escalatedTo,
      status: event.status,
    });
  } catch { /* best-effort */ }
}

export async function acknowledgeEscalation(
  escalationId: string,
  tenantId: string,
): Promise<boolean> {
  try {
    const { db, escalationEvents, eq, and } = await import("db");
    await db.update(escalationEvents).set({
      status: "acknowledged",
      acknowledgedAt: new Date(),
    }).where(and(
      eq(escalationEvents.id, escalationId),
      eq(escalationEvents.tenantId, tenantId),
    ));
    return true;
  } catch {
    return false;
  }
}

export async function resolveEscalation(
  escalationId: string,
  tenantId: string,
): Promise<boolean> {
  try {
    const { db, escalationEvents, eq, and } = await import("db");
    await db.update(escalationEvents).set({
      status: "resolved",
      resolvedAt: new Date(),
    }).where(and(
      eq(escalationEvents.id, escalationId),
      eq(escalationEvents.tenantId, tenantId),
    ));
    return true;
  } catch {
    return false;
  }
}

"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "db";
import { tasks, advisorNotifications } from "db";
import { and, eq, inArray, isNull, sql } from "db";

export type PortalShellBadgeCounts = {
  openTasks: number;
  unreadConversations: number;
  notifications: number;
};

/**
 * Jedno volání místo tří samostatných server actions — jedna auth kontrola, paralelní dotazy.
 * Pro badge v PortalShell (sidebar + header).
 */
export async function getPortalShellBadgeCounts(): Promise<PortalShellBadgeCounts> {
  const auth = await requireAuthInAction();

  if (auth.roleName === "Client") {
    return { openTasks: 0, unreadConversations: 0, notifications: 0 };
  }

  const canReadContacts = hasPermission(auth.roleName, "contacts:read");

  const [openTasksResult, unreadMessagesResult, notificationRows] = await Promise.all([
    canReadContacts
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(tasks)
          .where(and(eq(tasks.tenantId, auth.tenantId), isNull(tasks.completedAt)))
      : Promise.resolve([{ count: 0 }]),
    canReadContacts
      ? db.execute(sql`
          SELECT COUNT(DISTINCT m.contact_id)::int AS cnt
          FROM messages m
          WHERE m.tenant_id = ${auth.tenantId}
            AND m.sender_type = 'client'
            AND m.read_at IS NULL
        `)
      : Promise.resolve({ rows: [{ cnt: 0 }] }),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(advisorNotifications)
      .where(
        and(
          eq(advisorNotifications.tenantId, auth.tenantId),
          eq(advisorNotifications.targetUserId, auth.userId),
          eq(advisorNotifications.status, "unread"),
          inArray(advisorNotifications.type, ["client_portal_request", "client_material_response"])
        )
      ),
  ]);

  const openTasks = canReadContacts ? Number((openTasksResult[0] as { count?: number })?.count ?? 0) : 0;

  let unreadConversations = 0;
  if (canReadContacts) {
    const execRows = Array.isArray(unreadMessagesResult)
      ? unreadMessagesResult
      : (unreadMessagesResult as { rows?: { cnt: number }[] }).rows ?? [];
    const row = execRows[0] as { cnt?: number } | undefined;
    unreadConversations = row?.cnt ?? 0;
  }

  const notifications = Number(notificationRows[0]?.c ?? 0);

  return { openTasks, unreadConversations, notifications };
}

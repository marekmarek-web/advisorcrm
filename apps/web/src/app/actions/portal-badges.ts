"use server";

import { unstable_cache } from "next/cache";
import { requireAuthInAction } from "@/lib/auth/require-auth";
import { withTenantContextFromAuth } from "@/lib/auth/with-auth-context";
import { hasPermission } from "@/lib/auth/permissions";
import { tasks, advisorNotifications } from "db";
import { and, eq, inArray, isNull, sql } from "db";
import { ADVISOR_NOTIFICATION_TYPES } from "@/lib/advisor-in-app/advisor-notification-types";

export type PortalShellBadgeCounts = {
  openTasks: number;
  unreadConversations: number;
  notifications: number;
};

function getBadgesCacheTag(userId: string) {
  return `badges-${userId}`;
}

async function fetchBadgeCounts(
  tenantId: string,
  userId: string,
  canReadContacts: boolean
): Promise<PortalShellBadgeCounts> {
  return withTenantContextFromAuth({ tenantId, userId }, async (tx) => {
    let openTasksResult: { count?: number }[] = [{ count: 0 }];
    let notificationRows: { c?: number }[] = [{ c: 0 }];
    try {
      [openTasksResult, notificationRows] = await Promise.all([
        canReadContacts
          ? tx
              .select({ count: sql<number>`count(*)::int` })
              .from(tasks)
              .where(and(eq(tasks.tenantId, tenantId), isNull(tasks.completedAt)))
          : Promise.resolve([{ count: 0 }]),
        tx
          .select({ c: sql<number>`count(*)::int` })
          .from(advisorNotifications)
          .where(
            and(
              eq(advisorNotifications.tenantId, tenantId),
              eq(advisorNotifications.targetUserId, userId),
              eq(advisorNotifications.status, "unread"),
              inArray(advisorNotifications.type, [...ADVISOR_NOTIFICATION_TYPES])
            )
          ),
      ]);
    } catch {
      /* DB nedostupná — vrátíme nuly, nepádíme s HTTP 500 */
    }

    const openTasks = canReadContacts ? Number((openTasksResult[0] as { count?: number })?.count ?? 0) : 0;

    let unreadConversations = 0;
    if (canReadContacts) {
      try {
        const unreadMessagesResult = await tx.execute(sql`
          SELECT COUNT(DISTINCT m.contact_id)::int AS cnt
          FROM messages m
          WHERE m.tenant_id = ${tenantId}
            AND m.sender_type = 'client'
            AND m.read_at IS NULL
        `);
        const execRows = Array.isArray(unreadMessagesResult)
          ? unreadMessagesResult
          : (unreadMessagesResult as { rows?: { cnt: number }[] }).rows ?? [];
        const row = execRows[0] as { cnt?: number } | undefined;
        unreadConversations = row?.cnt ?? 0;
      } catch {
        unreadConversations = 0;
      }
    }

    const notifications = Number(notificationRows[0]?.c ?? 0);
    return { openTasks, unreadConversations, notifications };
  });
}

/**
 * Jedno volání místo tří samostatných server actions — jedna auth kontrola, paralelní dotazy.
 * Výsledek je kešovaný 30s na serveru; invalidovat pomocí revalidateTag(getBadgesCacheTag(userId)).
 * Pro badge v PortalShell (sidebar + header).
 */
export async function getPortalShellBadgeCounts(): Promise<PortalShellBadgeCounts> {
  const auth = await requireAuthInAction();

  if (auth.roleName === "Client") {
    return { openTasks: 0, unreadConversations: 0, notifications: 0 };
  }

  const canReadContacts = hasPermission(auth.roleName, "contacts:read");

  const cachedFetch = unstable_cache(
    () => fetchBadgeCounts(auth.tenantId, auth.userId, canReadContacts),
    [`badges-${auth.tenantId}-${auth.userId}`],
    { revalidate: 30, tags: [getBadgesCacheTag(auth.userId)] }
  );

  return cachedFetch();
}

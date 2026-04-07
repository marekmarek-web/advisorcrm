import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import {
  db,
  messages,
  messageAttachments,
  contacts,
  tasks,
  advisorMaterialRequests,
  terminationRequests,
  eq,
  and,
  asc,
  desc,
  isNull,
  sql,
  inArray,
} from "db";
import { getChatContextPanelSnapshot, type ChatContextPanelSnapshot } from "@/app/actions/messages";
import type { AdvisorChatAiBundle } from "./advisor-chat-ai-types";

const MAX_MESSAGES = 35;
const MAX_BODY_LEN = 2_000;

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export async function loadAdvisorChatAiBundle(
  contactId: string,
  options?: { crmSnapshot?: ChatContextPanelSnapshot },
): Promise<AdvisorChatAiBundle | null> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client" || !hasPermission(auth.roleName, "contacts:read")) return null;

  const snapshotPromise = options?.crmSnapshot
    ? Promise.resolve(options.crmSnapshot)
    : getChatContextPanelSnapshot(contactId);

  const [snapshot, contactRow, msgDesc, taskRows, matRows, termRows] = await Promise.all([
    snapshotPromise,
    db
      .select({
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        lifecycleStage: contacts.lifecycleStage,
        tags: contacts.tags,
        leadSource: contacts.leadSource,
        priority: contacts.priority,
      })
      .from(contacts)
      .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, contactId)))
      .limit(1),
    db
      .select({
        id: messages.id,
        senderType: messages.senderType,
        body: messages.body,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(and(eq(messages.tenantId, auth.tenantId), eq(messages.contactId, contactId)))
      .orderBy(desc(messages.createdAt))
      .limit(MAX_MESSAGES),
    db
      .select({ title: tasks.title, dueDate: tasks.dueDate })
      .from(tasks)
      .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.contactId, contactId), isNull(tasks.completedAt)))
      .orderBy(asc(tasks.dueDate))
      .limit(12),
    db
      .select({
        title: advisorMaterialRequests.title,
        category: advisorMaterialRequests.category,
      })
      .from(advisorMaterialRequests)
      .where(
        and(
          eq(advisorMaterialRequests.tenantId, auth.tenantId),
          eq(advisorMaterialRequests.contactId, contactId),
          sql`${advisorMaterialRequests.status} NOT IN ('done', 'closed')`,
        ),
      )
      .orderBy(desc(advisorMaterialRequests.updatedAt))
      .limit(8),
    db
      .select({
        id: terminationRequests.id,
        status: terminationRequests.status,
        insurerName: terminationRequests.insurerName,
        updatedAt: terminationRequests.updatedAt,
      })
      .from(terminationRequests)
      .where(
        and(eq(terminationRequests.tenantId, auth.tenantId), eq(terminationRequests.contactId, contactId)),
      )
      .orderBy(desc(terminationRequests.updatedAt))
      .limit(6),
  ]);

  const c = contactRow[0];
  if (!c) return null;

  const chronological = [...msgDesc].reverse();
  const messageIds = chronological.map((m) => m.id);

  const attachmentHints: { fileName: string; mimeType: string | null }[] = [];
  if (messageIds.length) {
    const atts = await db
      .select({
        fileName: messageAttachments.fileName,
        mimeType: messageAttachments.mimeType,
      })
      .from(messageAttachments)
      .where(inArray(messageAttachments.messageId, messageIds));
    const seen = new Set<string>();
    for (const a of atts) {
      const key = `${a.fileName}|${a.mimeType ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      attachmentHints.push({ fileName: a.fileName, mimeType: a.mimeType });
      if (attachmentHints.length >= 20) break;
    }
  }

  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  const displayName = name || c.email?.trim() || "Kontakt";
  const tagStr = (c.tags ?? []).filter(Boolean).slice(0, 6).join(", ");
  const metaParts = [
    c.lifecycleStage?.trim(),
    tagStr || null,
    c.leadSource?.trim(),
    c.priority?.trim(),
  ].filter(Boolean);
  const contactMetaLine = metaParts.join(" · ") || "";

  const turns = chronological
    .map((m) => {
      const st = m.senderType?.trim();
      if (st !== "client" && st !== "advisor") return null;
      return {
        sender: st as "client" | "advisor",
        body: truncate(m.body ?? "", MAX_BODY_LEN),
        createdAt: m.createdAt.toISOString(),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const lastAt =
    chronological.length > 0 ? chronological[chronological.length - 1]!.createdAt.toISOString() : null;

  const primaryOpportunity = snapshot.primaryOpportunity
    ? {
        title: snapshot.primaryOpportunity.title,
        caseType: snapshot.primaryOpportunity.caseType,
        stageName: snapshot.primaryOpportunity.stageName,
      }
    : null;

  return {
    contactId,
    contactDisplayName: displayName,
    contactMetaLine,
    lastThreadActivityAt: lastAt,
    messages: turns,
    primaryOpportunity,
    openTasks: taskRows.map((t) => ({
      title: t.title,
      dueDate: t.dueDate ?? null,
    })),
    pendingMaterialRequests: matRows.map((m) => ({
      title: m.title,
      category: m.category,
    })),
    crmCounts: {
      openTasksCount: snapshot.openTasksCount,
      overdueTasksCount: snapshot.overdueTasksCount,
      pendingMaterialRequestsCount: snapshot.pendingMaterialRequestsCount,
      openOpportunitiesCount: snapshot.openOpportunitiesCount,
      opportunitiesReadable: snapshot.opportunitiesReadable,
    },
    attachmentHints,
    terminationRequests: termRows.map((t) => ({
      id: t.id,
      status: t.status,
      insurerName: t.insurerName,
      updatedAt: t.updatedAt.toISOString(),
    })),
  };
}

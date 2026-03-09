"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { db, messages, eq, and, asc, isNull, sql } from "db";

export type MessageRow = {
  id: string;
  senderType: string;
  senderId: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
};

export async function getMessages(contactId: string): Promise<MessageRow[]> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client") {
    if (auth.contactId !== contactId) throw new Error("Forbidden");
  } else if (!hasPermission(auth.roleName, "contacts:read")) {
    throw new Error("Forbidden");
  }
  const rows = await db
    .select({
      id: messages.id,
      senderType: messages.senderType,
      senderId: messages.senderId,
      body: messages.body,
      readAt: messages.readAt,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(and(eq(messages.tenantId, auth.tenantId), eq(messages.contactId, contactId)))
    .orderBy(asc(messages.createdAt));
  return rows;
}

export async function sendMessage(contactId: string, body: string): Promise<string | null> {
  const auth = await requireAuthInAction();
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Prázdná zpráva");

  const senderType = auth.roleName === "Client" ? "client" : "advisor";

  if (auth.roleName === "Client") {
    if (auth.contactId !== contactId) throw new Error("Forbidden");
  } else if (!hasPermission(auth.roleName, "contacts:write")) {
    throw new Error("Forbidden");
  }

  const [row] = await db
    .insert(messages)
    .values({
      tenantId: auth.tenantId,
      contactId,
      senderType,
      senderId: auth.userId,
      body: trimmed,
    })
    .returning({ id: messages.id });
  return row?.id ?? null;
}

export type RecentConversation = {
  contactId: string;
  contactName: string;
  lastMessage: string;
  lastMessageAt: Date;
  senderType: string;
  unread: boolean;
};

export async function getRecentConversations(limit = 5): Promise<RecentConversation[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) return [];

  const result = await db.execute(sql`
    SELECT DISTINCT ON (m.contact_id)
      m.contact_id,
      c.first_name || ' ' || c.last_name AS contact_name,
      m.body AS last_message,
      m.created_at AS last_message_at,
      m.sender_type,
      CASE WHEN m.read_at IS NULL AND m.sender_type = 'client' THEN true ELSE false END AS unread
    FROM messages m
    JOIN contacts c ON c.id = m.contact_id
    WHERE m.tenant_id = ${auth.tenantId}
    ORDER BY m.contact_id, m.created_at DESC
    LIMIT ${limit}
  `);

  const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? [];
  return (rows as { contact_id: string; contact_name: string; last_message: string; last_message_at: Date; sender_type: string; unread: boolean }[]).map((r) => ({
    contactId: r.contact_id,
    contactName: r.contact_name,
    lastMessage: r.last_message,
    lastMessageAt: new Date(r.last_message_at),
    senderType: r.sender_type,
    unread: r.unread,
  }));
}

export async function markMessagesRead(contactId: string): Promise<void> {
  const auth = await requireAuthInAction();

  if (auth.roleName === "Client") {
    if (auth.contactId !== contactId) throw new Error("Forbidden");
    // Mark advisor messages as read for the client
    await db
      .update(messages)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(messages.tenantId, auth.tenantId),
          eq(messages.contactId, contactId),
          eq(messages.senderType, "advisor"),
          isNull(messages.readAt)
        )
      );
  } else {
    if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
    // Mark client messages as read for the advisor
    await db
      .update(messages)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(messages.tenantId, auth.tenantId),
          eq(messages.contactId, contactId),
          eq(messages.senderType, "client"),
          isNull(messages.readAt)
        )
      );
  }
}

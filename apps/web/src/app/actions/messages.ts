"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { db, messages, messageAttachments, tenants, contacts, eq, and, asc, isNull, sql } from "db";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail, logNotification } from "@/lib/email/send-email";
import { newMessageAdvisorTemplate } from "@/lib/email/templates";

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

/** Returns number of distinct contacts that have at least one unread message from client. For sidebar badge. */
export async function getUnreadConversationsCount(): Promise<number> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client") return 0;
  if (!hasPermission(auth.roleName, "contacts:read")) return 0;

  const result = await db.execute(sql`
    SELECT COUNT(DISTINCT m.contact_id)::int AS cnt
    FROM messages m
    WHERE m.tenant_id = ${auth.tenantId}
      AND m.sender_type = 'client'
      AND m.read_at IS NULL
  `);
  const rows = Array.isArray(result) ? result : (result as { rows?: { cnt: number }[] }).rows ?? [];
  const row = rows[0] as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

/** Client-only badge: unread advisor messages in own thread. */
export async function getUnreadAdvisorMessagesForClientCount(): Promise<number> {
  const auth = await requireAuthInAction();
  if (auth.roleName !== "Client" || !auth.contactId) return 0;

  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt
    FROM messages m
    WHERE m.tenant_id = ${auth.tenantId}
      AND m.contact_id = ${auth.contactId}
      AND m.sender_type = 'advisor'
      AND m.read_at IS NULL
  `);
  const rows = Array.isArray(result) ? result : (result as { rows?: { cnt: number }[] }).rows ?? [];
  const row = rows[0] as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

export type ConversationListItem = {
  contactId: string;
  contactName: string;
  lastMessage: string;
  lastMessageAt: Date;
  unreadCount: number;
  unread: boolean;
};

export async function getConversationsList(search?: string): Promise<ConversationListItem[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) return [];

  const searchCond = search?.trim()
    ? sql`AND (c.first_name ILIKE ${"%" + search.trim() + "%"} OR c.last_name ILIKE ${"%" + search.trim() + "%"})`
    : sql``;

  const result = await db.execute(sql`
    WITH last_per_contact AS (
      SELECT DISTINCT ON (m.contact_id)
        m.contact_id,
        m.body AS last_message,
        m.created_at AS last_message_at,
        m.sender_type,
        CASE WHEN m.read_at IS NULL AND m.sender_type = 'client' THEN 1 ELSE 0 END AS is_unread
      FROM messages m
      WHERE m.tenant_id = ${auth.tenantId}
      ORDER BY m.contact_id, m.created_at DESC
    ),
    unread_counts AS (
      SELECT contact_id, COUNT(*)::int AS unread_count
      FROM messages
      WHERE tenant_id = ${auth.tenantId}
        AND sender_type = 'client'
        AND read_at IS NULL
      GROUP BY contact_id
    )
    SELECT
      c.id AS contact_id,
      c.first_name || ' ' || c.last_name AS contact_name,
      lpc.last_message,
      lpc.last_message_at,
      COALESCE(uc.unread_count, 0) AS unread_count
    FROM last_per_contact lpc
    JOIN contacts c ON c.id = lpc.contact_id AND c.tenant_id = ${auth.tenantId}
    LEFT JOIN unread_counts uc ON uc.contact_id = lpc.contact_id
    WHERE 1=1 ${searchCond}
    ORDER BY lpc.last_message_at DESC
    LIMIT 200
  `);

  const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? [];
  return (rows as { contact_id: string; contact_name: string; last_message: string; last_message_at: Date; unread_count: number }[]).map((r) => ({
    contactId: r.contact_id,
    contactName: r.contact_name,
    lastMessage: r.last_message,
    lastMessageAt: new Date(r.last_message_at),
    unreadCount: r.unread_count,
    unread: r.unread_count > 0,
  }));
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
  const messageId = row?.id ?? null;

  if (messageId && senderType === "client") {
    notifyAdvisorNewMessage(auth.tenantId, contactId, "", trimmed.slice(0, 200)).catch(() => {});
  }
  if (messageId && senderType === "advisor") {
    const { createPortalNotification } = await import("./portal-notifications");
    createPortalNotification({
      tenantId: auth.tenantId,
      contactId,
      type: "new_message",
      title: "Nová zpráva od poradce",
      body: trimmed.slice(0, 200),
      relatedEntityType: "message",
      relatedEntityId: messageId,
    }).catch(() => {});
  }
  return messageId;
}

const ATTACHMENT_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

/**
 * Send a message with optional file attachments (FormData with "body" and optional "file" / "files").
 * Used by portal messages page. Inserts message, uploads files to storage, inserts message_attachments.
 */
export async function sendMessageWithAttachments(contactId: string, formData: FormData): Promise<string | null> {
  const auth = await requireAuthInAction();
  const body = (formData.get("body") as string)?.trim() ?? "";
  if (!body) throw new Error("Prázdná zpráva");

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
      body,
    })
    .returning({ id: messages.id });
  const messageId = row?.id ?? null;
  if (!messageId) return null;

  const files = (formData.getAll("file") as File[]).concat(formData.getAll("files") as File[]).filter((f) => f?.size);
  const admin = createAdminClient();
  const bucket = "documents";

  for (const file of files) {
    if (file.size > ATTACHMENT_MAX_SIZE) continue;
    if (ATTACHMENT_TYPES.length && !ATTACHMENT_TYPES.includes(file.type)) continue;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${auth.tenantId}/messages/${messageId}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await admin.storage.from(bucket).upload(path, file, { upsert: false });
    if (uploadError) continue;
    await db.insert(messageAttachments).values({
      messageId,
      storagePath: path,
      fileName: file.name,
      mimeType: file.type || null,
      sizeBytes: file.size,
    });
  }

  if (senderType === "client") {
    const contactName = ""; // resolved in notifyAdvisorNewMessage if needed
    notifyAdvisorNewMessage(auth.tenantId, contactId, contactName, body.slice(0, 200)).catch(() => {});
  }
  if (senderType === "advisor") {
    const { createPortalNotification } = await import("./portal-notifications");
    createPortalNotification({
      tenantId: auth.tenantId,
      contactId,
      type: "new_message",
      title: "Nová zpráva od poradce",
      body: body.slice(0, 200),
      relatedEntityType: "message",
      relatedEntityId: messageId,
    }).catch(() => {});
  }
  return messageId;
}

export async function notifyAdvisorNewMessage(
  tenantId: string,
  contactId: string,
  contactName: string,
  bodyPreview: string
): Promise<void> {
  let displayName = contactName?.trim() || "";
  if (!displayName) {
    const [c] = await db
      .select({ firstName: contacts.firstName, lastName: contacts.lastName })
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)))
      .limit(1);
    displayName = c ? [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || "Klient" : "Klient";
  }
  const [tenant] = await db.select({ notificationEmail: tenants.notificationEmail }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const email = tenant?.notificationEmail?.trim();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://advisorcrm-web.vercel.app";
  const messagesUrl = `${baseUrl}/portal/messages?contact=${contactId}`;
  const { subject, html } = newMessageAdvisorTemplate({
    contactName: displayName,
    bodyPreview: bodyPreview || "(bez textu)",
    messagesUrl,
  });

  if (email) {
    const result = await sendEmail({ to: email, subject, html });
    await logNotification({
      tenantId,
      contactId,
      template: "new_message_advisor",
      subject,
      recipient: email,
      status: result.ok ? "sent" : (result.error ?? "failed"),
    });
  } else {
    await logNotification({
      tenantId,
      contactId,
      template: "new_message_advisor",
      subject,
      recipient: "",
      status: "skipped_no_email",
    });
  }
}

export type MessageAttachmentRow = {
  id: string;
  messageId: string;
  storagePath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

export async function getMessageAttachments(messageId: string): Promise<MessageAttachmentRow[]> {
  const auth = await requireAuthInAction();
  const [msg] = await db
    .select({ id: messages.id, tenantId: messages.tenantId, contactId: messages.contactId })
    .from(messages)
    .where(and(eq(messages.tenantId, auth.tenantId), eq(messages.id, messageId)))
    .limit(1);
  if (!msg) return [];
  if (auth.roleName === "Client" && auth.contactId !== msg.contactId) return [];

  const rows = await db
    .select({
      id: messageAttachments.id,
      messageId: messageAttachments.messageId,
      storagePath: messageAttachments.storagePath,
      fileName: messageAttachments.fileName,
      mimeType: messageAttachments.mimeType,
      sizeBytes: messageAttachments.sizeBytes,
    })
    .from(messageAttachments)
    .where(eq(messageAttachments.messageId, messageId));
  return rows;
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

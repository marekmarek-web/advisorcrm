"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import {
  db,
  messages,
  messageAttachments,
  tenants,
  contacts,
  opportunities,
  opportunityStages,
  tasks,
  advisorMaterialRequests,
  eq,
  and,
  asc,
  desc,
  isNull,
  isNotNull,
  lt,
  sql,
} from "db";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail, logNotification } from "@/lib/email/send-email";
import { newMessageAdvisorTemplate } from "@/lib/email/templates";

/** Kratší první řádka + samostatná cesta kvůli zalamování v úzkém panelu (overflow-hidden). */
const PORTAL_MESSAGES_SCHEMA_HINT =
  "Supabase → SQL Editor: spusťte soubor portal_messages_tables.sql (vytvoří tabulky messages a message_attachments).\nCesta v repu Aidvisora: packages/db/migrations/portal_messages_tables.sql\nPoté obnovte stránku.";

function isNextRedirectError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { digest?: string }).digest === "NEXT_REDIRECT";
}

/** Drizzle + postgres.js vrací buď pole řádků, nebo objekt s .rows (.native v některých režimech). */
function sqlExecuteRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows: unknown }).rows;
    if (Array.isArray(rows)) return rows as Record<string, unknown>[];
  }
  return [];
}

function formatClientVisibleDbError(e: unknown): string {
  if (e instanceof Error && e.message === "Forbidden") {
    return "K této konverzaci nemáte přístup.";
  }
  const raw = (e instanceof Error ? e.message : String(e)).trim();
  const lower = raw.toLowerCase();

  if (
    (lower.includes("relation") || lower.includes("42p01")) &&
    (lower.includes("messages") || lower.includes("message_attachments")) &&
    (lower.includes("does not exist") || lower.includes("neexistuje"))
  ) {
    return `Chybí tabulky pro zprávy v databázi. ${PORTAL_MESSAGES_SCHEMA_HINT}`;
  }

  if (lower.includes("permission denied") || lower.includes("42501") || lower.includes("insufficient_privilege")) {
    return `Databáze nepovolila přístup k zprávám (často RLS na tabulce messages bez politik, nebo špatná role připojení). V Supabase znovu spusťte celý soubor portal_messages_tables.sql — obsahuje DISABLE ROW LEVEL SECURITY. Ověřte také, že Vercel DATABASE_URL míří na stejný Supabase projekt.
${PORTAL_MESSAGES_SCHEMA_HINT}`;
  }

  if (lower.includes("42703") || (lower.includes("column") && lower.includes("does not exist"))) {
    return `Schéma tabulky messages neodpovídá aplikaci (chybějící sloupec). V Supabase spusťte znovu portal_messages_tables.sql (ALTER … ADD COLUMN IF NOT EXISTS).
${PORTAL_MESSAGES_SCHEMA_HINT}`;
  }

  if (
    process.env.NODE_ENV === "production" &&
    (/\bserver components\b/i.test(raw) ||
      raw.includes("omitted in production") ||
      raw.includes("digest property"))
  ) {
    return `Načtení zpráv na serveru selhalo. ${PORTAL_MESSAGES_SCHEMA_HINT}`;
  }

  return raw || "Nepodařilo se dokončit operaci se zprávami.";
}

export type MessageRow = {
  id: string;
  senderType: string;
  senderId: string;
  body: string;
  /** ISO 8601 nebo null — serializace přes server actions. */
  readAt: string | null;
  /** ISO 8601 — serializace přes server actions. */
  createdAt: string;
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
  return rows.map((r) => ({
    id: r.id,
    senderType: r.senderType,
    senderId: r.senderId,
    body: r.body,
    readAt: r.readAt ? r.readAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export type ThreadMessagesLoadResult =
  | { ok: true; messages: MessageRow[] }
  | { ok: false; error: string };

/** Stejné jako getMessages, ale nikdy nehází kvůli DB — vhodné pro volání z klienta (žádný HTTP 500 při chybějící tabulce). */
export async function loadThreadMessages(contactId: string): Promise<ThreadMessagesLoadResult> {
  try {
    const rows = await getMessages(contactId);
    return { ok: true, messages: rows };
  } catch (e) {
    if (isNextRedirectError(e)) throw e;
    return { ok: false, error: formatClientVisibleDbError(e) };
  }
}

/** Returns number of distinct contacts that have at least one unread message from client. For sidebar badge. */
export async function getUnreadConversationsCount(): Promise<number> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client") return 0;
  if (!hasPermission(auth.roleName, "contacts:read")) return 0;

  try {
    const result = await db.execute(sql`
      SELECT COUNT(DISTINCT m.contact_id)::int AS cnt
      FROM messages m
      WHERE m.tenant_id = ${auth.tenantId}
        AND m.sender_type = 'client'
        AND m.read_at IS NULL
    `);
    const rows = sqlExecuteRows(result);
    const row = rows[0] as { cnt?: unknown } | undefined;
    return Number(row?.cnt ?? 0);
  } catch {
    return 0;
  }
}

/** Client-only badge: unread advisor messages in own thread. */
export async function getUnreadAdvisorMessagesForClientCount(): Promise<number> {
  const auth = await requireAuthInAction();
  if (auth.roleName !== "Client" || !auth.contactId) return 0;

  try {
    const result = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM messages m
      WHERE m.tenant_id = ${auth.tenantId}
        AND m.contact_id = ${auth.contactId}
        AND m.sender_type = 'advisor'
        AND m.read_at IS NULL
    `);
    const rows = sqlExecuteRows(result);
    const row = rows[0] as { cnt?: unknown } | undefined;
    return Number(row?.cnt ?? 0);
  } catch {
    return 0;
  }
}

export type ConversationListItem = {
  contactId: string;
  contactName: string;
  lastMessage: string;
  /** ISO 8601 (UTC) — server actions musí vracet čistě JSON; Date způsobilo pád / generickou chybu v produkci. */
  lastMessageAt: string;
  unreadCount: number;
  unread: boolean;
};

export type ConversationsListResult =
  | { ok: true; list: ConversationListItem[] }
  | { ok: false; error: string };

/**
 * Seznam konverzací — při chybě DB vrací `{ ok: false, error }` místo výjimky,
 * aby Next nevracel HTTP 500 a klient mohl zobrazit návod na migraci.
 */
export async function getConversationsList(search?: string): Promise<ConversationsListResult> {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:read")) return { ok: true, list: [] };

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

    const rows = sqlExecuteRows(result);
    const list: ConversationListItem[] = rows.map((r) => {
      const unreadCount = Number(r.unread_count ?? 0);
      const at = r.last_message_at;
      const d = at instanceof Date ? at : new Date(at as string | number);
      const safe = Number.isFinite(d.getTime()) ? d : new Date();
      return {
        contactId: String(r.contact_id ?? ""),
        contactName: (String(r.contact_name ?? "").trim() || "Kontakt").trim(),
        lastMessage: String(r.last_message ?? ""),
        lastMessageAt: safe.toISOString(),
        unreadCount,
        unread: unreadCount > 0,
      };
    });
    return { ok: true, list };
  } catch (e) {
    if (isNextRedirectError(e)) throw e;
    console.error("[getConversationsList]", e);
    return { ok: false, error: formatClientVisibleDbError(e) };
  }
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

export type PortalSendMessageResult =
  | { ok: true; messageId: string | null }
  | { ok: false; error: string };

/** Odeslání z chatu portálu bez výjimky při chybě → klient nedostane HTTP 500 z action. */
export async function sendPortalMessage(contactId: string, body: string): Promise<PortalSendMessageResult> {
  try {
    const messageId = await sendMessage(contactId, body);
    return { ok: true, messageId };
  } catch (e) {
    if (isNextRedirectError(e)) throw e;
    return { ok: false, error: formatClientVisibleDbError(e) };
  }
}

export async function sendPortalMessageWithAttachments(
  contactId: string,
  formData: FormData
): Promise<PortalSendMessageResult> {
  try {
    const messageId = await sendMessageWithAttachments(contactId, formData);
    return { ok: true, messageId };
  } catch (e) {
    if (isNextRedirectError(e)) throw e;
    return { ok: false, error: formatClientVisibleDbError(e) };
  }
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
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://www.aidvisora.cz");
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
  /** ISO 8601 — serializace přes server actions. */
  lastMessageAt: string;
  senderType: string;
  unread: boolean;
};

export async function getRecentConversations(limit = 5): Promise<RecentConversation[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) return [];

  try {
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

    const rows = sqlExecuteRows(result);
    return rows.map((r) => {
      const at = r.last_message_at;
      const d = at instanceof Date ? at : new Date(at as string | number);
      const safe = Number.isFinite(d.getTime()) ? d : new Date();
      return {
        contactId: String(r.contact_id ?? ""),
        contactName: String(r.contact_name ?? "").trim() || "Kontakt",
        lastMessage: String(r.last_message ?? ""),
        lastMessageAt: safe.toISOString(),
        senderType: String(r.sender_type ?? ""),
        unread: Boolean(r.unread),
      };
    });
  } catch {
    return [];
  }
}

/** Smaže jednu zprávu v tenantu (přílohy cascade). Pouze poradce s contacts:write. */
export async function deleteMessageForAdvisor(messageId: string): Promise<void> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client") throw new Error("Forbidden");
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

  const [row] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.tenantId, auth.tenantId), eq(messages.id, messageId)))
    .limit(1);
  if (!row) throw new Error("Zpráva nebyla nalezena.");

  await db
    .delete(messages)
    .where(and(eq(messages.tenantId, auth.tenantId), eq(messages.id, messageId)));
}

/** Smaže všechny zprávy v konverzaci s kontaktem (včetně příloh — cascade). Pouze poradce s contacts:write. */
export async function deleteConversationForContact(contactId: string): Promise<void> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client") throw new Error("Forbidden");
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

  await db
    .delete(messages)
    .where(and(eq(messages.tenantId, auth.tenantId), eq(messages.contactId, contactId)));
}

export type ChatContextPrimaryOpportunity = {
  id: string;
  title: string;
  caseType: string;
  stageName: string;
};

/** Agregace pro pravý panel chatu (obchody, úkoly, podklady) — tenant + oprávnění v dotazech. */
export type ChatContextPanelSnapshot = {
  primaryOpportunity: ChatContextPrimaryOpportunity | null;
  openOpportunitiesCount: number;
  openTasksCount: number;
  overdueTasksCount: number;
  pendingMaterialRequestsCount: number;
  /** Zda uživatel smí číst modul obchodů (jinak jsou počty 0 a nezobrazujeme „žádný obchod“). */
  opportunitiesReadable: boolean;
};

const EMPTY_CHAT_CONTEXT_SNAPSHOT: ChatContextPanelSnapshot = {
  primaryOpportunity: null,
  openOpportunitiesCount: 0,
  openTasksCount: 0,
  overdueTasksCount: 0,
  pendingMaterialRequestsCount: 0,
  opportunitiesReadable: false,
};

export async function getChatContextPanelSnapshot(contactId: string): Promise<ChatContextPanelSnapshot> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");

  const [c] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, contactId)))
    .limit(1);
  if (!c) throw new Error("Kontakt nenalezen.");

  const today = new Date().toISOString().slice(0, 10);
  const canOpp = hasPermission(auth.roleName, "opportunities:read");

  try {
    const [oppRows, oppCountRow, tasksOpenRow, tasksOverRow, matRow] = await Promise.all([
      canOpp
        ? db
            .select({
              id: opportunities.id,
              title: opportunities.title,
              caseType: opportunities.caseType,
              stageName: opportunityStages.name,
              updatedAt: opportunities.updatedAt,
            })
            .from(opportunities)
            .innerJoin(opportunityStages, eq(opportunities.stageId, opportunityStages.id))
            .where(
              and(
                eq(opportunities.tenantId, auth.tenantId),
                eq(opportunities.contactId, contactId),
                isNull(opportunities.closedAt),
              ),
            )
            .orderBy(desc(opportunities.updatedAt))
        : Promise.resolve([] as { id: string; title: string; caseType: string | null; stageName: string; updatedAt: Date }[]),
      canOpp
        ? db
            .select({ cnt: sql<number>`count(*)::int` })
            .from(opportunities)
            .where(
              and(
                eq(opportunities.tenantId, auth.tenantId),
                eq(opportunities.contactId, contactId),
                isNull(opportunities.closedAt),
              ),
            )
        : Promise.resolve([{ cnt: 0 }]),
      db
        .select({ cnt: sql<number>`count(*)::int` })
        .from(tasks)
        .where(
          and(eq(tasks.tenantId, auth.tenantId), eq(tasks.contactId, contactId), isNull(tasks.completedAt)),
        ),
      db
        .select({ cnt: sql<number>`count(*)::int` })
        .from(tasks)
        .where(
          and(
            eq(tasks.tenantId, auth.tenantId),
            eq(tasks.contactId, contactId),
            isNull(tasks.completedAt),
            isNotNull(tasks.dueDate),
            lt(tasks.dueDate, today),
          ),
        ),
      db
        .select({ cnt: sql<number>`count(*)::int` })
        .from(advisorMaterialRequests)
        .where(
          and(
            eq(advisorMaterialRequests.tenantId, auth.tenantId),
            eq(advisorMaterialRequests.contactId, contactId),
            sql`${advisorMaterialRequests.status} NOT IN ('done', 'closed')`,
          ),
        ),
    ]);

    const primary = oppRows[0];
    return {
      primaryOpportunity: primary
        ? {
            id: primary.id,
            title: primary.title,
            caseType: primary.caseType?.trim() || "",
            stageName: primary.stageName,
          }
        : null,
      openOpportunitiesCount: Number(oppCountRow[0]?.cnt ?? 0),
      openTasksCount: Number(tasksOpenRow[0]?.cnt ?? 0),
      overdueTasksCount: Number(tasksOverRow[0]?.cnt ?? 0),
      pendingMaterialRequestsCount: Number(matRow[0]?.cnt ?? 0),
      opportunitiesReadable: canOpp,
    };
  } catch {
    return EMPTY_CHAT_CONTEXT_SNAPSHOT;
  }
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

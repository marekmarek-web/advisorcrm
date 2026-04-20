"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { withAuthContext, withTenantContextFromAuth } from "@/lib/auth/with-auth-context";
import { getMembership } from "@/lib/auth/get-membership";
import { hasPermission } from "@/lib/auth/permissions";
import type { RoleName } from "@/shared/rolePermissions";
import { tasks, contacts, opportunities, meetingNotes, eq, and, asc, desc, isNull, isNotNull, gte, lt, lte, sql } from "db";
import { logActivity } from "./activity";
import { formatDisplayDateCs } from "@/lib/date/format-display-cs";
import { defaultTaskDueDateYmd, normalizeIsoDateOnly } from "@/lib/date/date-only";

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  contactId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  opportunityId: string | null;
  opportunityTitle: string | null;
  dueDate: string | null;
  completedAt: Date | null;
  createdAt: Date;
};

export type TaskCounts = {
  all: number;
  today: number;
  week: number;
  overdue: number;
  completed: number;
};

export type TasksScope = "mine" | "team";

/** Resolve an effective scope for the current user. "team" requires team_overview:read; otherwise we fall back to "mine". */
function resolveTasksScope(
  auth: { roleName: RoleName },
  requested: TasksScope | undefined,
): TasksScope {
  if (requested === "team" && hasPermission(auth.roleName, "team_overview:read")) return "team";
  return "mine";
}

export async function getTasksList(
  filter?: "all" | "overdue" | "today" | "week" | "completed",
  scope?: TasksScope,
): Promise<TaskRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const effectiveScope = resolveTasksScope(auth, scope);

  const conditions: ReturnType<typeof eq>[] = [eq(tasks.tenantId, auth.tenantId)];
  if (effectiveScope === "mine") {
    conditions.push(eq(tasks.assignedTo, auth.userId));
  }
  const today = new Date().toISOString().slice(0, 10);

  switch (filter) {
    case "completed":
      conditions.push(isNotNull(tasks.completedAt));
      break;
    case "overdue":
      conditions.push(isNull(tasks.completedAt));
      conditions.push(lt(tasks.dueDate, today));
      break;
    case "today":
      conditions.push(isNull(tasks.completedAt));
      conditions.push(eq(tasks.dueDate, today));
      break;
    case "week": {
      conditions.push(isNull(tasks.completedAt));
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() + 7);
      conditions.push(gte(tasks.dueDate, today));
      conditions.push(lte(tasks.dueDate, weekEnd.toISOString().slice(0, 10)));
      break;
    }
    default:
      conditions.push(isNull(tasks.completedAt));
      break;
  }

  const rows = await withTenantContextFromAuth(auth, (tx) =>
    tx
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        contactId: tasks.contactId,
        opportunityId: tasks.opportunityId,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
        createdAt: tasks.createdAt,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactPhone: contacts.phone,
        contactEmail: contacts.email,
        opportunityTitle: opportunities.title,
      })
      .from(tasks)
      .leftJoin(contacts, eq(tasks.contactId, contacts.id))
      .leftJoin(opportunities, eq(tasks.opportunityId, opportunities.id))
      .where(and(...conditions))
      .orderBy(
        filter === "completed" ? desc(tasks.completedAt) : asc(tasks.dueDate),
        asc(tasks.createdAt)
      ),
  );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    contactId: r.contactId,
    contactName:
      r.contactFirstName && r.contactLastName
        ? `${r.contactFirstName} ${r.contactLastName}`
        : r.contactFirstName || r.contactLastName || null,
    contactPhone: r.contactPhone ?? null,
    contactEmail: r.contactEmail ?? null,
    opportunityId: r.opportunityId ?? null,
    opportunityTitle: r.opportunityTitle ?? null,
    dueDate: normalizeIsoDateOnly(r.dueDate),
    completedAt: r.completedAt,
    createdAt: r.createdAt,
  }));
}

/** Count of open (incomplete) tasks assigned to the current user (defaults to "mine" for sidebar badge). */
export async function getOpenTasksCount(scope?: TasksScope): Promise<number> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) return 0;
  const effectiveScope = resolveTasksScope(auth, scope);
  const scopeCondition =
    effectiveScope === "mine" ? [eq(tasks.assignedTo, auth.userId)] : [];
  const rows = await withTenantContextFromAuth(auth, (tx) =>
    tx
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(eq(tasks.tenantId, auth.tenantId), isNull(tasks.completedAt), ...scopeCondition),
      ),
  );
  return Number(rows[0]?.count ?? 0);
}

export async function getTasksCounts(scope?: TasksScope): Promise<TaskCounts> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) return { all: 0, today: 0, week: 0, overdue: 0, completed: 0 };
  const effectiveScope = resolveTasksScope(auth, scope);

  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  const scopeCondition =
    effectiveScope === "mine" ? [eq(tasks.assignedTo, auth.userId)] : [];

  const rows = await withTenantContextFromAuth(auth, (tx) =>
    tx
      .select({
        all: sql<number>`count(*) filter (where ${tasks.completedAt} is null)::int`,
        today: sql<number>`count(*) filter (where ${tasks.completedAt} is null and ${tasks.dueDate} = ${today})::int`,
        week: sql<number>`count(*) filter (where ${tasks.completedAt} is null and ${tasks.dueDate} >= ${today} and ${tasks.dueDate} <= ${weekEndStr})::int`,
        overdue: sql<number>`count(*) filter (where ${tasks.completedAt} is null and ${tasks.dueDate} < ${today})::int`,
        completed: sql<number>`count(*) filter (where ${tasks.completedAt} is not null)::int`,
      })
      .from(tasks)
      .where(and(eq(tasks.tenantId, auth.tenantId), ...scopeCondition)),
  );

  const r = rows[0];
  return {
    all: Number(r?.all ?? 0),
    today: Number(r?.today ?? 0),
    week: Number(r?.week ?? 0),
    overdue: Number(r?.overdue ?? 0),
    completed: Number(r?.completed ?? 0),
  };
}

export async function getTasksForDate(dateStr: string, scope?: TasksScope): Promise<TaskRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const effectiveScope = resolveTasksScope(auth, scope);
  const conditions: ReturnType<typeof eq>[] = [
    eq(tasks.tenantId, auth.tenantId),
    eq(tasks.dueDate, dateStr),
  ];
  if (effectiveScope === "mine") {
    conditions.push(eq(tasks.assignedTo, auth.userId));
  }
  const rows = await withTenantContextFromAuth(auth, (tx) =>
    tx
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        contactId: tasks.contactId,
        opportunityId: tasks.opportunityId,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
        createdAt: tasks.createdAt,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactPhone: contacts.phone,
        contactEmail: contacts.email,
        opportunityTitle: opportunities.title,
      })
      .from(tasks)
      .leftJoin(contacts, eq(tasks.contactId, contacts.id))
      .leftJoin(opportunities, eq(tasks.opportunityId, opportunities.id))
      .where(and(...conditions))
      .orderBy(asc(tasks.createdAt)),
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    contactId: r.contactId,
    contactName: r.contactFirstName && r.contactLastName ? `${r.contactFirstName} ${r.contactLastName}` : r.contactFirstName || r.contactLastName || null,
    contactPhone: r.contactPhone ?? null,
    contactEmail: r.contactEmail ?? null,
    opportunityId: r.opportunityId ?? null,
    opportunityTitle: r.opportunityTitle ?? null,
    dueDate: normalizeIsoDateOnly(r.dueDate),
    completedAt: r.completedAt,
    createdAt: r.createdAt,
  }));
}

export async function getTasksByContactId(contactId: string): Promise<TaskRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const rows = await withTenantContextFromAuth(auth, (tx) =>
    tx
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        contactId: tasks.contactId,
        opportunityId: tasks.opportunityId,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
        createdAt: tasks.createdAt,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactPhone: contacts.phone,
        contactEmail: contacts.email,
        opportunityTitle: opportunities.title,
      })
      .from(tasks)
      .leftJoin(contacts, eq(tasks.contactId, contacts.id))
      .leftJoin(opportunities, eq(tasks.opportunityId, opportunities.id))
      .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.contactId, contactId)))
      .orderBy(asc(tasks.dueDate), asc(tasks.createdAt)),
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    contactId: r.contactId,
    contactName: r.contactFirstName && r.contactLastName ? `${r.contactFirstName} ${r.contactLastName}` : r.contactFirstName || r.contactLastName || null,
    contactPhone: r.contactPhone ?? null,
    contactEmail: r.contactEmail ?? null,
    opportunityId: r.opportunityId ?? null,
    opportunityTitle: r.opportunityTitle ?? null,
    dueDate: normalizeIsoDateOnly(r.dueDate),
    completedAt: r.completedAt,
    createdAt: r.createdAt,
  }));
}

export async function getTasksByOpportunityId(oppId: string): Promise<TaskRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const rows = await withTenantContextFromAuth(auth, (tx) =>
    tx
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        contactId: tasks.contactId,
        opportunityId: tasks.opportunityId,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
        createdAt: tasks.createdAt,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactPhone: contacts.phone,
        contactEmail: contacts.email,
        opportunityTitle: opportunities.title,
      })
      .from(tasks)
      .leftJoin(contacts, eq(tasks.contactId, contacts.id))
      .leftJoin(opportunities, eq(tasks.opportunityId, opportunities.id))
      .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.opportunityId, oppId)))
      .orderBy(asc(tasks.dueDate), asc(tasks.createdAt)),
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    contactId: r.contactId,
    contactName: r.contactFirstName && r.contactLastName ? `${r.contactFirstName} ${r.contactLastName}` : r.contactFirstName || r.contactLastName || null,
    contactPhone: r.contactPhone ?? null,
    contactEmail: r.contactEmail ?? null,
    opportunityId: r.opportunityId ?? null,
    opportunityTitle: r.opportunityTitle ?? null,
    dueDate: normalizeIsoDateOnly(r.dueDate),
    completedAt: r.completedAt,
    createdAt: r.createdAt,
  }));
}

export async function createTask(data: {
  title: string;
  description?: string;
  contactId?: string;
  dueDate?: string;
  analysisId?: string;
  opportunityId?: string;
  /** For team/manager follow-ups: assign to this user (must be in same tenant; requires team_overview:read). */
  assignedTo?: string;
}): Promise<string | null> {
  try {
    const auth = await requireAuthInAction();
    const canWrite =
      hasPermission(auth.roleName, "contacts:write") || hasPermission(auth.roleName, "tasks:*");
    if (!canWrite) throw new Error("Nemáte oprávnění k vytváření úkolů.");

    let assignee = auth.userId;
    if (data.assignedTo) {
      if (!hasPermission(auth.roleName, "team_overview:read")) throw new Error("Forbidden");
      const member = await getMembership(data.assignedTo);
      if (!member || member.tenantId !== auth.tenantId) throw new Error("Forbidden");
      assignee = data.assignedTo;
    }

    const dueTrimmed = data.dueDate?.trim() ?? "";
    const dueDateResolved = dueTrimmed.length > 0 ? dueTrimmed : defaultTaskDueDateYmd();

    const [row] = await withTenantContextFromAuth(auth, (tx) =>
      tx
        .insert(tasks)
        .values({
          tenantId: auth.tenantId,
          title: data.title.trim(),
          description: data.description?.trim() || null,
          contactId: data.contactId || null,
          dueDate: dueDateResolved,
          analysisId: data.analysisId || null,
          opportunityId: data.opportunityId || null,
          assignedTo: assignee,
          createdBy: auth.userId,
        })
        .returning({ id: tasks.id }),
    );
    const newId = row?.id ?? null;
    if (newId) {
      try {
        await logActivity("task", newId, "create", { title: data.title, contactId: data.contactId });
      } catch {}
    }
    return newId;
  } catch (e) {
    console.error("[createTask]", e);
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Forbidden") || msg.includes("oprávnění")) throw e;
    if (msg.includes("foreign key") || msg.includes("violates foreign key")) {
      throw new Error("Vybraný klient není platný nebo neexistuje. Zkuste vybrat jiného nebo nechat pole prázdné.");
    }
    throw new Error(msg || "Úkol se nepodařilo vytvořit. Zkuste to znovu.");
  }
}

export async function updateTask(
  id: string,
  data: {
    title?: string;
    description?: string;
    contactId?: string;
    dueDate?: string;
    opportunityId?: string;
  }
): Promise<void> {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

    await withTenantContextFromAuth(auth, (tx) =>
      tx
        .update(tasks)
        .set({
          ...(data.title != null && { title: data.title.trim() }),
          ...(data.description != null && { description: data.description.trim() || null }),
          ...(data.contactId != null && { contactId: data.contactId || null }),
          ...(data.dueDate != null && { dueDate: data.dueDate || null }),
          ...(data.opportunityId != null && { opportunityId: data.opportunityId || null }),
          updatedAt: new Date(),
        })
        .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.id, id))),
    );
  } catch (e) {
    console.error("[updateTask]", e);
    throw new Error(e instanceof Error ? e.message : "Úkol se nepodařilo upravit.");
  }
}

export async function deleteTask(id: string): Promise<void> {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

    await withTenantContextFromAuth(auth, (tx) =>
      tx.delete(tasks).where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.id, id))),
    );
    try { await logActivity("task", id, "delete"); } catch {}
  } catch (e) {
    console.error("[deleteTask]", e);
    throw new Error(e instanceof Error ? e.message : "Úkol se nepodařilo smazat.");
  }
}

export async function completeTask(id: string): Promise<void> {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

    await withTenantContextFromAuth(auth, (tx) =>
      tx
        .update(tasks)
        .set({ completedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.id, id))),
    );
    try { await logActivity("task", id, "complete"); } catch {}
  } catch (e) {
    console.error("[completeTask]", e);
    throw new Error(e instanceof Error ? e.message : "Úkol se nepodařilo dokončit.");
  }
}

export async function reopenTask(id: string): Promise<void> {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

    await withTenantContextFromAuth(auth, (tx) =>
      tx
        .update(tasks)
        .set({ completedAt: null, updatedAt: new Date() })
        .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.id, id))),
    );
  } catch (e) {
    console.error("[reopenTask]", e);
    throw new Error(e instanceof Error ? e.message : "Úkol se nepodařilo znovu otevřít.");
  }
}

function isForeignKeyError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return msg.includes("foreign key") || msg.includes("violates foreign key");
}

/** Přenese úkol do Zápisků (meeting_note) a smaže úkol — atomicky v transakci. */
export async function moveTaskToNotesBoard(taskId: string): Promise<{ noteId: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) {
    throw new Error("Nemáte oprávnění k úpravě úkolů.");
  }
  if (!hasPermission(auth.roleName, "meeting_notes:write")) {
    throw new Error("Nemáte oprávnění k vytváření zápisků.");
  }

  const taskRows = await withTenantContextFromAuth(auth, (tx) =>
    tx
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        contactId: tasks.contactId,
        opportunityId: tasks.opportunityId,
        dueDate: tasks.dueDate,
      })
      .from(tasks)
      .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.id, taskId)))
      .limit(1),
  );

  const task = taskRows[0];
  if (!task) {
    throw new Error("Úkol nebyl nalezen.");
  }

  const meetingAt = new Date();
  const domain = "komplex";
  const desc = task.description?.trim() ?? "";
  const obsahLines = ["Přeneseno z úkolu (interní evidencia v CRM)."];
  if (desc) obsahLines.push(desc);
  const obsah = obsahLines.join("\n\n");
  const dueStr = task.dueDate ? String(task.dueDate) : "";
  const dueDisplay = dueStr ? formatDisplayDateCs(dueStr) || dueStr : "";
  const dalsi_kroky = dueDisplay ? `Termín z úkolu: ${dueDisplay}` : "";

  const content: Record<string, unknown> = {
    title: task.title.trim(),
    obsah,
    ...(dalsi_kroky ? { dalsi_kroky } : {}),
  };

  const attempts: { contactId: string | null; opportunityId: string | null }[] = [];
  const seen = new Set<string>();
  const addAttempt = (contactId: string | null, opportunityId: string | null) => {
    const k = `${contactId ?? ""}::${opportunityId ?? ""}`;
    if (seen.has(k)) return;
    seen.add(k);
    attempts.push({ contactId, opportunityId });
  };
  addAttempt(task.contactId, task.opportunityId);
  addAttempt(null, task.opportunityId);
  addAttempt(null, null);

  let lastError: unknown = null;
  for (const { contactId, opportunityId } of attempts) {
    try {
      const noteId = await withTenantContextFromAuth(auth, async (tx) => {
        const [row] = await tx
          .insert(meetingNotes)
          .values({
            tenantId: auth.tenantId,
            contactId,
            opportunityId,
            templateId: null,
            meetingAt,
            domain,
            content,
            createdBy: auth.userId,
          })
          .returning({ id: meetingNotes.id });

        const newNoteId = row?.id;
        if (!newNoteId) throw new Error("Nepodařilo se vytvořit zápisek.");

        await tx
          .delete(tasks)
          .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.id, taskId)));

        return newNoteId;
      });

      try {
        await logActivity("meeting_note", noteId, "create_from_task", { taskId, title: task.title });
      } catch {
        /* ignore */
      }
      try {
        await logActivity("task", taskId, "move_to_notes", { noteId });
      } catch {
        /* ignore */
      }

      return { noteId };
    } catch (e) {
      lastError = e;
      if (isForeignKeyError(e)) continue;
      console.error("[moveTaskToNotesBoard]", e);
      throw new Error(
        e instanceof Error ? e.message : "Přenos úkolu do zápisků se nezdařil. Zkuste to znovu.",
      );
    }
  }

  console.error("[moveTaskToNotesBoard] exhausted FK retries", lastError);
  throw new Error(
    "Nepodařilo se uložit zápisek (odkaz na klienta nebo obchod není platný). Zkuste úkol upravit a opakovat akci.",
  );
}

"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { db } from "db";
import { boardViews, boardItems } from "db";
import { contacts } from "db";
import { eq, and, asc } from "db";
import type { Column, Group } from "@/app/components/monday/types";

export type BoardViewRow = {
  id: string;
  name: string;
  columnsConfig: Column[] | null;
  groupsConfig: Array<{ id: string; name: string; color: string; collapsed: boolean }> | null;
  groupBy: string | null;
  filters: Record<string, unknown> | null;
};

export type BoardItemRow = {
  id: string;
  groupId: string;
  name: string;
  cells: Record<string, string | number>;
  contactId: string | null;
  contactName: string | null;
  sortOrder: number;
};

const DEFAULT_COLUMNS: Column[] = [
  { id: "item", title: "Jméno klienta", type: "item", width: 220, hidden: false },
  { id: "firma", title: "Firma", type: "text", width: 120, hidden: false },
  { id: "zp", title: "ZP", type: "status", width: 100, hidden: false },
  { id: "investice_j", title: "Investice J", type: "status", width: 100, hidden: false },
  { id: "investice_p", title: "Investice P", type: "status", width: 100, hidden: false },
  { id: "uver", title: "Úvěr/Kons..", type: "status", width: 100, hidden: false },
  { id: "dps", title: "DPS", type: "status", width: 80, hidden: false },
  { id: "pov", title: "POV", type: "status", width: 80, hidden: false },
  { id: "nem_dom", title: "NEM-DOM", type: "status", width: 90, hidden: false },
];

const DEFAULT_GROUPS = [
  { id: "g1", name: "Nové", color: "#579bfc", collapsed: false },
  { id: "g2", name: "Rozpracované", color: "#00c875", collapsed: false },
];

export async function listBoardViews(): Promise<{ id: string; name: string }[]> {
  const auth = await requireAuthInAction();
  const rows = await db
    .select({ id: boardViews.id, name: boardViews.name })
    .from(boardViews)
    .where(eq(boardViews.tenantId, auth.tenantId))
    .orderBy(asc(boardViews.updatedAt));
  return rows.map((r) => ({ id: r.id, name: r.name ?? "Board" }));
}

export async function createBoardView(options: {
  name: string;
  copyColumnsFromViewId?: string | null;
}): Promise<string> {
  const auth = await requireAuthInAction();
  let columnsConfig: unknown = DEFAULT_COLUMNS;
  let groupsConfig: unknown = DEFAULT_GROUPS;
  if (options.copyColumnsFromViewId) {
    const [source] = await db
      .select()
      .from(boardViews)
      .where(
        and(
          eq(boardViews.tenantId, auth.tenantId),
          eq(boardViews.id, options.copyColumnsFromViewId)
        )
      )
      .limit(1);
    if (source?.columnsConfig) columnsConfig = source.columnsConfig;
    if (source?.groupsConfig) groupsConfig = source.groupsConfig;
  }
  const [created] = await db
    .insert(boardViews)
    .values({
      tenantId: auth.tenantId,
      name: (options.name || "Nový board").trim(),
      columnsConfig: columnsConfig as Record<string, unknown>,
      groupsConfig: groupsConfig as Record<string, unknown>,
    })
    .returning({ id: boardViews.id });
  return created.id;
}

export async function getOrCreateBoardView(viewId?: string | null): Promise<{
  view: BoardViewRow;
  items: BoardItemRow[];
}> {
  const auth = await requireAuthInAction();

  if (viewId) {
    const existing = await db
      .select()
      .from(boardViews)
      .where(
        and(
          eq(boardViews.tenantId, auth.tenantId),
          eq(boardViews.id, viewId)
        )
      )
      .limit(1);
    if (existing.length > 0) {
      const view = existing[0];
      const items = await loadItemsForView(view.id);
      return {
        view: {
          id: view.id,
          name: view.name,
          columnsConfig: view.columnsConfig as Column[] | null,
          groupsConfig: view.groupsConfig as BoardViewRow["groupsConfig"],
          groupBy: view.groupBy,
          filters: view.filters as Record<string, unknown> | null,
        },
        items: items,
      };
    }
  }

  const existing = await db
    .select()
    .from(boardViews)
    .where(eq(boardViews.tenantId, auth.tenantId))
    .limit(1);

  let view: typeof existing[0];
  if (existing.length > 0) {
    view = existing[0];
  } else {
    const [created] = await db
      .insert(boardViews)
      .values({
        tenantId: auth.tenantId,
        name: "Plan rozděleno",
        columnsConfig: DEFAULT_COLUMNS as unknown as Record<string, unknown>,
        groupsConfig: DEFAULT_GROUPS as unknown as Record<string, unknown>,
      })
      .returning();
    view = created;
  }

  const items = await loadItemsForView(view.id);
  return {
    view: {
      id: view.id,
      name: view.name,
      columnsConfig: view.columnsConfig as Column[] | null,
      groupsConfig: view.groupsConfig as BoardViewRow["groupsConfig"],
      groupBy: view.groupBy,
      filters: view.filters as Record<string, unknown> | null,
    },
    items: items,
  };
}

async function loadItemsForView(viewId: string): Promise<BoardItemRow[]> {
  const auth = await requireAuthInAction();
  const items = await db
    .select({
      id: boardItems.id,
      groupId: boardItems.groupId,
      name: boardItems.name,
      cells: boardItems.cells,
      contactId: boardItems.contactId,
      sortOrder: boardItems.sortOrder,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
    })
    .from(boardItems)
    .leftJoin(contacts, eq(boardItems.contactId, contacts.id))
    .where(eq(boardItems.viewId, viewId))
    .orderBy(asc(boardItems.sortOrder));
  return items.map((i) => ({
    id: i.id,
    groupId: i.groupId,
    name: i.name,
    cells: (i.cells ?? {}) as Record<string, string | number>,
    contactId: i.contactId,
    contactName:
      i.contactFirstName != null && i.contactLastName != null
        ? `${i.contactFirstName} ${i.contactLastName}`.trim()
        : null,
    sortOrder: i.sortOrder,
  }));
}

export async function saveBoardViewConfig(
  viewId: string,
  config: {
    columnsConfig?: Column[];
    groupsConfig?: Array<{ id: string; name: string; color: string; collapsed: boolean; subtitle?: string }>;
    groupBy?: string | null;
    filters?: Record<string, unknown> | null;
  }
) {
  const auth = await requireAuthInAction();
  await db
    .update(boardViews)
    .set({
      ...(config.columnsConfig !== undefined && {
        columnsConfig: config.columnsConfig as unknown as Record<string, unknown>,
      }),
      ...(config.groupsConfig !== undefined && {
        groupsConfig: config.groupsConfig as unknown as Record<string, unknown>,
      }),
      ...(config.groupBy !== undefined && { groupBy: config.groupBy }),
      ...(config.filters !== undefined && {
        filters: config.filters as unknown as Record<string, unknown>,
      }),
      updatedAt: new Date(),
    })
    .where(and(eq(boardViews.tenantId, auth.tenantId), eq(boardViews.id, viewId)));
}

export async function updateBoardViewName(viewId: string, name: string): Promise<void> {
  const auth = await requireAuthInAction();
  await db
    .update(boardViews)
    .set({ name: name.trim() || "Default", updatedAt: new Date() })
    .where(and(eq(boardViews.tenantId, auth.tenantId), eq(boardViews.id, viewId)));
}

export async function createBoardItem(
  viewId: string,
  data: { name: string; groupId: string; cells?: Record<string, string | number> }
): Promise<string> {
  const auth = await requireAuthInAction();
  const maxOrder = await db
    .select({ sortOrder: boardItems.sortOrder })
    .from(boardItems)
    .where(eq(boardItems.viewId, viewId))
    .orderBy(asc(boardItems.sortOrder));
  const nextOrder = maxOrder.length > 0 ? Math.max(...maxOrder.map((r) => r.sortOrder)) + 1 : 0;

  const [row] = await db
    .insert(boardItems)
    .values({
      tenantId: auth.tenantId,
      viewId,
      name: data.name,
      groupId: data.groupId,
      cells: (data.cells ?? {}) as unknown as Record<string, unknown>,
      sortOrder: nextOrder,
    })
    .returning({ id: boardItems.id });
  return row.id;
}

export async function updateBoardItem(
  itemId: string,
  data: { name?: string; groupId?: string; cells?: Record<string, string | number>; contactId?: string | null }
) {
  const auth = await requireAuthInAction();
  await db
    .update(boardItems)
    .set({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.groupId !== undefined && { groupId: data.groupId }),
      ...(data.cells !== undefined && { cells: data.cells as unknown as Record<string, unknown> }),
      ...(data.contactId !== undefined && { contactId: data.contactId }),
      updatedAt: new Date(),
    })
    .where(and(eq(boardItems.tenantId, auth.tenantId), eq(boardItems.id, itemId)));
}

export async function deleteBoardItems(itemIds: string[]) {
  const auth = await requireAuthInAction();
  for (const id of itemIds) {
    await db
      .delete(boardItems)
      .where(and(eq(boardItems.tenantId, auth.tenantId), eq(boardItems.id, id)));
  }
}

export async function saveBoardItemsBatch(
  viewId: string,
  items: Array<{
    id: string;
    name: string;
    groupId: string;
    cells: Record<string, string | number>;
    sortOrder: number;
  }>
) {
  const auth = await requireAuthInAction();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  for (const item of items) {
    try {
      if (!uuidRegex.test(item.id)) {
        const [row] = await db.insert(boardItems).values({
          tenantId: auth.tenantId,
          viewId,
          name: item.name,
          groupId: item.groupId,
          cells: item.cells as unknown as Record<string, unknown>,
          sortOrder: item.sortOrder,
        }).returning({ id: boardItems.id });
        item.id = row.id;
        continue;
      }

      const existing = await db
        .select({ id: boardItems.id })
        .from(boardItems)
        .where(and(eq(boardItems.tenantId, auth.tenantId), eq(boardItems.id, item.id)))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(boardItems)
          .set({
            name: item.name,
            groupId: item.groupId,
            cells: item.cells as unknown as Record<string, unknown>,
            sortOrder: item.sortOrder,
            updatedAt: new Date(),
          })
          .where(and(eq(boardItems.tenantId, auth.tenantId), eq(boardItems.id, item.id)));
      } else {
        await db.insert(boardItems).values({
          id: item.id,
          tenantId: auth.tenantId,
          viewId,
          name: item.name,
          groupId: item.groupId,
          cells: item.cells as unknown as Record<string, unknown>,
          sortOrder: item.sortOrder,
        });
      }
    } catch (err) {
      console.error(`[board] saveBoardItemsBatch failed for item ${item.id}:`, err);
    }
  }
}

"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "db";
import { mindmapMaps, mindmapNodes, mindmapEdges, contacts, households } from "db";
import { eq, and, desc, or, sql, inArray } from "db";

export type MindmapEntityType = "contact" | "household" | "standalone";

/** List item for client/entity-linked maps (contact or household). */
export type ClientMapItem = {
  id: string;
  entityType: "contact" | "household";
  entityId: string;
  entityName: string;
  entityKind: "Klient" | "Domácnost" | "Klient (Podnikatel)";
  nodeCount: number;
  updatedAt: Date;
  openRoute: string;
};

/** List item for standalone (free) maps. */
export type FreeMapItem = {
  id: string;
  name: string;
  nodeCount: number;
  updatedAt: Date;
  createdAt?: Date;
};

export type ViewportState = {
  pan: { x: number; y: number };
  zoom: number;
};

export type MindmapNodeType =
  | "core"
  | "category"
  | "item"
  | "goal"
  | "task"
  | "deal"
  | "document"
  | "note"
  | "risk"
  | "recommendation";

export type MindmapNodeMetadata = {
  value?: string;
  status?: string;
  progress?: number;
  color?: string;
  icon?: string;
  detail?: string;
  [key: string]: unknown;
};

export type MindmapNode = {
  id: string;
  type: MindmapNodeType;
  title: string;
  subtitle: string | null;
  x: number;
  y: number;
  entityType: string | null;
  entityId: string | null;
  metadata: MindmapNodeMetadata | null;
};

export type MindmapEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  dashed: boolean;
};

export type MindmapState = {
  mapId: string;
  entityType: MindmapEntityType;
  entityId: string;
  entityName: string;
  nodes: MindmapNode[];
  edges: MindmapEdge[];
  viewport: ViewportState;
};

function parseViewport(raw: unknown): ViewportState {
  if (raw && typeof raw === "object" && "pan" in raw && "zoom" in raw) {
    const p = (raw as { pan?: unknown; zoom?: unknown }).pan;
    const z = (raw as { zoom?: number }).zoom;
    const pan =
      p && typeof p === "object" && "x" in p && "y" in p
        ? { x: Number((p as { x: unknown }).x) || 0, y: Number((p as { y: unknown }).y) || 0 }
        : { x: 0, y: 0 };
    return { pan, zoom: typeof z === "number" ? z : 1 };
  }
  return { pan: { x: 0, y: 0 }, zoom: 1 };
}

function parseMetadata(raw: unknown): MindmapNodeMetadata | null {
  if (raw && typeof raw === "object") return raw as MindmapNodeMetadata;
  return null;
}

/** Load standalone mindmap by map id. Returns null if not found or not standalone. */
export async function getMindmapByMapId(mapId: string): Promise<MindmapState | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");

  const [map] = await db
    .select()
    .from(mindmapMaps)
    .where(
      and(
        eq(mindmapMaps.id, mapId),
        eq(mindmapMaps.tenantId, auth.tenantId),
        eq(mindmapMaps.entityType, "standalone")
      )
    )
    .limit(1);

  if (!map) return null;

  const entityName = map.name ?? "Bez názvu";

  const nodesRows = await db
    .select()
    .from(mindmapNodes)
    .where(eq(mindmapNodes.mapId, map.id));
  const edgesRows = await db
    .select()
    .from(mindmapEdges)
    .where(eq(mindmapEdges.mapId, map.id));

  const viewport = parseViewport(map.viewport);

  if (nodesRows.length === 0) {
    const rootId = crypto.randomUUID();
    return {
      mapId: map.id,
      entityType: "standalone",
      entityId: map.id,
      entityName,
      nodes: [
        {
          id: rootId,
          type: "core",
          title: entityName,
          subtitle: "Libovolná mapa",
          x: 400,
          y: 350,
          entityType: null,
          entityId: null,
          metadata: null,
        },
      ],
      edges: [],
      viewport,
    };
  }

  const nodes: MindmapNode[] = nodesRows.map((r) => ({
    id: r.id,
    type: r.type as MindmapNodeType,
    title: r.title,
    subtitle: r.subtitle,
    x: Number(r.x),
    y: Number(r.y),
    entityType: r.entityType,
    entityId: r.entityId,
    metadata: parseMetadata(r.metadata),
  }));

  const edges: MindmapEdge[] = edgesRows.map((r) => ({
    id: r.id,
    sourceId: r.sourceNodeId,
    targetId: r.targetNodeId,
    dashed: r.dashed ?? false,
  }));

  return {
    mapId: map.id,
    entityType: "standalone",
    entityId: map.id,
    entityName,
    nodes,
    edges,
    viewport,
  };
}

/** List recently updated client/entity maps (contact + household) with node count and open route. */
export async function listRecentClientMaps(): Promise<ClientMapItem[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");

  const maps = await db
    .select({
      id: mindmapMaps.id,
      entityType: mindmapMaps.entityType,
      entityId: mindmapMaps.entityId,
      updatedAt: mindmapMaps.updatedAt,
    })
    .from(mindmapMaps)
    .where(
      and(
        eq(mindmapMaps.tenantId, auth.tenantId),
        or(eq(mindmapMaps.entityType, "contact"), eq(mindmapMaps.entityType, "household"))
      )
    )
    .orderBy(desc(mindmapMaps.updatedAt));

  if (maps.length === 0) return [];

  const mapIds = maps.map((m) => m.id);
  const nodeCountRows = await db
    .select({
      mapId: mindmapNodes.mapId,
      count: sql<number>`count(*)::int`.as("count"),
    })
    .from(mindmapNodes)
    .where(inArray(mindmapNodes.mapId, mapIds))
    .groupBy(mindmapNodes.mapId);

  const countByMapId = new Map<string, number>();
  for (const row of nodeCountRows) {
    countByMapId.set(row.mapId, Number(row.count));
  }

  const contactIds = [...new Set(maps.filter((m) => m.entityType === "contact").map((m) => m.entityId))];
  const householdIds = [...new Set(maps.filter((m) => m.entityType === "household").map((m) => m.entityId))];

  const contactNames = new Map<string, { name: string; isPodnikatel: boolean }>();
  if (contactIds.length > 0) {
    const contactRows = await db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        tags: contacts.tags,
      })
      .from(contacts)
      .where(and(eq(contacts.tenantId, auth.tenantId), inArray(contacts.id, contactIds)));
    for (const c of contactRows) {
      const name = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "Kontakt";
      const isPodnikatel = !!(c.tags && Array.isArray(c.tags) && c.tags.includes("podnikatel"));
      contactNames.set(c.id, { name, isPodnikatel });
    }
  }

  const householdNames = new Map<string, string>();
  if (householdIds.length > 0) {
    const householdRows = await db
      .select({ id: households.id, name: households.name })
      .from(households)
      .where(and(eq(households.tenantId, auth.tenantId), inArray(households.id, householdIds)));
    for (const h of householdRows) {
      householdNames.set(h.id, h.name ?? "Domácnost");
    }
  }

  return maps.map((m) => {
    const entityType = m.entityType as "contact" | "household";
    const entityId = m.entityId;
    let entityName = "";
    let entityKind: ClientMapItem["entityKind"] = "Klient";
    if (entityType === "contact") {
      const info = contactNames.get(entityId);
      entityName = info?.name ?? "Kontakt";
      entityKind = info?.isPodnikatel ? "Klient (Podnikatel)" : "Klient";
    } else {
      entityName = householdNames.get(entityId) ?? "Domácnost";
      entityKind = "Domácnost";
    }
    const openRoute =
      entityType === "contact"
        ? `/portal/mindmap?contactId=${encodeURIComponent(entityId)}`
        : `/portal/mindmap?householdId=${encodeURIComponent(entityId)}`;
    return {
      id: m.id,
      entityType,
      entityId,
      entityName,
      entityKind,
      nodeCount: countByMapId.get(m.id) ?? 0,
      updatedAt: m.updatedAt,
      openRoute,
    };
  });
}

/** List standalone maps for the current tenant, with node count. */
export async function listStandaloneMaps(): Promise<FreeMapItem[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");

  const rows = await db
    .select({
      id: mindmapMaps.id,
      name: mindmapMaps.name,
      updatedAt: mindmapMaps.updatedAt,
      createdAt: mindmapMaps.createdAt,
    })
    .from(mindmapMaps)
    .where(
      and(
        eq(mindmapMaps.tenantId, auth.tenantId),
        eq(mindmapMaps.entityType, "standalone")
      )
    )
    .orderBy(desc(mindmapMaps.updatedAt));

  if (rows.length === 0) return [];

  const rowIds = rows.map((r) => r.id);
  const nodeCountRows = await db
    .select({
      mapId: mindmapNodes.mapId,
      count: sql<number>`count(*)::int`.as("count"),
    })
    .from(mindmapNodes)
    .where(inArray(mindmapNodes.mapId, rowIds))
    .groupBy(mindmapNodes.mapId);

  const countByMapId = new Map<string, number>();
  for (const row of nodeCountRows) {
    countByMapId.set(row.mapId, Number(row.count));
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name ?? "Bez názvu",
    nodeCount: countByMapId.get(r.id) ?? 0,
    updatedAt: r.updatedAt,
    createdAt: r.createdAt,
  }));
}

/** Create a new standalone mindmap. Returns the new map id. */
export async function createStandaloneMap(name: string): Promise<{ mapId: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

  const [inserted] = await db
    .insert(mindmapMaps)
    .values({
      tenantId: auth.tenantId,
      entityType: "standalone",
      entityId: crypto.randomUUID(),
      name: name.trim() || "Bez názvu",
    })
    .returning({ id: mindmapMaps.id });

  if (!inserted) throw new Error("Failed to create mindmap");
  return { mapId: inserted.id };
}

/** Rename a standalone map. */
export async function renameStandaloneMap(mapId: string, name: string): Promise<{ ok: boolean }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

  const [map] = await db
    .select({ id: mindmapMaps.id })
    .from(mindmapMaps)
    .where(
      and(
        eq(mindmapMaps.id, mapId),
        eq(mindmapMaps.tenantId, auth.tenantId),
        eq(mindmapMaps.entityType, "standalone")
      )
    )
    .limit(1);
  if (!map) throw new Error("Map not found");

  await db
    .update(mindmapMaps)
    .set({ name: name.trim() || "Bez názvu", updatedAt: new Date() })
    .where(eq(mindmapMaps.id, mapId));
  return { ok: true };
}

/** Delete a standalone map (and its nodes/edges via cascade). */
export async function deleteStandaloneMap(mapId: string): Promise<{ ok: boolean }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

  const [map] = await db
    .select({ id: mindmapMaps.id })
    .from(mindmapMaps)
    .where(
      and(
        eq(mindmapMaps.id, mapId),
        eq(mindmapMaps.tenantId, auth.tenantId),
        eq(mindmapMaps.entityType, "standalone")
      )
    )
    .limit(1);
  if (!map) throw new Error("Map not found");

  await db.delete(mindmapMaps).where(eq(mindmapMaps.id, mapId));
  return { ok: true };
}

/** Duplicate a standalone map (new id, copy nodes and edges). Returns the new map id. */
export async function duplicateStandaloneMap(mapId: string): Promise<{ mapId: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

  const state = await getMindmapByMapId(mapId);
  const tenantId = auth.tenantId;
  if (!state) throw new Error("Map not found");

  const newName = (state.entityName || "Bez názvu") + " (kopie)";
  const [inserted] = await db
    .insert(mindmapMaps)
    .values({
      tenantId,
      entityType: "standalone",
      entityId: crypto.randomUUID(),
      name: newName,
      viewport: state.viewport as unknown as Record<string, unknown>,
    })
    .returning({ id: mindmapMaps.id });
  if (!inserted) throw new Error("Failed to duplicate map");

  const oldToNewNodeId = new Map<string, string>();
  for (const n of state.nodes) {
    const newId = crypto.randomUUID();
    oldToNewNodeId.set(n.id, newId);
  }

  for (const n of state.nodes) {
    const newId = oldToNewNodeId.get(n.id)!;
    await db.insert(mindmapNodes).values({
      id: newId,
      mapId: inserted.id,
      type: n.type,
      title: n.title,
      subtitle: n.subtitle,
      x: n.x,
      y: n.y,
      entityType: n.entityType,
      entityId: n.entityId,
      metadata: n.metadata as Record<string, unknown> | null,
    });
  }

  for (const e of state.edges) {
    const newSource = oldToNewNodeId.get(e.sourceId);
    const newTarget = oldToNewNodeId.get(e.targetId);
    if (newSource && newTarget) {
      await db.insert(mindmapEdges).values({
        mapId: inserted.id,
        sourceNodeId: newSource,
        targetNodeId: newTarget,
        dashed: e.dashed,
      });
    }
  }

  return { mapId: inserted.id };
}

/** Load mindmap for a contact or household. Creates empty map with root node if none exists. */
export async function getMindmap(
  entityType: "contact" | "household",
  entityId: string
): Promise<MindmapState | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");

  const [map] = await db
    .select()
    .from(mindmapMaps)
    .where(
      and(
        eq(mindmapMaps.tenantId, auth.tenantId),
        eq(mindmapMaps.entityType, entityType),
        eq(mindmapMaps.entityId, entityId)
      )
    )
    .limit(1);

  let entityName = "";
  if (entityType === "contact") {
    const { getContact } = await import("./contacts");
    const c = await getContact(entityId);
    entityName = c ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "Kontakt" : "Kontakt";
  } else {
    const { getHousehold } = await import("./households");
    const h = await getHousehold(entityId);
    entityName = h?.name ?? "Domácnost";
  }

  if (!map) {
    // Return initial state with root node only; map not persisted until first save
    const rootId = crypto.randomUUID();
    return {
      mapId: "",
      entityType,
      entityId,
      entityName,
      nodes: [
        {
          id: rootId,
          type: "core",
          title: entityName,
          subtitle: entityType === "household" ? "Domácnost" : "Klient",
          x: 400,
          y: 350,
          entityType: entityType,
          entityId,
          metadata: null,
        },
      ],
      edges: [],
      viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    };
  }

  const nodesRows = await db
    .select()
    .from(mindmapNodes)
    .where(eq(mindmapNodes.mapId, map.id));
  const edgesRows = await db
    .select()
    .from(mindmapEdges)
    .where(eq(mindmapEdges.mapId, map.id));

  const nodes: MindmapNode[] = nodesRows.map((r) => ({
    id: r.id,
    type: r.type as MindmapNodeType,
    title: r.title,
    subtitle: r.subtitle,
    x: Number(r.x),
    y: Number(r.y),
    entityType: r.entityType,
    entityId: r.entityId,
    metadata: parseMetadata(r.metadata),
  }));

  const edges: MindmapEdge[] = edgesRows.map((r) => ({
    id: r.id,
    sourceId: r.sourceNodeId,
    targetId: r.targetNodeId,
    dashed: r.dashed ?? false,
  }));

  const viewport = parseViewport(map.viewport);

  return {
    mapId: map.id,
    entityType: map.entityType as MindmapEntityType,
    entityId: map.entityId,
    entityName,
    nodes,
    edges,
    viewport,
  };
}

/** Save full mindmap state (viewport, nodes, edges). Creates or updates map. For standalone, map must already exist. */
export async function saveMindmap(
  entityType: MindmapEntityType,
  entityId: string,
  payload: {
    viewport: ViewportState;
    nodes: Omit<MindmapNode, "id">[] | MindmapNode[];
    edges: Omit<MindmapEdge, "id">[] | MindmapEdge[];
  }
): Promise<{ mapId: string; ok: boolean }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

  let mapId: string;

  if (entityType === "standalone") {
    const [existing] = await db
      .select({ id: mindmapMaps.id })
      .from(mindmapMaps)
      .where(
        and(
          eq(mindmapMaps.id, entityId),
          eq(mindmapMaps.tenantId, auth.tenantId),
          eq(mindmapMaps.entityType, "standalone")
        )
      )
      .limit(1);
    if (!existing) throw new Error("Standalone map not found");
    mapId = existing.id;
    await db
      .update(mindmapMaps)
      .set({
        viewport: payload.viewport as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(mindmapMaps.id, mapId));
    await db.delete(mindmapNodes).where(eq(mindmapNodes.mapId, mapId));
    await db.delete(mindmapEdges).where(eq(mindmapEdges.mapId, mapId));
  } else {
    const [existing] = await db
      .select({ id: mindmapMaps.id })
      .from(mindmapMaps)
      .where(
        and(
          eq(mindmapMaps.tenantId, auth.tenantId),
          eq(mindmapMaps.entityType, entityType),
          eq(mindmapMaps.entityId, entityId)
        )
      )
      .limit(1);

    if (existing) {
      mapId = existing.id;
      await db
        .update(mindmapMaps)
        .set({
          viewport: payload.viewport as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(mindmapMaps.id, mapId));
      await db.delete(mindmapNodes).where(eq(mindmapNodes.mapId, mapId));
      await db.delete(mindmapEdges).where(eq(mindmapEdges.mapId, mapId));
    } else {
      const [inserted] = await db
        .insert(mindmapMaps)
        .values({
          tenantId: auth.tenantId,
          entityType,
          entityId,
          viewport: payload.viewport as unknown as Record<string, unknown>,
        })
        .returning({ id: mindmapMaps.id });
      if (!inserted) throw new Error("Failed to create mindmap");
      mapId = inserted.id;
    }
  }

  for (const n of payload.nodes) {
    const id = (n as MindmapNode).id ?? crypto.randomUUID();
    await db.insert(mindmapNodes).values({
      id,
      mapId,
      type: n.type,
      title: n.title,
      subtitle: n.subtitle ?? null,
      x: n.x,
      y: n.y,
      entityType: n.entityType ?? null,
      entityId: n.entityId ?? null,
      metadata: (n.metadata ?? null) as Record<string, unknown> | null,
    });
  }

  for (const e of payload.edges) {
    const edgeId = (e as MindmapEdge).id ?? crypto.randomUUID();
    await db.insert(mindmapEdges).values({
      id: edgeId,
      mapId,
      sourceNodeId: e.sourceId,
      targetNodeId: e.targetId,
      dashed: e.dashed ?? false,
    });
  }

  return { mapId, ok: true };
}

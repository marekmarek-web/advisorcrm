"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { db } from "db";
import { mindmapMaps, mindmapNodes, mindmapEdges } from "db";
import { eq, and } from "db";

export type MindmapEntityType = "contact" | "household";

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

/** Load mindmap for a contact or household. Creates empty map with root node if none exists. */
export async function getMindmap(
  entityType: MindmapEntityType,
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

/** Save full mindmap state (viewport, nodes, edges). Creates or updates map. */
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

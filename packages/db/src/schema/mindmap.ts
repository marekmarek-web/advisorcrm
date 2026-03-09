import { pgTable, uuid, text, timestamp, real, boolean, uniqueIndex, jsonb } from "drizzle-orm/pg-core";

export const mindmapMaps = pgTable(
  "mindmap_maps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    entityType: text("entity_type").notNull(), // 'contact' | 'household'
    entityId: uuid("entity_id").notNull(),
    viewport: jsonb("viewport"), // { pan: { x, y }, zoom }
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("mindmap_maps_tenant_entity").on(t.tenantId, t.entityType, t.entityId)]
);

export const mindmapNodes = pgTable("mindmap_nodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  mapId: uuid("map_id")
    .notNull()
    .references(() => mindmapMaps.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // core | category | item | goal | task | deal | document | note | risk | recommendation
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  x: real("x").notNull().default(0),
  y: real("y").notNull().default(0),
  entityType: text("entity_type"), // optional link: contract | opportunity | task | document | contact | household
  entityId: text("entity_id"), // uuid as text for flexibility
  metadata: jsonb("metadata"), // { value?, status?, progress?, color?, icon?, detail?, ... }
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const mindmapEdges = pgTable("mindmap_edges", {
  id: uuid("id").primaryKey().defaultRandom(),
  mapId: uuid("map_id")
    .notNull()
    .references(() => mindmapMaps.id, { onDelete: "cascade" }),
  sourceNodeId: uuid("source_node_id")
    .notNull()
    .references(() => mindmapNodes.id, { onDelete: "cascade" }),
  targetNodeId: uuid("target_node_id")
    .notNull()
    .references(() => mindmapNodes.id, { onDelete: "cascade" }),
  dashed: boolean("dashed").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

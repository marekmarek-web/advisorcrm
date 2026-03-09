import type {
  MindmapNodeType,
  MindmapNodeMetadata,
  ViewportState,
  MindmapEntityType,
} from "@/app/actions/mindmap";

export type { MindmapNodeType, MindmapNodeMetadata, ViewportState, MindmapEntityType };

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

export type MindmapContext = {
  entityType: "contact" | "household";
  entityId: string;
  entityName: string;
};

export type MindmapInteractionMode = "select" | "pan" | "connect" | "add";

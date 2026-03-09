"use client";

import { useState, useCallback } from "react";
import type { MindmapNode, MindmapEdge, ViewportState } from "./types";

export function useMindmapState(initial: {
  nodes: MindmapNode[];
  edges: MindmapEdge[];
  viewport: ViewportState;
}) {
  const [nodes, setNodes] = useState<MindmapNode[]>(initial.nodes);
  const [edges, setEdges] = useState<MindmapEdge[]>(initial.edges);
  const [viewport, setViewport] = useState<ViewportState>(initial.viewport);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const updateNodePosition = useCallback((id: string, x: number, y: number) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, x, y } : n))
    );
    setDirty(true);
  }, []);

  const updateViewport = useCallback((v: Partial<ViewportState> | ((prev: ViewportState) => ViewportState)) => {
    setViewport((prev) => (typeof v === "function" ? v(prev) : { ...prev, ...v }));
    setDirty(true);
  }, []);

  const addNode = useCallback(
    (node: Omit<MindmapNode, "id"> & { id?: string }, parentId: string) => {
      const id = node.id ?? crypto.randomUUID();
      const parent = nodes.find((n) => n.id === parentId);
      const newNode: MindmapNode = {
        ...node,
        id,
        x: parent ? parent.x + 280 : node.x ?? 400,
        y: parent ? parent.y + (Math.random() * 80 - 40) : node.y ?? 350,
      };
      setNodes((prev) => [...prev, newNode]);
      setEdges((prev) => [...prev, { id: crypto.randomUUID(), sourceId: parentId, targetId: id, dashed: false }]);
      setDirty(true);
      return id;
    },
    [nodes]
  );

  const updateNode = useCallback((id: string, data: Partial<MindmapNode>) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...data } : n))
    );
    setDirty(true);
  }, []);

  const deleteNode = useCallback((id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.sourceId !== id && e.targetId !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
    setDirty(true);
  }, [selectedNodeId]);

  const addEdge = useCallback((sourceId: string, targetId: string, dashed = false) => {
    setEdges((prev) => [
      ...prev,
      { id: crypto.randomUUID(), sourceId, targetId, dashed },
    ]);
    setDirty(true);
  }, []);

  const setState = useCallback(
    (state: { nodes: MindmapNode[]; edges: MindmapEdge[]; viewport: ViewportState }) => {
      setNodes(state.nodes);
      setEdges(state.edges);
      setViewport(state.viewport);
      setDirty(false);
    },
    []
  );

  return {
    nodes,
    edges,
    viewport,
    selectedNodeId,
    dirty,
    setNodes,
    setEdges,
    setViewport,
    setSelectedNodeId,
    setDirty,
    setState,
    updateNodePosition,
    updateViewport,
    addNode,
    updateNode,
    deleteNode,
    addEdge,
  };
}

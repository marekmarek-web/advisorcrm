"use client";

import { useRef, useCallback } from "react";
import { Download, Sparkles } from "lucide-react";
import { saveMindmap } from "@/app/actions/mindmap";
import type { MindmapState } from "@/app/actions/mindmap";
import type { MindmapNode } from "./types";
import { useMindmapState } from "./useMindmapState";
import { MindmapCanvas } from "./MindmapCanvas";
import { MindmapToolbar } from "./MindmapToolbar";
import { MindmapControls } from "./MindmapControls";
import { MindmapSidePanel } from "./MindmapSidePanel";
import { renderNodeByType } from "./NodeRenderers";

type MindmapViewProps = {
  initial: MindmapState;
};

export function MindmapView({ initial }: MindmapViewProps) {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const {
    nodes,
    edges,
    viewport,
    selectedNodeId,
    dirty,
    setState,
    updateNodePosition,
    updateViewport,
    addNode,
    setSelectedNodeId,
    setDirty,
  } = useMindmapState({
    nodes: initial.nodes,
    edges: initial.edges,
    viewport: initial.viewport,
  });

  const handleSave = useCallback(async () => {
    await saveMindmap(initial.entityType, initial.entityId, {
      viewport,
      nodes,
      edges,
    });
    setDirty(false);
  }, [initial.entityType, initial.entityId, viewport, nodes, edges, setDirty]);

  const handleAddNode = useCallback(
    (parentId: string, type: "category" | "item" | "goal") => {
      addNode(
        {
          type,
          title: type === "category" ? "Nová kategorie" : type === "goal" ? "Nový cíl" : "Nová položka",
          subtitle: null,
          x: 0,
          y: 0,
          entityType: null,
          entityId: null,
          metadata: type === "goal" ? { value: "0 Kč", progress: 0 } : type === "item" ? { value: "0 Kč", status: "planned" } : null,
        },
        parentId
      );
    },
    [addNode]
  );

  const handleCenter = useCallback(() => {
    const root = nodes.find((n) => n.type === "core");
    if (!root || !canvasContainerRef.current) return;
    const rect = canvasContainerRef.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    updateViewport({
      pan: {
        x: cx - root.x * viewport.zoom,
        y: cy - root.y * viewport.zoom,
      },
      zoom: 1,
    });
  }, [nodes, viewport.zoom, updateViewport]);

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null;

  return (
    <div className="h-screen flex flex-col bg-[#f8fafc] text-slate-800 overflow-hidden">
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-100 px-6 py-3 z-50 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-6">
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-slate-900">
              Mapování: {initial.entityName}
            </h1>
            <span
              className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border ${
                dirty ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-600 border-emerald-100"
              }`}
            >
              {dirty ? "Neuloženo" : "Uloženo"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {dirty && (
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors"
            >
              Uložit
            </button>
          )}
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-100 to-orange-100 text-amber-800 border border-amber-200 hover:shadow-md rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
          >
            <Sparkles size={14} className="text-amber-600" /> AI Návrh strategie
          </button>
          <button
            type="button"
            className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors"
            title="Export"
          >
            <Download size={16} />
          </button>
        </div>
      </header>

      <div ref={canvasContainerRef} className="flex-1 flex min-h-0 relative">
        <div className="flex-1 min-w-0 relative flex flex-col">
          <MindmapCanvas
            nodes={nodes}
            edges={edges}
            viewport={viewport}
            selectedNodeId={selectedNodeId}
            onViewportChange={updateViewport}
            onNodePositionChange={updateNodePosition}
            onNodeSelect={setSelectedNodeId}
            onCanvasClick={() => setSelectedNodeId(null)}
            renderNode={(node, opts) =>
              renderNodeByType(node, {
                ...opts,
                onAddChild: handleAddNode,
              })
            }
          />
          <MindmapToolbar />
          <MindmapControls
            viewport={viewport}
            onZoom={(delta) =>
              updateViewport({ zoom: Math.min(Math.max(viewport.zoom + delta, 0.4), 2) })
            }
            onCenter={handleCenter}
          />
        </div>
        <div
          className={
            selectedNode
              ? "fixed inset-0 z-50 md:relative md:inset-auto md:z-auto md:w-80 md:shrink-0 flex flex-col"
              : "hidden md:flex md:w-80 md:shrink-0 flex-col"
          }
        >
          <MindmapSidePanel
            node={selectedNode}
            entityType={initial.entityType}
            entityId={initial.entityId}
            onClose={() => setSelectedNodeId(null)}
            fullscreenOnMobile={!!selectedNode}
          />
        </div>
      </div>
    </div>
  );
}

"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import Link from "next/link";
import { Download, Sparkles, Info } from "lucide-react";
import { saveMindmap } from "@/app/actions/mindmap";
import type { MindmapState } from "@/app/actions/mindmap";
import type { MindmapInteractionMode, MindmapNode, MindmapNodeClipboardData } from "./types";
import { useMindmapState } from "./useMindmapState";
import { MindmapCanvas } from "./MindmapCanvas";
import { MindmapToolbar } from "./MindmapToolbar";
import { MindmapControls } from "./MindmapControls";
import { MindmapSidePanel } from "./MindmapSidePanel";
import { renderNodeByType, type NodeItemMenuAction } from "./NodeRenderers";

type MindmapViewProps = {
  initial: MindmapState;
};

export function MindmapView({ initial }: MindmapViewProps) {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasExportRef = useRef<HTMLDivElement>(null);
  const {
    nodes,
    edges,
    viewport,
    selectedNodeId,
    dirty,
    updateNodePosition,
    updateViewport,
    addNode,
    updateNode,
    deleteNode,
    addEdge,
    setSelectedNodeId,
    setDirty,
  } = useMindmapState({
    nodes: initial.nodes,
    edges: initial.edges,
    viewport: initial.viewport,
  });

  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [infoPopoverOpen, setInfoPopoverOpen] = useState(false);
  const [nodeClipboard, setNodeClipboard] = useState<MindmapNodeClipboardData | null>(null);
  const [interactionMode, setInteractionMode] = useState<MindmapInteractionMode>("select");
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  useEffect(() => {
    if (interactionMode !== "connect") setConnectSourceId(null);
  }, [interactionMode]);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    setSaving(true);
    try {
      await saveMindmap(initial.entityType, initial.entityId, {
        viewport,
        nodes,
        edges,
      });
      setDirty(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Uložení selhalo.";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
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

  const handleCopyNodeData = useCallback(() => {
    if (!selectedNode) return;
    setNodeClipboard({
      title: selectedNode.title,
      subtitle: selectedNode.subtitle,
      type: selectedNode.type,
      metadata: selectedNode.metadata ? { ...selectedNode.metadata } : null,
    });
  }, [selectedNode]);

  const handlePasteNodeData = useCallback(() => {
    if (!selectedNode || !nodeClipboard || selectedNode.type === "core") return;
    const meta = nodeClipboard.metadata ? { ...nodeClipboard.metadata } : null;
    updateNode(selectedNode.id, {
      title: nodeClipboard.title,
      subtitle: nodeClipboard.subtitle,
      type: nodeClipboard.type,
      metadata: meta && Object.keys(meta).length ? meta : null,
    });
  }, [selectedNode, nodeClipboard, updateNode]);

  const findParentId = useCallback(
    (nodeId: string) => {
      const e = edges.find((ed) => ed.targetId === nodeId);
      if (e) return e.sourceId;
      return nodes.find((n) => n.type === "core")?.id ?? null;
    },
    [edges, nodes]
  );

  const handleNodeSelectFromCanvas = useCallback(
    (id: string | null) => {
      if (interactionMode === "connect" && id) {
        if (!connectSourceId) {
          setConnectSourceId(id);
          return;
        }
        if (connectSourceId === id) {
          setConnectSourceId(null);
          return;
        }
        addEdge(connectSourceId, id);
        setConnectSourceId(null);
        setInteractionMode("select");
        setSelectedNodeId(null);
        return;
      }
      setSelectedNodeId(id);
    },
    [interactionMode, connectSourceId, addEdge, setSelectedNodeId]
  );

  const handleCanvasBackgroundClick = useCallback(() => {
    setSelectedNodeId(null);
    if (interactionMode === "connect") setConnectSourceId(null);
  }, [interactionMode, setSelectedNodeId]);

  const handleItemMenu = useCallback(
    (node: MindmapNode, action: NodeItemMenuAction) => {
      if (action === "edit") {
        setSelectedNodeId(node.id);
        return;
      }
      if (action === "delete") {
        if (node.type === "core") {
          window.alert("Kořenový uzel nelze smazat.");
          return;
        }
        if (!window.confirm("Opravdu smazat tento uzel?")) return;
        deleteNode(node.id);
        return;
      }
      if (action === "duplicate") {
        if (node.type === "core") return;
        const parentId = findParentId(node.id);
        if (!parentId) return;
        addNode(
          {
            type: node.type,
            title: `${node.title} (kopie)`,
            subtitle: node.subtitle,
            x: node.x,
            y: node.y,
            entityType: null,
            entityId: null,
            metadata: node.metadata ? { ...node.metadata } : null,
          },
          parentId
        );
      }
    },
    [addNode, deleteNode, findParentId, setSelectedNodeId]
  );

  const handleExportPng = useCallback(async () => {
    const el = canvasExportRef.current;
    if (!el) return;
    setExportBusy(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(el, { cacheBust: true, pixelRatio: 2 });
      const a = document.createElement("a");
      a.href = dataUrl;
      const safe = (initial.entityName ?? "export").replace(/\s+/g, "_").replace(/[^\w.-]/g, "");
      a.download = `mindmap-${safe}.png`;
      a.click();
    } catch {
      window.alert("Export se nepodařil. Zkuste jiný prohlížeč nebo menší mapu.");
    } finally {
      setExportBusy(false);
      setMobileMenuOpen(false);
    }
  }, [initial.entityName]);

  const handleAiStrategyStub = useCallback(() => {
    window.alert("Funkce AI návrhu strategie bude brzy k dispozici. Zatím použijte asistenta v portálu.");
    setMobileMenuOpen(false);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-[#f8fafc] text-slate-800 overflow-hidden pb-[env(safe-area-inset-bottom)]">
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-100 px-4 md:px-6 py-3 z-50 flex items-center justify-between gap-2 shadow-sm shrink-0">
        <div className="flex items-center gap-2 md:gap-6 min-w-0">
          {initial.entityType === "standalone" && (
            <Link
              href="/portal/mindmap"
              className="text-slate-500 hover:text-slate-800 text-sm font-medium shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center md:min-h-0 md:min-w-0 md:flex-initial"
            >
              ← <span className="hidden sm:inline">Výběr map</span>
            </Link>
          )}
          <div className="h-4 w-px bg-slate-200 hidden md:block" />
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="font-bold text-slate-900 truncate text-base md:text-lg">
              {initial.entityType === "standalone" ? initial.entityName : `Mapování: ${initial.entityName}`}
            </h1>
            <span
              className={`shrink-0 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border ${
                dirty ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-600 border-emerald-100"
              }`}
            >
              {dirty ? "Neuloženo" : "Uloženo"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          {saveError && (
            <span className="text-rose-600 text-xs md:text-sm truncate max-w-[120px] md:max-w-none" title={saveError}>
              {saveError}
            </span>
          )}
          {!isMobile && dirty && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Ukládám…" : "Uložit"}
            </button>
          )}
          {!isMobile && (
            <>
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
            </>
          )}
          {isMobile && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMobileMenuOpen((o) => !o)}
                className="min-w-[44px] min-h-[44px] rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"
                aria-label="Menu"
              >
                <span className="text-lg font-bold">⋯</span>
              </button>
              {mobileMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMobileMenuOpen(false)} aria-hidden />
                  <div className="absolute right-0 top-full mt-1 py-2 min-w-[200px] bg-white rounded-xl shadow-xl border border-slate-200 z-50">
                    {dirty && (
                      <button
                        type="button"
                        onClick={() => { handleSave(); setMobileMenuOpen(false); }}
                        disabled={saving}
                        className="w-full text-left px-4 py-3 text-sm font-bold text-indigo-600 disabled:opacity-50 min-h-[44px]"
                      >
                        {saving ? "Ukládám…" : "Uložit"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleAiStrategyStub}
                      className="w-full text-left px-4 py-3 text-sm font-medium text-slate-700 flex items-center gap-2 min-h-[44px] active:bg-slate-50"
                    >
                      <Sparkles size={16} className="text-amber-600" /> AI Návrh strategie
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExportPng()}
                      disabled={exportBusy}
                      className="w-full text-left px-4 py-3 text-sm font-medium text-slate-700 flex items-center gap-2 min-h-[44px] disabled:opacity-50 active:bg-slate-50"
                    >
                      <Download size={16} /> {exportBusy ? "Export…" : "Export"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      <div ref={canvasContainerRef} className="flex-1 flex min-h-0 relative">
        <div ref={canvasExportRef} className="flex-1 min-w-0 relative flex flex-col bg-[#f8fafc]">
          {connectSourceId ? (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[55] px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-lg max-w-[90vw] text-center">
              Vyberte cílový uzel pro spojení…
            </div>
          ) : null}
          {!selectedNode && (
            <div className="absolute top-3 right-3 z-10 md:top-4 md:right-4">
              <button
                type="button"
                onClick={() => setInfoPopoverOpen((o) => !o)}
                className="w-9 h-9 rounded-full border border-slate-200 bg-white/90 backdrop-blur flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-700 shadow-sm min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 md:w-8 md:h-8"
                aria-label="Nápověda"
              >
                <Info size={18} />
              </button>
              {infoPopoverOpen && (
                <>
                  <div className="fixed inset-0 z-40" aria-hidden onClick={() => setInfoPopoverOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-72 p-4 bg-white rounded-xl shadow-xl border border-slate-200 z-50 text-left text-sm text-slate-600">
                    <p>Klikněte na uzel pro zobrazení detailu. Nebo použijte nástroje vlevo pro přidání kategorie či položky.</p>
                  </div>
                </>
              )}
            </div>
          )}
          <MindmapCanvas
            nodes={nodes}
            edges={edges}
            viewport={viewport}
            selectedNodeId={selectedNodeId}
            onViewportChange={updateViewport}
            onNodePositionChange={updateNodePosition}
            onNodeSelect={handleNodeSelectFromCanvas}
            onCanvasClick={handleCanvasBackgroundClick}
            renderNode={(node, opts) =>
              renderNodeByType(node, {
                ...opts,
                onAddChild: handleAddNode,
                onItemMenu: handleItemMenu,
              })
            }
          />
          <MindmapToolbar
            mode={interactionMode}
            onModeChange={setInteractionMode}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          <MindmapControls
            viewport={viewport}
            onZoom={(delta) =>
              updateViewport({ zoom: Math.min(Math.max(viewport.zoom + delta, 0.4), 2) })
            }
            onCenter={handleCenter}
            mobile={isMobile}
          />

          {settingsOpen ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-[60] bg-black/30"
                aria-label="Zavřít nastavení"
                onClick={() => setSettingsOpen(false)}
              />
              <div className="fixed left-4 bottom-24 md:left-24 md:bottom-auto md:top-28 z-[61] w-[min(calc(100vw-2rem),280px)] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Mapa</p>
                <p className="text-sm font-bold text-slate-900 mb-3 truncate" title={initial.entityName}>
                  {initial.entityName}
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleCenter();
                      setSettingsOpen(false);
                    }}
                    className="min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold active:scale-[0.98] transition-transform"
                  >
                    Vycentrovat mapu
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(false)}
                    className="min-h-[44px] rounded-xl border border-slate-200 text-slate-700 text-sm font-bold active:scale-[0.98]"
                  >
                    Zavřít
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
        {selectedNode && (
        <div className="fixed inset-0 z-50 md:relative md:inset-auto md:z-auto md:w-80 md:shrink-0 flex flex-col">
          <MindmapSidePanel
            key={selectedNode.id}
            node={selectedNode}
            entityType={initial.entityType}
            entityId={initial.entityId}
            onClose={() => setSelectedNodeId(null)}
            onUpdateNode={updateNode}
            onDeleteNode={(id) => {
              deleteNode(id);
              setSelectedNodeId(null);
            }}
            fullscreenOnMobile={!!selectedNode}
            onCopyNodeData={handleCopyNodeData}
            onPasteNodeData={handlePasteNodeData}
            hasClipboard={nodeClipboard != null}
          />
        </div>
        )}
      </div>
    </div>
  );
}

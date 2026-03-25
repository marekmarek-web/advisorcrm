"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { FileText, User, Briefcase, CheckSquare, Trash2, Tag, ClipboardCopy, ClipboardPaste } from "lucide-react";
import type { MindmapNode } from "./types";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";

const NODE_TYPES: { value: MindmapNode["type"]; label: string }[] = [
  { value: "category", label: "Kategorie" },
  { value: "item", label: "Položka" },
  { value: "goal", label: "Cíl" },
  { value: "task", label: "Úkol" },
  { value: "deal", label: "Obchod" },
  { value: "document", label: "Dokument" },
  { value: "note", label: "Poznámka" },
  { value: "risk", label: "Riziko" },
  { value: "recommendation", label: "Doporučení" },
];

type DraftTargetSnapshot = {
  id: string;
  type: MindmapNode["type"];
  title: string;
  metadata: MindmapNode["metadata"] | null;
};

type MindmapSidePanelProps = {
  node: MindmapNode | null;
  entityType: "contact" | "household" | "standalone";
  entityId: string;
  onClose: () => void;
  onUpdateNode?: (id: string, data: Partial<MindmapNode>) => void;
  onDeleteNode?: (id: string) => void;
  fullscreenOnMobile?: boolean;
  onCopyNodeData?: () => void;
  onPasteNodeData?: () => void;
  hasClipboard?: boolean;
};

export function MindmapSidePanel({
  node,
  entityType,
  entityId,
  onClose,
  onUpdateNode,
  onDeleteNode,
  fullscreenOnMobile,
  onCopyNodeData,
  onPasteNodeData,
  hasClipboard = false,
}: MindmapSidePanelProps) {
  const [editTitle, setEditTitle] = useState("");
  const [editSubtitle, setEditSubtitle] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editDetail, setEditDetail] = useState("");
  const [editProgress, setEditProgress] = useState(0);

  /** Blur can run after props switched to another node; writes must target this snapshot. */
  const draftTargetRef = useRef<DraftTargetSnapshot | null>(null);

  useEffect(() => {
    if (node) {
      draftTargetRef.current = {
        id: node.id,
        type: node.type,
        title: node.title,
        metadata: node.metadata ? { ...node.metadata } : null,
      };
      setEditTitle(node.title);
      setEditSubtitle(node.subtitle ?? "");
      setEditValue((node.metadata?.value as string) ?? "");
      setEditDetail((node.metadata?.detail as string) ?? "");
      setEditProgress(Number(node.metadata?.progress ?? 0));
    }
  }, [node?.id, node?.type, node?.title, node?.subtitle, node?.metadata]);

  const applyEdits = useCallback(() => {
    const target = draftTargetRef.current;
    if (!target || !onUpdateNode) return;
    const meta: NonNullable<MindmapNode["metadata"]> = { ...(target.metadata ?? {}) };
    if (target.type === "item" || target.type === "goal" || target.type === "category") {
      meta.value = editValue || undefined;
      meta.detail = editDetail || undefined;
      if (target.type === "goal") meta.progress = Math.min(100, Math.max(0, editProgress));
    }
    onUpdateNode(target.id, {
      title: editTitle.trim() || target.title,
      subtitle: editSubtitle.trim() || null,
      metadata: Object.keys(meta).length ? meta : null,
    });
  }, [onUpdateNode, editTitle, editSubtitle, editValue, editDetail, editProgress]);

  if (!node) {
    return null;
  }

  const entityHref =
    entityType === "contact"
      ? `/portal/contacts/${entityId}`
      : entityType === "household"
        ? `/portal/households/${entityId}`
        : "/portal/mindmap";
  const contractId = node.entityType === "contract" ? node.entityId : null;
  const opportunityId = node.entityType === "opportunity" ? node.entityId : null;
  const taskId = node.entityType === "task" ? node.entityId : null;
  const canEdit = Boolean(onUpdateNode);
  const isCore = node.type === "core";

  return (
    <div
      className={
        fullscreenOnMobile
          ? "w-full h-full md:w-80 md:h-auto shrink-0 border-l border-slate-200 bg-white md:bg-white/95 backdrop-blur overflow-y-auto flex flex-col"
          : "w-80 shrink-0 border-l border-slate-200 bg-white/95 backdrop-blur overflow-y-auto"
      }
    >
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-900">Detail uzlu</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -m-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium md:py-1 md:px-0 md:mx-0"
            aria-label="Zavřít"
          >
            {fullscreenOnMobile ? "✕ Zavřít" : "Zavřít"}
          </button>
        </div>

        {/* Typ uzlu (read-only nebo změna) */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Typ</label>
          {canEdit && !isCore ? (
            <CustomDropdown
              value={node.type}
              onChange={(id) => {
                const nextType = id as MindmapNode["type"];
                const tid = draftTargetRef.current?.id ?? node.id;
                onUpdateNode?.(tid, { type: nextType });
                if (draftTargetRef.current?.id === tid) {
                  draftTargetRef.current = { ...draftTargetRef.current, type: nextType };
                }
              }}
              options={NODE_TYPES.map((t) => ({ id: t.value, label: t.label }))}
              placeholder="Typ"
              icon={Tag}
            />
          ) : (
            <p className="text-lg font-bold text-slate-900 mt-1">{node.type}</p>
          )}
        </div>

        {/* Název – editovatelný */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Název</label>
          {canEdit ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={applyEdits}
              onKeyDown={(e) => e.key === "Enter" && applyEdits()}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-900"
            />
          ) : (
            <h2 className="text-lg font-bold text-slate-900 mt-1">{node.title}</h2>
          )}
        </div>

        {/* Podnadpis */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Podnadpis</label>
          {canEdit ? (
            <input
              type="text"
              value={editSubtitle}
              onChange={(e) => setEditSubtitle(e.target.value)}
              onBlur={applyEdits}
              placeholder="Volitelný popis"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600"
            />
          ) : (
            <p className="text-sm text-slate-500 mt-1">{node.subtitle ?? "—"}</p>
          )}
        </div>

        {/* Uložit změny – výrazné tlačítko pro aplikaci editací */}
        {canEdit && !isCore && (
          <button
            type="button"
            onClick={applyEdits}
            className="w-full py-2.5 px-4 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
          >
            Uložit změny
          </button>
        )}

        {/* Metadata: hodnota, popis, progres (pro položku/cíl) */}
        {(node.type === "item" || node.type === "goal" || node.type === "category") && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Hodnota a detail</h4>
            {canEdit ? (
              <>
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={applyEdits}
                  placeholder="Hodnota (např. 0 Kč)"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
                <textarea
                  value={editDetail}
                  onChange={(e) => setEditDetail(e.target.value)}
                  onBlur={applyEdits}
                  placeholder="Popis / poznámka"
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-y"
                />
                {node.type === "goal" && (
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400">Progres %</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={editProgress}
                      onChange={(e) => setEditProgress(Number(e.target.value))}
                      onBlur={applyEdits}
                      className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    />
                  </div>
                )}
              </>
            ) : (
              <ul className="text-sm text-slate-700 space-y-1">
                {node.metadata?.value != null && <li><strong>Hodnota:</strong> {String(node.metadata.value)}</li>}
                {node.metadata?.status != null && <li><strong>Stav:</strong> {String(node.metadata.status)}</li>}
                {node.metadata?.progress != null && <li><strong>Progres:</strong> {Number(node.metadata.progress)} %</li>}
                {node.metadata?.detail != null && <li><strong>Detail:</strong> {String(node.metadata.detail)}</li>}
              </ul>
            )}
          </div>
        )}

        {node.metadata && Object.keys(node.metadata).length > 0 && (node.type !== "item" && node.type !== "goal" && node.type !== "category") && (
          <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Metadata</h4>
            <ul className="text-sm text-slate-700 space-y-1">
              {node.metadata.value != null && <li><strong>Hodnota:</strong> {String(node.metadata.value)}</li>}
              {node.metadata.status != null && <li><strong>Stav:</strong> {String(node.metadata.status)}</li>}
              {node.metadata.progress != null && <li><strong>Progres:</strong> {Number(node.metadata.progress)} %</li>}
            </ul>
          </div>
        )}

        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Rychlé akce</h4>
          <div className="flex flex-col gap-2">
            <Link
              href={entityHref}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
            >
              <User size={16} />{" "}
              {entityType === "standalone" ? "Výběr map" : entityType === "household" ? "Otevřít domácnost" : "Otevřít klienta"}
            </Link>
            {contractId && entityType === "contact" && (
              <Link
                href={`/portal/contacts/${entityId}#smlouvy`}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
              >
                <FileText size={16} /> Smlouva
              </Link>
            )}
            {opportunityId && (
              <Link
                href={`/portal/pipeline/${opportunityId}`}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
              >
                <Briefcase size={16} /> Obchod
              </Link>
            )}
            {taskId && (
              <Link
                href="/portal/tasks"
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
              >
                <CheckSquare size={16} /> Úkol
              </Link>
            )}
            {canEdit && onCopyNodeData && (
              <button
                type="button"
                onClick={() => onCopyNodeData()}
                className="flex items-center gap-2 px-3 py-3 md:py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 min-h-[44px] md:min-h-0 text-left w-full"
              >
                <ClipboardCopy size={16} /> Zkopírovat data uzlu
              </button>
            )}
            {canEdit && onPasteNodeData && !isCore && (
              <button
                type="button"
                onClick={() => onPasteNodeData()}
                disabled={!hasClipboard}
                title={!hasClipboard ? "Nejdřív zkopírujte data z jiného uzlu" : undefined}
                className="flex items-center gap-2 px-3 py-3 md:py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 min-h-[44px] md:min-h-0 text-left w-full disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <ClipboardPaste size={16} /> Vložit data uzlu
              </button>
            )}
          </div>
        </div>

        {/* Smazat uzel */}
        {canEdit && onDeleteNode && !isCore && (
          <div className="pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Opravdu smazat tento uzel?")) {
                  onDeleteNode(node.id);
                }
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-rose-200 text-rose-700 text-sm font-medium hover:bg-rose-50"
            >
              <Trash2 size={16} /> Smazat uzel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

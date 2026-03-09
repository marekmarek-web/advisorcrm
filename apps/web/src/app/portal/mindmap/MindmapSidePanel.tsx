"use client";

import Link from "next/link";
import { FileText, User, Briefcase, CheckSquare } from "lucide-react";
import type { MindmapNode } from "./types";

type MindmapSidePanelProps = {
  node: MindmapNode | null;
  entityType: "contact" | "household";
  entityId: string;
  onClose: () => void;
  /** When true, panel uses full width/height (mobile fullscreen overlay). */
  fullscreenOnMobile?: boolean;
};

export function MindmapSidePanel({ node, entityType, entityId, onClose, fullscreenOnMobile }: MindmapSidePanelProps) {
  if (!node) {
    return (
      <div className="w-80 shrink-0 border-l border-slate-200 bg-white/95 backdrop-blur p-6 flex flex-col items-center justify-center text-center text-slate-500">
        <p className="text-sm font-medium">Klikněte na uzel pro zobrazení detailu.</p>
        <p className="text-xs mt-2">Nebo použijte nástroje vlevo pro přidání kategorie či položky.</p>
      </div>
    );
  }

  const entityHref = entityType === "contact" ? `/portal/contacts/${entityId}` : `/portal/households/${entityId}`;
  const contractId = node.entityType === "contract" ? node.entityId : null;
  const opportunityId = node.entityType === "opportunity" ? node.entityId : null;
  const taskId = node.entityType === "task" ? node.entityId : null;

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
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{node.type}</span>
          <h2 className="text-lg font-bold text-slate-900 mt-1">{node.title}</h2>
          {node.subtitle && <p className="text-sm text-slate-500 mt-0.5">{node.subtitle}</p>}
        </div>
        {node.metadata && Object.keys(node.metadata).length > 0 && (
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
              <User size={16} /> Otevřít {entityType === "household" ? "domácnost" : "klienta"}
            </Link>
            {contractId && (
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
          </div>
        </div>
      </div>
    </div>
  );
}

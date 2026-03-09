"use client";

import {
  User,
  TrendingUp,
  Shield,
  Home,
  Target,
  Briefcase,
  FileText,
  Plus,
  MoreHorizontal,
} from "lucide-react";
import type { MindmapNode } from "./types";

const ICON_MAP: Record<string, React.ComponentType<{ size?: number | string }>> = {
  TrendingUp,
  Shield,
  Home,
  Target,
  Briefcase,
  FileText,
  User,
};

type NodeRenderersProps = {
  node: MindmapNode;
  isDragging: boolean;
  onAddChild?: (parentId: string, type: "category" | "item" | "goal") => void;
  onOpenDetail?: (node: MindmapNode) => void;
};

export function NodeRendererCore({ node, isDragging, onAddChild }: NodeRenderersProps) {
  return (
    <div className="bg-[#1a1c2e] text-white p-6 rounded-[24px] shadow-xl border-2 border-indigo-500/30 w-72 text-center group relative">
      <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-inner">
        <User size={32} className="text-white" />
      </div>
      <h2 className="text-2xl font-bold tracking-tight mb-1">{node.title}</h2>
      <p className="text-indigo-200 text-sm font-medium">{node.subtitle ?? ""}</p>
      {onAddChild && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAddChild(node.id, "category"); }}
          className="absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 shadow-lg"
        >
          <Plus size={16} />
        </button>
      )}
    </div>
  );
}

const CATEGORY_STYLES: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
  blue: "bg-blue-50 text-blue-600 border-blue-100",
  rose: "bg-rose-50 text-rose-600 border-rose-100",
  amber: "bg-amber-50 text-amber-600 border-amber-100",
  indigo: "bg-indigo-50 text-indigo-600 border-indigo-100",
};

export function NodeRendererCategory({ node, isDragging, onAddChild }: NodeRenderersProps) {
  const colorKey = (node.metadata?.color as string) ?? "indigo";
  const boxClass = CATEGORY_STYLES[colorKey] ?? CATEGORY_STYLES.indigo;
  const iconName = (node.metadata?.icon as string) ?? "FileText";
  const Icon = ICON_MAP[iconName] ?? FileText;
  return (
    <div
      className={`bg-white p-5 rounded-2xl shadow-lg border border-slate-200 w-64 flex items-center gap-4 group transition-transform ${isDragging ? "scale-105" : ""} relative`}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm border ${boxClass}`}>
        <Icon size={24} />
      </div>
      <h3 className="font-bold text-slate-800 text-lg leading-tight flex-1">{node.title}</h3>
      {onAddChild && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAddChild(node.id, "item"); }}
          className="absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-white border border-slate-200 text-slate-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 shadow-md"
        >
          <Plus size={16} />
        </button>
      )}
    </div>
  );
}

export function NodeRendererItem({ node, isDragging }: NodeRenderersProps) {
  const value = (node.metadata?.value as string) ?? "—";
  const status = (node.metadata?.status as string) ?? "active";
  const detail = node.metadata?.detail as string | undefined;
  const isPlanned = status === "planned";
  return (
    <div
      className={`bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-sm border transition-all w-56 group
        ${isDragging ? "shadow-xl scale-105 border-indigo-300" : "border-slate-200 hover:border-slate-300 hover:shadow-md"}
        ${isPlanned ? "border-dashed border-2 opacity-80" : ""}
      `}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Produkt</span>
        <button type="button" className="text-slate-300 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
          <MoreHorizontal size={14} />
        </button>
      </div>
      <h4 className="font-bold text-slate-800 text-[15px] mb-1 leading-tight">{node.title}</h4>
      <div className={`text-sm font-bold ${value.includes("-") ? "text-rose-600" : "text-emerald-600"}`}>
        {value}
      </div>
      {detail && (
        <div className="text-xs text-slate-500 font-medium mt-2 pt-2 border-t border-slate-100">
          {detail}
        </div>
      )}
    </div>
  );
}

export function NodeRendererGoal({ node, isDragging }: NodeRenderersProps) {
  const value = (node.metadata?.value as string) ?? "—";
  const progress = (node.metadata?.progress as number) ?? 0;
  return (
    <div
      className={`bg-gradient-to-br from-amber-50 to-orange-50 p-4 rounded-2xl shadow-sm border border-amber-200 w-56 group
        ${isDragging ? "shadow-xl scale-105" : "hover:shadow-md"}
      `}
    >
      <div className="flex items-center gap-2 mb-2 text-amber-700">
        <Target size={16} />
        <span className="text-[10px] font-bold uppercase tracking-wider">Cíl</span>
      </div>
      <h4 className="font-bold text-amber-950 text-[15px] mb-1 leading-tight">{node.title}</h4>
      <div className="text-sm font-bold text-amber-800 mb-3">{value}</div>
      <div className="h-1.5 w-full bg-amber-200/50 rounded-full overflow-hidden">
        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, progress)}%` }} />
      </div>
    </div>
  );
}

export function renderNodeByType(
  node: MindmapNode,
  opts: { isDragging: boolean; onAddChild?: (parentId: string, type: "category" | "item" | "goal") => void; onOpenDetail?: (node: MindmapNode) => void }
): React.ReactNode {
  const props: NodeRenderersProps = { node, isDragging: opts.isDragging, onAddChild: opts.onAddChild, onOpenDetail: opts.onOpenDetail };
  switch (node.type) {
    case "core":
      return <NodeRendererCore {...props} />;
    case "category":
      return <NodeRendererCategory {...props} />;
    case "item":
      return <NodeRendererItem {...props} />;
    case "goal":
      return <NodeRendererGoal {...props} />;
    default:
      return (
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 w-52">
          <span className="text-[10px] font-bold uppercase text-slate-400">{node.type}</span>
          <h4 className="font-bold text-slate-800 text-sm mt-1">{node.title}</h4>
        </div>
      );
  }
}

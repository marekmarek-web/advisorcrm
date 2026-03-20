"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  ChevronUp,
  ChevronDown,
  Trash2,
  Check,
  X,
  Tag,
  GripVertical,
} from "lucide-react";
import { createPortal } from "react-dom";
import type { StatusLabel } from "@/app/lib/status-labels";
import { getStatusLabels, setStatusLabels } from "@/app/lib/status-labels";

interface EditLabelsEditorProps {
  open: boolean;
  onClose: () => void;
}

export function EditLabelsEditor({ open, onClose }: EditLabelsEditorProps) {
  const [labels, setLabels] = useState<StatusLabel[]>(() => getStatusLabels());
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);

  const colors = useMemo(
    () => ["#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#f97316", "#374151", "#ef4444"],
    []
  );

  const updateLabel = (index: number, patch: Partial<StatusLabel>) => {
    setLabels((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const removeLabel = (index: number) => {
    setLabels((prev) => prev.filter((_, i) => i !== index));
  };

  const addLabel = () => {
    const id = `label_${Date.now()}`;
    setLabels((prev) => [...prev, { id, label: "", color: "#10b981" }]);
  };

  const moveLabel = (index: number, direction: "up" | "down") => {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= labels.length) return;
    setLabels((prev) => {
      const next = [...prev];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDraggedItemIndex(index);
    e.dataTransfer.setData("text/plain", String(index));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    if (draggedItemIndex === null || draggedItemIndex === index) return;
    setLabels((prev) => {
      const next = [...prev];
      const dragged = next[draggedItemIndex];
      next.splice(draggedItemIndex, 1);
      next.splice(index, 0, dragged);
      return next;
    });
    setDraggedItemIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedItemIndex(null);
  };

  const handleSave = () => {
    if (labels.length > 0) {
      const normalized = labels.map((label, idx) => ({
        id: label.id || `label_${idx}_${Date.now()}`,
        label: label.label.trim() || `Štítek ${idx + 1}`,
        color: label.color,
      }));
      setStatusLabels(normalized);
    }
    onClose();
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Upravit štítky"
    >
      <div
        className="w-full max-w-lg max-h-[90vh] bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
      <div className="p-6 pb-4 flex items-start justify-between">
        <div className="flex gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
            <Tag className="text-white w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Upravit štítky</h2>
            <p className="text-slate-400 text-sm mt-1">Nastavte barvy, názvy a pořadí štítků.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 hover:bg-slate-50 rounded-full transition-colors text-slate-300 hover:text-slate-500 min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Zavřít"
        >
          <X size={22} />
        </button>
      </div>

      <div className="px-6 max-h-[55vh] overflow-y-auto space-y-3">
        {labels.map((l, i) => (
          <div
            key={l.id}
            draggable
            onDragStart={(e) => handleDragStart(e, i)}
            onDragEnter={(e) => handleDragEnter(e, i)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => e.preventDefault()}
            className={`group flex items-center gap-4 p-4 bg-white border rounded-2xl transition-all duration-200 ${
              draggedItemIndex === i
                ? "border-indigo-400 shadow-md scale-[1.01] opacity-80 z-10 relative bg-indigo-50/50"
                : "border-slate-100 hover:border-purple-200 hover:shadow-md"
            }`}
          >
            <div className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 shrink-0">
              <GripVertical size={20} />
            </div>

            <div className="flex gap-2 shrink-0 bg-slate-50/50 p-1.5 rounded-xl border border-slate-50">
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => updateLabel(i, { color: c })}
                  className={`w-5 h-5 rounded-full transition-all transform hover:scale-125 ${
                    l.color === c ? "ring-2 ring-offset-2 ring-slate-400 scale-110 shadow-sm" : "opacity-80"
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Barva ${c}`}
                />
              ))}
            </div>

            <input
              type="text"
              value={l.label}
              onChange={(e) => updateLabel(i, { label: e.target.value })}
              placeholder="Název štítku..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-slate-700 font-medium placeholder:text-slate-300 placeholder:font-normal min-h-[44px]"
            />

            <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => moveLabel(i, "up")}
                disabled={i === 0}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 disabled:opacity-20 min-h-[44px] min-w-[44px]"
                aria-label="Nahoru"
              >
                <ChevronUp size={18} />
              </button>
              <button
                type="button"
                onClick={() => moveLabel(i, "down")}
                disabled={i === labels.length - 1}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 disabled:opacity-20 min-h-[44px] min-w-[44px]"
                aria-label="Dolů"
              >
                <ChevronDown size={18} />
              </button>
              <div className="w-px h-4 bg-slate-100 mx-1" />
              <button
                type="button"
                onClick={() => removeLabel(i)}
                disabled={labels.length <= 1}
                className="p-2 hover:bg-red-50 hover:text-red-500 rounded-lg text-slate-400 transition-colors disabled:opacity-20 min-h-[44px] min-w-[44px]"
                aria-label="Smazat"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addLabel}
          className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-slate-100 rounded-2xl text-slate-400 hover:border-indigo-200 hover:text-indigo-500 hover:bg-indigo-50/30 transition-all group"
        >
          <Plus size={20} className="group-hover:rotate-90 transition-transform" />
          <span className="font-medium">Přidat nový label</span>
        </button>
      </div>

      <div className="p-6 pt-5 flex items-center justify-between border-t border-slate-100">
        <button
          type="button"
          onClick={onClose}
          className="px-6 py-3 text-slate-400 font-semibold hover:text-slate-600 transition-colors min-h-[44px]"
        >
          Zrušit
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold rounded-2xl shadow-xl shadow-indigo-100 hover:shadow-indigo-200 hover:-translate-y-0.5 active:translate-y-0 transition-all min-h-[44px]"
        >
          <Check size={20} strokeWidth={3} />
          Uložit změny
        </button>
      </div>
    </div>
  </div>,
  document.body
);
}

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
        className="w-full max-w-lg max-h-[90vh] bg-[color:var(--wp-surface-card)] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
      <div className="p-6 pb-4 flex items-start justify-between">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-200 dark:shadow-sm dark:shadow-black/25">
            <Tag className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[color:var(--wp-text)]">Upravit štítky</h2>
            <p className="text-[color:var(--wp-text-tertiary)] text-sm mt-1">Nastavte barvy, názvy a pořadí štítků.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 hover:bg-[color:var(--wp-surface-muted)] rounded-full transition-colors text-[color:var(--wp-text-tertiary)] hover:text-[color:var(--wp-text-secondary)] min-h-[44px] min-w-[44px] flex items-center justify-center"
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
            className={`group flex items-center gap-4 p-4 bg-[color:var(--wp-surface-card)] border rounded-2xl transition-all duration-200 ${
              draggedItemIndex === i
                ? "border-indigo-400 shadow-md scale-[1.01] opacity-80 z-10 relative bg-indigo-50/50"
                : "border-[color:var(--wp-surface-card-border)] hover:border-purple-200 hover:shadow-md"
            }`}
          >
            <div className="cursor-grab active:cursor-grabbing text-[color:var(--wp-text-tertiary)] hover:text-[color:var(--wp-text-secondary)] shrink-0">
              <GripVertical size={20} />
            </div>

            <div className="flex gap-2 shrink-0 bg-[color:var(--wp-surface-muted)]/50 p-1.5 rounded-xl border border-[color:var(--wp-surface-card-border)]/50">
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => updateLabel(i, { color: c })}
                  className={`w-5 h-5 rounded-full transition-all transform hover:scale-125 ${
                    l.color === c ? "ring-2 ring-offset-2 ring-[color:var(--wp-text-tertiary)] scale-110 shadow-sm" : "opacity-80"
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
              className="flex-1 bg-transparent border-none focus:ring-0 text-[color:var(--wp-text-secondary)] font-medium placeholder:text-[color:var(--wp-text-tertiary)] placeholder:font-normal min-h-[44px]"
            />

            <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => moveLabel(i, "up")}
                disabled={i === 0}
                className="p-2 hover:bg-[color:var(--wp-surface-muted)] rounded-lg text-[color:var(--wp-text-tertiary)] disabled:opacity-20 min-h-[44px] min-w-[44px]"
                aria-label="Nahoru"
              >
                <ChevronUp size={18} />
              </button>
              <button
                type="button"
                onClick={() => moveLabel(i, "down")}
                disabled={i === labels.length - 1}
                className="p-2 hover:bg-[color:var(--wp-surface-muted)] rounded-lg text-[color:var(--wp-text-tertiary)] disabled:opacity-20 min-h-[44px] min-w-[44px]"
                aria-label="Dolů"
              >
                <ChevronDown size={18} />
              </button>
              <div className="w-px h-4 bg-[color:var(--wp-surface-muted)] mx-1" />
              <button
                type="button"
                onClick={() => removeLabel(i)}
                disabled={labels.length <= 1}
                className="p-2 hover:bg-red-50 hover:text-red-500 rounded-lg text-[color:var(--wp-text-tertiary)] transition-colors disabled:opacity-20 min-h-[44px] min-w-[44px]"
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
          className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-[color:var(--wp-surface-card-border)] rounded-2xl text-[color:var(--wp-text-tertiary)] hover:border-indigo-200 hover:text-indigo-500 hover:bg-indigo-50/30 transition-all group"
        >
          <Plus size={20} className="group-hover:rotate-90 transition-transform" />
          <span className="font-medium">Přidat nový label</span>
        </button>
      </div>

      <div className="p-6 pt-5 flex items-center justify-between border-t border-[color:var(--wp-surface-card-border)]">
        <button
          type="button"
          onClick={onClose}
          className="px-6 py-3 text-[color:var(--wp-text-tertiary)] font-semibold hover:text-[color:var(--wp-text-secondary)] transition-colors min-h-[44px]"
        >
          Zrušit
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="flex min-h-[44px] items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 px-8 py-3 font-bold text-white shadow-xl shadow-indigo-100 transition-all hover:-translate-y-0.5 hover:shadow-indigo-200 active:translate-y-0 dark:shadow-md dark:shadow-black/35 dark:hover:shadow-lg dark:hover:shadow-black/45"
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

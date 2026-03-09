"use client";

import { useState } from "react";
import type { StatusLabel } from "@/app/lib/status-labels";
import { getStatusLabels, setStatusLabels } from "@/app/lib/status-labels";
import { BaseModal } from "@/app/components/BaseModal";

interface EditLabelsEditorProps {
  open: boolean;
  onClose: () => void;
}

export function EditLabelsEditor({ open, onClose }: EditLabelsEditorProps) {
  const [labels, setLabels] = useState<StatusLabel[]>(() => getStatusLabels());

  const updateLabel = (index: number, patch: Partial<StatusLabel>) => {
    setLabels((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const removeLabel = (index: number) => {
    setLabels((prev) => prev.filter((_, i) => i !== index));
  };

  const addLabel = () => {
    const id = `label_${Date.now()}`;
    setLabels((prev) => [...prev, { id, label: "Nový", color: "#579bfc" }]);
  };

  const moveUp = (index: number) => {
    if (index <= 0) return;
    setLabels((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const moveDown = (index: number) => {
    if (index >= labels.length - 1) return;
    setLabels((prev) => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  };

  const handleSave = () => {
    if (labels.length > 0) setStatusLabels(labels);
    onClose();
  };

  return (
    <BaseModal open={open} onClose={onClose} title="Edit Labels" maxWidth="md">
      <div className="flex flex-col">
        <div className="p-3 space-y-2">
          {labels.map((l, i) => (
            <div key={l.id} className="flex items-center gap-2 py-1">
              <input
                type="color"
                value={l.color}
                onChange={(e) => updateLabel(i, { color: e.target.value })}
                className="w-8 h-8 rounded border border-monday-border cursor-pointer"
                title="Barva"
              />
              <input
                type="text"
                value={l.label}
                onChange={(e) => updateLabel(i, { label: e.target.value })}
                className="flex-1 min-w-0 h-8 px-2 text-[13px] border border-monday-border rounded-[6px] focus:outline-none focus:ring-1 focus:ring-monday-blue"
              />
              <div className="flex items-center gap-0.5">
                <button type="button" onClick={() => moveUp(i)} disabled={i === 0} className="p-1 rounded hover:bg-monday-row-hover text-monday-text-muted disabled:opacity-40" aria-label="Nahoru">↑</button>
                <button type="button" onClick={() => moveDown(i)} disabled={i === labels.length - 1} className="p-1 rounded hover:bg-monday-row-hover text-monday-text-muted disabled:opacity-40" aria-label="Dolů">↓</button>
                <button type="button" onClick={() => removeLabel(i)} disabled={labels.length <= 1} className="p-1 rounded hover:bg-red-50 text-red-600 disabled:opacity-40" aria-label="Smazat">✕</button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center gap-2 px-4 py-3 border-t border-slate-200 shrink-0">
          <button type="button" onClick={addLabel} className="px-3 py-1.5 text-[13px] font-medium text-monday-blue hover:bg-monday-row-hover rounded-[6px]">
            + Přidat label
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-[13px] font-medium text-monday-text-muted hover:bg-monday-row-hover rounded-[6px]">
              Zrušit
            </button>
            <button type="button" onClick={handleSave} className="px-3 py-1.5 text-[13px] font-medium text-white bg-monday-blue rounded-[6px] hover:opacity-90">
              Save
            </button>
          </div>
        </div>
      </div>
    </BaseModal>
  );
}

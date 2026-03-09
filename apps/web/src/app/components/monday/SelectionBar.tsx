"use client";

import { useState } from "react";

interface SelectionBarProps {
  count: number;
  onClear: () => void;
  onDelete: () => void;
  onMoveToGroup: (groupId: string) => void;
  groupOptions: { id: string; name: string }[];
}

export function SelectionBar({
  count,
  onClear,
  onDelete,
  onMoveToGroup,
  groupOptions,
}: SelectionBarProps) {
  const [moveOpen, setMoveOpen] = useState(false);

  if (count === 0) return null;

  return (
    <div className="flex items-center gap-4 h-10 px-4 bg-monday-blue text-white text-[13px] shrink-0">
      <span className="font-medium">{count} items selected</span>
      <button type="button" onClick={onClear} className="hover:underline">
        Clear
      </button>
      <div className="relative">
        <button type="button" onClick={() => setMoveOpen((o) => !o)} className="hover:underline">
          Move to group
        </button>
        {moveOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMoveOpen(false)} />
            <div className="absolute left-0 top-full mt-1 py-1 min-w-[160px] bg-monday-surface border border-monday-border rounded-[var(--monday-radius)] shadow-[var(--monday-shadow)] z-40 text-monday-text">
              {groupOptions.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => { onMoveToGroup(g.id); setMoveOpen(false); }}
                  className="w-full text-left px-3 py-2 text-[13px] hover:bg-monday-row-hover"
                >
                  {g.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <button type="button" onClick={onDelete} className="hover:underline text-red-200">
        Delete
      </button>
    </div>
  );
}

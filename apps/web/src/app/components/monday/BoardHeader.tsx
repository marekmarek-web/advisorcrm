"use client";

import { useState, useRef, useEffect } from "react";

export type ViewItem = { id: string; name: string };

interface BoardHeaderProps {
  boardName: string;
  views: ViewItem[];
  activeViewId: string;
  onViewChange: (viewId: string) => void;
  onAddView: () => void;
  onViewNameChange?: (name: string) => void;
}

export function BoardHeader({
  boardName,
  views,
  activeViewId,
  onViewChange,
  onAddView,
  onViewNameChange,
}: BoardHeaderProps) {
  const [open, setOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editNameVal, setEditNameVal] = useState(views.find((v) => v.id === activeViewId)?.name ?? boardName);
  const ref = useRef<HTMLDivElement>(null);
  const activeView = views.find((v) => v.id === activeViewId);
  const displayName = activeView?.name ?? boardName;

  useEffect(() => setEditNameVal(displayName), [displayName]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div className="flex items-center gap-2 h-12 px-4 border-b border-monday-border bg-monday-surface shrink-0">
      {editingName && onViewNameChange ? (
        <input
          value={editNameVal}
          onChange={(e) => setEditNameVal(e.target.value)}
          onBlur={() => {
            onViewNameChange(editNameVal.trim() || displayName);
            setEditingName(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onViewNameChange(editNameVal.trim() || displayName);
              setEditingName(false);
            }
            if (e.key === "Escape") {
              setEditNameVal(displayName);
              setEditingName(false);
            }
          }}
          className="h-8 px-2 text-[15px] font-semibold text-monday-text border border-monday-blue rounded-[6px] focus:outline-none min-w-[160px]"
          autoFocus
        />
      ) : onViewNameChange ? (
        <span
          role="button"
          tabIndex={0}
          onClick={() => setEditingName(true)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditingName(true); } }}
          className="text-monday-text font-semibold text-[15px] cursor-text px-1 py-0.5 rounded-[4px] hover:bg-monday-row-hover border border-transparent hover:border-monday-border min-w-[80px] inline-block"
          title="Klikni pro úpravu názvu"
        >
          {boardName || " "}
        </span>
      ) : (
        <span className="text-monday-text font-semibold text-[15px] px-1">{boardName}</span>
      )}
      <div className="relative flex items-center gap-1" ref={ref}>
        {!editingName && (
          <>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-monday-text-muted text-[13px] hover:bg-monday-row-hover border border-monday-border"
            >
              {displayName}
              <span className="text-[10px]">▼</span>
            </button>
            {open && (
              <div className="wp-dropdown absolute left-0 top-full mt-1">
                {onViewNameChange && (
                  <button
                    type="button"
                    onClick={() => { setOpen(false); setEditingName(true); }}
                    className="wp-dropdown-item"
                  >
                    Přejmenovat nástěnku
                  </button>
                )}
                {views.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      onViewChange(v.id);
                      setOpen(false);
                    }}
                    className={`wp-dropdown-item ${v.id === activeViewId ? "text-monday-blue font-medium" : ""}`}
                  >
                    {v.name}
                  </button>
                ))}
                <div className="wp-dropdown-divider" />
                <button
                  type="button"
                  onClick={() => { onAddView(); setOpen(false); }}
                  className="wp-dropdown-item text-monday-text-muted"
                >
                  + Přidat nástěnku
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

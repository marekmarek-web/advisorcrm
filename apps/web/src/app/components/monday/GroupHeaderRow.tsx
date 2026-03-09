"use client";

import { useState, useRef, useEffect } from "react";

interface GroupHeaderRowProps {
  name: string;
  color: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onRename: (name: string) => void;
  onCollapseAll: () => void;
  colSpan: number;
  /** Počet řádků ve skupině (header + položky + add row) pro rowSpan barevného pruhu */
  groupRowSpan?: number;
  /** Volitelný editovatelný podnázev / wizard pod názvem */
  subtitle?: string;
  onSubtitleChange?: (value: string) => void;
  /** Drop položky na hlavičku skupiny (přesun do této skupiny) */
  onDropItem?: (itemId: string) => void;
  /** První skupina – zaoblení nahoře (wizard card) */
  isFirstGroup?: boolean;
  /** Skupina je sbalená – zaoblení i dole */
  isCollapsed?: boolean;
  /** Skupina má řádek „+ Nový řádek“ – zaoblení dole na add row */
  hasAddRow?: boolean;
}

export function GroupHeaderRow({
  name,
  color,
  collapsed,
  onToggleCollapse,
  onRename,
  onCollapseAll,
  colSpan,
  groupRowSpan = 1,
  subtitle,
  onSubtitleChange,
  onDropItem,
  isFirstGroup = false,
  isCollapsed = false,
  hasAddRow = true,
}: GroupHeaderRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(name);
  const [editingSubtitle, setEditingSubtitle] = useState(false);
  const [subtitleVal, setSubtitleVal] = useState(subtitle ?? "");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setSubtitleVal(subtitle ?? ""), [subtitle]);

  useEffect(() => {
    if (!menuOpen) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenuOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menuOpen]);

  return (
    <tr className="bg-monday-surface">
      {groupRowSpan > 0 && (
        <td
          rowSpan={groupRowSpan}
          className="w-1 p-0 align-top border-b border-monday-border bg-monday-surface"
          style={{ width: 4, minWidth: 4, backgroundColor: color, verticalAlign: "top" }}
          aria-hidden
        />
      )}
      <td
        colSpan={groupRowSpan > 0 ? colSpan : colSpan + 1}
        className="py-0 pr-0 align-middle"
        onDragOver={onDropItem ? (e) => { e.preventDefault(); e.currentTarget.classList.add("bg-monday-row-hover"); } : undefined}
        onDragLeave={onDropItem ? (e) => e.currentTarget.classList.remove("bg-monday-row-hover") : undefined}
        onDrop={onDropItem ? (e) => {
          e.preventDefault();
          e.currentTarget.classList.remove("bg-monday-row-hover");
          const itemId = e.dataTransfer.getData("text/plain");
          if (itemId) onDropItem(itemId);
        } : undefined}
      >
        <div
          className={`flex items-center min-h-9 border-b border-monday-border bg-monday-surface wp-card-group-header ${isFirstGroup ? "rounded-t-[var(--wp-radius-sm)]" : ""} ${isCollapsed ? "rounded-b-[var(--wp-radius-sm)]" : ""}`}
          style={{
            ...(isFirstGroup ? { borderTopLeftRadius: "var(--wp-radius)", borderTopRightRadius: "var(--wp-radius)" } : {}),
            ...(isCollapsed ? { borderBottomLeftRadius: "var(--wp-radius)", borderBottomRightRadius: "var(--wp-radius)" } : {}),
            boxShadow: "var(--wp-shadow-sm)",
          }}
        >
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-2 shrink-0 text-monday-text-muted hover:bg-monday-row-hover"
            aria-label={collapsed ? "Expand" : "Collapse"}
          >
            <span className={`inline-block transition-transform ${collapsed ? "" : "rotate-90"}`}>▶</span>
          </button>
          <div className="flex-1 min-w-0 flex flex-col py-1">
            <div className="flex items-center gap-1">
              {editing ? (
                <input
                  value={editVal}
                  onChange={(e) => setEditVal(e.target.value)}
                  onBlur={() => { onRename(editVal); setEditing(false); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { onRename(editVal); setEditing(false); } if (e.key === "Escape") { setEditVal(name); setEditing(false); } }}
                  className="flex-1 min-w-0 h-7 px-2 text-[13px] font-semibold border border-monday-blue rounded focus:outline-none"
                  autoFocus
                />
              ) : (
                <span
                  role="button"
                  tabIndex={0}
                  className="px-1 text-[13px] font-semibold text-monday-text cursor-text hover:bg-monday-row-hover rounded"
                  onClick={() => setEditing(true)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditing(true); } }}
                >
                  {name}
                </span>
              )}
            </div>
            {(onSubtitleChange || subtitle) && (
              <div className="mt-0.5">
                {editingSubtitle && onSubtitleChange ? (
                  <input
                    value={subtitleVal}
                    onChange={(e) => setSubtitleVal(e.target.value)}
                    onBlur={() => { onSubtitleChange(subtitleVal); setEditingSubtitle(false); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { onSubtitleChange(subtitleVal); setEditingSubtitle(false); } if (e.key === "Escape") setEditingSubtitle(false); }}
                    placeholder="Kroky / wizard…"
                    className="w-full min-w-0 h-6 px-2 text-[11px] text-monday-text-muted border border-monday-border rounded focus:outline-none"
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => onSubtitleChange && setEditingSubtitle(true)}
                    className="text-left w-full px-1 text-[11px] text-monday-text-muted hover:bg-monday-row-hover rounded truncate block"
                  >
                    {subtitle || (onSubtitleChange ? "+ Přidat kroky" : "")}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="relative ml-auto pr-2 shrink-0" ref={ref}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="p-1 rounded hover:bg-monday-row-hover text-monday-text-muted text-sm"
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="wp-dropdown wp-popover absolute right-0 top-full mt-1">
                <button type="button" onClick={() => { setEditing(true); setMenuOpen(false); }} className="wp-dropdown-item">Přejmenovat skupinu</button>
                <button type="button" onClick={() => { onCollapseAll(); setMenuOpen(false); }} className="wp-dropdown-item">Sbalit vše</button>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

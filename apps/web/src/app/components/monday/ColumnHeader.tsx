"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Shield, TrendingUp, Home, PiggyBank, Briefcase, CheckCircle2, FileText } from "lucide-react";
import type { Column, ColumnType } from "./types";

const COLUMN_ICONS: Record<string, string> = {
  zp: "🛡️",
  inv: "📈",
  hypo: "🏠",
  uver: "💳",
  dps: "🏦",
  pov_hav: "🚗",
  nem_dom: "🏢",
  odp: "⚖️",
};

const COLUMN_LUCIDE: Record<string, React.ReactNode> = {
  zp: <Shield size={14} />,
  inv: <TrendingUp size={14} />,
  hypo: <Home size={14} />,
  uver: <PiggyBank size={14} />,
  dps: <Briefcase size={14} />,
  pov_hav: <CheckCircle2 size={14} />,
  nem_dom: <Home size={14} />,
  odp: <FileText size={14} />,
};

const CHANGEABLE_TYPES: { type: ColumnType; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "number", label: "Číslo" },
  { type: "status", label: "Status" },
  { type: "date", label: "Datum" },
  { type: "product", label: "Produkt" },
];

interface ColumnHeaderProps {
  column: Column;
  isFirst: boolean;
  isStickyCorner: boolean;
  selectAllChecked?: boolean;
  selectAllIndeterminate?: boolean;
  onSelectAll?: (checked: boolean) => void;
  onResize: (columnId: string, width: number) => void;
  onHide: (columnId: string) => void;
  onRename: (columnId: string, title: string) => void;
  onDelete?: (columnId: string) => void;
  onSort: (columnId: string, dir: "asc" | "desc") => void;
  onChangeType?: (columnId: string, newType: ColumnType) => void;
  onAddColumnAfter?: (columnId: string) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, columnId: string) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent, columnId: string) => void;
  /** Monday style: render inner content only (no <th>), icon + title centered */
  mondayStyle?: boolean;
}

export function ColumnHeader({
  column,
  isFirst,
  isStickyCorner,
  selectAllChecked,
  selectAllIndeterminate,
  onSelectAll,
  onResize,
  onHide,
  onRename,
  onDelete,
  onSort,
  onChangeType,
  onAddColumnAfter,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  mondayStyle = false,
}: ColumnHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [renameVal, setRenameVal] = useState(column.title);
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    setRenameVal(column.title);
  }, [column.title]);

  useEffect(() => {
    if (menuOpen && menuButtonRef.current && mondayStyle && typeof document !== "undefined") {
      const rect = menuButtonRef.current.getBoundingClientRect();
      setMenuPosition({ top: rect.bottom + 4, left: rect.left });
    }
  }, [menuOpen, mondayStyle]);

  useEffect(() => {
    if (!menuOpen) { setTypeMenuOpen(false); return; }
    const h = (e: MouseEvent) => {
      const target = e.target as Node;
      const portal = document.getElementById("column-header-menu-portal");
      if (portal && portal.contains(target)) return;
      if (ref.current && !ref.current.contains(target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menuOpen]);

  const minW = column.minWidth ?? 60;
  const maxW = column.maxWidth ?? 400;
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startW: column.width };

    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const newW = Math.min(maxW, Math.max(minW, resizeRef.current.startW + (ev.clientX - resizeRef.current.startX)));
      onResize(column.id, newW);
    };

    const onUp = () => {
      resizeRef.current = null;
      document.body.classList.remove("is-resizing");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.body.classList.add("is-resizing");
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [column.id, column.width, minW, maxW, onResize]);

  const content = (
    <>
      <div className={`flex items-center gap-1 group ${mondayStyle && !isFirst ? "justify-center" : "justify-between"}`}>
        {isFirst && onSelectAll != null && (
          <input
            type="checkbox"
            checked={selectAllChecked ?? false}
            ref={(el) => { if (el) el.indeterminate = selectAllIndeterminate ?? false; }}
            onChange={(e) => onSelectAll(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 mr-1"
          />
        )}
        {editing ? (
          <input
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onBlur={() => { onRename(column.id, renameVal); setEditing(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { onRename(column.id, renameVal); setEditing(false); } if (e.key === "Escape") { setRenameVal(column.title); setEditing(false); } }}
            className="flex-1 min-w-0 h-6 px-1.5 text-[12px] border border-monday-blue rounded focus:outline-none"
            autoFocus
          />
        ) : (
          <span className={`truncate flex items-center gap-1 ${mondayStyle && !isFirst ? "flex-col" : ""}`}>
            {mondayStyle && !isFirst && COLUMN_LUCIDE[column.id] && <span className="text-slate-500">{COLUMN_LUCIDE[column.id]}</span>}
            {!mondayStyle && COLUMN_ICONS[column.id] && <span className="text-sm leading-none">{COLUMN_ICONS[column.id]}</span>}
            <span className={mondayStyle && !isFirst ? "text-[11px] mt-0.5 tracking-wider" : ""}>{column.title}</span>
            {!mondayStyle && (
              <span
                className="shrink-0 w-3.5 h-3.5 flex items-center justify-center rounded-full bg-monday-border/70 text-monday-text-muted text-[9px] font-bold cursor-help"
                data-tip={`${column.title} (${column.type})`}
                aria-label="Info o sloupci"
              >
                i
              </span>
            )}
          </span>
        )}
        {!mondayStyle && (
          <div className="relative shrink-0 opacity-0 group-hover:opacity-100" ref={ref}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="p-0.5 rounded hover:bg-monday-row-hover text-monday-text-muted"
              aria-label="Column menu"
            >
              &#x22EF;
            </button>
            {menuOpen && (
              <div className="wp-dropdown wp-popover absolute left-0 top-full mt-1 z-50">
                <button type="button" onClick={() => { setEditing(true); setMenuOpen(false); }} className="wp-dropdown-item">Přejmenovat sloupec</button>
                <button type="button" onClick={() => { onSort(column.id, "asc"); setMenuOpen(false); }} className="wp-dropdown-item">Seřadit vzestupně</button>
                <button type="button" onClick={() => { onSort(column.id, "desc"); setMenuOpen(false); }} className="wp-dropdown-item">Seřadit sestupně</button>
                <button type="button" onClick={() => { onHide(column.id); setMenuOpen(false); }} className="wp-dropdown-item">Skrýt sloupec</button>
                {onAddColumnAfter && (
                  <button type="button" onClick={() => { onAddColumnAfter(column.id); setMenuOpen(false); }} className="wp-dropdown-item">Přidat sloupec vpravo</button>
                )}
                {onChangeType && column.type !== "item" && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setTypeMenuOpen((o) => !o)}
                      className="wp-dropdown-item flex items-center justify-between"
                    >
                      Změnit typ
                      <span className="text-[10px] text-monday-text-muted ml-2">&#x25B6;</span>
                    </button>
                    {typeMenuOpen && (
                      <div className="wp-dropdown absolute left-full top-0 ml-1 min-w-[120px]">
                        {CHANGEABLE_TYPES.map((t) => (
                          <button
                            key={t.type}
                            type="button"
                            onClick={() => {
                              onChangeType(column.id, t.type);
                              setMenuOpen(false);
                            }}
                            className={`wp-dropdown-item ${column.type === t.type ? "font-semibold text-monday-blue" : ""}`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {onDelete && column.type !== "item" && (
                  <button type="button" onClick={() => { onDelete(column.id); setMenuOpen(false); }} className="wp-dropdown-item text-red-600">Smazat sloupec</button>
                )}
              </div>
            )}
          </div>
        )}
        {mondayStyle && (
          <div className="relative shrink-0 opacity-0 group-hover:opacity-100" ref={ref}>
            <button
              ref={menuButtonRef}
              type="button"
              onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
              className="p-0.5 rounded hover:bg-slate-100 text-slate-500 text-sm"
              aria-label="Menu sloupce"
            >
              &#x22EF;
            </button>
            {menuOpen && typeof document !== "undefined" && createPortal(
              <div
                id="column-header-menu-portal"
                className="board-context-menu fixed z-[400]"
                style={{ top: menuPosition.top, left: menuPosition.left }}
              >
                <div className="board-context-menu-inner">
                  <button type="button" onClick={() => { setEditing(true); setMenuOpen(false); }} className="board-context-item">Přejmenovat sloupec</button>
                  <button type="button" onClick={() => { onSort(column.id, "asc"); setMenuOpen(false); }} className="board-context-item">Seřadit vzestupně</button>
                  <button type="button" onClick={() => { onSort(column.id, "desc"); setMenuOpen(false); }} className="board-context-item">Seřadit sestupně</button>
                  <button type="button" onClick={() => { onHide(column.id); setMenuOpen(false); }} className="board-context-item">Skrýt sloupec</button>
                  {onAddColumnAfter && (
                    <button type="button" onClick={() => { onAddColumnAfter(column.id); setMenuOpen(false); }} className="board-context-item">Přidat sloupec vpravo</button>
                  )}
                  {onChangeType && column.type !== "item" && (
                    <>
                      <button type="button" onClick={() => setTypeMenuOpen((o) => !o)} className="board-context-item flex justify-between">
                        Změnit typ
                        <span className="text-[10px] opacity-70">&#x25B6;</span>
                      </button>
                      {typeMenuOpen && (
                        <div className="pl-3 border-l border-slate-200 ml-2 my-0.5 space-y-0">
                          {CHANGEABLE_TYPES.map((t) => (
                            <button
                              key={t.type}
                              type="button"
                              onClick={() => { onChangeType(column.id, t.type); setMenuOpen(false); }}
                              className={`board-context-item text-[13px] ${column.type === t.type ? "font-semibold text-monday-blue" : ""}`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {onDelete && column.type !== "item" && (
                    <button type="button" onClick={() => { onDelete(column.id); setMenuOpen(false); }} className="board-context-item is-danger">Smazat sloupec</button>
                  )}
                </div>
              </div>,
              document.body
            )}
          </div>
        )}
      </div>
      {column.type !== "item" && column.resizable !== false && (
        <div
          className="col-resize-hitbox"
          onMouseDown={handleResizeStart}
          title="Tažením změníš šířku sloupce"
          aria-label="Změna šířky sloupce"
        >
          <div className="col-resize-line" />
        </div>
      )}
    </>
  );

  if (mondayStyle) return <div className="relative w-full h-full">{content}</div>;
  return (
    <th
      className={`py-2 px-2 text-left text-monday-text-muted text-[12px] font-semibold border-b border-monday-border bg-monday-surface monday-cell-sep relative ${isStickyCorner ? "monday-sticky-corner pl-4" : ""}`}
      style={{ minWidth: column.width, width: column.width }}
      draggable={draggable && !isFirst && column.type !== "item"}
      onDragStart={draggable ? (e) => onDragStart?.(e, column.id) : undefined}
      onDragOver={draggable ? (e) => { e.preventDefault(); onDragOver?.(e); } : undefined}
      onDrop={draggable ? (e) => { e.preventDefault(); onDrop?.(e, column.id); } : undefined}
    >
      {content}
    </th>
  );
}

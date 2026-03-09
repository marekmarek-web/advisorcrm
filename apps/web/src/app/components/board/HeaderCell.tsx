"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Column, ColumnType } from "@/app/components/monday/types";
import { ResizeHandle } from "./ResizeHandle";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { ChevronDown } from "lucide-react";

const CHANGEABLE_TYPES: { type: ColumnType; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "number", label: "Číslo" },
  { type: "status", label: "Status" },
  { type: "date", label: "Datum" },
  { type: "product", label: "Produkt" },
];

export interface HeaderCellProps {
  column: Column;
  isFirst: boolean;
  selectAllChecked?: boolean;
  selectAllIndeterminate?: boolean;
  onSelectAll?: (checked: boolean) => void;
  onResize: (columnId: string, width: number) => void;
  onRename: (columnId: string, title: string) => void;
  onHide: (columnId: string) => void;
  onDelete?: (columnId: string) => void;
  onSort: (columnId: string, dir: "asc" | "desc") => void;
  onChangeType?: (columnId: string, newType: ColumnType) => void;
  onAddColumnAfter?: (columnId: string) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, columnId: string) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent, columnId: string) => void;
}

export function HeaderCell({
  column,
  isFirst,
  selectAllChecked,
  selectAllIndeterminate,
  onSelectAll,
  onResize,
  onRename,
  onHide,
  onDelete,
  onSort,
  onChangeType,
  onAddColumnAfter,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
}: HeaderCellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [renameVal, setRenameVal] = useState(column.title);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = checkboxRef.current;
    if (el) el.indeterminate = selectAllIndeterminate ?? false;
  }, [selectAllIndeterminate]);

  const handleCommitRename = useCallback(() => {
    const trimmed = renameVal.trim();
    if (trimmed && trimmed !== column.title) {
      onRename(column.id, trimmed);
    } else {
      setRenameVal(column.title);
    }
    setEditing(false);
  }, [column.id, column.title, renameVal, onRename]);

  const handleCancelRename = useCallback(() => {
    setRenameVal(column.title);
    setEditing(false);
  }, [column.title]);

  const getAnchorRect = useCallback(() => {
    const el = menuBtnRef.current;
    if (!el) return { top: 0, left: 0 };
    const rect = el.getBoundingClientRect();
    return { top: rect.bottom, left: rect.left };
  }, []);

  const menuItems: ContextMenuItem[] = [
    {
      type: "action",
      label: "Přejmenovat",
      onClick: () => {
        setMenuOpen(false);
        setEditing(true);
      },
    },
    { type: "separator" },
    {
      type: "action",
      label: "Seřadit vzestupně",
      onClick: () => onSort(column.id, "asc"),
    },
    {
      type: "action",
      label: "Seřadit sestupně",
      onClick: () => onSort(column.id, "desc"),
    },
    { type: "separator" },
    {
      type: "action",
      label: "Skrýt sloupec",
      onClick: () => onHide(column.id),
    },
    ...(onAddColumnAfter
      ? [
          {
            type: "action" as const,
            label: "Přidat sloupec vpravo",
            onClick: () => onAddColumnAfter(column.id),
          },
        ]
      : []),
    ...(onChangeType
      ? [
          {
            type: "submenu" as const,
            label: "Změnit typ",
            children: CHANGEABLE_TYPES.map(({ type, label }) => ({
              type: "action" as const,
              label,
              onClick: () => onChangeType(column.id, type),
            })),
          },
        ]
      : []),
    ...(onDelete
      ? [
          { type: "separator" as const },
          {
            type: "action" as const,
            label: "Smazat sloupec",
            onClick: () => onDelete(column.id),
            danger: true,
          },
        ]
      : []),
  ];

  const showResizeHandle = column.resizable !== false && column.type !== "item";
  const minWidth = column.minWidth ?? 50;
  const maxWidth = column.maxWidth ?? 500;

  if (editing) {
    return (
      <div className={`b-cell ${column.sticky ? "b-cell-sticky" : ""}`}>
        <div className="b-header-content">
          <input
            type="text"
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onBlur={handleCommitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCommitRename();
              if (e.key === "Escape") handleCancelRename();
            }}
            autoFocus
            className="b-header-edit-input"
            style={{ fontSize: "inherit" }}
          />
        </div>
        {showResizeHandle && (
          <ResizeHandle
            columnId={column.id}
            width={column.width}
            minWidth={minWidth}
            maxWidth={maxWidth}
            onResize={onResize}
          />
        )}
      </div>
    );
  }

  const canDrag = draggable && !isFirst && column.type !== "item";

  return (
    <div
      className={`b-cell ${column.sticky ? "b-cell-sticky" : ""}`}
      draggable={canDrag}
      onDragStart={canDrag && onDragStart ? (e) => onDragStart(e, column.id) : undefined}
      onDragOver={canDrag && onDragOver ? (e) => { e.preventDefault(); onDragOver(e); } : undefined}
      onDrop={canDrag && onDrop ? (e) => { e.preventDefault(); onDrop(e, column.id); } : undefined}
    >
      <div className="b-header-content">
        {isFirst && onSelectAll && (
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={selectAllChecked ?? false}
            onChange={(e) => onSelectAll(e.target.checked)}
            className="b-checkbox"
          />
        )}
        <span className="b-header-label">{column.title}</span>
        <button
          ref={menuBtnRef}
          type="button"
          className="b-header-menu-trigger"
          onClick={() => setMenuOpen(true)}
          aria-label="Otevřít menu"
        >
          <ChevronDown size={12} />
        </button>
      </div>
      {showResizeHandle && (
        <ResizeHandle
          columnId={column.id}
          width={column.width}
          minWidth={minWidth}
          maxWidth={maxWidth}
          onResize={onResize}
        />
      )}
      {menuOpen && (
        <ContextMenu
          items={menuItems}
          anchorRect={getAnchorRect()}
          anchorEl={menuBtnRef.current}
          anchorGap={4}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}

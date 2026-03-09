"use client";

import { useRef } from "react";
import type { Column, ColumnType } from "@/app/components/monday/types";
import { HeaderCell } from "./HeaderCell";

export interface BoardHeaderRowProps {
  visibleColumns: Column[];
  allSelected: boolean;
  someSelected: boolean;
  onSelectAll: (checked: boolean) => void;
  onResize: (columnId: string, width: number) => void;
  onRename: (columnId: string, title: string) => void;
  onHide: (columnId: string) => void;
  onDelete?: (columnId: string) => void;
  onSort: (columnId: string, dir: "asc" | "desc") => void;
  onChangeType?: (columnId: string, newType: ColumnType) => void;
  onAddColumnAfter?: (columnId: string) => void;
  onColumnReorder?: (fromId: string, toId: string) => void;
}

export function BoardHeaderRow({
  visibleColumns,
  allSelected,
  someSelected,
  onSelectAll,
  onResize,
  onRename,
  onHide,
  onDelete,
  onSort,
  onChangeType,
  onAddColumnAfter,
  onColumnReorder,
}: BoardHeaderRowProps) {
  const dragColRef = useRef<string | null>(null);

  return (
    <div className="b-row b-header-row">
      {visibleColumns.map((col, i) => (
        <HeaderCell
          key={col.id}
          column={col}
          isFirst={i === 0}
          selectAllChecked={i === 0 ? allSelected : undefined}
          selectAllIndeterminate={i === 0 ? someSelected && !allSelected : undefined}
          onSelectAll={i === 0 ? onSelectAll : undefined}
          onResize={onResize}
          onRename={onRename}
          onHide={onHide}
          onDelete={onDelete}
          onSort={onSort}
          onChangeType={onChangeType}
          onAddColumnAfter={onAddColumnAfter}
          draggable={!!onColumnReorder}
          onDragStart={(e, colId) => {
            dragColRef.current = colId;
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e, colId) => {
            e.preventDefault();
            if (dragColRef.current && dragColRef.current !== colId && onColumnReorder) {
              onColumnReorder(dragColRef.current, colId);
            }
            dragColRef.current = null;
          }}
        />
      ))}
      <div className="b-cell">
        <span className="text-[11px] text-[var(--board-text-muted)]">⋯</span>
      </div>
    </div>
  );
}

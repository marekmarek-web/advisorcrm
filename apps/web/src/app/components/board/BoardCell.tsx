"use client";

import { CellText } from "@/app/components/monday/CellText";
import { CellNumber } from "@/app/components/monday/CellNumber";
import { CellStatus } from "@/app/components/monday/CellStatus";
import { CellDate } from "@/app/components/monday/CellDate";
import { CellProduct } from "@/app/components/monday/CellProduct";
import type { Column, Item } from "@/app/components/monday/types";
import { User } from "lucide-react";

export interface BoardCellProps {
  column: Column;
  item: Item;
  isFirst: boolean;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onCellChange: (itemId: string, columnId: string, value: string | number) => void;
  onOpenItem?: (itemId: string) => void;
  onCellNoteChange?: (itemId: string, columnId: string, note: string) => void;
}

export function BoardCell({
  column,
  item,
  isFirst,
  selected,
  onSelect,
  onCellChange,
  onCellNoteChange,
}: BoardCellProps) {
  const cellValue = column.type === "item" ? item.name : item.cells[column.id];

  const isStatus = column.type === "status";

  return (
    <div
      className={`b-cell${isFirst ? " b-cell-sticky" : ""}${isStatus ? " b-cell-status" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      {column.type === "item" && (
        <>
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 mr-2 cursor-pointer"
          />
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center mr-2 shrink-0">
            <User size={13} className="text-slate-500" />
          </div>
          <div className="flex-1 min-w-0">
            {item.contactId && item.contactName ? (
              <span className="text-[14px] font-medium truncate block">{item.contactName}</span>
            ) : (
              <CellText
                value={String(item.name ?? "")}
                editable
                onChange={(v) => onCellChange(item.id, column.id, v)}
              />
            )}
          </div>
        </>
      )}
      {column.type === "text" && (
        <CellText
          value={String(cellValue ?? "")}
          editable
          onChange={(v) => onCellChange(item.id, column.id, v)}
        />
      )}
      {column.type === "status" && (
        <CellStatus
          value={String(cellValue ?? "")}
          onChange={(v) => onCellChange(item.id, column.id, v)}
          fullCell
          note={item.cellNotes?.[column.id]}
          onNoteChange={
            column.supportsNote && onCellNoteChange
              ? (v) => onCellNoteChange(item.id, column.id, v)
              : undefined
          }
        />
      )}
      {column.type === "number" && (
        <CellNumber
          value={cellValue ?? ""}
          onChange={(v) => onCellChange(item.id, column.id, v === "" ? "" : Number(v))}
        />
      )}
      {column.type === "date" && (
        <CellDate
          value={String(cellValue ?? "")}
          onChange={(v) => onCellChange(item.id, column.id, v)}
        />
      )}
      {column.type === "product" && (
        <CellProduct
          value={String(cellValue ?? "")}
          onChange={(v) => onCellChange(item.id, column.id, v)}
        />
      )}
    </div>
  );
}

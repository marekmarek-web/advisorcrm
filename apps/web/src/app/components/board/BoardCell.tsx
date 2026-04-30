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
  onOpenItem,
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
          <button
            type="button"
            className="mr-2 flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border-0 bg-gradient-to-br from-slate-200 to-slate-300 px-2 text-slate-500 shadow-sm transition hover:opacity-95 active:opacity-90 dark:from-slate-600 dark:to-slate-700 dark:text-slate-200"
            onClick={(e) => {
              e.stopPropagation();
              onOpenItem?.(item.id);
            }}
            aria-label="Otevřít detail položky"
            title="Otevřít detail položky"
          >
            <User size={15} className="shrink-0" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            {item.contactId && item.contactName ? (
              <span
                className="block cursor-default truncate text-[14px] font-medium text-[color:var(--wp-text)] select-text"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onOpenItem?.(item.id);
                }}
                title="Dvojklik otevře detail položky"
              >
                {item.contactName}
              </span>
            ) : (
              <CellText
                value={String(item.name ?? "")}
                editable
                onChange={(v) => onCellChange(item.id, column.id, v)}
                onDetailDoubleClick={onOpenItem ? () => onOpenItem(item.id) : undefined}
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

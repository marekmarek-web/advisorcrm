"use client";

import { memo } from "react";
import { User, MessageSquare } from "lucide-react";
import { CellText } from "./CellText";
import { CellNumber } from "./CellNumber";
import { CellStatus } from "./CellStatus";
import { CellDate } from "./CellDate";
import { CellProduct } from "./CellProduct";
import type { Column } from "./types";
import type { Item } from "./types";

const ACTIVE_STATUSES = new Set(["rozděláno", "k-podpisu", "domluvit"]);
const PRODUCT_COL_IDS = new Set(["zp", "inv", "hypo", "uver", "dps", "pov_hav", "nem_dom", "odp"]);

function itemHasPotential(item: Item): boolean {
  return Array.from(PRODUCT_COL_IDS).some((col) => ACTIVE_STATUSES.has(String(item.cells[col] ?? "")));
}

interface RowProps {
  item: Item;
  columns: Column[];
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onCellChange: (itemId: string, columnId: string, value: string | number) => void;
  onOpenItem?: (itemId: string) => void;
  onCellNoteChange?: (itemId: string, columnId: string, note: string) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent, droppedItemId: string) => void;
  groupId?: string;
  /** Monday-style table: zero-padding cells, sticky first col, full-cell status, action column */
  mondayStyle?: boolean;
  /** Width of the action column (for explicit style when using table-fixed) */
  actionColumnWidth?: number;
}

function RowComponent({
  item,
  columns,
  selected,
  onSelect,
  onCellChange,
  onOpenItem,
  draggable,
  onDragStart,
  onDrop,
  mondayStyle = false,
  onCellNoteChange,
  actionColumnWidth = 60,
}: RowProps) {
  const hasPotential = itemHasPotential(item);

  return (
    <tr
      className={`group/row border-b border-monday-border ${hasPotential ? "bg-amber-50/70" : ""} ${draggable ? "cursor-grab active:cursor-grabbing" : ""} ${mondayStyle ? "hover:bg-slate-50 transition-colors" : "monday-row-hover cursor-pointer"}`}
      onClick={() => !mondayStyle && onOpenItem?.(item.id)}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDrop ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } : undefined}
      onDrop={onDrop ? (e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id) onDrop(e, id); } : undefined}
    >
      {!mondayStyle && (
        <td className="w-1 p-0 border-r border-monday-border bg-monday-surface" style={{ width: 4, minWidth: 4 }} aria-hidden />
      )}
      {columns.map((col, colIndex) => {
        const isFirst = colIndex === 0;
        const cellValue = col.type === "item" ? item.name : item.cells[col.id];
        const tdClass = mondayStyle
          ? `${isFirst ? "sticky-col px-4 py-2 bg-white group-hover/row:bg-slate-50 border-b border-r border-slate-200/60 z-10" : "monday-td relative"}`
          : `monday-cell-sep bg-monday-surface ${isFirst ? "monday-sticky-first-col bg-monday-surface pl-2" : ""}`;

        if (col.type === "item") {
          const hasContact = !!item.contactId;
          const displayName = hasContact && item.contactName ? item.contactName : String(cellValue ?? "");
          return (
            <td key={col.id} className={`${tdClass} name-cell`} style={{ minWidth: col.width, width: col.width, maxWidth: col.width }}>
              <input
                type="checkbox"
                checked={selected}
                onChange={(e) => onSelect(e.target.checked)}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 cursor-pointer"
              />
              {mondayStyle && (
                <div className="avatar-dot">
                  <User size={14} />
                </div>
              )}
              <div className="flex-1 min-w-0 flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
                {hasContact ? (
                  <>
                    <span className={`row-title truncate ${mondayStyle ? "text-[15px]" : "text-[13px]"}`}>{displayName}</span>
                      {!mondayStyle && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onOpenItem?.(item.id); }}
                          className="text-[11px] text-monday-blue hover:underline text-left"
                        >
                          Přidat z domácnosti
                        </button>
                      )}
                    </>
                  ) : (
                    <CellText
                      value={String(cellValue ?? "")}
                      editable
                      onChange={(v) => onCellChange(item.id, col.id, v)}
                    />
                  )}
              </div>
            </td>
          );
        }

        if (col.type === "text") {
          return (
            <td key={col.id} className={tdClass} style={{ minWidth: col.width, width: col.width }} onClick={(e) => e.stopPropagation()}>
              <CellText
                value={String(cellValue ?? "")}
                editable
                onChange={(v) => onCellChange(item.id, col.id, v)}
              />
            </td>
          );
        }

        if (col.type === "status") {
          const statusTdClass = mondayStyle ? `${tdClass} monday-td-fullcell` : tdClass;
          return (
            <td key={col.id} className={statusTdClass} style={{ minWidth: col.width, width: col.width, maxWidth: col.width }} onClick={(e) => e.stopPropagation()}>
              <CellStatus
                value={String(cellValue ?? "")}
                onChange={(v) => onCellChange(item.id, col.id, v)}
                fullCell={mondayStyle}
                note={item.cellNotes?.[col.id]}
                onNoteChange={col.supportsNote && onCellNoteChange ? (v) => onCellNoteChange(item.id, col.id, v) : undefined}
              />
            </td>
          );
        }

        if (col.type === "number") {
          return (
            <td key={col.id} className={tdClass} style={{ minWidth: col.width, width: col.width, maxWidth: col.width }} onClick={(e) => e.stopPropagation()}>
              <CellNumber
                value={cellValue ?? ""}
                onChange={(v) => onCellChange(item.id, col.id, v === "" ? "" : Number(v))}
              />
            </td>
          );
        }

        if (col.type === "date") {
          return (
            <td key={col.id} className={tdClass} style={{ minWidth: col.width, width: col.width, maxWidth: col.width }} onClick={(e) => e.stopPropagation()}>
              <CellDate
                value={String(cellValue ?? "")}
                onChange={(v) => onCellChange(item.id, col.id, v)}
              />
            </td>
          );
        }

        if (col.type === "product") {
          return (
            <td key={col.id} className={tdClass} style={{ minWidth: col.width, width: col.width, maxWidth: col.width }} onClick={(e) => e.stopPropagation()}>
              <CellProduct
                value={String(cellValue ?? "")}
                onChange={(v) => onCellChange(item.id, col.id, v)}
              />
            </td>
          );
        }

        return null;
      })}
      {mondayStyle && (
        <td className="px-4 py-2 text-center border-b border-slate-200/60 bg-white group-hover/row:bg-slate-50 box-border" style={{ width: actionColumnWidth, minWidth: actionColumnWidth, maxWidth: actionColumnWidth }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenItem?.(item.id); }}
            className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200 rounded transition-colors opacity-0 group-hover/row:opacity-100"
            title="Otevřít"
          >
            <MessageSquare size={16} />
          </button>
        </td>
      )}
    </tr>
  );
}

export const Row = memo(RowComponent);

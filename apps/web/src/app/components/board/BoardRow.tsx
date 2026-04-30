"use client";

import { memo } from "react";
import { MessageSquare } from "lucide-react";
import type { Column, Item } from "@/app/components/monday/types";
import { BoardCell } from "./BoardCell";

export interface BoardRowProps {
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
}

function BoardRowComponent({
  item,
  columns,
  selected,
  onSelect,
  onCellChange,
  onOpenItem,
  onCellNoteChange,
  draggable,
  onDragStart,
  onDrop,
}: BoardRowProps) {
  return (
    <div
      className={`b-row b-data-row${selected ? " is-selected" : ""}${draggable ? " cursor-grab active:cursor-grabbing" : ""}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={
        onDrop
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }
          : undefined
      }
      onDrop={
        onDrop
          ? (e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              if (id) onDrop(e, id);
            }
          : undefined
      }
    >
      {columns.map((col, i) => (
        <BoardCell
          key={col.id}
          column={col}
          item={item}
          isFirst={i === 0}
          selected={selected}
          onSelect={onSelect}
          onCellChange={onCellChange}
          onOpenItem={onOpenItem}
          onCellNoteChange={onCellNoteChange}
        />
      ))}
      <div className="b-cell">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenItem?.(item.id);
          }}
          className="b-action-btn"
          aria-label="Otevřít detail položky"
          title="Otevřít detail položky"
        >
          <MessageSquare size={15} />
        </button>
      </div>
    </div>
  );
}

export const BoardRow = memo(BoardRowComponent);

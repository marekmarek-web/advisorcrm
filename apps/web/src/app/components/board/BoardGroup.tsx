"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Column, ColumnType, Group, Item } from "@/app/components/monday/types";
import { BoardHeaderRow } from "./BoardHeaderRow";
import { BoardRow } from "./BoardRow";
import { AddRow } from "./AddRow";
import { BoardSummaryRow } from "./BoardSummaryRow";
import { ContextMenu } from "./ContextMenu";

export interface BoardGroupProps {
  group: Group;
  groupItems: Item[];
  visibleColumns: Column[];
  selection: Set<string>;
  showSelectAll: boolean;
  onSelectAll: (checked: boolean) => void;
  onSelectItem: (itemId: string, checked: boolean) => void;
  onCellChange: (itemId: string, columnId: string, value: string | number) => void;
  onAddItem: (groupId: string) => void;
  onGroupToggleCollapse: (groupId: string) => void;
  onGroupRename: (groupId: string, name: string) => void;
  onGroupCollapseAll: () => void;
  onColumnResize: (columnId: string, width: number) => void;
  onColumnHide: (columnId: string) => void;
  onColumnRename: (columnId: string, title: string) => void;
  onColumnDelete?: (columnId: string) => void;
  onColumnSort: (columnId: string, dir: "asc" | "desc") => void;
  onColumnChangeType?: (columnId: string, newType: ColumnType) => void;
  onAddColumnAfter?: (columnId: string) => void;
  onColumnReorder?: (fromId: string, toId: string) => void;
  onOpenItem?: (itemId: string) => void;
  onCellNoteChange?: (itemId: string, columnId: string, note: string) => void;
  onItemMove?: (itemId: string, targetGroupId: string, targetIndex: number) => void;
  onGroupReorder?: (fromGroupId: string, toGroupId: string) => void;
}

export function BoardGroup({
  group,
  groupItems,
  visibleColumns,
  selection,
  showSelectAll,
  onSelectAll,
  onSelectItem,
  onCellChange,
  onAddItem,
  onGroupToggleCollapse,
  onGroupRename,
  onGroupCollapseAll,
  onColumnResize,
  onColumnHide,
  onColumnRename,
  onColumnDelete,
  onColumnSort,
  onColumnChangeType,
  onAddColumnAfter,
  onColumnReorder,
  onOpenItem,
  onCellNoteChange,
  onItemMove,
  onGroupReorder,
}: BoardGroupProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(group.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [menuAnchor, setMenuAnchor] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!editingName) {
      setNameVal(group.name);
    }
  }, [group.name, editingName]);

  const commitGroupName = () => {
    const trimmed = nameVal.trim();
    const next = trimmed.length > 0 ? trimmed : group.name;
    onGroupRename(group.id, next);
    setEditingName(false);
  };

  return (
    <div className="b-group">
      <div
        className="b-group-title group"
        draggable={!!onGroupReorder}
        onDragStart={onGroupReorder ? (e) => { e.dataTransfer.setData("application/group-id", group.id); e.dataTransfer.effectAllowed = "move"; } : undefined}
        onDragOver={onGroupReorder ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } : undefined}
        onDrop={onGroupReorder ? (e) => { e.preventDefault(); const fromId = e.dataTransfer.getData("application/group-id"); if (fromId && fromId !== group.id) onGroupReorder(fromId, group.id); } : undefined}
      >
        <button
          type="button"
          className="b-group-toggle flex shrink-0 items-center justify-center rounded border-0 bg-transparent p-0 text-[color:var(--board-text)] hover:bg-[rgba(0,0,0,0.04)]"
          aria-expanded={!group.collapsed}
          aria-label={group.collapsed ? "Rozbalit skupinu" : "Sbalit skupinu"}
          onClick={(e) => {
            e.stopPropagation();
            onGroupToggleCollapse(group.id);
          }}
        >
          {group.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>
        <button
          type="button"
          className="b-group-bar"
          style={{ background: group.color }}
          aria-label={group.collapsed ? "Rozbalit skupinu" : "Sbalit skupinu"}
          onClick={(e) => {
            e.stopPropagation();
            onGroupToggleCollapse(group.id);
          }}
        />
        {editingName ? (
          <input
            type="text"
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            onBlur={() => {
              commitGroupName();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitGroupName();
              } else if (e.key === "Escape") {
                setNameVal(group.name);
                setEditingName(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            style={{ color: group.color }}
            className="b-group-name-input"
          />
        ) : (
          <h2
            className="b-group-name cursor-text select-text rounded px-0.5 hover:bg-[rgba(0,0,0,0.04)]"
            style={{ color: group.color }}
            title="Upravit název skupiny"
            onClick={(e) => {
              e.stopPropagation();
              setNameVal(group.name);
              setEditingName(true);
            }}
          >
            {group.name}
          </h2>
        )}
        <span className="b-group-count">{groupItems.length} klientů</span>
        <div className="ml-auto" onClick={(e) => e.stopPropagation()}>
          <button
            ref={menuBtnRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              setMenuAnchor({ top: rect.bottom + 4, left: rect.left });
              setMenuOpen((o) => !o);
            }}
            className="p-1 rounded text-[var(--board-text-muted)] hover:bg-[rgba(0,0,0,0.04)] opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ opacity: menuOpen ? 1 : undefined }}
          >
            ⋯
          </button>
          {menuOpen && (
            <ContextMenu
              anchorRect={menuAnchor}
              anchorEl={menuBtnRef.current}
              anchorGap={4}
              onClose={() => setMenuOpen(false)}
              items={[
                {
                  type: "action",
                  label: "Přejmenovat skupinu",
                  onClick: () => {
                    setNameVal(group.name);
                    setEditingName(true);
                  },
                },
                {
                  type: "action",
                  label: "Sbalit vše",
                  onClick: () => onGroupCollapseAll(),
                },
              ]}
            />
          )}
        </div>
      </div>
      {!group.collapsed && (
        <div className="b-group-body" style={{ borderLeftColor: group.color }}>
          <BoardHeaderRow
            visibleColumns={visibleColumns}
            allSelected={showSelectAll && groupItems.length > 0 && groupItems.every((it) => selection.has(it.id))}
            someSelected={showSelectAll && groupItems.some((it) => selection.has(it.id))}
            onSelectAll={onSelectAll}
            onResize={onColumnResize}
            onRename={onColumnRename}
            onHide={onColumnHide}
            onDelete={onColumnDelete}
            onSort={onColumnSort}
            onChangeType={onColumnChangeType}
            onAddColumnAfter={onAddColumnAfter}
            onColumnReorder={onColumnReorder}
          />
          {groupItems.map((item, idx) => (
            <BoardRow
              key={item.id}
              item={item}
              columns={visibleColumns}
              selected={selection.has(item.id)}
              onSelect={(checked) => onSelectItem(item.id, checked)}
              onCellChange={onCellChange}
              onOpenItem={onOpenItem}
              onCellNoteChange={onCellNoteChange}
              draggable={!!onItemMove}
              onDragStart={
                onItemMove
                  ? (e) => {
                      e.dataTransfer.setData("text/plain", item.id);
                      e.dataTransfer.effectAllowed = "move";
                    }
                  : undefined
              }
              onDrop={onItemMove ? (e, droppedId) => onItemMove(droppedId, group.id, idx) : undefined}
            />
          ))}
          <AddRow onAddItem={() => onAddItem(group.id)} visibleColumnsCount={visibleColumns.length} />
          <BoardSummaryRow visibleColumns={visibleColumns} items={groupItems} />
        </div>
      )}
    </div>
  );
}

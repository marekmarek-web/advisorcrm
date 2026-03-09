"use client";
/* Fix the existing board in place. Do not delete, hide, simplify, or replace columns. Preserve the full schema and only repair layout, sizing, scrolling, status rendering, summaries, and notes. */

import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import { ColumnHeader } from "./ColumnHeader";
import { Row } from "./Row";
import { SelectionBar } from "./SelectionBar";
import { SkeletonLine, SkeletonTableRow } from "@/app/components/Skeleton";
import { getStatusLabels } from "@/app/lib/status-labels";
import type { Column, ColumnType, Group, Item } from "./types";

const STATUS_DONE_ID = "hotovo";
const STATUS_IN_PROGRESS_ID = "rozděláno";
/** Single source for action column width; must match colgroup and last th/td */
const ACTION_COLUMN_WIDTH = 60;

interface BoardTableProps {
  loading?: boolean;
  columns: Column[];
  visibleColumns: Column[];
  hiddenColumnIds: Set<string>;
  groups: Group[];
  items: Record<string, Item>;
  selection: Set<string>;
  onSelectAll: (checked: boolean) => void;
  onSelectItem: (itemId: string, checked: boolean) => void;
  onCellChange: (itemId: string, columnId: string, value: string | number) => void;
  onAddItem: (groupId: string) => void;
  onGroupToggleCollapse: (groupId: string) => void;
  onGroupRename: (groupId: string, name: string) => void;
  onGroupSubtitleChange?: (groupId: string, subtitle: string) => void;
  onGroupCollapseAll: () => void;
  onColumnResize: (columnId: string, width: number) => void;
  onColumnHide: (columnId: string) => void;
  onColumnRename: (columnId: string, title: string) => void;
  onColumnDelete?: (columnId: string) => void;
  onColumnSort: (columnId: string, dir: "asc" | "desc") => void;
  onColumnChangeType?: (columnId: string, newType: ColumnType) => void;
  onColumnReorder?: (fromId: string, toId: string) => void;
  onAddColumnAfter?: (columnId: string) => void;
  onAddGroup?: () => void;
  onClearSelection: () => void;
  onDeleteSelected: () => void;
  onMoveSelectedToGroup: (groupId: string) => void;
  onItemMove?: (itemId: string, targetGroupId: string, targetIndex: number) => void;
  onOpenItem?: (itemId: string) => void;
  onCellNoteChange?: (itemId: string, columnId: string, note: string) => void;
}

export function BoardTable({
  loading = false,
  columns,
  visibleColumns,
  hiddenColumnIds,
  groups,
  items,
  selection,
  onSelectAll,
  onSelectItem,
  onCellChange,
  onAddItem,
  onGroupToggleCollapse,
  onGroupRename,
  onGroupSubtitleChange,
  onGroupCollapseAll,
  onColumnResize,
  onColumnHide,
  onColumnRename,
  onColumnDelete,
  onColumnSort,
  onColumnChangeType,
  onColumnReorder,
  onAddColumnAfter,
  onAddGroup,
  onClearSelection,
  onDeleteSelected,
  onMoveSelectedToGroup,
  onItemMove,
  onOpenItem,
  onCellNoteChange,
}: BoardTableProps) {
  const allVisibleItemIds = groups.flatMap((g) => g.itemIds);
  const allSelected = allVisibleItemIds.length > 0 && allVisibleItemIds.every((id) => selection.has(id));
  const someSelected = allVisibleItemIds.some((id) => selection.has(id));
  const dragColRef = useRef<string | null>(null);

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [groupMenuOpenId, setGroupMenuOpenId] = useState<string | null>(null);
  const groupMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!groupMenuOpenId) return;
    const h = (e: MouseEvent) => {
      if (groupMenuRef.current && !groupMenuRef.current.contains(e.target as Node)) setGroupMenuOpenId(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [groupMenuOpenId]);

  const statusLabels = getStatusLabels();
  const doneColor = statusLabels.find((s) => s.id === STATUS_DONE_ID)?.color ?? "#00c875";
  const inProgressColor = statusLabels.find((s) => s.id === STATUS_IN_PROGRESS_ID)?.color ?? "#fdab3d";

  /** Single source of truth: total table width = sum of column widths + action column. No arbitrary stretch. */
  const totalTableWidth =
    visibleColumns.reduce((sum, c) => sum + c.width, 0) + ACTION_COLUMN_WIDTH;

  return (
    <div className="board-shell flex flex-col flex-1 min-h-0">
      <SelectionBar
        count={selection.size}
        onClear={onClearSelection}
        onDelete={onDeleteSelected}
        onMoveToGroup={onMoveSelectedToGroup}
        groupOptions={groups.map((g) => ({ id: g.id, name: g.name }))}
      />
      <div className="board-scroll overflow-auto flex-1 relative px-6 py-4">
        {loading && (
          <div className="absolute inset-0 z-10 bg-white/80 flex items-center justify-center pointer-events-none">
            <table className="w-full border-collapse" style={{ minWidth: "max-content" }}>
              <thead>
                <tr>
                  {visibleColumns.map((col) => (
                    <th key={col.id} className="py-2 px-2 border-b border-monday-border">
                      <SkeletonLine className="h-3 w-20" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonTableRow key={i} columns={visibleColumns.length} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Single horizontal scroll: content width = sum of column widths; no stretch */}
        <div className="monday-board-wrap" style={{ width: totalTableWidth }}>
          {groups.map((group, groupIndex) => {
            const groupItems = group.itemIds.map((id) => items[id]).filter(Boolean) as Item[];
            const showSelectAll = groupIndex === 0;

            return (
              <div key={group.id} className="group-section">
                <div
                  className="group-title-row group/header"
                  onClick={() => onGroupToggleCollapse(group.id)}
                >
                  <button type="button" className="group-toggle" aria-label={group.collapsed ? "Rozbalit" : "Sbalit"} onClick={(e) => e.stopPropagation()}>
                    {group.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <div className="group-color" style={{ background: group.color }} />
                  {editingGroupId === group.id ? (
                    <input
                      value={editingGroupName}
                      onChange={(e) => setEditingGroupName(e.target.value)}
                      onBlur={() => {
                        onGroupRename(group.id, editingGroupName.trim() || group.name);
                        setEditingGroupId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onGroupRename(group.id, editingGroupName.trim() || group.name);
                          setEditingGroupId(null);
                        }
                        if (e.key === "Escape") setEditingGroupId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="group-title border border-[var(--border-strong)] rounded-md px-2 py-1 min-w-[120px] outline-none focus:ring-2 focus:ring-[#4f7cff]/30"
                      style={{ color: group.color }}
                      autoFocus
                    />
                  ) : (
                    <h2 className="group-title" style={{ color: group.color }}>
                      {group.name}
                    </h2>
                  )}
                  <span className="group-count">{groupItems.length} klientů</span>
                  <div className="relative ml-auto flex items-center" ref={groupMenuOpenId === group.id ? groupMenuRef : null} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setGroupMenuOpenId(groupMenuOpenId === group.id ? null : group.id);
                      }}
                      className="p-1 rounded opacity-0 group-hover/header:opacity-100 hover:bg-slate-100 text-slate-500 text-sm"
                    >
                      ⋯
                    </button>
                    {groupMenuOpenId === group.id && (
                      <div className="board-context-menu absolute right-0 top-full mt-1 z-50">
                        <div className="board-context-menu-inner">
                          <button type="button" onClick={(e) => { e.stopPropagation(); setEditingGroupName(group.name); setEditingGroupId(group.id); setGroupMenuOpenId(null); }} className="board-context-item">Přejmenovat skupinu</button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); onGroupCollapseAll(); setGroupMenuOpenId(null); }} className="board-context-item">Sbalit vše</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {!group.collapsed && (
                  <div className="group-body border-l-2 bg-white" style={{ borderLeftColor: group.color }}>
                    <table
                      className="monday-table text-left bg-white table-fixed"
                      style={{ tableLayout: "fixed", width: totalTableWidth }}
                    >
                      <colgroup>
                        {visibleColumns.map((col) => (
                          <col key={col.id} style={{ width: col.width }} />
                        ))}
                        <col style={{ width: ACTION_COLUMN_WIDTH }} />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-[var(--border-soft)] h-10">
                          {visibleColumns.map((col, i) => (
                            <th
                              key={col.id}
                              className={`monday-th font-normal text-[var(--text-muted)] text-xs border-b border-[var(--border-soft)] bg-[var(--bg-header)] box-border relative overflow-visible ${i === 0 ? "sticky-col-th px-4 text-left" : "text-center px-0"}`}
                              style={{ width: col.width, minWidth: col.width, maxWidth: col.width, height: 40 }}
                            >
                              <div className={`h-full ${i === 0 ? "flex items-center justify-between" : "flex flex-col items-center justify-center"}`}>
                                <ColumnHeader
                                  column={col}
                                  isFirst={i === 0}
                                  isStickyCorner={i === 0}
                                  selectAllChecked={i === 0 && showSelectAll ? allSelected : undefined}
                                  selectAllIndeterminate={i === 0 && showSelectAll ? someSelected && !allSelected : undefined}
                                  onSelectAll={i === 0 && showSelectAll ? onSelectAll : undefined}
                                  onResize={onColumnResize}
                                  onHide={onColumnHide}
                                  onRename={onColumnRename}
                                  onDelete={onColumnDelete}
                                  onSort={onColumnSort}
                                  onChangeType={onColumnChangeType}
                                  draggable={!!onColumnReorder}
                                  onDragStart={(e, colId) => { dragColRef.current = colId; e.dataTransfer.effectAllowed = "move"; }}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={(e, colId) => { e.preventDefault(); if (dragColRef.current && dragColRef.current !== colId && onColumnReorder) onColumnReorder(dragColRef.current, colId); dragColRef.current = null; }}
                                  onAddColumnAfter={onAddColumnAfter}
                                  mondayStyle
                                />
                                {i === 0 && <span className="text-slate-300">|</span>}
                              </div>
                            </th>
                          ))}
                          <th className="monday-th font-normal text-[var(--text-muted)] text-xs px-4 border-b border-[var(--border-soft)] text-center bg-[var(--bg-header)] box-border" style={{ width: ACTION_COLUMN_WIDTH, minWidth: ACTION_COLUMN_WIDTH, maxWidth: ACTION_COLUMN_WIDTH }}>
                            Akce
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupItems.map((item, idx) => (
                          <Row
                            key={item.id}
                            item={item}
                            columns={visibleColumns}
                            selected={selection.has(item.id)}
                            onSelect={(checked) => onSelectItem(item.id, checked)}
                            onCellChange={onCellChange}
                            onOpenItem={onOpenItem}
                            onCellNoteChange={onCellNoteChange}
                            draggable={!!onItemMove}
                            onDragStart={onItemMove ? (e) => { e.dataTransfer.setData("text/plain", item.id); e.dataTransfer.effectAllowed = "move"; } : undefined}
                            onDrop={onItemMove ? (e, droppedItemId) => onItemMove(droppedItemId, group.id, idx) : undefined}
                            groupId={group.id}
                            mondayStyle
                            actionColumnWidth={ACTION_COLUMN_WIDTH}
                          />
                        ))}
                        <tr>
                          <td className="sticky-col bg-white border-r border-[var(--border-soft)] border-b border-[var(--border-soft)]">
                            <input
                              type="text"
                              placeholder="+ Přidat klienta"
                              onFocus={() => onAddItem(group.id)}
                              className="w-full h-10 px-4 text-sm text-[var(--text-muted)] outline-none hover:bg-[var(--bg-cell-hover)] focus:bg-white transition-colors border-none box-border"
                            />
                          </td>
                          <td colSpan={visibleColumns.length - 1} className="bg-[var(--bg-header)] border-b border-[var(--border-soft)]" />
                          <td className="bg-[var(--bg-header)] border-b border-[var(--border-soft)]" style={{ width: ACTION_COLUMN_WIDTH }} />
                        </tr>
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-[var(--border-soft)]">
                          <td className="sticky-col bg-white border-r border-[var(--border-soft)] p-1 align-top box-border" style={{ width: visibleColumns[0]?.width, minWidth: visibleColumns[0]?.width, maxWidth: visibleColumns[0]?.width }} />
                          {visibleColumns.slice(1).map((col) => {
                            if (col.type !== "status" || !col.hasSummary) {
                              return <td key={col.id} className="p-1 border-r border-[var(--border-soft)] bg-[var(--bg-header)] box-border" style={{ width: col.width, minWidth: col.width, maxWidth: col.width }} />;
                            }
                            const total = groupItems.length;
                            const done = groupItems.filter((it) => it.cells[col.id] === STATUS_DONE_ID).length;
                            const inProgress = groupItems.filter((it) => it.cells[col.id] === STATUS_IN_PROGRESS_ID).length;
                            const donePct = total === 0 ? 0 : (done / total) * 100;
                            const inProgPct = total === 0 ? 0 : (inProgress / total) * 100;
                            return (
                              <td key={col.id} className="p-1 border-r border-[var(--border-soft)] bg-[var(--bg-header)] align-top box-border" style={{ width: col.width, minWidth: col.width, maxWidth: col.width }}>
                                <div className="summary-track">
                                  <div className="flex h-full">
                                    <div className="summary-segment" style={{ width: `${donePct}%`, backgroundColor: doneColor }} />
                                    <div className="summary-segment" style={{ width: `${inProgPct}%`, backgroundColor: inProgressColor }} />
                                  </div>
                                </div>
                              </td>
                            );
                          })}
                          <td className="p-1 bg-[var(--bg-header)] box-border" style={{ width: ACTION_COLUMN_WIDTH, minWidth: ACTION_COLUMN_WIDTH, maxWidth: ACTION_COLUMN_WIDTH }} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {onAddGroup && (
            <div className="mt-4">
              <button
                type="button"
                onClick={onAddGroup}
                className="flex items-center gap-2 px-4 py-2.5 text-[13px] text-slate-500 hover:bg-slate-50 rounded-lg border-2 border-dashed border-slate-200 font-medium"
              >
                + Přidat skupinu
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

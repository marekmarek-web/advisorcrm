"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ActivityEntry } from "@/app/components/monday/RightPanel";
import { BoardHeader } from "@/app/components/monday/BoardHeader";
import { Toolbar } from "@/app/components/monday/Toolbar";
import { KPIBar } from "@/app/components/monday/KPIBar";
import { BoardShell } from "@/app/components/board/BoardShell";
import { BoardScroller } from "@/app/components/board/BoardScroller";
import { BoardGroup } from "@/app/components/board/BoardGroup";
import { SelectionBar } from "@/app/components/monday/SelectionBar";
import { RightPanel } from "@/app/components/monday/RightPanel";
import type { Board, Column, ColumnType, Group, Item } from "@/app/components/monday/types";
import { createSeedBoard, nextId, nextViewIdSeq, DEFAULT_CELLS } from "@/app/board/seed-data";
import { loadPortalState, savePortalState } from "@/app/lib/portal-state";
import {
  listBoardViews,
  createBoardView,
  saveBoardViewConfig,
  saveBoardItemsBatch,
  deleteBoardItems as deleteBoardItemsAction,
  createBoardItem,
  updateBoardViewName,
  updateBoardItem,
} from "@/app/actions/board";
import { getContactsList } from "@/app/actions/contacts";
import { BaseModal } from "@/app/components/BaseModal";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { PRODUCT_COLUMNS } from "@/app/board/seed-data";
import { Filter, ArrowUpDown } from "lucide-react";

const GROUP_COLORS = ["#579bfc", "#00c875", "#fdab3d", "#a25ddc", "#ff642e", "#ffcb00", "#037f4c", "#333333"];

const STATUS_DONE = "hotovo";
const ACTIVE_STATUSES = new Set(["rozděláno", "k-podpisu", "domluvit"]);

function openCasesCount(items: Record<string, Item>): number {
  return Object.values(items).filter((item) =>
    PRODUCT_COLUMNS.some((col) => {
      const v = item.cells[col];
      return v && v !== STATUS_DONE && v !== "x" && v !== "zatím-ne";
    })
  ).length;
}

function itemHasPotential(item: Item): boolean {
  return PRODUCT_COLUMNS.some((col) => {
    const v = String(item.cells[col] ?? "");
    return ACTIVE_STATUSES.has(v);
  });
}

function getInitialPortalState() {
  const seed = createSeedBoard();
  return loadPortalState(seed);
}

interface PortalBoardViewProps {
  dbViewId?: string;
  initialBoard?: Board;
}

export function PortalBoardView({ dbViewId, initialBoard }: PortalBoardViewProps = {}) {
  const fallback = useMemo(() => {
    if (initialBoard) {
      const cols = initialBoard.views[0]?.columns ?? [];
      const hiddenIds = cols.filter((c) => c.hidden).map((c) => c.id);
      return { board: initialBoard, hiddenColumnIds: hiddenIds, activeViewId: initialBoard.views[0]?.id ?? "v1" };
    }
    return getInitialPortalState();
  }, [initialBoard]);

  const router = useRouter();
  const [board, setBoard] = useState<Board>(() => fallback.board);
  const [activeViewId, setActiveViewId] = useState(() => fallback.activeViewId);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [hiddenColumnIds, setHiddenColumnIds] = useState<Set<string>>(() => new Set(fallback.hiddenColumnIds));
  const [viewsList, setViewsList] = useState<{ id: string; name: string }[]>([]);
  const [newBoardModalOpen, setNewBoardModalOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [newBoardTemplateId, setNewBoardTemplateId] = useState<string>("");
  const [newBoardCreating, setNewBoardCreating] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoad = useRef(true);
  useEffect(() => {
    if (initialLoad.current) {
      initialLoad.current = false;
      return;
    }
    if (!dbViewId) {
      savePortalState({ board, hiddenColumnIds: Array.from(hiddenColumnIds), activeViewId });
      return;
    }
    if (saveTimerRef.current != null) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    saveTimerRef.current = setTimeout(() => {
      const view = board.views.find((v) => v.id === activeViewId);
      if (view) {
        // Per-view: each board view has its own column config and groups (editable column/template logika)
        saveBoardViewConfig(dbViewId, {
          columnsConfig: view.columns,
          groupsConfig: board.groups.map((g) => ({ id: g.id, name: g.name, color: g.color, collapsed: g.collapsed, subtitle: g.subtitle })),
        }).catch(() => {});
      }
      // Always use item.name from state (never from cells) so changing status never overwrites client name
      const allItems = board.groups.flatMap((g, gi) =>
        g.itemIds.map((itemId, ii) => {
          const item = board.items[itemId];
          return item ? { id: item.id, name: item.name, groupId: g.id, cells: item.cells as Record<string, string | number>, sortOrder: gi * 1000 + ii } : null;
        }).filter(Boolean) as Array<{ id: string; name: string; groupId: string; cells: Record<string, string | number>; sortOrder: number }>
      );
      saveBoardItemsBatch(dbViewId, allItems).catch(() => {});
    }, 1500);
  }, [board, hiddenColumnIds, activeViewId, dbViewId]);
  useEffect(() => {
    if (!dbViewId) return;
    listBoardViews().then(setViewsList).catch(() => setViewsList([]));
  }, [dbViewId]);

  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [sortColumnId, setSortColumnId] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [groupBy, setGroupBy] = useState<"none" | "status">("none");
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [hideOpen, setHideOpen] = useState(false);
  const [groupByOpen, setGroupByOpen] = useState(false);
  const [personOpen, setPersonOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [panelContacts, setPanelContacts] = useState<Array<{ id: string; firstName: string; lastName: string }>>([]);
  const [activityByItem, setActivityByItem] = useState<Record<string, ActivityEntry[]>>({});
  const [tableLoading, setTableLoading] = useState(false);
  const tableLoadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addGroupModalOpen, setAddGroupModalOpen] = useState(false);
  const [addGroupName, setAddGroupName] = useState("");
  const [addGroupColor, setAddGroupColor] = useState(GROUP_COLORS[0]);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const activeView = useMemo(() => board.views.find((v) => v.id === activeViewId), [board.views, activeViewId]);
  const columns = activeView?.columns ?? [];
  const visibleColumns = useMemo(() => columns.filter((c) => !hiddenColumnIds.has(c.id)), [columns, hiddenColumnIds]);

  const filteredAndSortedGroups = useMemo(() => {
    let itemIdsByGroup = board.groups.map((g) => ({ ...g, itemIds: [...g.itemIds] }));

    itemIdsByGroup = itemIdsByGroup.map((g) => ({
      ...g,
      itemIds: g.itemIds.filter((id) => {
        const item = board.items[id];
        if (!item) return false;
        if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        if (filterStatus) {
          const hasStatus = PRODUCT_COLUMNS.some((col) => item.cells[col] === filterStatus);
          if (!hasStatus) return false;
        }
        return true;
      }),
    }));

    if (sortColumnId && sortDir) {
      itemIdsByGroup = itemIdsByGroup.map((g) => ({
        ...g,
        itemIds: [...g.itemIds].sort((a, b) => {
          const itemA = board.items[a];
          const itemB = board.items[b];
          if (!itemA || !itemB) return 0;
          let valA: string | number = sortColumnId === "item" ? itemA.name : itemA.cells[sortColumnId];
          let valB: string | number = sortColumnId === "item" ? itemB.name : itemB.cells[sortColumnId];
          if (typeof valA === "number" && typeof valB === "number") {
            return sortDir === "asc" ? valA - valB : valB - valA;
          }
          const sA = String(valA ?? "");
          const sB = String(valB ?? "");
          return sortDir === "asc" ? sA.localeCompare(sB) : sB.localeCompare(sA);
        }),
      }));
    }

    return itemIdsByGroup;
  }, [board.groups, board.items, searchQuery, filterStatus, sortColumnId, sortDir]);

  const kpiOpenCases = useMemo(() => openCasesCount(board.items), [board.items]);
  const kpiPotentialDeals = useMemo(() => {
    return Object.values(board.items).filter((item) =>
      PRODUCT_COLUMNS.some((col) => ACTIVE_STATUSES.has(String(item.cells[col] ?? "")))
    ).length;
  }, [board.items]);

  const onViewChange = useCallback(
    (viewId: string) => {
      if (dbViewId && viewId !== dbViewId) {
        router.push(`/portal/board?viewId=${encodeURIComponent(viewId)}`);
        return;
      }
      setActiveViewId(viewId);
    },
    [dbViewId, router]
  );
  const onViewNameChange = useCallback(
    (name: string) => {
      const trimmed = name.trim() || board.name;
      setBoard((b) => ({
        ...b,
        name: trimmed,
        views: b.views.map((v) => (v.id === activeViewId ? { ...v, name: trimmed } : v)),
      }));
      if (dbViewId) updateBoardViewName(dbViewId, trimmed).catch(() => {});
    },
    [activeViewId, dbViewId, board.name]
  );
  const onAddView = useCallback(() => {
    if (dbViewId) {
      setNewBoardName("");
      setNewBoardTemplateId(dbViewId);
      setNewBoardModalOpen(true);
      return;
    }
    const newView = {
      id: nextViewIdSeq(),
      name: "Nástěnka",
      columns: activeView ? activeView.columns.map((c) => ({ ...c })) : [],
    };
    setBoard((b) => ({ ...b, views: [...b.views, newView] }));
    setActiveViewId(newView.id);
  }, [dbViewId, activeView]);

  const triggerTableLoading = useCallback(() => {
    setTableLoading(true);
    if (tableLoadingTimerRef.current != null) { clearTimeout(tableLoadingTimerRef.current); tableLoadingTimerRef.current = null; }
    tableLoadingTimerRef.current = setTimeout(() => setTableLoading(false), 300);
  }, []);

  const onColumnHide = useCallback((columnId: string) => {
    setHiddenColumnIds((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) next.delete(columnId);
      else next.add(columnId);
      return next;
    });
    triggerTableLoading();
  }, [triggerTableLoading]);
  const onColumnRename = useCallback((columnId: string, title: string) => {
    setBoard((b) => ({
      ...b,
      views: b.views.map((v) => ({
        ...v,
        columns: v.columns.map((c) => (c.id === columnId ? { ...c, title } : c)),
      })),
    }));
    if (dbViewId) {
      const view = board.views.find((v) => v.id === activeViewId);
      if (view) {
        const nextColumns = view.columns.map((c) => (c.id === columnId ? { ...c, title } : c));
        saveBoardViewConfig(dbViewId, {
          columnsConfig: nextColumns,
          groupsConfig: board.groups.map((g) => ({ id: g.id, name: g.name, color: g.color, collapsed: g.collapsed, subtitle: g.subtitle })),
        }).catch(() => {});
      }
    }
  }, [dbViewId, activeViewId, board.views, board.groups]);
  const onColumnSort = useCallback((columnId: string, dir: "asc" | "desc") => {
    setSortColumnId(columnId);
    setSortDir(dir);
  }, []);
  const onColumnDelete = useCallback((columnId: string) => {
    setBoard((b) => ({
      ...b,
      views: b.views.map((v) => ({
        ...v,
        columns: v.columns.filter((c) => c.id !== columnId),
      })),
    }));
    setHiddenColumnIds((prev) => {
      const next = new Set(prev);
      next.delete(columnId);
      return next;
    });
    if (sortColumnId === columnId) {
      setSortColumnId(null);
      setSortDir("asc");
    }
  }, [sortColumnId]);

  const onColumnResize = useCallback((columnId: string, width: number) => {
    setBoard((b) => ({
      ...b,
      views: b.views.map((v) => ({
        ...v,
        columns: v.columns.map((c) => (c.id === columnId ? { ...c, width } : c)),
      })),
    }));
  }, []);

  const onColumnChangeType = useCallback((columnId: string, newType: ColumnType) => {
    setBoard((b) => ({
      ...b,
      views: b.views.map((v) => ({
        ...v,
        columns: v.columns.map((c) => (c.id === columnId ? { ...c, type: newType } : c)),
      })),
    }));
  }, []);

  const onColumnReorder = useCallback((fromId: string, toId: string) => {
    setBoard((b) => ({
      ...b,
      views: b.views.map((v) => {
        const cols = [...v.columns];
        const fromIdx = cols.findIndex((c) => c.id === fromId);
        const toIdx = cols.findIndex((c) => c.id === toId);
        if (fromIdx < 0 || toIdx < 0) return v;
        const [moved] = cols.splice(fromIdx, 1);
        cols.splice(toIdx, 0, moved);
        return { ...v, columns: cols };
      }),
    }));
  }, []);

  const onAddColumnAfter = useCallback((columnId: string) => {
    const newCol = {
      id: `col_${nextId()}`,
      title: "Nový sloupec",
      type: "text" as ColumnType,
      width: 120,
      hidden: false,
    };
    setBoard((b) => ({
      ...b,
      views: b.views.map((v) => {
        const idx = v.columns.findIndex((c) => c.id === columnId);
        if (idx < 0) return v;
        const cols = [...v.columns];
        cols.splice(idx + 1, 0, newCol);
        return { ...v, columns: cols };
      }),
    }));
    if (dbViewId) {
      const view = board.views.find((v) => v.id === activeViewId);
      if (view) {
        const idx = view.columns.findIndex((c) => c.id === columnId);
        const nextColumns = idx >= 0 ? [...view.columns.slice(0, idx + 1), newCol, ...view.columns.slice(idx + 1)] : view.columns;
        saveBoardViewConfig(dbViewId, {
          columnsConfig: nextColumns,
          groupsConfig: board.groups.map((g) => ({ id: g.id, name: g.name, color: g.color, collapsed: g.collapsed, subtitle: g.subtitle })),
        }).catch(() => {});
      }
    }
  }, [dbViewId, activeViewId, board.views, board.groups]);

  const onOpenAddGroupModal = useCallback(() => setAddGroupModalOpen(true), []);
  const onConfirmAddGroup = useCallback(() => {
    const name = addGroupName.trim() || "Nová skupina";
    const newGroup: Group = {
      id: `g_${nextId()}`,
      name,
      color: addGroupColor,
      collapsed: false,
      itemIds: [],
    };
    setBoard((b) => ({ ...b, groups: [...b.groups, newGroup] }));
    if (dbViewId) {
      const view = board.views.find((v) => v.id === activeViewId);
      if (view) {
        saveBoardViewConfig(dbViewId, {
          columnsConfig: view.columns,
          groupsConfig: [...board.groups, newGroup].map((g) => ({ id: g.id, name: g.name, color: g.color, collapsed: g.collapsed, subtitle: g.subtitle })),
        }).catch(() => {});
      }
    }
    setAddGroupModalOpen(false);
    setAddGroupName("");
    setAddGroupColor(GROUP_COLORS[0]);
  }, [addGroupName, addGroupColor, dbViewId, activeViewId, board.views, board.groups]);

  const onSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        const ids = filteredAndSortedGroups.flatMap((g) => g.itemIds);
        setSelection(new Set(ids));
      } else setSelection(new Set());
    },
    [filteredAndSortedGroups]
  );
  const onSelectItem = useCallback((itemId: string, checked: boolean) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (checked) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }, []);
  const onCellChange = useCallback((itemId: string, columnId: string, value: string | number) => {
    setBoard((b) => {
      const item = b.items[itemId];
      if (!item) return b;
      if (columnId === "item") {
        return { ...b, items: { ...b.items, [itemId]: { ...item, name: String(value) } } };
      }
      // Never change item.name when updating a non-item column (e.g. status)
      return {
        ...b,
        items: { ...b.items, [itemId]: { ...item, cells: { ...item.cells, [columnId]: value } } },
      };
    });
  }, []);
  const onCellNoteChange = useCallback((itemId: string, columnId: string, note: string) => {
    setBoard((b) => {
      const item = b.items[itemId];
      if (!item) return b;
      const cellNotes = { ...(item.cellNotes ?? {}), [columnId]: note };
      if (!note.trim()) {
        const { [columnId]: _, ...rest } = cellNotes;
        return { ...b, items: { ...b.items, [itemId]: { ...item, cellNotes: Object.keys(rest).length ? rest : undefined } } };
      }
      return { ...b, items: { ...b.items, [itemId]: { ...item, cellNotes } } };
    });
  }, []);
  const onAddItem = useCallback((groupId: string) => {
    const id = nextId();
    const newItem: Item = { id, name: "Nový řádek", cells: { ...DEFAULT_CELLS } };
    setBoard((b) => ({
      ...b,
      items: { ...b.items, [id]: newItem },
      groups: b.groups.map((g) => (g.id === groupId ? { ...g, itemIds: [...g.itemIds, id] } : g)),
    }));
  }, []);
  const onGroupToggleCollapse = useCallback((groupId: string) => {
    setBoard((b) => ({
      ...b,
      groups: b.groups.map((g) => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g)),
    }));
  }, []);
  const onGroupRename = useCallback((groupId: string, name: string) => {
    setBoard((b) => ({
      ...b,
      groups: b.groups.map((g) => (g.id === groupId ? { ...g, name } : g)),
    }));
    if (dbViewId) {
      const view = board.views.find((v) => v.id === activeViewId);
      if (view) {
        const nextGroups = board.groups.map((g) => (g.id === groupId ? { ...g, name } : g));
        saveBoardViewConfig(dbViewId, {
          columnsConfig: view.columns,
          groupsConfig: nextGroups.map((g) => ({ id: g.id, name: g.name, color: g.color, collapsed: g.collapsed, subtitle: g.subtitle })),
        }).catch(() => {});
      }
    }
  }, [dbViewId, activeViewId, board.views, board.groups]);

  const onGroupSubtitleChange = useCallback((groupId: string, subtitle: string) => {
    setBoard((b) => ({
      ...b,
      groups: b.groups.map((g) => (g.id === groupId ? { ...g, subtitle } : g)),
    }));
    if (dbViewId) {
      const view = board.views.find((v) => v.id === activeViewId);
      if (view) {
        const nextGroups = board.groups.map((g) => (g.id === groupId ? { ...g, subtitle } : g));
        saveBoardViewConfig(dbViewId, {
          columnsConfig: view.columns,
          groupsConfig: nextGroups.map((g) => ({ id: g.id, name: g.name, color: g.color, collapsed: g.collapsed, subtitle: g.subtitle })),
        }).catch(() => {});
      }
    }
  }, [dbViewId, activeViewId, board.views, board.groups]);
  const onGroupCollapseAll = useCallback(() => {
    setBoard((b) => ({ ...b, groups: b.groups.map((g) => ({ ...g, collapsed: true })) }));
  }, []);
  const onClearSelection = useCallback(() => setSelection(new Set()), []);
  const onDeleteSelected = useCallback(() => {
    setBoard((b) => {
      const nextItems = { ...b.items };
      const nextGroups = b.groups.map((g) => ({
        ...g,
        itemIds: g.itemIds.filter((id) => !selection.has(id)),
      }));
      selection.forEach((id) => delete nextItems[id]);
      return { ...b, items: nextItems, groups: nextGroups };
    });
    setSelection(new Set());
  }, [selection]);
  useEffect(() => {
    if (selectedItemId) {
      getContactsList()
        .then((list) => setPanelContacts(list.map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName }))))
        .catch(() => setPanelContacts([]));
    }
  }, [selectedItemId]);

  const getActivity = useCallback(async (itemId: string): Promise<ActivityEntry[]> => {
    return activityByItem[itemId] ?? [];
  }, [activityByItem]);

  const onItemContactChange = useCallback(
    (itemId: string, contactId: string | null, contactName: string | null) => {
      setBoard((b) => {
        const item = b.items[itemId];
        if (!item) return b;
        return {
          ...b,
          items: {
            ...b.items,
            [itemId]: { ...item, contactId: contactId ?? undefined, contactName: contactName ?? undefined },
          },
        };
      });
      if (dbViewId) {
        updateBoardItem(itemId, { contactId: contactId ?? undefined }).catch(() => {});
      }
    },
    [dbViewId]
  );

  const appendActivity = useCallback((itemId: string, entry: Omit<ActivityEntry, "id" | "createdAt">) => {
    const full: ActivityEntry = {
      ...entry,
      id: crypto.randomUUID?.() ?? `a-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setActivityByItem((prev) => ({
      ...prev,
      [itemId]: [...(prev[itemId] ?? []), full],
    }));
  }, []);

  const onMoveSelectedToGroup = useCallback((groupId: string) => {
    setBoard((b) => {
      const target = b.groups.find((g) => g.id === groupId);
      if (!target) return b;
      const toMove = [...selection];
      const newGroupItemIds = [...target.itemIds, ...toMove];
      const otherGroups = b.groups.map((g) => {
        if (g.id === groupId) return { ...g, itemIds: newGroupItemIds };
        return { ...g, itemIds: g.itemIds.filter((id) => !selection.has(id)) };
      });
      return { ...b, groups: otherGroups };
    });
    setSelection(new Set());
  }, [selection]);

  const onItemMove = useCallback((itemId: string, targetGroupId: string, targetIndex: number) => {
    setBoard((b) => {
      const fromGroup = b.groups.find((g) => g.itemIds.includes(itemId));
      if (!fromGroup) return b;
      if (fromGroup.id === targetGroupId && fromGroup.itemIds.indexOf(itemId) === targetIndex) return b;
      const newItemIds = fromGroup.itemIds.filter((id) => id !== itemId);
      const targetGroup = b.groups.find((g) => g.id === targetGroupId);
      if (!targetGroup) return b;
      const targetIds = [...targetGroup.itemIds];
      targetIds.splice(targetIndex, 0, itemId);
      return {
        ...b,
        groups: b.groups.map((g) => {
          if (g.id === fromGroup.id) return { ...g, itemIds: newItemIds };
          if (g.id === targetGroupId) return { ...g, itemIds: targetIds };
          return g;
        }),
      };
    });
  }, []);

  const onGroupReorder = useCallback((fromId: string, toId: string) => {
    setBoard((b) => {
      const groups = [...b.groups];
      const fromIdx = groups.findIndex((g) => g.id === fromId);
      const toIdx = groups.findIndex((g) => g.id === toId);
      if (fromIdx < 0 || toIdx < 0) return b;
      const [moved] = groups.splice(fromIdx, 1);
      groups.splice(toIdx, 0, moved);
      return { ...b, groups };
    });
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0 px-2 sm:px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <main className="flex-1 flex min-h-0 overflow-hidden flex-col md:flex-row">
        <div className="wp-projects-section flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between shrink-0 px-0 py-2 md:py-0" style={{ marginBottom: "var(--wp-space-4)" }}>
            <BoardHeader
              boardName={board.name}
              views={viewsList.length > 0 ? viewsList : board.views.map((v) => ({ id: v.id, name: v.name }))}
              activeViewId={dbViewId ?? activeViewId}
              onViewChange={onViewChange}
              onAddView={onAddView}
              onViewNameChange={dbViewId ? onViewNameChange : undefined}
            />
          </div>
          {!isMobile && (
          <Toolbar
            searchQuery={searchQuery}
            onSearchChange={(q) => {
              setSearchQuery(q);
              triggerTableLoading();
            }}
            columns={columns}
            hiddenColumnIds={hiddenColumnIds}
            onToggleColumn={onColumnHide}
            filterOpen={filterOpen}
            onFilterOpenChange={setFilterOpen}
            sortOpen={sortOpen}
            onSortOpenChange={setSortOpen}
            hideOpen={hideOpen}
            onHideOpenChange={setHideOpen}
            groupByOpen={groupByOpen}
            onGroupByOpenChange={setGroupByOpen}
            personOpen={personOpen}
            onPersonOpenChange={setPersonOpen}
            assignedTo={assignedTo}
            onAssignedToChange={setAssignedTo}
            filterStatus={filterStatus}
            onFilterStatusChange={(v) => {
              setFilterStatus(v);
              triggerTableLoading();
            }}
            sortColumnId={sortColumnId}
            sortDir={sortDir}
            onSortChange={(col, dir) => {
              setSortColumnId(col);
              setSortDir(dir);
              triggerTableLoading();
            }}
            groupBy={groupBy}
            onGroupByChange={(v) => {
              setGroupBy(v);
              triggerTableLoading();
            }}
          />
          )}
          {!isMobile && <KPIBar openCasesCount={kpiOpenCases} potentialDeals={kpiPotentialDeals} />}
          {isMobile && (
            <div className="flex items-center gap-2 px-2 pb-2 relative shrink-0">
              <input
                type="text"
                placeholder="Hledat…"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); triggerTableLoading(); }}
                className="flex-1 min-w-0 min-h-[44px] px-3 py-2 text-sm border border-slate-200 rounded-[var(--wp-radius-sm)]"
              />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen((o) => !o)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--wp-radius-sm)] border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  aria-label="Filtry a řazení"
                >
                  ⋮
                </button>
                {mobileMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setMobileMenuOpen(false)} aria-hidden />
                    <div className="absolute right-0 top-full mt-1 py-2 min-w-[200px] bg-white border border-slate-200 rounded-[var(--wp-radius-sm)] shadow-lg z-40">
                      <div className="px-3 py-2 border-b border-slate-100">
                        <p className="text-[11px] font-semibold text-slate-500 uppercase mb-1.5">STAV</p>
                        <CustomDropdown
                          value={filterStatus ?? ""}
                          onChange={(id) => { setFilterStatus(id || null); triggerTableLoading(); }}
                          options={[
                            { id: "", label: "Všechny" },
                            ...["hotovo", "rozděláno", "k-podpisu", "zatím-ne", "domluvit"].map((s) => ({ id: s, label: s })),
                          ]}
                          placeholder="Všechny"
                          icon={Filter}
                        />
                      </div>
                      <div className="px-3 py-2">
                        <p className="text-[11px] font-semibold text-slate-500 uppercase mb-1.5">Seřadit</p>
                        <CustomDropdown
                          value={sortColumnId ?? "item"}
                          onChange={(id) => { setSortColumnId(id || null); triggerTableLoading(); }}
                          options={[
                            { id: "item", label: "Jméno klienta" },
                            ...visibleColumns.filter((c) => c.id !== "item").map((c) => ({ id: c.id, label: c.title })),
                          ]}
                          placeholder="Jméno klienta"
                          icon={ArrowUpDown}
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setSortDir("asc"); triggerTableLoading(); }}
                            className={`flex-1 min-h-[44px] text-sm rounded-[var(--wp-radius-sm)] border ${sortDir === "asc" ? "border-slate-400 bg-slate-100" : "border-slate-200"}`}
                          >
                            A→Z
                          </button>
                          <button
                            type="button"
                            onClick={() => { setSortDir("desc"); triggerTableLoading(); }}
                            className={`flex-1 min-h-[44px] text-sm rounded-[var(--wp-radius-sm)] border ${sortDir === "desc" ? "border-slate-400 bg-slate-100" : "border-slate-200"}`}
                          >
                            Z→A
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          <BoardShell>
            <SelectionBar
            count={selection.size}
            onClear={onClearSelection}
            onDelete={onDeleteSelected}
            onMoveToGroup={onMoveSelectedToGroup}
            groupOptions={filteredAndSortedGroups.map((g) => ({ id: g.id, name: g.name }))}
          />
          {isMobile ? (
            <div className="flex-1 overflow-y-auto px-2 pb-8 space-y-4">
              {filteredAndSortedGroups.map((group) => {
                const groupItems = group.itemIds.map((id) => board.items[id]).filter(Boolean) as Item[];
                return (
                  <div key={group.id} className="rounded-[var(--wp-radius-sm)] border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div
                      className="px-4 py-3 flex items-center justify-between border-b border-slate-100"
                      style={{ backgroundColor: group.color ? `${group.color}20` : "var(--wp-bg)" }}
                    >
                      <span className="font-semibold text-sm text-slate-800">{group.name}</span>
                      <span className="text-xs text-slate-500">{groupItems.length} položek</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {groupItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedItemId(item.id)}
                          className="w-full text-left px-4 py-3 min-h-[44px] flex flex-col gap-1 hover:bg-slate-50 transition-colors"
                        >
                          <span className="font-medium text-slate-900">{item.name}</span>
                          {item.contactName && (
                            <span className="text-xs text-slate-500">{item.contactName}</span>
                          )}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {visibleColumns.slice(0, 4).map((col) => {
                              const val = item.cells[col.id];
                              if (val == null || val === "") return null;
                              return (
                                <span key={col.id} className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                                  {col.title}: {String(val)}
                                </span>
                              );
                            })}
                          </div>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => onAddItem(group.id)}
                        className="w-full px-4 py-3 text-left text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 min-h-[44px]"
                      >
                        + Přidat položku
                      </button>
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={onOpenAddGroupModal}
                className="w-full py-3 px-4 rounded-[var(--wp-radius-sm)] border-2 border-dashed border-slate-200 text-slate-500 font-medium text-sm hover:border-slate-300 hover:text-slate-700 min-h-[44px]"
              >
                + Přidat skupinu
              </button>
            </div>
          ) : (
          <BoardScroller visibleColumns={visibleColumns} actionColumnWidth={48}>
            {filteredAndSortedGroups.map((group, gi) => {
              const groupItems = group.itemIds.map((id) => board.items[id]).filter(Boolean) as Item[];
              return (
                <BoardGroup
                  key={group.id}
                  group={group}
                  groupItems={groupItems}
                  visibleColumns={visibleColumns}
                  selection={selection}
                  showSelectAll={gi === 0}
                  onSelectAll={onSelectAll}
                  onSelectItem={onSelectItem}
                  onCellChange={onCellChange}
                  onAddItem={onAddItem}
                  onGroupToggleCollapse={onGroupToggleCollapse}
                  onGroupRename={onGroupRename}
                  onGroupCollapseAll={onGroupCollapseAll}
                  onColumnResize={onColumnResize}
                  onColumnHide={onColumnHide}
                  onColumnRename={onColumnRename}
                  onColumnDelete={onColumnDelete}
                  onColumnSort={onColumnSort}
                  onColumnChangeType={onColumnChangeType}
                  onAddColumnAfter={onAddColumnAfter}
                  onColumnReorder={onColumnReorder}
                  onOpenItem={setSelectedItemId}
                  onCellNoteChange={onCellNoteChange}
                  onItemMove={onItemMove}
                  onGroupReorder={onGroupReorder}
                />
              );
            })}
            <button type="button" className="b-add-group" onClick={onOpenAddGroupModal}>
              + Přidat skupinu
            </button>
          </BoardScroller>
          )}
          </BoardShell>
        </div>
        {newBoardModalOpen && (
          <BaseModal open={true} onClose={() => setNewBoardModalOpen(false)} title="Nový board" maxWidth="sm">
            <div className="px-4 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Název</label>
                <input
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (document.getElementById("new-board-submit-btn") as HTMLButtonElement)?.click();
                    }
                  }}
                  placeholder="např. Obchody Q1"
                  className="w-full border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue/20 focus:border-monday-blue rounded-[var(--wp-radius-sm)] min-h-[44px]"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Z šablony</label>
                <CustomDropdown
                  value={newBoardTemplateId}
                  onChange={setNewBoardTemplateId}
                  options={[{ id: "", label: "Prázdný" }, ...viewsList.map((v) => ({ id: v.id, label: v.name }))]}
                  placeholder="Prázdný"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setNewBoardModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[var(--wp-radius-sm)]">
                  Zrušit
                </button>
                <button
                  id="new-board-submit-btn"
                  type="button"
                  disabled={newBoardCreating}
                  onClick={async () => {
                    setNewBoardCreating(true);
                    try {
                      const id = await createBoardView({
                        name: newBoardName.trim() || "Nový board",
                        copyColumnsFromViewId: newBoardTemplateId || null,
                      });
                      setNewBoardModalOpen(false);
                      router.push(`/portal/board?viewId=${encodeURIComponent(id)}`);
                    } finally {
                      setNewBoardCreating(false);
                    }
                  }}
                  className="px-4 py-2 text-sm font-semibold text-white bg-monday-blue hover:opacity-90 rounded-[var(--wp-radius-sm)] disabled:opacity-50 min-h-[44px]"
                >
                  {newBoardCreating ? "Vytvářím…" : "Vytvořit"}
                </button>
              </div>
            </div>
          </BaseModal>
        )}
        {addGroupModalOpen && (
          <BaseModal open={true} onClose={() => setAddGroupModalOpen(false)} title="Přidat skupinu" maxWidth="sm">
            <div className="px-4 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Název skupiny *</label>
                <input
                  value={addGroupName}
                  onChange={(e) => setAddGroupName(e.target.value)}
                  placeholder="např. V jednání"
                  className="w-full border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-monday-blue/20 focus:border-monday-blue rounded-[var(--wp-radius-sm)]"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">Barva (volitelně)</label>
                <div className="flex flex-wrap gap-2">
                  {GROUP_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setAddGroupColor(c)}
                      className="w-8 h-8 rounded-lg border-2 transition-all"
                      style={{
                        backgroundColor: c,
                        borderColor: addGroupColor === c ? "#333" : "transparent",
                        boxShadow: addGroupColor === c ? "0 0 0 2px white, 0 0 0 4px #333" : undefined,
                      }}
                      aria-label={`Barva ${c}`}
                    />
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddGroupModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[var(--wp-radius-sm)]"
                >
                  Zrušit
                </button>
                <button
                  type="button"
                  onClick={onConfirmAddGroup}
                  className="px-4 py-2 text-sm font-semibold text-white bg-monday-blue hover:opacity-90 rounded-[var(--wp-radius-sm)]"
                >
                  Vytvořit skupinu
                </button>
              </div>
            </div>
          </BaseModal>
        )}
        {selectedItemId && board.items[selectedItemId] && (
          <RightPanel
            itemId={selectedItemId}
            itemName={board.items[selectedItemId].contactName ?? board.items[selectedItemId].name}
            onClose={() => setSelectedItemId(null)}
            getActivity={getActivity}
            appendActivity={appendActivity}
            contactId={board.items[selectedItemId].contactId ?? undefined}
            contacts={panelContacts}
            onContactChange={(contactId, contactName) => onItemContactChange(selectedItemId, contactId, contactName)}
            mobileFullScreen={isMobile}
          />
        )}
      </main>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  MoreHorizontal,
  Plus,
  Search,
  User,
  X,
} from "lucide-react";
import {
  getOrCreateBoardView,
  createBoardItem,
  updateBoardItem,
  deleteBoardItems,
} from "@/app/actions/board";
import clsx from "clsx";
import { portalPrimaryButtonClassName } from "@/lib/ui/create-action-button-styles";
import { resolveBoardColumns } from "@/app/board/resolve-board-columns";
import { BLANK_BOARD_COLUMNS } from "@/app/board/seed-data";
import type { Board, Column, Group, Item } from "@/app/components/monday/types";
import {
  getStatusLabels,
  getStatusById,
  hydrateBoardLabelsFromServer,
  STATUS_LABELS_UPDATED_EVENT,
  shouldCelebrateBoardStatus,
  type StatusLabel,
} from "@/app/lib/status-labels";
import { triggerConfettiBurstFromRect } from "@/app/lib/confetti-burst";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  BottomSheet,
  FloatingActionButton,
} from "@/app/shared/mobile-ui/primitives";
import { useDeviceClass } from "@/lib/ui/useDeviceClass";
import { useConfirm } from "@/app/components/ConfirmDialog";
import { EditLabelsEditor } from "@/app/components/monday/EditLabelsEditor";

function StatusPill({ value, labels }: { value: string; labels: StatusLabel[] }) {
  if (!value || value === "") return <span className="text-xs text-[color:var(--wp-text-tertiary)]">—</span>;
  const sl = getStatusById(labels, value);
  if (!sl.label) {
    return (
      <span
        className="inline-block h-2.5 w-2.5 rounded-full align-middle"
        style={{ backgroundColor: sl.color }}
        aria-label="Štítek bez názvu"
      />
    );
  }
  return (
    <span
      className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full text-white truncate max-w-[80px]"
      style={{ backgroundColor: sl.color }}
    >
      {sl.label}
    </span>
  );
}

function ItemCard({
  item,
  columns,
  labels,
  onTap,
}: {
  item: Item;
  columns: Column[];
  labels: StatusLabel[];
  onTap: () => void;
}) {
  const statusCols = columns.filter((c) => c.type === "status" && !c.hidden);
  const filledStatuses = statusCols.filter((c) => {
    const val = item.cells[c.id];
    return val && val !== "";
  });

  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full text-left bg-[color:var(--wp-surface-card)] rounded-2xl border border-[color:var(--wp-surface-card-border)]/90 border-l-[4px] border-l-indigo-500 pl-3.5 pr-4 py-3.5 min-h-[64px] active:bg-[color:var(--wp-surface-muted)]/90 active:scale-[0.99] transition-all shadow-[0_2px_14px_-3px_rgba(15,23,42,0.1)] touch-manipulation"
    >
      <div className="flex items-center gap-2">
        {item.contactName && (
          <span className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
            {item.contactName
              .split(" ")
              .map((w) => w[0])
              .filter(Boolean)
              .join("")
              .toUpperCase()
              .slice(0, 2)}
          </span>
        )}
        <span className="flex-1 min-w-0">
          <span className="font-bold text-[15px] text-[color:var(--wp-text)] leading-snug truncate block">{item.name}</span>
          {item.contactName && item.contactName !== item.name && (
            <span className="text-xs text-[color:var(--wp-text-secondary)] truncate block mt-0.5 font-medium">{item.contactName}</span>
          )}
        </span>
      </div>
      {filledStatuses.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {filledStatuses.slice(0, 5).map((col) => (
            <div key={col.id} className="flex items-center gap-1">
              <span className="text-[10px] text-[color:var(--wp-text-secondary)]">{col.title}:</span>
              <StatusPill value={String(item.cells[col.id] ?? "")} labels={labels} />
            </div>
          ))}
          {filledStatuses.length > 5 && (
            <span className="text-[10px] text-[color:var(--wp-text-tertiary)]">+{filledStatuses.length - 5}</span>
          )}
        </div>
      )}
    </button>
  );
}

function GroupSection({
  group,
  items,
  columns,
  labels,
  onItemTap,
}: {
  group: Group;
  items: Item[];
  columns: Column[];
  labels: StatusLabel[];
  onItemTap: (item: Item) => void;
}) {
  const [collapsed, setCollapsed] = useState(group.collapsed);

  return (
    <div className="mb-5">
      <div className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-gradient-to-r from-[color:var(--wp-surface-muted)] to-[color:var(--wp-surface-card)] overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center gap-3 px-3 py-3 min-h-[48px]"
        >
          <span
            className="w-3.5 h-3.5 rounded-md shrink-0 ring-2 ring-white shadow-sm"
            style={{ backgroundColor: group.color }}
          />
          <div className="flex-1 min-w-0 text-left">
            <span className="font-black text-sm text-[color:var(--wp-text)] block truncate">{group.name}</span>
            {group.subtitle ? (
              <span className="text-[11px] text-[color:var(--wp-text-secondary)] font-semibold truncate block">{group.subtitle}</span>
            ) : null}
          </div>
          <span className="text-xs font-black text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-card)]/90 border border-[color:var(--wp-surface-card-border)] px-2 py-0.5 rounded-lg tabular-nums">
            {items.length}
          </span>
          {collapsed ? <ChevronRight size={18} className="text-[color:var(--wp-text-tertiary)] shrink-0" /> : <ChevronDown size={18} className="text-[color:var(--wp-text-tertiary)] shrink-0" />}
        </button>
      </div>

      {!collapsed && (
        <div className="space-y-2.5 mt-2.5 pl-0.5">
          {items.length === 0 && (
            <p className="text-xs text-[color:var(--wp-text-tertiary)] text-center py-3">Žádné položky</p>
          )}
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              columns={columns}
              labels={labels}
              onTap={() => onItemTap(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function BoardMobileScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewIdFromQuery = searchParams.get("viewId");
  const itemIdFromQuery = searchParams.get("item");
  const deviceClass = useDeviceClass();
  const confirm = useConfirm();

  const [board, setBoard] = useState<Board | undefined>(undefined);
  const [dbViewId, setDbViewId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [statusLabels, setStatusLabels] = useState<StatusLabel[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [labelsEditorOpen, setLabelsEditorOpen] = useState(false);

  const [newItemName, setNewItemName] = useState("");
  const [newItemGroup, setNewItemGroup] = useState("");
  const [savePending, startSaveTransition] = useTransition();
  const statusSelectRefs = useRef<Record<string, HTMLSelectElement | null>>({});

  useEffect(() => {
    setStatusLabels(getStatusLabels());
    const handler = () => setStatusLabels(getStatusLabels());
    window.addEventListener(STATUS_LABELS_UPDATED_EVENT, handler);
    // Stáhnout server-side sadu (přepíše LS) — sjednocuje desktop + mobile WebView.
    void hydrateBoardLabelsFromServer();
    return () => window.removeEventListener(STATUS_LABELS_UPDATED_EVENT, handler);
  }, []);

  const loadBoard = useCallback(() => {
    startTransition(async () => {
      setError(null);
      try {
        const data = await getOrCreateBoardView(viewIdFromQuery?.trim() || null);
        const id = data.view.id;
        setDbViewId(id);

        const savedColumns: Column[] = (data.view.columnsConfig as Column[]) ?? [];
        const columns = resolveBoardColumns(savedColumns);
        const groupConfigs = (data.view.groupsConfig ?? []) as Array<{
          id: string;
          name: string;
          color: string;
          collapsed: boolean;
          subtitle?: string;
        }>;

        const items: Record<string, Item> = {};
        for (const item of data.items) {
          items[item.id] = {
            id: item.id,
            name: item.name,
            cells: item.cells,
            contactId: item.contactId ?? undefined,
            contactName: item.contactName ?? undefined,
          };
        }

        const groups: Group[] = groupConfigs.map((gc) => ({
          ...gc,
          subtitle: gc.subtitle,
          itemIds: data.items
            .filter((i) => i.groupId === gc.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((i) => i.id),
        }));

        const orphanItems = data.items.filter(
          (i) => !groupConfigs.some((g) => g.id === i.groupId)
        );
        if (orphanItems.length > 0 && groups.length > 0) {
          groups[0].itemIds.push(...orphanItems.map((i) => i.id));
        }

        setBoard({ id, name: data.view.name, views: [{ id: "v1", name: data.view.name, columns }], groups, items });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Board se nepodařilo načíst.");
      }
    });
  }, [viewIdFromQuery]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    if (itemIdFromQuery && board) {
      const item = board.items[itemIdFromQuery];
      if (item) {
        setSelectedItem(item);
        setDetailOpen(true);
      }
    }
  }, [itemIdFromQuery, board]);

  const columns = board?.views[0]?.columns ?? BLANK_BOARD_COLUMNS;
  const statusCols = columns.filter((c: Column) => c.type === "status" && !c.hidden);

  const allItems = board ? Object.values(board.items) : [];
  const filteredItems = searchQuery.trim()
    ? allItems.filter((item) =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.contactName?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
      )
    : null;

  function handleItemTap(item: Item) {
    setSelectedItem(item);
    setDetailOpen(true);
  }

  function handleCreateItem() {
    if (!dbViewId || !newItemName.trim() || !newItemGroup) return;
    startSaveTransition(async () => {
      try {
        await createBoardItem(dbViewId, { name: newItemName.trim(), groupId: newItemGroup });
        setNewItemName("");
        setCreateOpen(false);
        loadBoard();
      } catch {
        /* retry from UI */
      }
    });
  }

  function handleMoveItem(targetGroupId: string) {
    if (!selectedItem) return;
    startSaveTransition(async () => {
      try {
        await updateBoardItem(selectedItem.id, { groupId: targetGroupId });
        setMoveOpen(false);
        setDetailOpen(false);
        setSelectedItem(null);
        loadBoard();
      } catch {
        /* retry from UI */
      }
    });
  }

  function handleDeleteItem() {
    if (!selectedItem) return;
    const itemId = selectedItem.id;
    void (async () => {
      if (
        !(await confirm({
          title: "Smazat položku",
          message: "Opravdu chcete smazat tuto položku?",
          confirmLabel: "Smazat",
          variant: "destructive",
        }))
      ) {
        return;
      }
      startSaveTransition(async () => {
        try {
          await deleteBoardItems([itemId]);
          setDetailOpen(false);
          setSelectedItem(null);
          loadBoard();
        } catch {
          /* retry from UI */
        }
      });
    })();
  }

  function handleStatusChange(columnId: string, newValue: string) {
    if (!selectedItem) return;
    const prev = String(selectedItem.cells[columnId] ?? "");
    startSaveTransition(async () => {
      try {
        const updatedCells = { ...selectedItem.cells, [columnId]: newValue };
        await updateBoardItem(selectedItem.id, { cells: updatedCells });
        setSelectedItem({ ...selectedItem, cells: updatedCells });
        loadBoard();
        if (shouldCelebrateBoardStatus(newValue, prev, statusLabels)) {
          const el = statusSelectRefs.current[columnId];
          triggerConfettiBurstFromRect(el?.getBoundingClientRect() ?? null);
        }
      } catch {
        /* retry from UI */
      }
    });
  }

  if (pending && !board) {
    return (
      <div className="min-h-[calc(100dvh-8rem)]">
        <LoadingSkeleton variant="card" rows={4} />
      </div>
    );
  }
  if (error) return <ErrorState title={error} onRetry={loadBoard} />;
  if (!board) return null;

  const isTablet = deviceClass === "tablet" || deviceClass === "desktop";
  const totalItems = Object.keys(board.items).length;

  return (
    <div className="-mx-4 -mt-4 flex flex-col min-h-[calc(100dvh-8rem)]">
      {/* Search bar */}
      <div className="px-4 pt-3 pb-2 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shrink-0">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--wp-text-tertiary)] pointer-events-none" />
          <input
            type="text"
            placeholder={`Hledat v boardu (${totalItems} položek)…`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] pl-9 pr-3 py-2.5 text-sm text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-200 min-h-[44px]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[color:var(--wp-text-tertiary)]"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Board content */}
      <div className={`flex-1 overflow-y-auto px-4 py-3 ${isTablet ? "columns-2 gap-4" : ""}`}>
        {filteredItems ? (
          filteredItems.length === 0 ? (
            <p className="text-center text-sm text-[color:var(--wp-text-secondary)] py-8">Nic nenalezeno pro &quot;{searchQuery}&quot;</p>
          ) : (
            <div className="space-y-2">
              {filteredItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  columns={columns}
                  labels={statusLabels}
                  onTap={() => handleItemTap(item)}
                />
              ))}
            </div>
          )
        ) : totalItems === 0 ? (
          <EmptyState
            title="Board je prázdný"
            description="Přidejte první položku pomocí tlačítka +."
            action={
              <button
                type="button"
                className={clsx(portalPrimaryButtonClassName, "px-4 text-sm font-semibold")}
                onClick={() => {
                  setNewItemGroup(board.groups[0]?.id ?? "");
                  setCreateOpen(true);
                }}
              >
                Přidat položku
              </button>
            }
          />
        ) : (
          board.groups.map((group) => {
            const groupItems = group.itemIds
              .map((id) => board.items[id])
              .filter(Boolean);
            return (
              <GroupSection
                key={group.id}
                group={group}
                items={groupItems}
                columns={columns}
                labels={statusLabels}
                onItemTap={handleItemTap}
              />
            );
          })
        )}
      </div>

      {/* FAB */}
      <FloatingActionButton
        icon={Plus}
        label="Přidat"
        onClick={() => {
          setNewItemGroup(board.groups[0]?.id ?? "");
          setNewItemName("");
          setCreateOpen(true);
        }}
      />

      {/* Detail sheet */}
      <BottomSheet
        open={detailOpen && !!selectedItem}
        onClose={() => { setDetailOpen(false); setSelectedItem(null); }}
        title={selectedItem?.name ?? "Detail"}
      >
        {selectedItem && (
          <div className="space-y-4 pb-4">
            {selectedItem.contactName && (
              <button
                type="button"
                onClick={() => {
                  if (selectedItem.contactId) {
                    router.push(`/portal/contacts/${selectedItem.contactId}`);
                  }
                }}
                className="flex items-center gap-2 text-sm text-indigo-600 font-semibold min-h-[44px] active:opacity-70"
              >
                <User size={16} />
                {selectedItem.contactName}
              </button>
            )}

            {/* Status cells */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-[color:var(--wp-text-secondary)] uppercase tracking-wider">Produkty</p>
                <button
                  type="button"
                  onClick={() => setLabelsEditorOpen(true)}
                  className="text-[11px] font-bold text-indigo-600 active:opacity-70 min-h-[36px] px-2"
                >
                  Upravit štítky
                </button>
              </div>
              {statusLabels.length === 0 && (
                <p className="text-[11px] text-[color:var(--wp-text-tertiary)] leading-snug">
                  Zatím nemáte žádné štítky. Přidejte je tlačítkem „Upravit štítky“ výše — nastavíte barvu a název (např. zelený = „hotovo“).
                </p>
              )}
              {statusCols.map((col: Column) => {
                const val = String(selectedItem.cells[col.id] ?? "");
                return (
                  <div key={col.id} className="flex items-center justify-between min-h-[44px]">
                    <span className="text-sm text-[color:var(--wp-text-secondary)] font-medium">{col.title}</span>
                    <select
                      ref={(el) => {
                        statusSelectRefs.current[col.id] = el;
                      }}
                      value={val}
                      onChange={(e) => handleStatusChange(col.id, e.target.value)}
                      className="rounded-lg border border-[color:var(--wp-surface-card-border)] px-2 py-1.5 text-sm text-[color:var(--wp-text)] bg-[color:var(--wp-surface-card)] min-h-[36px] min-w-[110px]"
                    >
                      <option value="">—</option>
                      {statusLabels.map((sl) => (
                        <option key={sl.id} value={sl.id}>{sl.label || `Štítek (${sl.color})`}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-2 border-t border-[color:var(--wp-surface-card-border)]">
              <button
                type="button"
                onClick={() => setMoveOpen(true)}
                className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] text-sm font-semibold text-[color:var(--wp-text-secondary)] active:bg-[color:var(--wp-surface-muted)]"
              >
                Přesunout do skupiny…
              </button>
              <button
                type="button"
                onClick={handleDeleteItem}
                disabled={savePending}
                className="w-full min-h-[44px] rounded-xl border border-rose-200 text-sm font-semibold text-rose-600 active:bg-rose-50 disabled:opacity-50"
              >
                Smazat položku
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* Move sheet */}
      <BottomSheet
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        title="Přesunout do skupiny"
      >
        <div className="space-y-2 pb-4">
          {board.groups.map((group) => {
            const currentGroupId = board.groups.find((g) =>
              g.itemIds.includes(selectedItem?.id ?? "")
            )?.id;
            const isCurrent = group.id === currentGroupId;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => handleMoveItem(group.id)}
                disabled={isCurrent || savePending}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl min-h-[48px] text-left transition-colors ${
                  isCurrent
                    ? "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-tertiary)] cursor-not-allowed"
                    : "bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] active:bg-[color:var(--wp-surface-muted)]"
                }`}
              >
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: group.color }} />
                <span className="text-sm font-medium text-[color:var(--wp-text)] flex-1">{group.name}</span>
                {isCurrent && <span className="text-[10px] text-[color:var(--wp-text-tertiary)]">aktuální</span>}
                <span className="text-xs text-[color:var(--wp-text-secondary)]">{group.itemIds.length}</span>
              </button>
            );
          })}
        </div>
      </BottomSheet>

      {/* Create sheet */}
      <BottomSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nová položka"
      >
        <div className="space-y-4 pb-4">
          <div>
            <label className="text-xs font-bold text-[color:var(--wp-text-secondary)] uppercase tracking-wider block mb-1">Název</label>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Jméno klienta / název…"
              className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-indigo-100"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[color:var(--wp-text-secondary)] uppercase tracking-wider block mb-1">Skupina</label>
            <select
              value={newItemGroup}
              onChange={(e) => setNewItemGroup(e.target.value)}
              className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 py-2.5 text-sm min-h-[44px]"
            >
              {board.groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleCreateItem}
            disabled={savePending || !newItemName.trim()}
            className={clsx(portalPrimaryButtonClassName, "w-full min-h-[48px] text-sm disabled:opacity-50")}
          >
            {savePending ? "Ukládám…" : "Vytvořit"}
          </button>
        </div>
      </BottomSheet>

      <EditLabelsEditor open={labelsEditorOpen} onClose={() => setLabelsEditorOpen(false)} />
    </div>
  );
}

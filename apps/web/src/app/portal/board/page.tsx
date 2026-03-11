import { getOrCreateBoardView } from "@/app/actions/board";
import { DEFAULT_BOARD_COLUMNS } from "@/app/board/seed-data";
import { PortalBoardView } from "../PortalBoardView";
import type { Board, Column, Group, Item } from "@/app/components/monday/types";

/** Sloučí sloupce z API s výchozím setem – nikdy nezobrazíme jen „Jméno klienta“, vždy kompletní sloupce. */
function mergeColumnsWithDefaults(saved: Column[]): Column[] {
  const byId = new Map(saved.map((c) => [c.id, c]));
  return DEFAULT_BOARD_COLUMNS.map((def) => {
    const s = byId.get(def.id);
    if (s) return { ...def, ...s };
    return { ...def };
  });
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ viewId?: string }>;
}) {
  const { viewId: viewIdParam } = await searchParams;
  let dbViewId: string | undefined;
  let initialBoard: Board | undefined;

  try {
    const data = await getOrCreateBoardView(viewIdParam ?? null);
    dbViewId = data.view.id;

    const savedColumns: Column[] = (data.view.columnsConfig as Column[]) ?? [];
    const columns = savedColumns.length > 0 ? mergeColumnsWithDefaults(savedColumns) : [...DEFAULT_BOARD_COLUMNS];
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

    initialBoard = {
      id: dbViewId,
      name: data.view.name,
      views: [{ id: "v1", name: data.view.name, columns }],
      groups,
      items,
    };
  } catch {
    // DB not available - fall back to seed/localStorage
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <PortalBoardView dbViewId={dbViewId} initialBoard={initialBoard} />
    </div>
  );
}

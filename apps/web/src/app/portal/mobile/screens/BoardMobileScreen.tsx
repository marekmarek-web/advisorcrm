"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { getOrCreateBoardView } from "@/app/actions/board";
import { DEFAULT_BOARD_COLUMNS } from "@/app/board/seed-data";
import { PortalBoardView } from "@/app/portal/PortalBoardView";
import type { Board, Column, Group, Item } from "@/app/components/monday/types";
import { ErrorState, LoadingSkeleton } from "@/app/shared/mobile-ui/primitives";

function mergeColumnsWithDefaults(saved: Column[]): Column[] {
  const byId = new Map(saved.map((c) => [c.id, c]));
  return DEFAULT_BOARD_COLUMNS.map((def) => {
    const s = byId.get(def.id);
    if (s) return { ...def, ...s };
    return { ...def };
  });
}

export function BoardMobileScreen() {
  const searchParams = useSearchParams();
  const viewIdFromQuery = searchParams.get("viewId");

  const [board, setBoard] = useState<Board | undefined>(undefined);
  const [dbViewId, setDbViewId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      setError(null);
      try {
        const data = await getOrCreateBoardView(viewIdFromQuery?.trim() || null);
        const id = data.view.id;
        setDbViewId(id);

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

        const orphanItems = data.items.filter((i) => !groupConfigs.some((g) => g.id === i.groupId));
        if (orphanItems.length > 0 && groups.length > 0) {
          groups[0].itemIds.push(...orphanItems.map((i) => i.id));
        }

        setBoard({
          id,
          name: data.view.name,
          views: [{ id: "v1", name: data.view.name, columns }],
          groups,
          items,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Board se nepodařilo načíst.");
      }
    });
  }, [viewIdFromQuery]);

  if (pending && !board) return <LoadingSkeleton variant="card" rows={4} />;
  if (error) return <ErrorState title={error} onRetry={() => window.location.reload()} />;

  return (
    <div className="-mx-4 -mt-4 flex-1 flex flex-col min-h-[65vh] overflow-hidden">
      <PortalBoardView dbViewId={dbViewId} initialBoard={board} />
    </div>
  );
}

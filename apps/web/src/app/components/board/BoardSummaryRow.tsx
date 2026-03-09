"use client";

import type { Column, Item } from "@/app/components/monday/types";
import { getStatusLabels } from "@/app/lib/status-labels";

interface BoardSummaryRowProps {
  visibleColumns: Column[];
  items: Item[];
}

export function BoardSummaryRow({ visibleColumns, items }: BoardSummaryRowProps) {
  const statusLabels = getStatusLabels();
  const doneColor = statusLabels.find((l) => l.id === "hotovo")?.color ?? "#00c875";
  const inProgressColor = statusLabels.find((l) => l.id === "rozděláno")?.color ?? "#fdab3d";
  const total = items.length;

  return (
    <div className="b-row b-summary-row">
      <div className="b-cell b-cell-sticky" />
      {visibleColumns.slice(1).map((col) => {
        if (col.type !== "status" || !col.hasSummary) {
          return <div key={col.id} className="b-cell" />;
        }
        const done = items.filter((it) => it.cells[col.id] === "hotovo").length;
        const inProgress = items.filter((it) => it.cells[col.id] === "rozděláno").length;
        const donePct = total === 0 ? 0 : (done / total) * 100;
        const inProgPct = total === 0 ? 0 : (inProgress / total) * 100;
        return (
          <div key={col.id} className="b-cell" style={{ padding: "0 8px" }}>
            <div className="b-summary-track">
              <div className="b-summary-seg" style={{ width: `${donePct}%`, backgroundColor: doneColor }} />
              <div className="b-summary-seg" style={{ width: `${inProgPct}%`, backgroundColor: inProgressColor }} />
            </div>
          </div>
        );
      })}
      <div className="b-cell" />
    </div>
  );
}

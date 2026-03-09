"use client";

import { useState, useEffect } from "react";
import { getActivityForEntity } from "@/app/actions/activity";
import type { ActivityRow } from "@/app/actions/activity";

const ACTION_LABELS: Record<string, string> = {
  create: "Vytvořeno",
  update: "Upraveno",
  delete: "Smazáno",
  status_change: "Změna stavu",
  won: "Výhra",
  lost: "Prohra",
};

function formatDate(date: Date | string) {
  return new Date(date).toLocaleString("cs-CZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMetaLabel(
  action: string,
  meta: Record<string, unknown> | null,
  stages: { id: string; name: string }[],
): string | null {
  if (!meta || typeof meta !== "object" || Object.keys(meta).length === 0) return null;
  if (action === "status_change" && typeof meta.stageId === "string") {
    const stage = stages.find((s) => s.id === meta.stageId);
    return stage ? ` → ${stage.name}` : ` (${meta.stageId})`;
  }
  return ` - ${JSON.stringify(meta)}`;
}

export function OpportunityTimelineTab(props: {
  opportunityId: string;
  stages?: { id: string; name: string }[];
}) {
  const { opportunityId, stages = [] } = props;
  const [items, setItems] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getActivityForEntity("opportunity", opportunityId)
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [opportunityId]);

  if (loading) return <p className="text-sm text-slate-500">Načítání…</p>;
  if (items.length === 0) return <p className="text-sm text-slate-500">Zatím žádná aktivita.</p>;

  return (
    <div className="relative space-y-0">
      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200" />
      {items.map((item) => {
        const metaLabel = formatMetaLabel(item.action, item.meta, stages);
        return (
          <div key={item.id} className="relative flex gap-3 pl-6 pb-4">
            <div className="absolute left-0 top-1.5 h-3 w-3 rounded-full bg-blue-100 border-2 border-blue-400" />
            <div>
              <p className="text-sm text-slate-800">
                {ACTION_LABELS[item.action] ?? item.action}
                {metaLabel ? (
                  <span className="text-slate-500">{metaLabel}</span>
                ) : null}
              </p>
              <p className="text-xs text-slate-500">{formatDate(item.createdAt)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

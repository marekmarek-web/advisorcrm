"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { getActivityForEntity } from "@/app/actions/activity";
import type { ActivityRow } from "@/app/actions/activity";

const ACTION_LABELS: Record<string, string> = {
  create: "Vytvořeno",
  update: "Upraveno",
  delete: "Smazáno",
  status_change: "Změna stavu",
  won: "Prodáno",
  lost: "Neprodáno",
};

const UPDATE_FIELD_LABELS: Record<string, string> = {
  title: "název",
  caseType: "typ případu",
  contactId: "klient",
  stageId: "fáze",
  probability: "pravděpodobnost",
  expectedValue: "konečná cena",
  expectedCloseDate: "odhad uzavření",
  closedAt: "datum uzavření",
  closedAs: "stav uzavření",
  customFields: "vlastní pole",
};

function formatDate(date: Date | string) {
  return new Date(date).toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** JSONB občas přijde jako řetězec; nikdy nepropouštět raw JSON do UI. */
function normalizeActivityMeta(meta: unknown): Record<string, unknown> | null {
  if (meta == null) return null;
  if (typeof meta === "string") {
    try {
      const p = JSON.parse(meta) as unknown;
      if (p && typeof p === "object" && !Array.isArray(p)) {
        return p as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }
  if (typeof meta === "object" && !Array.isArray(meta)) {
    return meta as Record<string, unknown>;
  }
  return null;
}

function formatMetaLabel(
  action: string,
  meta: Record<string, unknown> | null,
  stages: { id: string; name: string }[],
): string | null {
  if (!meta || Object.keys(meta).length === 0) return null;

  if (action === "status_change" && typeof meta.stageId === "string") {
    const stage = stages.find((s) => s.id === meta.stageId);
    return stage ? ` → ${stage.name}` : null;
  }

  if (action === "create") {
    const parts: string[] = [];
    if (typeof meta.title === "string" && meta.title.trim()) {
      parts.push(`„${meta.title.trim()}“`);
    }
    if (typeof meta.contactId === "string" && meta.contactId) {
      parts.push("klient přiřazen");
    }
    return parts.length > 0 ? ` – ${parts.join(" · ")}` : null;
  }

  if (action === "update" && Array.isArray(meta.fields)) {
    const labels = (meta.fields as string[])
      .map((k) => UPDATE_FIELD_LABELS[k] ?? k)
      .filter(Boolean);
    if (labels.length === 0) return null;
    return ` · ${labels.join(", ")}`;
  }

  return null;
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

  if (loading) {
    return <p className="text-sm font-medium text-slate-500">Načítání…</p>;
  }
  if (items.length === 0) {
    return <p className="text-sm font-medium text-slate-500">Zatím žádná aktivita.</p>;
  }

  return (
    <div className="relative space-y-8 before:absolute before:inset-0 before:ml-[15px] before:-translate-x-px before:h-full before:w-0.5 before:bg-slate-100">
      {items.map((item, index) => {
        const metaObj = normalizeActivityMeta(item.meta);
        const metaLabel = formatMetaLabel(item.action, metaObj, stages);
        const isLatest = index === 0;
        const label = ACTION_LABELS[item.action] ?? item.action;
        return (
          <div key={item.id} className="relative flex items-start gap-5 group">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center border-4 border-white z-10 shrink-0 transition-transform group-hover:scale-110 ${
                isLatest ? "bg-slate-100" : "bg-slate-100"
              }`}
            >
              <div
                className={`w-2.5 h-2.5 rounded-full ${isLatest ? "bg-indigo-500" : "bg-slate-400"}`}
              />
            </div>
            <div
              className={`rounded-2xl p-4 flex-1 transition-colors border ${
                isLatest
                  ? "bg-slate-50 border-slate-100 group-hover:border-indigo-200"
                  : "bg-white border-slate-100 group-hover:border-indigo-200"
              }`}
            >
              <p className="text-sm font-bold text-slate-900 mb-1">
                {label}
                {metaLabel ? <span className="text-slate-600 font-semibold">{metaLabel}</span> : null}
              </p>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <Clock size={12} className="shrink-0" aria-hidden />
                {formatDate(item.createdAt)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

"use client";

import Link from "next/link";
import type { ClientTimelineEvent } from "@/lib/timeline/types";
import type { TimelineEventCategory } from "@/lib/timeline/types";

function formatTimestamp(date: Date | string): string {
  return new Date(date).toLocaleString("cs-CZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const CATEGORY_BADGE: Record<
  TimelineEventCategory,
  { label: string; className: string }
> = {
  meeting: { label: "Schůzka", className: "bg-indigo-100 text-indigo-800" },
  task: { label: "Úkol", className: "bg-amber-100 text-amber-800" },
  deal: { label: "Obchod", className: "bg-emerald-100 text-emerald-800" },
  analysis: { label: "Analýza", className: "bg-violet-100 text-violet-800" },
  contract: { label: "Smlouva", className: "bg-sky-100 text-sky-800" },
  document: { label: "Dokument", className: "bg-slate-100 text-slate-700" },
  service: { label: "Servis", className: "bg-rose-100 text-rose-800" },
};

export function ClientTimelineItem({ event }: { event: ClientTimelineEvent }) {
  const badge = CATEGORY_BADGE[event.category] ?? {
    label: event.category,
    className: "bg-slate-100 text-slate-600",
  };
  const content = (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2 mb-0.5">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${badge.className}`}
        >
          {badge.label}
        </span>
        {event.isHouseholdEvent && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
            Domácnost
          </span>
        )}
      </div>
      <p className="text-sm font-medium text-slate-800">{event.title}</p>
      {event.summary && (
        <p className="text-xs text-slate-500 mt-0.5">{event.summary}</p>
      )}
      <p className="text-xs text-slate-400 mt-1">
        {formatTimestamp(event.timestamp)}
      </p>
      {event.link && (
        <span className="inline-block mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
          {event.link.label ?? "Otevřít"} →
        </span>
      )}
    </div>
  );

  return (
    <div className="relative flex gap-3 py-3">
      <div
        className="relative z-10 mt-2 h-[10px] w-[10px] shrink-0 rounded-full bg-[var(--wp-accent)] ring-2 ring-white"
        aria-hidden
      />
      {event.link?.path ? (
        <Link
          href={event.link.path}
          className="min-w-0 flex-1 block rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50/50 p-2 -m-2 transition-colors min-h-[44px] flex items-start"
        >
          {content}
        </Link>
      ) : (
        content
      )}
    </div>
  );
}

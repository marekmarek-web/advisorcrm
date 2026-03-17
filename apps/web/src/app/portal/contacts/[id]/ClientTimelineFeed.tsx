"use client";

import type { ClientTimelineEvent } from "@/lib/timeline/types";
import { ClientTimelineItem } from "./ClientTimelineItem";

export function ClientTimelineFeed({ events }: { events: ClientTimelineEvent[] }) {
  return (
    <div className="relative">
      <div className="absolute left-[13px] top-2 bottom-2 w-px bg-slate-200" aria-hidden />
      <div className="space-y-0">
        {events.map((event) => (
          <ClientTimelineItem key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}

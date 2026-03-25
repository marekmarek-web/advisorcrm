import type { EventRow } from "@/app/actions/events";
import { formatDateLocal } from "@/app/portal/calendar/date-utils";

type Timed = { id: string; start: number; end: number };

function timedForColumn(ev: EventRow, columnDateStr: string): Timed | null {
  if (ev.allDay) return null;
  if (formatDateLocal(new Date(ev.startAt)) !== columnDateStr) return null;
  const start = new Date(ev.startAt).getTime();
  const end = ev.endAt ? new Date(ev.endAt).getTime() : start + 60 * 60 * 1000;
  return { id: ev.id, start, end: Math.max(end, start + 15 * 60 * 1000) };
}

function findRoot(parent: number[], i: number): number {
  if (parent[i] !== i) parent[i] = findRoot(parent, parent[i]!);
  return parent[i]!;
}

function union(parent: number[], a: number, b: number) {
  const ra = findRoot(parent, a);
  const rb = findRoot(parent, b);
  if (ra !== rb) parent[ra] = rb;
}

/** Greedy column assignment within one overlap-connected group; returns left% and width% per event id. */
export function layoutTimedOverlaps(
  dayEvents: EventRow[],
  columnDateStr: string,
): Map<string, { leftPct: number; widthPct: number }> {
  const items: (Timed & { idx: number })[] = [];
  for (let i = 0; i < dayEvents.length; i++) {
    const ev = dayEvents[i]!;
    const t = timedForColumn(ev, columnDateStr);
    if (t) items.push({ ...t, idx: i });
  }
  const n = items.length;
  if (n === 0) return new Map();

  const parent = Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = items[i]!;
      const b = items[j]!;
      if (a.end > b.start && b.end > a.start) union(parent, i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = findRoot(parent, i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(i);
  }

  const layout = new Map<string, { leftPct: number; widthPct: number }>();
  const gap = 0.8;

  for (const indices of groups.values()) {
    const group = indices.map((i) => items[i]!).sort((a, b) => a.start - b.start);
    const colEnd: number[] = [];
    const placement: { id: string; col: number }[] = [];

    for (const item of group) {
      let col = -1;
      for (let c = 0; c < colEnd.length; c++) {
        if (colEnd[c]! <= item.start) {
          col = c;
          break;
        }
      }
      if (col === -1) {
        col = colEnd.length;
        colEnd.push(item.end);
      } else {
        colEnd[col] = item.end;
      }
      placement.push({ id: item.id, col });
    }

    const cols = Math.max(1, colEnd.length);
    const width = (100 - gap * (cols - 1)) / cols;
    for (const { id, col } of placement) {
      layout.set(id, {
        leftPct: col * (width + gap),
        widthPct: width,
      });
    }
  }

  return layout;
}

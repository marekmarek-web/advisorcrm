/**
 * Helpers for availability / free slots computation.
 * Prepared for booking and AI scheduling; no heavy dependencies.
 */

export type TimeRange = { start: string; end: string };

/**
 * Parse ISO string to timestamp (ms). Returns NaN for invalid.
 */
export function parseIsoToMs(iso: string): number {
  const d = new Date(iso);
  return d.getTime();
}

/**
 * Merge overlapping or adjacent busy periods. Input and output are sorted by start.
 */
export function mergeBusyRanges(busy: TimeRange[]): TimeRange[] {
  if (busy.length === 0) return [];
  const sorted = [...busy].sort((a, b) => parseIsoToMs(a.start) - parseIsoToMs(b.start));
  const out: TimeRange[] = [{ start: sorted[0].start, end: sorted[0].end }];
  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    const last = out[out.length - 1];
    const lastEnd = parseIsoToMs(last.end);
    const currStart = parseIsoToMs(curr.start);
    const currEnd = parseIsoToMs(curr.end);
    if (currStart <= lastEnd) {
      if (currEnd > lastEnd) last.end = curr.end;
    } else {
      out.push({ start: curr.start, end: curr.end });
    }
  }
  return out;
}

/**
 * Compute free intervals inside [rangeStart, rangeEnd] given merged busy periods.
 */
export function freeIntervals(
  rangeStart: string,
  rangeEnd: string,
  mergedBusy: TimeRange[]
): TimeRange[] {
  const startMs = parseIsoToMs(rangeStart);
  const endMs = parseIsoToMs(rangeEnd);
  if (startMs >= endMs) return [];
  const out: TimeRange[] = [];
  let cursor = startMs;
  for (const b of mergedBusy) {
    const bStart = parseIsoToMs(b.start);
    const bEnd = parseIsoToMs(b.end);
    if (bEnd <= cursor) continue;
    if (bStart >= endMs) break;
    if (bStart > cursor) {
      out.push({ start: new Date(cursor).toISOString(), end: new Date(Math.min(bStart, endMs)).toISOString() });
    }
    cursor = Math.max(cursor, bEnd);
  }
  if (cursor < endMs) {
    out.push({ start: new Date(cursor).toISOString(), end: new Date(endMs).toISOString() });
  }
  return out;
}

/**
 * Generate availability slots of given duration within free intervals.
 * stepMinutes: grid step for slot starts (e.g. 15 => 9:00, 9:15, 9:30...).
 */
export function slotsFromFreeIntervals(
  free: TimeRange[],
  durationMinutes: number,
  stepMinutes: number
): TimeRange[] {
  const stepMs = stepMinutes * 60 * 1000;
  const durationMs = durationMinutes * 60 * 1000;
  const result: TimeRange[] = [];
  for (const interval of free) {
    const startMs = parseIsoToMs(interval.start);
    const endMs = parseIsoToMs(interval.end);
    let t = startMs;
    while (t + durationMs <= endMs) {
      result.push({
        start: new Date(t).toISOString(),
        end: new Date(t + durationMs).toISOString(),
      });
      t += stepMs;
    }
  }
  return result;
}

/**
 * Full pipeline: busy ranges -> merged -> free intervals -> slots.
 * Returns slots in ISO, sorted by start.
 */
export function computeFreeSlots(
  rangeStart: string,
  rangeEnd: string,
  busy: TimeRange[],
  durationMinutes: number,
  stepMinutes: number = 15
): TimeRange[] {
  const merged = mergeBusyRanges(busy);
  const free = freeIntervals(rangeStart, rangeEnd, merged);
  const slots = slotsFromFreeIntervals(free, durationMinutes, stepMinutes);
  return slots.sort((a, b) => parseIsoToMs(a.start) - parseIsoToMs(b.start));
}

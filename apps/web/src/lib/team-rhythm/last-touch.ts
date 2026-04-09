import type { InternalRhythmCategory } from "./internal-classification";
import { isCadencePersonalTouchCategory } from "./internal-classification";

export type RhythmEventLike = {
  startAt: Date;
  targetUserIds: string[];
  category: InternalRhythmCategory;
};

/**
 * Poslední „osobní“ dotek z týmového kalendáře (heuristika z názvu události).
 */
export function lastPersonalTouchByUser(events: RhythmEventLike[], now: Date): Map<string, Date | null> {
  const map = new Map<string, Date | null>();
  const userIds = new Set<string>();
  for (const e of events) {
    for (const id of e.targetUserIds) userIds.add(id);
  }
  for (const uid of userIds) {
    let max: Date | null = null;
    for (const e of events) {
      if (!e.targetUserIds.includes(uid)) continue;
      if (e.startAt > now) continue;
      if (!isCadencePersonalTouchCategory(e.category)) continue;
      if (!max || e.startAt > max) max = e.startAt;
    }
    map.set(uid, max);
  }
  return map;
}

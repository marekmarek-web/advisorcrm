/**
 * Datetime helpers for availability, booking, and scheduling.
 * All internal logic uses ISO strings; timezone handling for display on frontend.
 */

export {
  parseIsoToMs,
  mergeBusyRanges,
  freeIntervals,
  slotsFromFreeIntervals,
  computeFreeSlots,
  type TimeRange,
} from "./slots";

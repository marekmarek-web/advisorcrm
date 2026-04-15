/**
 * Notes vision board: logical coordinate system.
 *
 * Stored positions (`NotesBoardStoredPosition` from server actions) use `x` and `y`
 * in the closed interval [0, 1] as fractions of the **board content box** width
 * and height. They are not tied to viewport pixels; drag/drop converts pixels ↔ units
 * using the current board element's `getBoundingClientRect()`.
 *
 * Card **visual** size must scale with the same board (e.g. `cqw` / `%`), not `vw`,
 * so layout stays consistent across notebook vs. large monitor without re-sorting cards.
 */

export const BOARD_UNIT_MIN = 0;
export const BOARD_UNIT_MAX = 1;

/**
 * Spawn placement only: approximate half-card size as a fraction of the board axis.
 * Used to center new cards in board space; persisted positions remain 0–1 units.
 */
export const NOTES_BOARD_SPAWN_HALF_CARD_X_FRAC = 0.11;
export const NOTES_BOARD_SPAWN_HALF_CARD_Y_FRAC = 0.11;

export function clampBoardUnit(n: number): number {
  if (!Number.isFinite(n)) return BOARD_UNIT_MIN;
  return Math.min(BOARD_UNIT_MAX, Math.max(BOARD_UNIT_MIN, n));
}

/** Convert a distance along one axis from pixels to 0–1 board units. */
export function pixelsToBoardUnits(px: number, axisPx: number): number {
  if (!Number.isFinite(px) || !Number.isFinite(axisPx) || axisPx <= 0) return BOARD_UNIT_MIN;
  return clampBoardUnit(px / axisPx);
}

/** Convert 0–1 board units to pixels for the current board size (render / hit testing). */
export function boardUnitsToPixels(u: number, axisPx: number): number {
  if (!Number.isFinite(axisPx) || axisPx <= 0) return 0;
  return clampBoardUnit(u) * axisPx;
}

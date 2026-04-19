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
export const NOTES_BOARD_SPAWN_HALF_CARD_X_FRAC = 0.095;
export const NOTES_BOARD_SPAWN_HALF_CARD_Y_FRAC = 0.095;

/**
 * Logické plátno free-boardu: i na úzkém notebooku (13") se sidebar collapse
 * nemění vzájemné pozice karet — jen se objeví horizontální scroll.
 * Karty se renderují proti plátnu o minimální šířce NOTES_BOARD_LOGICAL_MIN_WIDTH_PX,
 * nikoliv proti aktuální viewport šířce.
 */
export const NOTES_BOARD_LOGICAL_MIN_WIDTH_PX = 1440;
export const NOTES_BOARD_LOGICAL_MIN_HEIGHT_PX = 900;

/** Jemný grid pro snap při drop a pro řazení v tidyLayout. */
export const NOTES_BOARD_SNAP_PX = 16;

/**
 * Práh šířky hosting kontejneru (px), pod kterým přepínáme z free-boardu na
 * masonry feed. Řídí se šířkou skutečného kontejneru (ResizeObserver), ne
 * matchMedia — proto pracuje správně i při collapse / expand sidebaru.
 */
export const NOTES_BOARD_MASONRY_BREAKPOINT_PX = 900;

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

/** Zaokrouhlí px hodnotu na nejbližší násobek {@link NOTES_BOARD_SNAP_PX} (nebo vlastního kroku). */
export function snapToGrid(px: number, step: number = NOTES_BOARD_SNAP_PX): number {
  if (!Number.isFinite(px) || step <= 0) return 0;
  return Math.round(px / step) * step;
}

export type BoardRect = { x: number; y: number; w: number; h: number };

/** AABB overlap test (tolerance odečte okraje, tj. "skoro-dotyk" se nebere jako překryv). */
export function rectsOverlap(a: BoardRect, b: BoardRect, tolerancePx: number = 0): boolean {
  return !(
    a.x + a.w <= b.x + tolerancePx ||
    b.x + b.w <= a.x + tolerancePx ||
    a.y + a.h <= b.y + tolerancePx ||
    b.y + b.h <= a.y + tolerancePx
  );
}

/**
 * Vyhledá první volný slot row-major na daném gridu. Používá se při spawnu
 * nové karty, aby se nerodila přímo pod existující.
 */
export function findFirstFreeSlot(
  occupied: BoardRect[],
  canvasW: number,
  canvasH: number,
  cardW: number,
  cardH: number,
  paddingPx: number = NOTES_BOARD_SNAP_PX,
  stepPx: number = NOTES_BOARD_SNAP_PX,
): { x: number; y: number } {
  const maxX = Math.max(paddingPx, canvasW - paddingPx - cardW);
  const maxY = Math.max(paddingPx, canvasH - paddingPx - cardH);
  for (let y = paddingPx; y <= maxY; y += stepPx) {
    for (let x = paddingPx; x <= maxX; x += stepPx) {
      const slot: BoardRect = { x, y, w: cardW, h: cardH };
      let blocked = false;
      for (const r of occupied) {
        if (rectsOverlap(slot, r, 1)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) return { x, y };
    }
  }
  return { x: paddingPx, y: paddingPx };
}

/**
 * Row-major auto-layout pro tlačítko „Uspořádat". Pinned karty jdou první,
 * ostatní zachovají pořadí dle vstupního pole.
 */
export function tidyLayout(
  items: { id: string; pinned: boolean }[],
  canvasW: number,
  cardW: number,
  cardH: number,
  gapPx: number = NOTES_BOARD_SNAP_PX * 1.5,
  paddingPx: number = NOTES_BOARD_SNAP_PX,
): Record<string, { x: number; y: number }> {
  const ordered = [...items].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  const stepX = cardW + gapPx;
  const stepY = cardH + gapPx;
  const usableW = Math.max(cardW, canvasW - paddingPx * 2);
  const cols = Math.max(1, Math.floor((usableW + gapPx) / stepX));
  const out: Record<string, { x: number; y: number }> = {};
  ordered.forEach((it, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    out[it.id] = {
      x: paddingPx + col * stepX,
      y: paddingPx + row * stepY,
    };
  });
  return out;
}

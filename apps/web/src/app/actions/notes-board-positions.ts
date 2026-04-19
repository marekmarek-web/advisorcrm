"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { db, advisorPreferences, eq, and } from "db";

/**
 * `order` je volitelný index v mobilním masonry feedu. Když chybí, UI odvodí
 * pořadí ze `z` desc (pinned první). Na free-boardu se ignoruje.
 */
export type NotesBoardStoredPosition = {
  x: number;
  y: number;
  z: number;
  pinned: boolean;
  order?: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function sanitizePositions(raw: unknown): Record<string, NotesBoardStoredPosition> {
  if (raw == null || typeof raw !== "object") return {};
  const out: Record<string, NotesBoardStoredPosition> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!UUID_RE.test(key)) continue;
    if (val == null || typeof val !== "object") continue;
    const o = val as Record<string, unknown>;
    const x = clamp01(typeof o.x === "number" ? o.x : Number(o.x));
    const y = clamp01(typeof o.y === "number" ? o.y : Number(o.y));
    let z = typeof o.z === "number" ? o.z : Number(o.z);
    if (!Number.isFinite(z)) z = 1;
    z = Math.min(99999, Math.max(1, Math.floor(z)));
    const pinned = Boolean(o.pinned);
    const orderRaw = typeof o.order === "number" ? o.order : Number(o.order);
    const hasOrder = Number.isFinite(orderRaw);
    const base: NotesBoardStoredPosition = { x, y, z, pinned };
    if (hasOrder) {
      base.order = Math.min(99999, Math.max(0, Math.floor(orderRaw)));
    }
    out[key] = base;
  }
  return out;
}

/** Načte uložené pozice boardu Zápisků (0–1 vůči plátnu). */
export async function getNotesBoardPositions(): Promise<Record<string, NotesBoardStoredPosition>> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "meeting_notes:read")) return {};
  const row = await db
    .select({ notesBoardPositions: advisorPreferences.notesBoardPositions })
    .from(advisorPreferences)
    .where(and(eq(advisorPreferences.tenantId, auth.tenantId), eq(advisorPreferences.userId, auth.userId)))
    .limit(1);
  return sanitizePositions(row[0]?.notesBoardPositions ?? {});
}

/** Uloží celou mapu pozic (nahradí předchozí). */
export async function saveNotesBoardPositions(positions: Record<string, NotesBoardStoredPosition>): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "meeting_notes:write")) {
    throw new Error("Forbidden");
  }
  const clean = sanitizePositions(positions);
  const existing = await db
    .select({ id: advisorPreferences.id })
    .from(advisorPreferences)
    .where(and(eq(advisorPreferences.tenantId, auth.tenantId), eq(advisorPreferences.userId, auth.userId)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(advisorPreferences)
      .set({ notesBoardPositions: clean, updatedAt: new Date() })
      .where(eq(advisorPreferences.id, existing[0].id));
  } else {
    await db.insert(advisorPreferences).values({
      userId: auth.userId,
      tenantId: auth.tenantId,
      notesBoardPositions: clean,
    });
  }
}

"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { db } from "db";
import { advisorPreferences } from "db";
import { eq, and } from "db";
import {
  loadCareerPositions,
  findCareerPosition,
  type CareerPositionRow,
} from "@/lib/bj/coefficients-repository";

/**
 * Server actions pro nastavení kariérní pozice poradce.
 *
 * Pozice určuje hodnotu 1 BJ v Kč (62,50 – 200,00) a slouží k přepočtu BJ
 * součtu v produkčním reportu. Seznam pozic se načítá z
 * `career_position_coefficients` s per-tenant override.
 *
 * Workflow:
 *   1. `listCareerPositionOptions()` — UI naplní dropdown.
 *   2. `getMyCareerPosition()` — UI zjistí aktuální výběr (nebo `null`).
 *   3. `setMyCareerPosition(positionKey | null)` — UI uloží nový výběr
 *      (null = odebrat volbu → produkce ukáže „nezadána pozice").
 */

export type CareerPositionOption = {
  positionKey: string;
  positionLabel: string;
  positionLevel: number;
  /** Hodnota 1 BJ v Kč (62,50 – 200,00) pro tuto pozici. */
  bjValueCzk: number;
  /** Minimální BJ threshold pro postup na vyšší pozici (nebo null). */
  bjThreshold: number | null;
};

export type MyCareerPositionPayload = {
  positionKey: string | null;
  option: CareerPositionOption | null;
};

function rowToOption(row: CareerPositionRow): CareerPositionOption {
  return {
    positionKey: row.positionKey,
    positionLabel: row.positionLabel,
    positionLevel: row.positionLevel,
    bjValueCzk: row.bjValueCzk,
    bjThreshold: row.bjThreshold,
  };
}

export async function listCareerPositionOptions(): Promise<CareerPositionOption[]> {
  const auth = await requireAuthInAction();
  const rows = await loadCareerPositions(auth.tenantId);
  return rows.map(rowToOption);
}

export async function getMyCareerPosition(): Promise<MyCareerPositionPayload> {
  const auth = await requireAuthInAction();

  const [pref] = await db
    .select({ careerPositionKey: advisorPreferences.careerPositionKey })
    .from(advisorPreferences)
    .where(
      and(
        eq(advisorPreferences.tenantId, auth.tenantId),
        eq(advisorPreferences.userId, auth.userId),
      ),
    )
    .limit(1);

  const positionKey = pref?.careerPositionKey?.trim() || null;
  if (!positionKey) return { positionKey: null, option: null };

  const row = await findCareerPosition(auth.tenantId, positionKey);
  return {
    positionKey,
    option: row ? rowToOption(row) : null,
  };
}

export async function setMyCareerPosition(positionKey: string | null): Promise<MyCareerPositionPayload> {
  const auth = await requireAuthInAction();

  const trimmed = positionKey?.trim() || null;
  if (trimmed) {
    // Validace — odmítneme klíč, který v sazebníku neexistuje, abychom
    // nezasklili produkci invalidním linkem.
    const exists = await findCareerPosition(auth.tenantId, trimmed);
    if (!exists) {
      throw new Error(`Kariérní pozice „${trimmed}" není v sazebníku.`);
    }
  }

  const [existing] = await db
    .select({ id: advisorPreferences.id })
    .from(advisorPreferences)
    .where(
      and(
        eq(advisorPreferences.tenantId, auth.tenantId),
        eq(advisorPreferences.userId, auth.userId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(advisorPreferences)
      .set({ careerPositionKey: trimmed, updatedAt: new Date() })
      .where(eq(advisorPreferences.id, existing.id));
  } else {
    await db.insert(advisorPreferences).values({
      tenantId: auth.tenantId,
      userId: auth.userId,
      careerPositionKey: trimmed,
    });
  }

  return getMyCareerPosition();
}

"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { withAuthContext, withTenantContextFromAuth } from "@/lib/auth/with-auth-context";
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
  /** Uložený příplatek Kč/BJ (null = bez výjimky). */
  careerBjBonusCzk: number | null;
  /** Základ z pozice + příplatek; null bez zvolené pozice. */
  effectiveBjValueCzk: number | null;
};

function parseNumericCzk(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

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

  const pref = await withTenantContextFromAuth(auth, async (tx) => {
    const [row] = await tx
      .select({
        careerPositionKey: advisorPreferences.careerPositionKey,
        careerBjBonusCzk: advisorPreferences.careerBjBonusCzk,
      })
      .from(advisorPreferences)
      .where(
        and(
          eq(advisorPreferences.tenantId, auth.tenantId),
          eq(advisorPreferences.userId, auth.userId),
        ),
      )
      .limit(1);
    return row ?? null;
  });

  const bonus = parseNumericCzk(pref?.careerBjBonusCzk ?? null);
  const positionKey = pref?.careerPositionKey?.trim() || null;
  if (!positionKey) {
    return { positionKey: null, option: null, careerBjBonusCzk: bonus, effectiveBjValueCzk: null };
  }

  const row = await findCareerPosition(auth.tenantId, positionKey);
  const option = row ? rowToOption(row) : null;
  const base = option?.bjValueCzk ?? null;
  const effectiveBjValueCzk =
    base == null ? null : Math.round((base + (bonus ?? 0)) * 100) / 100;
  return {
    positionKey,
    option,
    careerBjBonusCzk: bonus,
    effectiveBjValueCzk,
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

  await withTenantContextFromAuth(auth, async (tx) => {
    const [existing] = await tx
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
      await tx
        .update(advisorPreferences)
        .set({ careerPositionKey: trimmed, updatedAt: new Date() })
        .where(eq(advisorPreferences.id, existing.id));
    } else {
      await tx.insert(advisorPreferences).values({
        tenantId: auth.tenantId,
        userId: auth.userId,
        careerPositionKey: trimmed,
      });
    }
  });

  return getMyCareerPosition();
}

/**
 * Osobní příplatek k sazbě 1 BJ (Kč). Null = odstranit výjimku.
 * Platí jen spolu s kariérní pozicí v produkčním přepočtu; lze uložit i bez pozice.
 */
export async function setMyCareerBjBonusCzk(bonusCzk: number | null): Promise<MyCareerPositionPayload> {
  let stored: string | null = null;
  if (bonusCzk != null) {
    if (!Number.isFinite(bonusCzk)) {
      throw new Error("Neplatná hodnota výjimky.");
    }
    const rounded = Math.round(bonusCzk * 100) / 100;
    if (rounded < 0 || rounded > 99_999.99) {
      throw new Error("Výjimka musí být v rozmezí 0 až 99 999,99 Kč / BJ.");
    }
    if (rounded === 0) {
      stored = null;
    } else {
      stored = rounded.toFixed(2);
    }
  }

  await withAuthContext(async (auth, tx) => {
    const [existing] = await tx
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
      await tx
        .update(advisorPreferences)
        .set({ careerBjBonusCzk: stored, updatedAt: new Date() })
        .where(eq(advisorPreferences.id, existing.id));
    } else {
      await tx.insert(advisorPreferences).values({
        tenantId: auth.tenantId,
        userId: auth.userId,
        careerBjBonusCzk: stored,
      });
    }
  });

  return getMyCareerPosition();
}

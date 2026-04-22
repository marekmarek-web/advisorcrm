"use server";

import { randomBytes } from "crypto";
import { withAuthContext } from "@/lib/auth/with-auth-context";
import { hasPermission } from "@/lib/auth/permissions";
import { advisorPreferences } from "db";
import { eq, and } from "db";
import type { BookingWeeklyAvailability } from "db";
import { defaultBookingAvailability, normalizeAvailability } from "@/lib/public-booking/defaults";

export type PublicBookingSettingsDTO = {
  publicBookingEnabled: boolean;
  publicBookingToken: string | null;
  bookingSlotMinutes: number;
  bookingBufferMinutes: number;
  bookingAvailability: BookingWeeklyAvailability | null;
};

function newBookingToken(): string {
  return randomBytes(18).toString("hex");
}

export async function getPublicBookingSettings(): Promise<PublicBookingSettingsDTO> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:read")) {
      return {
        publicBookingEnabled: false,
        publicBookingToken: null,
        bookingSlotMinutes: 30,
        bookingBufferMinutes: 0,
        bookingAvailability: null,
      };
    }

    const [row] = await tx
      .select({
        publicBookingEnabled: advisorPreferences.publicBookingEnabled,
        publicBookingToken: advisorPreferences.publicBookingToken,
        bookingSlotMinutes: advisorPreferences.bookingSlotMinutes,
        bookingBufferMinutes: advisorPreferences.bookingBufferMinutes,
        bookingAvailability: advisorPreferences.bookingAvailability,
      })
      .from(advisorPreferences)
      .where(
        and(eq(advisorPreferences.tenantId, auth.tenantId), eq(advisorPreferences.userId, auth.userId)),
      )
      .limit(1);

    if (!row) {
      return {
        publicBookingEnabled: false,
        publicBookingToken: null,
        bookingSlotMinutes: 30,
        bookingBufferMinutes: 0,
        bookingAvailability: null,
      };
    }

    return {
      publicBookingEnabled: row.publicBookingEnabled ?? false,
      publicBookingToken: row.publicBookingToken ?? null,
      bookingSlotMinutes: Math.min(120, Math.max(15, row.bookingSlotMinutes ?? 30)),
      bookingBufferMinutes: Math.min(120, Math.max(0, row.bookingBufferMinutes ?? 0)),
      bookingAvailability: normalizeAvailability(row.bookingAvailability),
    };
  });
}

export async function savePublicBookingSettings(input: {
  enabled: boolean;
  slotMinutes: number;
  bufferMinutes: number;
  availability: BookingWeeklyAvailability;
}): Promise<{ ok: true; token: string | null } | { ok: false; error: string }> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) {
      return { ok: false, error: "Forbidden" };
    }

    const slotMinutes = Math.min(120, Math.max(15, Math.round(input.slotMinutes)));
    const bufferMinutes = Math.min(120, Math.max(0, Math.round(input.bufferMinutes)));
    const availability = normalizeAvailability(input.availability) ?? defaultBookingAvailability();

    const [existing] = await tx
      .select({
        id: advisorPreferences.id,
        publicBookingToken: advisorPreferences.publicBookingToken,
      })
      .from(advisorPreferences)
      .where(
        and(eq(advisorPreferences.tenantId, auth.tenantId), eq(advisorPreferences.userId, auth.userId)),
      )
      .limit(1);

    let nextToken = existing?.publicBookingToken ?? null;
    if (input.enabled && !nextToken) {
      nextToken = newBookingToken();
    }

    if (existing) {
      await tx
        .update(advisorPreferences)
        .set({
          publicBookingEnabled: input.enabled,
          ...(input.enabled && nextToken ? { publicBookingToken: nextToken } : {}),
          bookingSlotMinutes: slotMinutes,
          bookingBufferMinutes: bufferMinutes,
          bookingAvailability: availability,
          updatedAt: new Date(),
        })
        .where(eq(advisorPreferences.id, existing.id));
    } else {
      await tx.insert(advisorPreferences).values({
        userId: auth.userId,
        tenantId: auth.tenantId,
        publicBookingEnabled: input.enabled,
        publicBookingToken: input.enabled ? nextToken : null,
        bookingSlotMinutes: slotMinutes,
        bookingBufferMinutes: bufferMinutes,
        bookingAvailability: availability,
      });
    }

    return { ok: true, token: input.enabled ? nextToken : null };
  });
}

export async function regeneratePublicBookingToken(): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) {
      return { ok: false, error: "Forbidden" };
    }

    const token = newBookingToken();
    const [existing] = await tx
      .select({ id: advisorPreferences.id })
      .from(advisorPreferences)
      .where(
        and(eq(advisorPreferences.tenantId, auth.tenantId), eq(advisorPreferences.userId, auth.userId)),
      )
      .limit(1);

    if (existing) {
      await tx
        .update(advisorPreferences)
        .set({ publicBookingToken: token, updatedAt: new Date() })
        .where(eq(advisorPreferences.id, existing.id));
    } else {
      await tx.insert(advisorPreferences).values({
        userId: auth.userId,
        tenantId: auth.tenantId,
        publicBookingToken: token,
        publicBookingEnabled: false,
        bookingAvailability: defaultBookingAvailability(),
        bookingSlotMinutes: 30,
        bookingBufferMinutes: 0,
      });
    }

    return { ok: true, token };
  });
}

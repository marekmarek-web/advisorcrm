"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { db, userProfiles, eq } from "db";

export type CalendarReminderChannelPrefs = {
  pushEnabled: boolean;
  emailEnabled: boolean;
};

export async function getCalendarReminderChannelPrefs(): Promise<CalendarReminderChannelPrefs> {
  const auth = await requireAuthInAction();
  const [row] = await db
    .select({
      pushEnabled: userProfiles.calendarReminderPushEnabled,
      emailEnabled: userProfiles.calendarReminderEmailEnabled,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, auth.userId))
    .limit(1);
  return {
    pushEnabled: row?.pushEnabled !== false,
    emailEnabled: row?.emailEnabled !== false,
  };
}

export async function updateCalendarReminderChannelPrefs(
  prefs: Partial<CalendarReminderChannelPrefs>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAuthInAction();
  if (prefs.pushEnabled === undefined && prefs.emailEnabled === undefined) {
    return { ok: false, error: "Nic ke změně." };
  }
  try {
    await db
      .insert(userProfiles)
      .values({
        userId: auth.userId,
        fullName: null,
        email: null,
        calendarReminderPushEnabled: prefs.pushEnabled ?? true,
        calendarReminderEmailEnabled: prefs.emailEnabled ?? true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: {
          ...(prefs.pushEnabled !== undefined && { calendarReminderPushEnabled: prefs.pushEnabled }),
          ...(prefs.emailEnabled !== undefined && { calendarReminderEmailEnabled: prefs.emailEnabled }),
          updatedAt: new Date(),
        },
      });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Uložení se nepovedlo." };
  }
}

import "server-only";

import { createAdminClient } from "@/lib/supabase/server";

/**
 * Klíče e-mailových upozornění, které zobrazujeme v `/portal/setup?tab=notifikace`.
 *
 * Každý klíč odpovídá jedné kategorii, kterou může poradce vypnout/zapnout
 * v osobním nastavení. Preference se ukládá do
 * `auth.users.raw_user_meta_data -> 'notification_prefs'` přes
 * `setNotificationPrefs()` v `@/app/actions/preferences`.
 *
 * Kategorie:
 * - `daily`     … denní souhrn ráno (agenda) — zatím neexistuje odesílací cron.
 * - `message`   … e-mail při nové zprávě od klienta — posílá
 *                 `notifyAdvisorNewMessage` do tenant-wide inboxu.
 * - `tasks`     … e-mail při zpožděných úkolech — zatím jen in-app reminder.
 * - `contracts` … týdenní souhrn expirací — zatím neexistuje odesílací cron.
 */
export type NotificationPrefKey = "daily" | "message" | "tasks" | "contracts";

/** Výchozí stav: všechny kategorie zapnuté, dokud je uživatel aktivně nevypne. */
const DEFAULT_PREFS: Record<NotificationPrefKey, boolean> = {
  daily: true,
  message: true,
  tasks: true,
  contracts: true,
};

const memo = new Map<string, Promise<Record<string, boolean>>>();

/**
 * Načte `notification_prefs` pro daného uživatele ze Supabase Auth user_metadata.
 *
 * Vrací raw slovník (včetně neznámých klíčů). Pro typované kontroly použij
 * `getUserNotificationPref()`.
 *
 * Výsledek je cachovaný v rámci jednoho process/instance běhu — stejný user_id
 * dotázaný víckrát v jednom cron tasku ušetří round-trip do Auth.
 *
 * Helper **nesmí blokovat** odesílání, když Auth nedostupné — vrací
 * `DEFAULT_PREFS` (tj. fail-open: raději pošleme, než bychom o zprávu přišli).
 */
export async function getUserNotificationPrefs(
  userId: string
): Promise<Record<string, boolean>> {
  if (!userId) return DEFAULT_PREFS;
  const cached = memo.get(userId);
  if (cached) return cached;

  const pending = (async () => {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error || !data?.user) return DEFAULT_PREFS;
      const raw = (data.user.user_metadata as { notification_prefs?: unknown } | null)?.notification_prefs;
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const out: Record<string, boolean> = { ...DEFAULT_PREFS };
        for (const [k, v] of Object.entries(raw)) {
          if (typeof v === "boolean") out[k] = v;
        }
        return out;
      }
      return DEFAULT_PREFS;
    } catch {
      return DEFAULT_PREFS;
    }
  })();

  memo.set(userId, pending);
  return pending;
}

/**
 * Vrací `true`, pokud má uživatel pro daný kanál upozornění zapnutý.
 *
 * Fail-open: když Supabase Auth není dostupná nebo pref není nastavený,
 * vrátíme `true` (výchozí stav z `DEFAULT_PREFS`). Preferujeme falešně
 * pozitivní odeslání proti tichému spadnutí důležité zprávy.
 */
export async function getUserNotificationPref(
  userId: string,
  key: NotificationPrefKey
): Promise<boolean> {
  const prefs = await getUserNotificationPrefs(userId);
  return prefs[key] !== false;
}

/** Testovací helper — vyčistí per-process memo. */
export function __clearNotificationPrefsMemo(): void {
  memo.clear();
}

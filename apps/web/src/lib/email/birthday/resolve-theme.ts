import type { BirthdayEmailTheme } from "./types";
import { isBirthdayEmailTheme } from "./types";
import { resolveBirthdayDecorImagePublicPath } from "./public-urls";

export function parseBirthdayThemePreference(
  raw: string | null | undefined,
  fallback: BirthdayEmailTheme
): BirthdayEmailTheme {
  if (raw && isBirthdayEmailTheme(raw)) return raw;
  return fallback;
}

export type ResolvedBirthdayTheme = {
  theme: BirthdayEmailTheme;
  /** Relativní cesta pro meta.asset — jen když se opravdu použil gif layout */
  asset: string | null;
};

/**
 * requested z nastavení; pokud birthday_gif a chybí soubor → premium_dark.
 */
export function resolveEffectiveBirthdayTheme(requested: BirthdayEmailTheme): ResolvedBirthdayTheme {
  if (requested === "birthday_gif") {
    const asset = resolveBirthdayDecorImagePublicPath();
    if (asset) return { theme: "birthday_gif", asset };
    return { theme: "premium_dark", asset: null };
  }
  return { theme: "premium_dark", asset: null };
}

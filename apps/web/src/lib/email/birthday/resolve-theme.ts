import { existsSync } from "fs";
import { join } from "path";
import type { BirthdayEmailTheme } from "./types";
import { BIRTHDAY_GIF_PUBLIC_PATH, isBirthdayEmailTheme } from "./types";

export function parseBirthdayThemePreference(
  raw: string | null | undefined,
  fallback: BirthdayEmailTheme
): BirthdayEmailTheme {
  if (raw && isBirthdayEmailTheme(raw)) return raw;
  return fallback;
}

/** Zjistí, zda je v deployi k dispozici soubor gifu (Next běží z apps/web nebo z monorepo root). */
export function birthdayGifPublicFileExists(): boolean {
  const paths = [
    join(process.cwd(), "public", "birthday-freepik.gif"),
    join(process.cwd(), "apps", "web", "public", "birthday-freepik.gif"),
  ];
  return paths.some((p) => existsSync(p));
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
  if (requested === "birthday_gif" && birthdayGifPublicFileExists()) {
    return { theme: "birthday_gif", asset: BIRTHDAY_GIF_PUBLIC_PATH };
  }
  if (requested === "birthday_gif") {
    return { theme: "premium_dark", asset: null };
  }
  return { theme: "premium_dark", asset: null };
}

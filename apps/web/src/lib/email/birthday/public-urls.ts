import { existsSync } from "fs";
import { join } from "path";
import { BIRTHDAY_DECOR_IMAGE_FILENAMES } from "./types";

export function getPublicSiteOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "https://www.aidvisora.cz";
}

export function absoluteUrlFromPublicPath(path: string): string {
  const base = getPublicSiteOrigin();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

const EMAIL_LOGO_CANDIDATES = [
  "email/aidvisory-mark.png",
  "email/aidvisory-mark.svg",
  "aidvisora-logo-a.png",
];

export function resolveEmailHeaderLogoUrl(): string | null {
  for (const rel of EMAIL_LOGO_CANDIDATES) {
    const paths = [
      join(process.cwd(), "public", rel),
      join(process.cwd(), "apps", "web", "public", rel),
    ];
    if (paths.some((p) => existsSync(p))) {
      return absoluteUrlFromPublicPath(`/${rel}`);
    }
  }
  return null;
}

export function resolveBirthdayDecorImagePublicPath(): string | null {
  for (const file of BIRTHDAY_DECOR_IMAGE_FILENAMES) {
    const paths = [
      join(process.cwd(), "public", file),
      join(process.cwd(), "apps", "web", "public", file),
    ];
    if (paths.some((p) => existsSync(p))) return `/${file}`;
  }
  return null;
}

export function birthdayGifAbsoluteUrlIfExists(): string | null {
  const rel = resolveBirthdayDecorImagePublicPath();
  if (!rel) return null;
  return absoluteUrlFromPublicPath(rel);
}

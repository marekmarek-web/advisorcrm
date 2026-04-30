import "server-only";

import { existsSync } from "node:fs";
import { join } from "node:path";

import { BIRTHDAY_DECOR_IMAGE_FILENAMES } from "./types";
import { absoluteUrlFromPublicPath } from "./public-urls";

const EMAIL_LOGO_CANDIDATES = [
  "logos/Aidvisora logo new svg.svg",
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

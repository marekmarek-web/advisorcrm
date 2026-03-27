/**
 * After `copy-pwa-icons-to-public.mjs`, Capacitor WebP may flatten alpha.
 * Rewrite public PWA icons from transparent `assets/icon-only.png` (or favicon fallback).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const iconOnly = path.join(webRoot, "assets", "icon-only.png");
const faviconPng = path.join(webRoot, "public", "favicon.png");
const outDir = path.join(webRoot, "public", "icons");

const src = fs.existsSync(iconOnly) ? iconOnly : faviconPng;
if (!fs.existsSync(src)) {
  console.warn("regenerate-public-pwa-webp: no icon-only.png or favicon.png — skip.");
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });
const bg = { r: 0, g: 0, b: 0, alpha: 0 };

for (const size of [192, 512]) {
  await sharp(src)
    .resize(size, size, { fit: "contain", background: bg })
    .webp({ alphaQuality: 100 })
    .toFile(path.join(outDir, `icon-${size}.webp`));
}

console.log("Wrote transparent WebP PWA icons from", path.relative(webRoot, src));

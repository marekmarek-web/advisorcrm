/**
 * Native (Capacitor Android/iOS): `logos/Aidvisora logo A.png` → assets/icon*.png + splash.
 * Web favicon / apple-touch (prohlížeč): `logos/Aidvisora favicon.png` pokud existuje, jinak stejný jako native.
 */
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const monorepoRoot = path.join(webRoot, "..", "..");
const nativeLogoPath = path.join(monorepoRoot, "logos", "Aidvisora logo A.png");
const webFaviconPath = path.join(monorepoRoot, "logos", "Aidvisora favicon.png");
const assetsDir = path.join(webRoot, "assets");
const publicDir = path.join(webRoot, "public");

const black = { r: 0, g: 0, b: 0, alpha: 1 };
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

async function main() {
  if (!existsSync(nativeLogoPath)) {
    console.error("Missing native app logo:", nativeLogoPath);
    process.exit(1);
  }

  await mkdir(assetsDir, { recursive: true });

  const iconSize = 1024;
  const logoMax = 900;
  const logoBuf = await sharp(nativeLogoPath)
    .resize(logoMax, logoMax, { fit: "inside", withoutEnlargement: true })
    .toBuffer();

  // App / PWA icon: centered on transparent 1024² (matches favicon artwork).
  await sharp({
    create: { width: iconSize, height: iconSize, channels: 4, background: transparent },
  })
    .composite([{ input: logoBuf, gravity: "center" }])
    .png()
    .toFile(path.join(assetsDir, "icon-only.png"));

  // @capacitor/assets expects `assets/icon.png` (1024).
  await sharp(path.join(assetsDir, "icon-only.png")).png().toFile(path.join(assetsDir, "icon.png"));

  const splashSize = 2732;
  const splashSide = Math.round(splashSize * 0.35);
  const splashLogoBuf = await sharp(nativeLogoPath)
    .resize(splashSide, splashSide, { fit: "inside", withoutEnlargement: true })
    .toBuffer();

  await sharp({
    create: { width: splashSize, height: splashSize, channels: 4, background: black },
  })
    .composite([{ input: splashLogoBuf, gravity: "center" }])
    .png()
    .toFile(path.join(assetsDir, "splash.png"));

  await sharp(path.join(assetsDir, "splash.png")).png().toFile(path.join(assetsDir, "splash-dark.png"));

  const webSrc = existsSync(webFaviconPath) ? webFaviconPath : path.join(assetsDir, "icon-only.png");
  await sharp(webSrc)
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .png()
    .toFile(path.join(publicDir, "favicon.png"));

  await sharp(webSrc)
    .resize(180, 180, { fit: "inside", withoutEnlargement: true })
    .png()
    .toFile(path.join(publicDir, "apple-touch-icon.png"));

  console.log(
    "Wrote assets from native logo, public favicon from",
    existsSync(webFaviconPath) ? "Aidvisora favicon.png" : "native icon",
    "(run pnpm cap:assets for WebP + Android/iOS icons)",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

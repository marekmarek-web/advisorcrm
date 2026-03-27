/**
 * Native (Capacitor Android/iOS): `logos/Aidvisora logo new fav.png` → assets/icon*.png + splash.
 * Web favicon / apple-touch: stejný zdroj (mark „A“).
 */
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const monorepoRoot = path.join(webRoot, "..", "..");
const brandMarkPath = path.join(monorepoRoot, "logos", "Aidvisora logo new fav.png");
const nativeLogoPath = brandMarkPath;
const webFaviconPath = brandMarkPath;
const assetsDir = path.join(webRoot, "assets");
const publicDir = path.join(webRoot, "public");

const black = { r: 0, g: 0, b: 0, alpha: 1 };
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
/** Opaque pad for iOS home screen (Apple recommends non-transparent for touch icon). */
const webIconBg = { r: 255, g: 255, b: 255, alpha: 1 };
/**
 * Source file has generous padding; trim removes it so the mark fills favicon / native sizes.
 * threshold: tolerance vs top-left “background” (anti-alias fringe).
 */
const trimThreshold = 42;

function sharpTrimmedMark(inputPath) {
  return sharp(inputPath).trim({ threshold: trimThreshold });
}

async function main() {
  if (!existsSync(nativeLogoPath)) {
    console.error("Missing brand mark (favicon / native):", nativeLogoPath);
    process.exit(1);
  }

  await mkdir(assetsDir, { recursive: true });

  const iconSize = 1024;
  const logoMax = 900;
  const logoBuf = await sharpTrimmedMark(nativeLogoPath)
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
  const splashLogoBuf = await sharpTrimmedMark(nativeLogoPath)
    .resize(splashSide, splashSide, { fit: "inside", withoutEnlargement: true })
    .toBuffer();

  await sharp({
    create: { width: splashSize, height: splashSize, channels: 4, background: black },
  })
    .composite([{ input: splashLogoBuf, gravity: "center" }])
    .png()
    .toFile(path.join(assetsDir, "splash.png"));

  await sharp(path.join(assetsDir, "splash.png")).png().toFile(path.join(assetsDir, "splash-dark.png"));

  const webSrc = webFaviconPath;
  const favFill = Math.round(512 * 0.99);
  const favLogoBuf = await sharpTrimmedMark(webSrc)
    .resize(favFill, favFill, { fit: "inside", withoutEnlargement: false })
    .toBuffer();
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: transparent },
  })
    .composite([{ input: favLogoBuf, gravity: "center" }])
    .png()
    .toFile(path.join(publicDir, "favicon.png"));

  const appleFill = Math.round(180 * 0.99);
  const appleBuf = await sharpTrimmedMark(webSrc)
    .resize(appleFill, appleFill, { fit: "inside", withoutEnlargement: false })
    .toBuffer();
  await sharp({
    create: { width: 180, height: 180, channels: 4, background: webIconBg },
  })
    .composite([{ input: appleBuf, gravity: "center" }])
    .png()
    .toFile(path.join(publicDir, "apple-touch-icon.png"));

  console.log(
    "Wrote assets from Aidvisora logo new fav.png (run pnpm cap:assets for WebP + Android/iOS icons)",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

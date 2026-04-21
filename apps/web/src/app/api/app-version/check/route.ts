import { NextResponse, type NextRequest } from "next/server";

/**
 * Delta A9+A11 — Native app version gate.
 *
 * Endpoint kontroluje, jestli verze v Capacitor shellu je novější nebo rovna
 * `MIN_APP_VERSION_<platform>` (hard gate — vrací `forceUpdate: true`).
 * Pokud je starší než `CURRENT_APP_VERSION_<platform>` ale >= MIN, vrací
 * `softUpdate: true` — jen info banner.
 *
 * Call path v app shellu:
 *   native app → GET /api/app-version/check?platform=ios&version=1.2.3
 *   → { ok, forceUpdate, softUpdate, storeUrl, messageCs }
 *
 * ENV:
 *   MIN_APP_VERSION_IOS           (např. "1.0.0")
 *   CURRENT_APP_VERSION_IOS       (např. "1.1.0")
 *   MIN_APP_VERSION_ANDROID
 *   CURRENT_APP_VERSION_ANDROID
 *   APP_STORE_URL_IOS             (plný URL na App Store)
 *   APP_STORE_URL_ANDROID         (plný URL na Play Store)
 *
 * Fail-closed: pokud je env špatně nastaveno nebo chybí, odpovíme
 * `{ ok: true, forceUpdate: false, softUpdate: false }` — gate je benevolentní.
 * Downside: špatně nastavený env způsobí, že v kritickém bugu nepůjde vynutit update.
 * → Monitorujeme přes /api/healthcheck a ops runbook.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Platform = "ios" | "android" | "web";

type CheckResponse =
  | {
      ok: true;
      platform: Platform;
      clientVersion: string;
      current: string | null;
      minimum: string | null;
      forceUpdate: boolean;
      softUpdate: boolean;
      storeUrl: string | null;
      messageCs: string;
    }
  | { ok: false; error: string };

function parseVersion(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^v/i, "");
  if (!/^\d+(\.\d+)*$/.test(cleaned)) return null;
  return cleaned.split(".").map((x) => parseInt(x, 10));
}

/** Vrátí -1 pokud a < b, 0 pokud a == b, 1 pokud a > b. */
function compareVersions(a: number[], b: number[]): number {
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    const aPart = a[i] ?? 0;
    const bPart = b[i] ?? 0;
    if (aPart < bPart) return -1;
    if (aPart > bPart) return 1;
  }
  return 0;
}

function parsePlatform(raw: string | null): Platform {
  const v = raw?.trim().toLowerCase();
  if (v === "ios" || v === "android" || v === "web") return v;
  return "web";
}

function readPlatformEnv(platform: Platform): {
  current: string | null;
  minimum: string | null;
  storeUrl: string | null;
} {
  if (platform === "ios") {
    return {
      current: process.env.CURRENT_APP_VERSION_IOS?.trim() || null,
      minimum: process.env.MIN_APP_VERSION_IOS?.trim() || null,
      storeUrl: process.env.APP_STORE_URL_IOS?.trim() || null,
    };
  }
  if (platform === "android") {
    return {
      current: process.env.CURRENT_APP_VERSION_ANDROID?.trim() || null,
      minimum: process.env.MIN_APP_VERSION_ANDROID?.trim() || null,
      storeUrl: process.env.APP_STORE_URL_ANDROID?.trim() || null,
    };
  }
  return { current: null, minimum: null, storeUrl: null };
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const platform = parsePlatform(url.searchParams.get("platform"));
  const versionRaw = url.searchParams.get("version");
  const version = parseVersion(versionRaw);

  if (!version) {
    const body: CheckResponse = { ok: false, error: "Missing or invalid ?version" };
    return NextResponse.json(body, { status: 400 });
  }

  const { current, minimum, storeUrl } = readPlatformEnv(platform);
  const currentParsed = parseVersion(current);
  const minimumParsed = parseVersion(minimum);

  let forceUpdate = false;
  let softUpdate = false;

  if (minimumParsed && compareVersions(version, minimumParsed) < 0) {
    forceUpdate = true;
  } else if (currentParsed && compareVersions(version, currentParsed) < 0) {
    softUpdate = true;
  }

  const messageCs = forceUpdate
    ? "Tato verze aplikace již není podporována. Prosím aktualizujte na nejnovější verzi, abyste mohli pokračovat."
    : softUpdate
      ? "K dispozici je nová verze aplikace. Doporučujeme aktualizovat pro opravy chyb a nové funkce."
      : "Máte nejnovější verzi aplikace.";

  const body: CheckResponse = {
    ok: true,
    platform,
    clientVersion: versionRaw ?? "",
    current,
    minimum,
    forceUpdate,
    softUpdate,
    storeUrl,
    messageCs,
  };

  return NextResponse.json(body, {
    headers: {
      // Cache na 60 s — v případě incidentu lze obejít přes deploy nebo env rotace.
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  });
}

export function getPublicSiteOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "https://www.aidvisora.cz";
}

export function absoluteUrlFromPublicPath(path: string): string {
  const base = getPublicSiteOrigin();
  const p = path.startsWith("/") ? path : `/${path}`;
  const encoded = p.split("/").map((seg) => (seg === "" ? "" : encodeURIComponent(seg))).join("/");
  return `${base}${encoded}`;
}

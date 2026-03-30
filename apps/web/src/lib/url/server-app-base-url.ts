/**
 * Základní URL pro odkazy generované na serveru (e-maily, pozvánky do klientské zóny).
 * Pořadí: NEXT_PUBLIC_APP_URL → https://VERCEL_URL → localhost.
 */
export function getServerAppBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_URL?.trim().replace(/\/$/, "");
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

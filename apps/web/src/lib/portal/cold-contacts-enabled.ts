/**
 * Feature flag: "Studené kontakty" v portálu.
 * Vercel env: NEXT_PUBLIC_PORTAL_COLD_CONTACTS_ENABLED=true → zapnout položku menu / tools hub / routu.
 *
 * Ve výchozím stavu je flag VYPNUTÝ (false) — nová release v1 má polish-fokus,
 * studené kontakty jsou připraveny pro pozdější release a neukazují se v UI.
 */
export function isColdContactsEnabled(): boolean {
  if (typeof process.env.NEXT_PUBLIC_PORTAL_COLD_CONTACTS_ENABLED === "undefined") return false;
  const v = process.env.NEXT_PUBLIC_PORTAL_COLD_CONTACTS_ENABLED.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  return false;
}

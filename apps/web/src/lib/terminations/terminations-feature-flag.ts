/**
 * Feature flag: vypnutí modulu výpovědí bez deploye (NEXT_PUBLIC_TERMINATIONS_ENABLED=false).
 */
export function isTerminationsModuleEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_TERMINATIONS_ENABLED;
  if (typeof v === "string" && v.toLowerCase() === "false") return false;
  return true;
}

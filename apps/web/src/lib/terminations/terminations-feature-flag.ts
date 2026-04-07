/**
 * Feature flag: vypnutí modulu výpovědí bez deploye (NEXT_PUBLIC_TERMINATIONS_ENABLED=false).
 */
export function isTerminationsModuleEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_TERMINATIONS_ENABLED;
  if (typeof v === "string" && v.toLowerCase() === "false") return false;
  return true;
}

/** Server actions: volitelně ještě TERMINATIONS_ENABLED=false (bez prefixu NEXT_PUBLIC). */
export function isTerminationsModuleEnabledOnServer(): boolean {
  const s = process.env.TERMINATIONS_ENABLED;
  if (typeof s === "string" && s.toLowerCase() === "false") return false;
  return isTerminationsModuleEnabled();
}

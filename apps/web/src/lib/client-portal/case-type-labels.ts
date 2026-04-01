/** Sdílené mapování case_type (klientský portál / pipeline) na český popisek. */

const CASE_TYPE_LABELS: Record<string, string> = {
  hypotéka: "Hypotéka",
  hypo: "Hypotéka",
  investice: "Investice",
  invest: "Investice",
  pojištění: "Pojištění",
  pojist: "Pojištění",
  úvěr: "Úvěr",
  "změna situace": "Změna životní situace",
  "servis smlouvy": "Servis smlouvy",
  jiné: "Jiné",
};

export function caseTypeToLabel(caseType: string): string {
  const n = caseType?.toLowerCase().trim() ?? "";
  return (CASE_TYPE_LABELS[n] ?? caseType) || "Jiné";
}

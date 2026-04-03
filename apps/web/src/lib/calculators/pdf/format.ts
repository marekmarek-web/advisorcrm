/**
 * Formatting helpers for calculator PDF rows (Czech locale style).
 */

export function formatCurrencyCs(value: number): string {
  return `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} Kč`;
}

export function formatPercentCs(value: number, fractionDigits = 2): string {
  return `${value.toLocaleString("cs-CZ", { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })} %`;
}

export function buildCalculatorExportFilename(prefix: string, extension: "html" | "pdf"): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `aidvisora-${prefix}-${stamp}.${extension}`;
}

export const CALCULATOR_PDF_DISCLAIMER_LINES = [
  "Výpočty v tomto dokumentu jsou orientační a slouží pouze pro rychlou představu.",
  "Nejsou závaznou nabídkou a nenahrazují individuální posouzení bonity, účelu úvěru a podmínek u konkrétní instituce.",
] as const;

/**
 * Shared structure for calculator HTML/print export (sections → tabulky v reportu).
 */

export interface CalculatorPdfRow {
  label: string;
  value: string;
}

export interface CalculatorPdfSection {
  title: string;
  rows: CalculatorPdfRow[];
}

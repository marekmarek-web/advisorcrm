import type { BaseFund } from "./types";

/** Skupiny pro filtr v Nastavení — mapování z katalogových polí, bez nových faktů. */
export type FundUiGroupId =
  | "etf"
  | "bonds"
  | "cash_conservative"
  | "real_estate"
  | "pension"
  | "qualified_investor";

export const FUND_UI_GROUP_LABELS: Record<FundUiGroupId, string> = {
  etf: "ETF",
  bonds: "Dluhopisové",
  cash_conservative: "Peněžní / konzervativní",
  real_estate: "Realitní",
  pension: "Penzijní",
  qualified_investor: "FKI / alternativní",
};

export function getFundUiGroup(fund: BaseFund): FundUiGroupId | "other" {
  const key = fund.baseFundKey;
  const c = `${fund.category} ${fund.subcategory ?? ""}`.toLowerCase();

  if (fund.availability?.includes("qualified_investor")) return "qualified_investor";

  if (key === "monetika" || key === "nn_povinny_konzervativni") return "cash_conservative";
  if (c.includes("dluhopis") || c.includes("bond")) return "bonds";
  if (c.includes("etf")) return "etf";
  if (c.includes("nemovit") || c.includes("realit") || key === "creif" || key === "atris" || key === "investika_realitni_fond")
    return "real_estate";
  if (
    c.includes("účastnick") ||
    c.includes("ucastnick") ||
    c.includes("dps") ||
    c.includes("penz") ||
    key.startsWith("nn_") ||
    key === "conseq_globalni_akciovy_ucastnicky"
  )
    return "pension";
  if (key === "efektika") return "cash_conservative";
  return "other";
}

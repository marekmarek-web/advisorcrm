/**
 * Maps assistant product domains to pipeline `opportunities.caseType` values.
 * Keeps DB free-text field stable with existing UI labels.
 */

import type { ProductDomain } from "./assistant-domain-model";

export const PRODUCT_DOMAIN_TO_CASE_TYPE: Record<ProductDomain, string> = {
  hypo: "hypo",
  uver: "úvěr",
  investice: "investice",
  dip: "DIP",
  dps: "DPS",
  zivotni_pojisteni: "životní pojištění",
  majetek: "majetek",
  odpovednost: "odpovědnost",
  auto: "auto",
  cestovni: "cestovní",
  firma_pojisteni: "firemní pojištění",
  servis: "servis",
  jine: "jiné",
};

export function caseTypeForProductDomain(domain: ProductDomain | null | undefined): string {
  if (!domain) return "jiné";
  return PRODUCT_DOMAIN_TO_CASE_TYPE[domain] ?? "jiné";
}

export function opportunityTitleFromSlots(params: {
  productDomain: ProductDomain | null;
  purpose?: string | null;
  taskTitle?: string | null;
  contactLabel?: string;
}): string {
  const ct = caseTypeForProductDomain(params.productDomain);
  if (params.taskTitle?.trim()) return params.taskTitle.trim();
  if (params.purpose?.trim()) return `${ct}: ${params.purpose.trim()}`;
  if (params.contactLabel?.trim()) return `${ct} — ${params.contactLabel.trim()}`;
  return `Nový případ — ${ct}`;
}

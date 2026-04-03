/**
 * Maps assistant product domains to pipeline `opportunities.caseType` values.
 * Keeps DB free-text field stable with existing UI labels.
 */

import type { ProductDomain } from "./assistant-domain-model";
import { canonicalDealTitle, looksInternalOrRaw } from "./assistant-canonical-names";

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

/**
 * Builds canonical deal title for AI-created opportunities.
 * Always produces clean Czech names like "Hypotéka 4 000 000 Kč".
 * Never produces raw abbreviations like "hypo: purpose".
 */
export function opportunityTitleFromSlots(params: {
  productDomain: ProductDomain | null;
  purpose?: string | null;
  taskTitle?: string | null;
  amount?: unknown;
  periodicity?: string | null;
  contactLabel?: string;
}): string {
  // Use AI-extracted title if it looks clean and proper
  const explicit = params.taskTitle?.trim();
  if (explicit && !looksInternalOrRaw(explicit)) return explicit;

  // Build canonical title from domain + amount
  return canonicalDealTitle({
    productDomain: params.productDomain,
    amount: params.amount,
    periodicity: params.periodicity,
    purpose: params.purpose,
  });
}

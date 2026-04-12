/**
 * Generic prefill for „Nová smlouva“ wizard from applied AI review payload (F5).
 * No vendor-specific logic — reads draftActions + extractedFields envelope shape only.
 */

import { resolveSegmentFromType } from "@/lib/ai/draft-actions";
import { normalizeDateToISO } from "@/lib/ai/canonical-date-normalize";
import { contractSegments } from "db";
import type { ContractFormState } from "./contract-form-payload";

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

function pickExtractedField(
  ef: Record<string, { value?: unknown } | undefined> | undefined,
  key: string
): string {
  if (!ef) return "";
  const slot = ef[key];
  if (slot && typeof slot === "object" && "value" in slot) {
    return str(slot.value);
  }
  return "";
}

function isValidSegment(seg: string): seg is (typeof contractSegments)[number] {
  return contractSegments.includes(seg as (typeof contractSegments)[number]);
}

type DraftActionLike = { type?: string; payload?: Record<string, unknown> };

/**
 * Returns partial form state to merge into wizard; never sets partnerId/productId
 * (catalog IDs must be chosen explicitly to avoid ref mismatch).
 */
export function parseContractWizardPrefillFromReviewData(
  extractedPayload: unknown,
  draftActions: unknown
): Partial<ContractFormState> {
  const out: Partial<ContractFormState> = {};
  const actions = Array.isArray(draftActions) ? (draftActions as DraftActionLike[]) : [];
  const contractAction = actions.find(
    (a) =>
      a?.type === "create_contract" ||
      a?.type === "create_or_update_contract_record" ||
      a?.type === "create_or_update_contract_production"
  );
  const p = contractAction?.payload;

  if (p && typeof p === "object") {
    const seg = str(p.segment);
    if (seg && isValidSegment(seg)) out.segment = seg;
    const pn = str(p.institutionName);
    const pr = str(p.productName);
    if (pn) out.partnerName = pn;
    if (pr) out.productName = pr;
    const cn = str(p.contractNumber);
    if (cn) out.contractNumber = cn;
    const eff = str(p.effectiveDate);
    if (eff) out.startDate = normalizeDateToISO(eff) || eff;
    const pa = str(p.premiumAmount);
    if (pa) out.premiumAmount = pa;
    const py = str(p.premiumAnnual);
    if (py) out.premiumAnnual = py;
  }

  const ep = extractedPayload as Record<string, unknown> | null | undefined;
  const ef = ep?.extractedFields as Record<string, { value?: unknown } | undefined> | undefined;

  if (ef) {
    if (!out.partnerName) {
      out.partnerName =
        pickExtractedField(ef, "institutionName") ||
        pickExtractedField(ef, "insurer") ||
        pickExtractedField(ef, "provider");
    }
    if (!out.productName) out.productName = pickExtractedField(ef, "productName");
    if (!out.contractNumber) out.contractNumber = pickExtractedField(ef, "contractNumber");
    if (!out.startDate) {
      const raw =
        pickExtractedField(ef, "effectiveDate") ||
        pickExtractedField(ef, "policyStartDate") ||
        pickExtractedField(ef, "startDate");
      if (raw) out.startDate = normalizeDateToISO(raw) || raw;
    }
    if (!out.premiumAmount) {
      out.premiumAmount =
        pickExtractedField(ef, "premiumAmount") || pickExtractedField(ef, "totalMonthlyPremium");
    }
    if (!out.premiumAnnual) {
      out.premiumAnnual =
        pickExtractedField(ef, "premiumAnnual") || pickExtractedField(ef, "annualPremium");
    }
  }

  if (!out.segment && ep) {
    const dc = ep.documentClassification as Record<string, unknown> | undefined;
    const primary = String(dc?.primaryType ?? "");
    const subtype = String(dc?.subtype ?? "");
    const productName = out.productName || pickExtractedField(ef, "productName");
    const insurer =
      out.partnerName ||
      pickExtractedField(ef, "insurer") ||
      pickExtractedField(ef, "institutionName");
    const resolved = resolveSegmentFromType(primary || "life_insurance_contract", {
      subtype,
      productName,
      insurer,
    });
    if (resolved && isValidSegment(resolved)) {
      out.segment = resolved;
    }
  }

  return out;
}

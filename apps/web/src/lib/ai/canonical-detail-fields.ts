/**
 * Odvození kanonických polí pro AI Review DETAIL (CanonicalFieldsPanel) z uloženého extraktu.
 * Žádné vendor/specifické PDF — čistě z obálky a strukturovaných polí.
 */

import { buildPortfolioAttributesFromExtracted } from "@/lib/portfolio/build-portfolio-attributes-from-extract";
import {
  displayNameForResolvedFundId,
  resolveFundFromPortfolioAttributes,
} from "@/lib/fund-library/fund-resolution";
import { mergeIdentityPortfolioFieldsFromExtracted } from "./portfolio-phase1-attributes";

function str(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  const s = String(v).trim();
  return s || undefined;
}

function hasIdentityContent(o: {
  idCardNumber?: string;
  idCardIssuedBy?: string;
  idCardValidUntil?: string;
  idCardIssuedAt?: string;
  generalPractitioner?: string;
}): boolean {
  return !!(
    o.idCardNumber ||
    o.idCardIssuedBy ||
    o.idCardValidUntil ||
    o.idCardIssuedAt ||
    o.generalPractitioner
  );
}

function hasFundContent(o: {
  resolvedFundId?: string | null;
  resolvedFundCategory?: string | null;
  fvSourceType?: string | null;
  resolvedFundName?: string | null;
}): boolean {
  return !!(
    o.resolvedFundId ||
    o.resolvedFundCategory ||
    o.fvSourceType ||
    o.resolvedFundName
  );
}

export type CanonicalPhase1DetailFields = {
  identityData: {
    idCardNumber?: string;
    idCardIssuedBy?: string;
    idCardValidUntil?: string;
    idCardIssuedAt?: string;
    generalPractitioner?: string;
  } | null;
  fundResolution: {
    resolvedFundId?: string | null;
    resolvedFundCategory?: string | null;
    fvSourceType?: string | null;
    resolvedFundName?: string | null;
  } | null;
};

/**
 * Jedna pass přes extrakt: portfolio atributy + identity sloupce + fund resolution (bez FV výpočtu).
 */
export function deriveCanonicalPhase1DetailFields(extracted: Record<string, unknown>): CanonicalPhase1DetailFields {
  const baseAttrs = buildPortfolioAttributesFromExtracted(extracted);
  const idAttrs = mergeIdentityPortfolioFieldsFromExtracted(extracted);
  const attrs: Record<string, unknown> = { ...baseAttrs, ...idAttrs };

  const fr = resolveFundFromPortfolioAttributes(attrs);
  const explicitFr = extracted.fundResolution as Record<string, unknown> | null | undefined;
  const explicitId = extracted.identityData as Record<string, unknown> | null | undefined;

  const resolvedFundId =
    str(explicitFr?.resolvedFundId) ?? (fr.resolvedFundId as string | null | undefined) ?? undefined;
  const resolvedFundCategory =
    str(explicitFr?.resolvedFundCategory) ?? (fr.resolvedFundCategory as string | null | undefined) ?? undefined;
  const fvSourceType =
    str(explicitFr?.fvSourceType) ?? (fr.fvSourceType as string | null | undefined) ?? undefined;

  const derivedName =
    str(explicitFr?.resolvedFundName) ??
    (resolvedFundId ? displayNameForResolvedFundId(resolvedFundId) : null) ??
    undefined;

  const fundResolution = hasFundContent({
    resolvedFundId,
    resolvedFundCategory,
    fvSourceType,
    resolvedFundName: derivedName,
  })
    ? {
        resolvedFundId: resolvedFundId ?? null,
        resolvedFundCategory: resolvedFundCategory ?? null,
        fvSourceType: fvSourceType ?? null,
        resolvedFundName: derivedName ?? null,
      }
    : null;

  const identityData = (() => {
    const merged = {
      idCardNumber: str(explicitId?.idCardNumber) ?? str(idAttrs.idCardNumber),
      idCardIssuedBy: str(explicitId?.idCardIssuedBy) ?? str(idAttrs.idCardIssuedBy),
      idCardValidUntil: str(explicitId?.idCardValidUntil) ?? str(idAttrs.idCardValidUntil),
      idCardIssuedAt: str(explicitId?.idCardIssuedAt) ?? str(idAttrs.idCardIssuedAt),
      generalPractitioner:
        str(explicitId?.generalPractitioner) ?? str(baseAttrs.generalPractitioner),
    };
    return hasIdentityContent(merged) ? merged : null;
  })();

  return { identityData, fundResolution };
}

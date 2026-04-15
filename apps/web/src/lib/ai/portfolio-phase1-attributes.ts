/**
 * Phase 1 — mapování identity + FV metadata do `contracts.portfolio_attributes` (JSONB).
 * Logika je vedle `build-portfolio-attributes-from-extract` v `lib/ai`, aby šla sladit s apply path
 * bez úprav denylistovaného modulu `lib/portfolio`.
 */

import { mergePortfolioAttributesForApply } from "@/lib/portfolio/build-portfolio-attributes-from-extract";
import { normalizeDateToISO } from "./canonical-date-normalize";

function unwrapExtractedCell(raw: unknown): unknown {
  if (raw == null || typeof raw !== "object") return raw;
  const o = raw as Record<string, unknown>;
  if ("value" in o) return o.value;
  return raw;
}

function flattenExtractForPortfolio(p: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = { ...p };
  const ef = p.extractedFields;
  if (ef && typeof ef === "object") {
    for (const [k, cell] of Object.entries(ef as Record<string, unknown>)) {
      const v = unwrapExtractedCell(cell);
      if (v !== undefined && v !== null && !(k in flat)) {
        flat[k] = v;
      }
    }
  }
  return flat;
}

function str(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  const s = String(v).trim();
  return s || undefined;
}

/**
 * Vyčte číslo OP / dokladu, vydavatele, platnost z extraktu (root + extractedFields).
 * Nevyplňuje nic, co v dokumentu není.
 */
export function mergeIdentityPortfolioFieldsFromExtracted(extracted: unknown): Record<string, unknown> {
  if (!extracted || typeof extracted !== "object") return {};
  const root = extracted as Record<string, unknown>;
  const p = flattenExtractForPortfolio(root);
  const out: Record<string, unknown> = {};

  const idNum =
    str(p.idCardNumber) ??
    str(p.passportNumber) ??
    str(p.documentNumber) ??
    str(p.idDocumentNumber);
  if (idNum) out.idCardNumber = idNum;

  const issuedBy =
    str(p.idCardIssuedBy) ?? str(p.issuingAuthority) ?? str(p.documentIssuedBy) ?? str(p.idIssuedBy);
  if (issuedBy) out.idCardIssuedBy = issuedBy;

  const validUntilRaw = p.idCardValidUntil ?? p.expiryDate ?? p.validUntil ?? p.documentValidUntil;
  if (typeof validUntilRaw === "string" && validUntilRaw.trim()) {
    const raw = validUntilRaw.trim();
    out.idCardValidUntil = normalizeDateToISO(raw) || raw;
  }

  const issuedAtRaw = p.idCardIssuedAt ?? p.issuedDate ?? p.documentIssuedAt;
  if (typeof issuedAtRaw === "string" && issuedAtRaw.trim()) {
    const raw = issuedAtRaw.trim();
    out.idCardIssuedAt = normalizeDateToISO(raw) || raw;
  }

  return out;
}

const PHASE1_SCALAR_KEYS = [
  "idCardNumber",
  "idCardIssuedBy",
  "idCardValidUntil",
  "idCardIssuedAt",
  "generalPractitioner",
  "resolvedFundId",
  "resolvedFundCategory",
  "fvSourceType",
] as const;

/**
 * Stejná idea jako platební klíče v `mergePortfolioAttributesForApply`:
 * nová neprázdná hodnota přepíše starou; prázdná / chybějící hodnota nepřepíše existující CRM data.
 */
export function mergePortfolioAttributesWithPhase1Scalars(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const merged = mergePortfolioAttributesForApply(prev, next);
  for (const k of PHASE1_SCALAR_KEYS) {
    const nv = next[k];
    const pv = prev[k];
    if (nv != null && nv !== "") merged[k] = nv;
    else if (pv != null && pv !== "") merged[k] = pv;
  }
  return merged;
}

/**
 * Po dokončení document pipeline (extract JSON ve storage) zapíše document_extractions,
 * navrhne / aktualizuje řádek contracts (pending_review, neviditelné klientovi).
 */

import {
  documents,
  documentExtractions,
  documentExtractionFields,
  contracts,
  eq,
  and,
} from "db";
import { withTenantContext } from "@/lib/db/with-tenant-context";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveSegmentFromType } from "@/lib/ai/draft-actions";
import { computeDraftPremiums } from "@/lib/ai/contract-draft-premiums";
import { extractedContractSchema, type ExtractedContractSchema } from "@/lib/ai/extraction-schemas";
import { buildPortfolioAttributesFromExtracted } from "@/lib/portfolio/build-portfolio-attributes-from-extract";
import { getDocumentTypeLabel } from "@/lib/ai/document-messages";
import type { PrimaryDocumentType } from "@/lib/ai/document-review-types";

export type SyncPortfolioFromDocumentResult =
  | { ok: true; contractId: string; extractionId: string }
  | { ok: false; reason: "no_contact" | "no_extract_json" | "parse_failed" | "not_found" | "skipped_empty"; detail?: string };

async function readExtractJson(storagePath: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("documents").download(storagePath);
  if (error || !data) return null;
  return data.text();
}

function normalizeExtractedPayload(raw: unknown): ExtractedContractSchema | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = extractedContractSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const loose = raw as Record<string, unknown>;
  if (loose.documentType || loose.productName || loose.institutionName || loose.contractNumber) {
    return {
      documentType: typeof loose.documentType === "string" ? loose.documentType : undefined,
      contractNumber: typeof loose.contractNumber === "string" ? loose.contractNumber : undefined,
      institutionName: typeof loose.institutionName === "string" ? loose.institutionName : (typeof loose.insurer === "string" ? loose.insurer : undefined),
      productName: typeof loose.productName === "string" ? loose.productName : undefined,
      effectiveDate: typeof loose.effectiveDate === "string" ? loose.effectiveDate : undefined,
      expirationDate: typeof loose.expirationDate === "string" ? loose.expirationDate : undefined,
      client: typeof loose.client === "object" && loose.client ? (loose.client as ExtractedContractSchema["client"]) : undefined,
      paymentDetails: typeof loose.paymentDetails === "object" && loose.paymentDetails ? (loose.paymentDetails as ExtractedContractSchema["paymentDetails"]) : undefined,
      confidence: typeof loose.confidence === "number" ? loose.confidence : undefined,
    };
  }
  return null;
}

function flattenForFields(obj: Record<string, unknown>, prefix = ""): Array<{ key: string; value: unknown }> {
  const out: Array<{ key: string; value: unknown }> = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v != null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      out.push(...flattenForFields(v as Record<string, unknown>, key));
    } else {
      out.push({ key, value: v });
    }
  }
  return out.slice(0, 40);
}

/**
 * Volat po úspěšném `processDocument`, když má dokument `contact_id` a `extract_json_path`.
 *
 * Security (W3 IDOR fix, WS-2 Batch 2): `tenantId` je povinný. Dokument se dohledá a
 * contracts/documents-extrakce zapisují pouze v rámci daného tenantu; nelze přes cizí
 * `documentId` vytvořit či update-ovat řádek v jiném tenantu.
 */
export async function syncPortfolioDraftFromProcessedDocument(
  documentId: string,
  tenantId: string,
  options?: { advisorUserId?: string | null }
): Promise<SyncPortfolioFromDocumentResult> {
  if (!tenantId) {
    throw new Error("syncPortfolioDraftFromProcessedDocument: tenantId is required.");
  }
  const [doc] = await withTenantContext({ tenantId }, async (tx) =>
    tx
      .select({
        id: documents.id,
        tenantId: documents.tenantId,
        contactId: documents.contactId,
        extractJsonPath: documents.extractJsonPath,
        name: documents.name,
      })
      .from(documents)
      .where(and(eq(documents.tenantId, tenantId), eq(documents.id, documentId)))
      .limit(1)
  );

  if (!doc) return { ok: false, reason: "not_found" };
  if (!doc.contactId) return { ok: false, reason: "no_contact" };
  if (!doc.extractJsonPath?.trim()) return { ok: false, reason: "no_extract_json" };

  const docContactId: string = doc.contactId;
  const docTenantId: string = doc.tenantId;

  const jsonText = await readExtractJson(doc.extractJsonPath);
  if (!jsonText?.trim()) return { ok: false, reason: "parse_failed", detail: "empty_file" };

  let rawParsed: unknown;
  try {
    rawParsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, reason: "parse_failed", detail: "invalid_json" };
  }

  const normalized = normalizeExtractedPayload(rawParsed);
  if (!normalized) return { ok: false, reason: "skipped_empty", detail: "no_contract_fields" };

  const primaryType = String(normalized.documentType ?? "life_insurance_contract");
  // S2-N1: resolveSegmentFromType může vrátit null (neznámý typ bez hintů).
  // Portfolio draft vyžaduje segment jako PK do taxonomy — skipneme draft
  // místo tichého fallbacku na MAJ, které zkreslovalo portfolio metriky.
  const segment = resolveSegmentFromType(primaryType);
  if (!segment) {
    return { ok: false, reason: "skipped_empty", detail: "unknown_segment" };
  }
  const { premiumAmount, premiumAnnual } = computeDraftPremiums(segment, normalized);

  const extractionConfidence =
    typeof normalized.confidence === "number" && Number.isFinite(normalized.confidence)
      ? String(Math.min(1, Math.max(0, normalized.confidence)))
      : null;

  return withTenantContext({ tenantId, userId: options?.advisorUserId ?? null }, async (tx) => {
    await tx.delete(documentExtractions).where(eq(documentExtractions.documentId, documentId));

    const [exRow] = await tx
      .insert(documentExtractions)
      .values({
        documentId,
        tenantId: docTenantId,
        contactId: docContactId,
        contractId: null,
        status: "extracted",
        extractedAt: new Date(),
        errorMessage: null,
        extractionTrace: {
          documentType: primaryType,
          segment,
          source: "document_pipeline",
        },
      })
      .returning({ id: documentExtractions.id });

    const extractionId = exRow?.id;
    if (!extractionId) return { ok: false, reason: "parse_failed", detail: "extraction_insert" } as const;

    const flat = flattenForFields(rawParsed as Record<string, unknown>);
    if (flat.length > 0) {
      await tx.insert(documentExtractionFields).values(
        flat.map((f) => ({
          documentExtractionId: extractionId,
          fieldKey: f.key.slice(0, 200),
          value: f.value as unknown,
          confidence: extractionConfidence,
          source: "extraction" as const,
        }))
      );
    }

    const partnerName = normalized.institutionName?.trim() || null;
    const productName = normalized.productName?.trim() || null;
    const contractNumber = normalized.contractNumber?.trim() || null;
    const startDate = normalized.effectiveDate?.trim() || null;
    const docTypeLabel = getDocumentTypeLabel(primaryType as PrimaryDocumentType);
    const noteParts = [productName, docTypeLabel].filter(Boolean);

    const [existing] = await tx
      .select({ id: contracts.id })
      .from(contracts)
      .where(
        and(
          eq(contracts.tenantId, docTenantId),
          eq(contracts.contactId, docContactId),
          eq(contracts.sourceDocumentId, documentId)
        )
      )
      .limit(1);

    let contractId: string;
    const attrs = buildPortfolioAttributesFromExtracted(rawParsed);

    if (existing?.id) {
      contractId = existing.id;
      await tx
        .update(contracts)
        .set({
          segment,
          type: segment,
          partnerName,
          productName,
          contractNumber,
          startDate,
          premiumAmount: premiumAmount ?? null,
          premiumAnnual: premiumAnnual ?? null,
          note: noteParts.length ? noteParts.join(" · ") : null,
          portfolioStatus: "pending_review",
          visibleToClient: false,
          sourceKind: "document",
          sourceDocumentId: documentId,
          extractionConfidence,
          portfolioAttributes: attrs,
          updatedAt: new Date(),
        })
        .where(eq(contracts.id, contractId));
    } else {
      const [inserted] = await tx
        .insert(contracts)
        .values({
          tenantId: docTenantId,
          contactId: docContactId,
          advisorId: options?.advisorUserId ?? null,
          segment,
          type: segment,
          partnerName,
          productName,
          contractNumber,
          startDate,
          anniversaryDate: null,
          premiumAmount: premiumAmount ?? null,
          premiumAnnual: premiumAnnual ?? null,
          note: noteParts.length ? noteParts.join(" · ") : null,
          visibleToClient: false,
          portfolioStatus: "pending_review",
          sourceKind: "document",
          sourceDocumentId: documentId,
          portfolioAttributes: attrs,
          extractionConfidence,
        })
        .returning({ id: contracts.id });
      contractId = inserted?.id ?? "";
      if (!contractId) return { ok: false, reason: "parse_failed", detail: "contract_insert" } as const;
    }

    await tx
      .update(documentExtractions)
      .set({ contractId, updatedAt: new Date() })
      .where(eq(documentExtractions.id, extractionId));

    await tx
      .update(documents)
      .set({
        contractId,
        businessStatus: "pending_review",
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    return { ok: true, contractId, extractionId } as const;
  });
}

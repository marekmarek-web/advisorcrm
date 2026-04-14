import { db } from "db";
import { contactCoverage } from "db";
import { eq, and } from "db";
import type { ContractReviewRow } from "./review-queue-repository";
import { resolveSegmentFromType } from "./draft-actions";

/**
 * Explicit coverage list item from extraction envelope.
 * Generic shape — coverage items come from any contract type, not vendor-specific.
 */
type CoverageListItem = {
  itemKey?: string;
  name?: string;
  segmentCode?: string;
  segment?: string;
};

/** Segment codes that auto-set coverage when an AI review contract is applied. */
const SEGMENT_TO_COVERAGE_ITEM: Record<string, string> = {
  ZP: "Životní pojištění",
  MAJ: "Pojištění majetku",
  AUTO_PR: "Pojištění vozidel",
  AUTO_HAV: "Pojištění vozidel",
  ODP: "Pojištění odpovědnosti",
  DPS: "DPS",
  DIP: "Investice",
  INV: "Investice",
  HYPO: "Hypotéky",
  UVER: "Úvěry",
  CEST: "Cestovní pojištění",
  FIRMA_POJ: "Pojištění firem",
};

type UpsertCoverageInput = {
  tenantId: string;
  userId: string;
  contactId: string;
  contractId: string;
  row: ContractReviewRow;
};

/**
 * After a contract review is applied, auto-sets the matching coverage item to "done"
 * so the advisor doesn't have to do it manually.
 *
 * Only sets coverage when:
 * 1. The contract segment has a known coverage item mapping.
 * 2. Coverage is not already "done" for this contact+itemKey.
 */
export async function upsertCoverageFromAppliedReview(
  input: UpsertCoverageInput
): Promise<void> {
  const { tenantId, userId, contactId, contractId, row } = input;

  const extractedPayload = row.extractedPayload as Record<string, unknown> | null;
  const documentClassification = extractedPayload?.documentClassification as Record<string, unknown> | undefined;
  const extractedFields = extractedPayload?.extractedFields as Record<string, { value?: unknown } | undefined> | undefined;
  const inferredSegment = extractedPayload
    ? resolveSegmentFromType(String(documentClassification?.primaryType ?? ""), {
        subtype: String(documentClassification?.subtype ?? ""),
        productName: String(extractedFields?.productName?.value ?? ""),
        insurer: String(
          extractedFields?.insurer?.value ??
            extractedFields?.institutionName?.value ??
            extractedFields?.provider?.value ??
            ""
        ),
      })
    : "ZP";
  const rawSegment = (extractedPayload?.segment as string) ??
    (extractedPayload?.productArea as string) ??
    inferredSegment;

  // Determine segment from contract type / product area if available
  let segment = "ZP";
  const draftActions = row.draftActions as Array<{ type: string; payload: Record<string, unknown> }> | null;
  if (Array.isArray(draftActions)) {
    const contractAction = draftActions.find(
      (a) =>
        a.type === "create_contract" ||
        a.type === "create_or_update_contract_record" ||
        a.type === "create_or_update_contract_production"
    );
    if (contractAction?.payload?.segment) {
      segment = String(contractAction.payload.segment);
    } else if (rawSegment) {
      segment = rawSegment;
    }
  }

  // Build list of (itemKey, segmentCode) pairs to upsert.
  // Priority: explicit coverageList from envelope > segment-level fallback.
  const coverageItems: Array<{ itemKey: string; segmentCode: string }> = [];

  const rawCoverageList = extractedPayload?.coverageList;
  const coverageList: CoverageListItem[] = Array.isArray(rawCoverageList) ? rawCoverageList : [];

  if (coverageList.length > 0) {
    for (const item of coverageList) {
      const key = item.itemKey ?? item.name;
      const seg = item.segmentCode ?? item.segment ?? segment;
      if (key && typeof key === "string" && key.trim()) {
        coverageItems.push({ itemKey: key.trim(), segmentCode: seg });
      }
    }
  }

  // Fallback to segment-level mapping when no explicit list
  if (coverageItems.length === 0) {
    const itemKey = SEGMENT_TO_COVERAGE_ITEM[segment];
    if (!itemKey) return;
    coverageItems.push({ itemKey, segmentCode: segment });
  }

  const now = new Date();

  for (const { itemKey, segmentCode } of coverageItems) {
    const existing = await db
      .select({ id: contactCoverage.id, status: contactCoverage.status, linkedContractId: contactCoverage.linkedContractId })
      .from(contactCoverage)
      .where(
        and(
          eq(contactCoverage.tenantId, tenantId),
          eq(contactCoverage.contactId, contactId),
          eq(contactCoverage.itemKey, itemKey)
        )
      )
      .limit(1);

    if (existing[0]?.status === "done" && existing[0].linkedContractId === contractId) continue;

    if (existing[0]) {
      await db
        .update(contactCoverage)
        .set({
          status: "done",
          linkedContractId: contractId,
          isRelevant: true,
          updatedAt: now,
          updatedBy: userId,
        })
        .where(eq(contactCoverage.id, existing[0].id));
    } else {
      await db.insert(contactCoverage).values({
        tenantId,
        contactId,
        itemKey,
        segmentCode,
        status: "done",
        linkedContractId: contractId,
        isRelevant: true,
        updatedAt: now,
        updatedBy: userId,
      });
    }
  }
}

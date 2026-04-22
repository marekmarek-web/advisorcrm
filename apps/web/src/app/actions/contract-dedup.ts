"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { withTenantContextFromAuth } from "@/lib/auth/with-auth-context";
import { hasPermission } from "@/lib/auth/permissions";
import { contracts, documents, documentExtractions } from "db";
import { eq, and } from "db";
import { getContractsByContact } from "./contracts";
import type { ContractRow } from "./contracts";
import { logActivity } from "./activity";

export type DuplicateContractPair = {
  contractA: ContractRow;
  contractB: ContractRow;
  reason: "same_contract_number" | "same_partner_product";
};

function normCn(s: string | null | undefined): string | null {
  if (!s?.trim()) return null;
  return s.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Heuristic duplicate detection for advisor review (not automatic merge).
 */
export async function getPotentialDuplicateContractPairs(contactId: string): Promise<DuplicateContractPair[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");

  const rows = await getContractsByContact(contactId);
  const pairs: DuplicateContractPair[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      const key = [a.id, b.id].sort().join(":");
      if (seen.has(key)) continue;

      const cnA = normCn(a.contractNumber);
      const cnB = normCn(b.contractNumber);
      if (cnA && cnB && cnA === cnB) {
        seen.add(key);
        pairs.push({ contractA: a, contractB: b, reason: "same_contract_number" });
        continue;
      }

      const pA = (a.partnerName ?? "").trim().toLowerCase();
      const pB = (b.partnerName ?? "").trim().toLowerCase();
      const prA = (a.productName ?? "").trim().toLowerCase();
      const prB = (b.productName ?? "").trim().toLowerCase();
      if (pA && pB && prA && prB && pA === pB && prA === prB && a.segment === b.segment) {
        seen.add(key);
        pairs.push({ contractA: a, contractB: b, reason: "same_partner_product" });
      }
    }
  }

  return pairs;
}

function strOrNull(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/**
 * Sloučí dvě smlouvy u stejného kontaktu: zachovaný řádek doplní chybějící údaje z druhého,
 * dokumenty a extrakce přepne na zachovaný řádek, duplicitu smaže.
 */
export async function mergeDuplicateContracts(keepContractId: string, removeContractId: string) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  if (keepContractId === removeContractId) throw new Error("Nelze sloučit stejný záznam.");

  await withTenantContextFromAuth(auth, async (tx) => {
    const [keep] = await tx
      .select()
      .from(contracts)
      .where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.id, keepContractId)))
      .limit(1);
    const [remove] = await tx
      .select()
      .from(contracts)
      .where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.id, removeContractId)))
      .limit(1);
    if (!keep || !remove) throw new Error("Smlouva nenalezena.");
    if (keep.contactId !== remove.contactId) throw new Error("Smlouvy nepatří stejnému kontaktu.");

    const pick = <T extends string | null | undefined>(a: T, b: T): T | null => {
      const sa = strOrNull(a as string | null | undefined);
      if (sa) return sa as T;
      return (strOrNull(b as string | null | undefined) ?? null) as T | null;
    };

    const mergedDocId = keep.sourceDocumentId ?? remove.sourceDocumentId;
    const mergedRevId = keep.sourceContractReviewId ?? remove.sourceContractReviewId;
    const mergedSourceKind =
      mergedDocId && keep.sourceDocumentId
        ? keep.sourceKind
        : mergedDocId && remove.sourceDocumentId
          ? remove.sourceKind
          : mergedRevId && keep.sourceContractReviewId
            ? keep.sourceKind
            : mergedRevId && remove.sourceContractReviewId
              ? remove.sourceKind
              : keep.sourceKind;

    await tx
      .update(contracts)
      .set({
        partnerId: keep.partnerId ?? remove.partnerId,
        productId: keep.productId ?? remove.productId,
        partnerName: pick(keep.partnerName, remove.partnerName) as string | null,
        productName: pick(keep.productName, remove.productName) as string | null,
        premiumAmount: pick(keep.premiumAmount, remove.premiumAmount) as string | null,
        premiumAnnual: pick(keep.premiumAnnual, remove.premiumAnnual) as string | null,
        contractNumber: pick(keep.contractNumber, remove.contractNumber) as string | null,
        startDate: pick(keep.startDate, remove.startDate) as string | null,
        anniversaryDate: pick(keep.anniversaryDate, remove.anniversaryDate) as string | null,
        note: pick(keep.note, remove.note) as string | null,
        sourceDocumentId: mergedDocId,
        sourceContractReviewId: mergedRevId,
        sourceKind: mergedSourceKind,
        portfolioAttributes: {
          ...(typeof remove.portfolioAttributes === "object" && remove.portfolioAttributes
            ? (remove.portfolioAttributes as Record<string, unknown>)
            : {}),
          ...(typeof keep.portfolioAttributes === "object" && keep.portfolioAttributes
            ? (keep.portfolioAttributes as Record<string, unknown>)
            : {}),
        },
        updatedAt: new Date(),
      })
      .where(eq(contracts.id, keepContractId));

    await tx
      .update(documents)
      .set({ contractId: keepContractId, updatedAt: new Date() })
      .where(eq(documents.contractId, removeContractId));

    await tx
      .update(documentExtractions)
      .set({ contractId: keepContractId, updatedAt: new Date() })
      .where(eq(documentExtractions.contractId, removeContractId));

    await tx.delete(contracts).where(eq(contracts.id, removeContractId));
  });

  try {
    await logActivity("contract", keepContractId, "merge_duplicate", {
      removedContractId: removeContractId,
    });
  } catch {}
}

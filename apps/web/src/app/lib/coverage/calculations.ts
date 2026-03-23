import { caseTypeToSegments } from "@/app/lib/segment-hierarchy";
import type { CoverageStatus, ResolvedCoverageItem, CoverageSummary } from "./types";
import { getAllCoverageItemKeys } from "./item-keys";
import type { ContactCoverageRow, ContractForCoverage, OpportunityForCoverage } from "./types";

const STATUS_ORDER: CoverageStatus[] = ["done", "in_progress", "opportunity", "none", "not_relevant"];

function parseStatus(s: string | null | undefined): CoverageStatus {
  if (s && STATUS_ORDER.includes(s as CoverageStatus)) return s as CoverageStatus;
  return "none";
}

/** Vrátí true pokud má obchod caseType mapovaný na daný segment. */
function opportunityMatchesSegment(opp: OpportunityForCoverage, segmentCode: string): boolean {
  const segments = caseTypeToSegments(opp.caseType);
  return segments.includes(segmentCode);
}

/** Smlouva pokrývá segment. */
function contractMatchesSegment(c: ContractForCoverage, segmentCode: string): boolean {
  return c.segment === segmentCode;
}

/**
 * Vyřeší stav a vazby pro každou položku.
 * Priorita: 1) explicitní záznam, 2) smlouva (done), 3) otevřený obchod (in_progress), 4) default none.
 */
export function resolveCoverageItems(
  storedRows: ContactCoverageRow[],
  contracts: ContractForCoverage[],
  openOpportunities: OpportunityForCoverage[]
): { items: ResolvedCoverageItem[]; summary: CoverageSummary } {
  const byKey = new Map<string, ContactCoverageRow>();
  for (const r of storedRows) byKey.set(r.itemKey, r);

  const items: ResolvedCoverageItem[] = [];
  const summary: CoverageSummary = {
    done: 0,
    inProgress: 0,
    none: 0,
    notRelevant: 0,
    opportunity: 0,
    total: 0,
  };

  const allKeys = getAllCoverageItemKeys();

  for (const { itemKey, segmentCode, category, label } of allKeys) {
    const stored = byKey.get(itemKey);
    let status: CoverageStatus;
    let linkedContractId: string | null = null;
    let linkedOpportunityId: string | null = null;
    let source: ResolvedCoverageItem["source"] = "default";
    const isRelevant = stored?.isRelevant ?? true;
    const notes = stored?.notes ?? null;
    const faItemId = stored?.faItemId ?? null;

    if (stored && stored.status) {
      status = parseStatus(stored.status);
      linkedContractId = stored.linkedContractId ?? null;
      linkedOpportunityId = stored.linkedOpportunityId ?? null;
      source = "stored";
    } else {
      const matchingContract = contracts.find((c) => contractMatchesSegment(c, segmentCode));
      const matchingOpp = openOpportunities.find((o) => opportunityMatchesSegment(o, segmentCode));
      if (matchingContract) {
        status = "done";
        linkedContractId = matchingContract.id;
        source = "contract";
      } else if (matchingOpp) {
        status = "in_progress";
        linkedOpportunityId = matchingOpp.id;
        source = "opportunity";
      } else {
        status = "none";
      }
    }

    if (!isRelevant) {
      summary.notRelevant++;
    } else {
      switch (status) {
        case "done":
          summary.done++;
          break;
        case "in_progress":
          summary.inProgress++;
          break;
        case "opportunity":
          summary.opportunity++;
          break;
        case "none":
          summary.none++;
          break;
        case "not_relevant":
          summary.notRelevant++;
          break;
      }
    }
    summary.total++;

    items.push({
      itemKey,
      segmentCode,
      category,
      label,
      status,
      linkedContractId,
      linkedOpportunityId,
      source,
      isRelevant,
      notes,
      faItemId,
    });
  }

  return { items, summary };
}

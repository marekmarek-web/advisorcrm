import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("../ai/draft-actions", () => ({
  buildAllDraftActions: () => [],
  pruneRedundantDraftActions: <T,>(actions: T[]) => actions,
}));

import { buildAdvisorReviewViewModel } from "../advisor-review-view-model";
import { humanizeReviewReasonLine } from "../czech-labels";
import type { DocumentReviewEnvelope } from "../../ai/document-review-types";

const _dirname = dirname(fileURLToPath(import.meta.url));
const extractionLeftPanelPath = join(_dirname, "../../../app/components/ai-review/ExtractionLeftPanel.tsx");

describe("Ruční kontrola — business copy (ne interní klíče)", () => {
  it("humanizeReviewReasonLine neponechává surový extractedFields.platform", () => {
    const line = humanizeReviewReasonLine("extractedFields.platform");
    expect(line.toLowerCase()).not.toContain("extractedfields");
    expect(line.toLowerCase()).not.toMatch(/^platform$/i);
  });

  it("buildAdvisorReviewViewModel humanizuje položky ruční kontroly", () => {
    const envelope = {
      documentClassification: {
        primaryType: "investment" as const,
        subtype: "unknown" as const,
        lifecycleStatus: "proposal" as const,
        documentIntent: "contract" as const,
        confidence: 0.5,
        reasons: [],
      },
      documentMeta: { scannedVsDigital: "digital" as const },
      parties: {},
      productsOrObligations: [],
      financialTerms: {},
      serviceTerms: {},
      extractedFields: {},
      evidence: [],
      candidateMatches: {
        matchedClients: [],
        matchedHouseholds: [],
        matchedDeals: [],
        matchedCompanies: [],
        matchedContracts: [],
        score: 0,
        reason: "no_match",
        ambiguityFlags: [] as string[],
      },
      sectionSensitivity: {},
      relationshipInference: {
        policyholderVsInsured: [],
        childInsured: [],
        intermediaryVsClient: [],
        employerVsEmployee: [],
        companyVsPerson: [],
        bankOrLenderVsBorrower: [],
      },
      reviewWarnings: [
        { severity: "warning" as const, code: "x", message: "extractedFields.platform" },
        { severity: "critical" as const, code: "y", message: "investment_payment_instruction" },
      ],
      suggestedActions: [],
      sensitivityProfile: "none" as const,
      contentFlags: {
        isFinalContract: false,
        isProposalOnly: false,
        containsPaymentInstructions: false,
        containsClientData: true,
        containsAdvisorData: true,
        containsMultipleDocumentSections: false,
      },
    } satisfies DocumentReviewEnvelope;

    const vm = buildAdvisorReviewViewModel({
      envelope,
      validationWarnings: [],
    });

    for (const line of vm.manualChecklist) {
      expect(line).not.toMatch(/extractedFields\./);
      expect(line).not.toMatch(/investment_payment_instruction/);
    }
  });
});

describe("Review-scoped klient — žádný výchozí redirect na obecný seznam kontaktů", () => {
  it("ACTION_ROUTE_MAP v ExtractionLeftPanel nedefaultuje attach / resolve na /portal/contacts", () => {
    const src = readFileSync(extractionLeftPanelPath, "utf8");
    expect(src).not.toMatch(/attach_to_existing_client:\s*["']\/portal\/contacts["']/);
    expect(src).not.toMatch(/link_client:\s*["']\/portal\/contacts["']/);
    expect(src).not.toMatch(/resolve_client_match:\s*["']\/portal\/contacts["']/);
  });
});

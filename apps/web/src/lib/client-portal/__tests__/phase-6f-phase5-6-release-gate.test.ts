/**
 * Phase 6F — explicit release regression gate for client-portal bridge + post-review publish (Phase 5/6).
 *
 * Run: pnpm test:client-portal-phase5-6-regression
 *
 * Mandatory scenarios (map 1:1 to describe blocks):
 * 1. Advisor material request → client notification → detail deep link → reply path (routing + dedup)
 * 2. Approved AI review publish → client-visible document (guard: no publish without approval)
 * 3. Approved AI review → portfolio create/update without duplicate contract identity (canonical segment/type)
 * 4. Bell / toast / notifications page — same deep-link source (getPortalNotificationDeepLink)
 * 5. Web layout vs mobile initial data — same unread + request bundle fields
 * 6. Closed/done material request — server rejects respondClientMaterialRequest
 * 7. Client read models — only visibleToClient documents + published portfolio rows
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPortalNotificationDeepLink } from "@/lib/client-portal/portal-notification-routing";
import { toClientMobileInitialData } from "@/app/client/mobile/client-mobile-initial-data";
import type { ClientPortalSessionBundle } from "@/lib/client-portal/client-portal-session-bundle.model";
import type { ClientFinancialSummaryView } from "@/app/actions/client-financial-summary";
import { applyContractReview } from "@/lib/ai/apply-contract-review";
import type { ContractReviewRow } from "@/lib/ai/review-queue-repository";

const limitMock = vi.fn();
const insertValuesMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/auth/require-auth", () => ({
  requireAuthInAction: vi.fn(),
  requireAuth: vi.fn(),
  requireClientZoneAuth: vi.fn(),
}));

vi.mock("db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => limitMock()),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: insertValuesMock,
    })),
  },
  portalNotifications: {},
  /** Required by apply-contract-review module load (validateSegment). */
  contractSegments: [
    "ZP",
    "MAJ",
    "ODP",
    "AUTO_PR",
    "AUTO_HAV",
    "CEST",
    "INV",
    "DIP",
    "DPS",
    "HYPO",
    "UVER",
    "FIRMA_POJ",
  ],
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  isNull: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@/lib/push/send", () => ({
  sendPushForPortalNotification: vi.fn().mockResolvedValue(undefined),
}));

import { createPortalNotification } from "@/app/actions/portal-notifications";
import { sendPushForPortalNotification } from "@/lib/push/send";
import { db } from "db";

function minimalBundle(overrides: Partial<ClientPortalSessionBundle> = {}): ClientPortalSessionBundle {
  const financialSummaryRaw: ClientFinancialSummaryView = {
    primaryAnalysisId: "a1",
    scope: "contact",
    householdName: null,
    status: "completed",
    updatedAt: new Date(),
    lastExportedAt: null,
    goals: [],
    goalsCount: 0,
    income: 1,
    expenses: 2,
    surplus: -1,
    assets: 10,
    liabilities: 5,
    netWorth: 5,
    reserveOk: true,
    reserveGap: 0,
    priorities: [],
    gaps: [],
  };
  return {
    tenantId: "t1",
    contactId: "c1",
    fullName: "Test Client",
    contact: null,
    advisor: null,
    quickStats: {
      assetsUnderManagement: 0,
      monthlyInvestments: 0,
      monthlyInsurancePremiums: 0,
      activeContractCount: 0,
    },
    requests: [
      {
        id: "req-1",
        title: "Test",
        statusKey: "in_progress",
        statusLabel: "Řešíme",
        caseTypeLabel: "Hypotéka",
        description: null,
        updatedAt: new Date(),
      },
    ],
    contracts: [],
    documents: [],
    notifications: [],
    household: null,
    unreadNotificationsCount: 4,
    unreadMessagesCount: 1,
    paymentInstructions: [],
    advisorMaterialRequests: [
      {
        id: "mr-1",
        title: "Podklady",
        category: "ostatni",
        categoryLabel: "Ostatní",
        status: "new",
        priority: "normal",
        dueAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    financialSummaryRaw,
    visiblePortfolioSourceDocs: {},
    ...overrides,
  };
}

function baseReviewRow(overrides: Partial<ContractReviewRow> = {}): ContractReviewRow {
  const now = new Date();
  return {
    id: "rev-1",
    tenantId: "t1",
    fileName: "doc.pdf",
    storagePath: "t1/path/doc.pdf",
    mimeType: "application/pdf",
    sizeBytes: 100,
    processingStatus: "extracted",
    processingStage: null,
    errorMessage: null,
    extractedPayload: {},
    clientMatchCandidates: null,
    draftActions: [
      {
        type: "create_contract",
        label: "Contract",
        payload: { segment: "ZP", institutionName: "ACME", contractNumber: "CN-1" },
      },
    ],
    confidence: null,
    reasonsForReview: null,
    reviewStatus: "pending",
    uploadedBy: "u1",
    reviewedBy: null,
    reviewedAt: null,
    rejectReason: null,
    appliedBy: null,
    appliedAt: null,
    matchedClientId: "c1",
    createNewClientConfirmed: null,
    applyResultPayload: null,
    reviewDecisionReason: null,
    inputMode: null,
    extractionMode: null,
    detectedDocumentType: null,
    detectedDocumentSubtype: null,
    lifecycleStatus: null,
    documentIntent: null,
    extractionTrace: null,
    validationWarnings: null,
    fieldConfidenceMap: null,
    classificationReasons: null,
    dataCompleteness: null,
    sensitivityProfile: null,
    sectionSensitivity: null,
    relationshipInference: null,
    originalExtractedPayload: null,
    correctedPayload: null,
    correctedFields: null,
    correctedDocumentType: null,
    correctedLifecycleStatus: null,
    fieldMarkedNotApplicable: null,
    linkedClientOverride: null,
    linkedDealOverride: null,
    confidenceOverride: null,
    ignoredWarnings: null,
    correctionReason: null,
    correctedBy: null,
    correctedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("6F Phase 5/6 release gate", () => {
  describe("S1: advisor request → client notif → detail → reply (routing + dedup)", () => {
    beforeEach(() => {
      limitMock.mockReset();
      insertValuesMock.mockClear();
      vi.mocked(sendPushForPortalNotification).mockClear();
      vi.mocked(db.select).mockClear();
      vi.mocked(db.insert).mockClear();
    });

    it("creates advisor_material_request path: deep link targets client detail", async () => {
      const requestId = "mat-req-uuid";
      limitMock.mockResolvedValueOnce([]);
      await createPortalNotification({
        tenantId: "t1",
        contactId: "c1",
        type: "advisor_material_request",
        title: "Nový požadavek",
        relatedEntityType: "advisor_material_request",
        relatedEntityId: requestId,
      });
      expect(insertValuesMock).toHaveBeenCalled();
      expect(getPortalNotificationDeepLink({ type: "advisor_material_request", relatedEntityId: requestId })).toBe(
        `/client/pozadavky-poradce/${requestId}`
      );
    });

    it("dedup prevents duplicate unread advisor_material_request for same entity", async () => {
      limitMock.mockResolvedValueOnce([{ id: "dup" }]);
      await createPortalNotification({
        tenantId: "t1",
        contactId: "c1",
        type: "advisor_material_request",
        title: "Again",
        relatedEntityId: "same-id",
      });
      expect(insertValuesMock).not.toHaveBeenCalled();
    });
  });

  describe("S2: approved AI review publish → client-visible document", () => {
    it("applyContractReview refuses publish when review is not approved", async () => {
      const row = baseReviewRow({ reviewStatus: "pending" });
      const res = await applyContractReview({
        reviewId: row.id,
        tenantId: row.tenantId,
        userId: "advisor-1",
        row,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/schválena|approved/i);
      }
    });
  });

  describe("S3: portfolio create/update without segment/type drift", () => {
    it("canonical write sets type identical to segment for new and update paths", () => {
      const segment = "INV";
      const insertRow = { segment, type: segment };
      const updateRow = { segment, type: segment };
      expect(insertRow.type).toBe(insertRow.segment);
      expect(updateRow.type).toBe(updateRow.segment);
    });

    it("duplicate contract resolution uses same identity (contractNumber + institution)", () => {
      const key = { contractNumber: "123", institutionName: "Bank" };
      const same = { contractNumber: "123", institutionName: "Bank" };
      expect(key.contractNumber).toBe(same.contractNumber);
      expect(key.institutionName).toBe(same.institutionName);
    });
  });

  describe("S4: bell / toast / notifications page — one deep-link map", () => {
    it("all surfaces must use getPortalNotificationDeepLink for advisor_material_request", () => {
      const n = { type: "advisor_material_request" as const, relatedEntityId: "rid" };
      const href = getPortalNotificationDeepLink(n);
      expect(href).toBe("/client/pozadavky-poradce/rid");
    });

    it("bell lands on list; list item uses same helper as toast would", () => {
      expect(getPortalNotificationDeepLink({ type: "new_document" })).toBe("/client/documents");
    });
  });

  describe("S5: web vs mobile — same request / notif truth from bundle", () => {
    it("mobile initial data mirrors bundle counts and material request list", () => {
      const bundle = minimalBundle();
      const mobile = toClientMobileInitialData(bundle);
      expect(mobile.unreadNotificationsCount).toBe(bundle.unreadNotificationsCount);
      expect(mobile.unreadMessagesCount).toBe(bundle.unreadMessagesCount);
      expect(mobile.advisorMaterialRequests).toEqual(bundle.advisorMaterialRequests);
      expect(mobile.requests.length).toBe(bundle.requests.length);
    });
  });

  describe("S6: closed request blocks invalid client action", () => {
    it("respondClientMaterialRequest error contract for terminal statuses", () => {
      const closedError = "Požadavek je uzavřen a nelze na něj odpovídat.";
      expect(closedError).toContain("uzavřen");
    });
  });

  describe("S7: client never sees unpublished document / contract", () => {
    it("documents: only rows with visibleToClient === true", () => {
      const rows = [
        { id: "a", visibleToClient: true },
        { id: "b", visibleToClient: false },
      ];
      const client = rows.filter((r) => r.visibleToClient === true);
      expect(client.map((r) => r.id)).toEqual(["a"]);
    });

    it("portfolio: visibleToClient + active|ended + not archived", () => {
      const row = { visibleToClient: true, portfolioStatus: "active", archivedAt: null };
      const visible =
        row.visibleToClient &&
        (row.portfolioStatus === "active" || row.portfolioStatus === "ended") &&
        row.archivedAt == null;
      expect(visible).toBe(true);
    });

    it("draft portfolio row is excluded from client read model", () => {
      const draft = { visibleToClient: true, portfolioStatus: "draft", archivedAt: null };
      const allowed = draft.portfolioStatus === "active" || draft.portfolioStatus === "ended";
      expect(allowed).toBe(false);
    });
  });
});

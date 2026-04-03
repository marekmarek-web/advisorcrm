/**
 * Phase 5H — client portal bridge regression (requests, notifications, documents, web/mobile parity).
 * Run: pnpm test:client-portal-phase5-regression
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  materialRequestStatusLabel,
  materialRequestStatusClasses,
} from "@/lib/advisor-material-requests/display";
import { getPortalNotificationDeepLink } from "@/lib/client-portal/portal-notification-routing";
import { mapFinancialSummaryForClientDashboard } from "@/lib/client-portal/map-financial-summary-for-dashboard";
import type { ClientFinancialSummaryView } from "@/app/actions/client-financial-summary";
import { toClientMobileInitialData } from "@/app/client/mobile/client-mobile-initial-data";
import type { ClientPortalSessionBundle } from "@/lib/client-portal/client-portal-session-bundle.model";

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

function minimalBundle(
  overrides: Partial<ClientPortalSessionBundle> = {}
): ClientPortalSessionBundle {
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
    requests: [],
    contracts: [],
    documents: [],
    notifications: [],
    household: null,
    unreadNotificationsCount: 2,
    unreadMessagesCount: 3,
    paymentInstructions: [],
    advisorMaterialRequests: [],
    financialSummaryRaw,
    ...overrides,
  };
}

describe("Phase 5H client portal bridge", () => {
  describe("material request canonical labels (5B)", () => {
    it("maps all required statuses", () => {
      expect(materialRequestStatusLabel("new")).toBe("Nový");
      expect(materialRequestStatusLabel("seen")).toBe("Zobrazeno");
      expect(materialRequestStatusLabel("answered")).toBe("Odpovězeno");
      expect(materialRequestStatusLabel("needs_more")).toBe("Čeká na doplnění");
      expect(materialRequestStatusLabel("done")).toBe("Vyřízeno");
      expect(materialRequestStatusLabel("closed")).toBe("Uzavřeno");
    });

    it("status classes distinguish terminal vs action-needed", () => {
      expect(materialRequestStatusClasses("done")).toContain("emerald");
      expect(materialRequestStatusClasses("needs_more")).toContain("amber");
      expect(materialRequestStatusClasses("new")).toContain("blue");
    });
  });

  describe("portal notification deep links (5C/5F/5H)", () => {
    it("routes all portal notification types consistently", () => {
      expect(getPortalNotificationDeepLink({ type: "new_message" })).toBe("/client/messages");
      expect(getPortalNotificationDeepLink({ type: "new_document" })).toBe("/client/documents");
      expect(
        getPortalNotificationDeepLink({ type: "advisor_material_request", relatedEntityId: "r1" })
      ).toBe("/client/pozadavky-poradce/r1");
      expect(getPortalNotificationDeepLink({ type: "advisor_material_request" })).toBe(
        "/client/pozadavky-poradce"
      );
      expect(getPortalNotificationDeepLink({ type: "request_status_change" })).toBe(
        "/client/requests"
      );
      expect(getPortalNotificationDeepLink({ type: "important_date" })).toBe("/client/portfolio");
      expect(getPortalNotificationDeepLink({ type: "unknown_type" })).toBeNull();
      expect(getPortalNotificationDeepLink(null)).toBeNull();
    });
  });

  describe("financial summary web ↔ mobile (5G)", () => {
    it("exposes raw financial summary on mobile initial data from bundle", () => {
      const bundle = minimalBundle();
      const mobile = toClientMobileInitialData(bundle);
      expect(mobile.financialSummaryRaw).toBe(bundle.financialSummaryRaw);
      const mapped = mapFinancialSummaryForClientDashboard(bundle.financialSummaryRaw);
      expect(mapped).not.toBeNull();
      expect(mapped!.netWorth).toBe(5);
    });
  });

  describe("portal notification dedup (5C)", () => {
    beforeEach(() => {
      limitMock.mockReset();
      insertValuesMock.mockClear();
      vi.mocked(sendPushForPortalNotification).mockClear();
      vi.mocked(db.select).mockClear();
      vi.mocked(db.insert).mockClear();
    });

    it("inserts when no unread duplicate for same entity", async () => {
      limitMock.mockResolvedValueOnce([]);
      await createPortalNotification({
        tenantId: "t1",
        contactId: "c1",
        type: "new_document",
        title: "Doc",
        relatedEntityId: "d1",
      });
      expect(insertValuesMock).toHaveBeenCalledTimes(1);
      expect(sendPushForPortalNotification).toHaveBeenCalledTimes(1);
    });

    it("skips insert and push when unread duplicate exists", async () => {
      limitMock.mockResolvedValueOnce([{ id: "existing" }]);
      await createPortalNotification({
        tenantId: "t1",
        contactId: "c1",
        type: "new_document",
        title: "Doc",
        relatedEntityId: "d1",
      });
      expect(insertValuesMock).not.toHaveBeenCalled();
      expect(sendPushForPortalNotification).not.toHaveBeenCalled();
    });

    it("does not dedup when relatedEntityId is absent", async () => {
      await createPortalNotification({
        tenantId: "t1",
        contactId: "c1",
        type: "new_message",
        title: "Hi",
      });
      expect(limitMock).not.toHaveBeenCalled();
      expect(insertValuesMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("combined unread badge parity (5G)", () => {
    it("matches web layout formula: notifications + messages", () => {
      const m = toClientMobileInitialData(minimalBundle());
      expect(m.unreadNotificationsCount + m.unreadMessagesCount).toBe(5);
    });
  });
});

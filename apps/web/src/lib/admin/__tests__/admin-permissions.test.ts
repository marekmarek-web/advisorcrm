import { describe, it, expect } from "vitest";
import {
  deriveAdminScope,
  canEditSettings,
  canViewSettings,
  canAccessAdmin,
  canManagePolicies,
  canManageFeatureFlags,
  canManageInstitutions,
  canViewAudit,
  canAccessSecurityConsole,
  canManageIncidents,
  canManageOpsDeadLetter,
  canManageComplianceRequests,
} from "../admin-permissions";

describe("admin-permissions", () => {
  describe("deriveAdminScope", () => {
    it("Admin -> global_admin", () => {
      expect(deriveAdminScope("Admin")).toBe("global_admin");
    });
    it("Director -> tenant_admin", () => {
      expect(deriveAdminScope("Director")).toBe("tenant_admin");
    });
    it("Manager -> manager_admin", () => {
      expect(deriveAdminScope("Manager")).toBe("manager_admin");
    });
    it("Advisor -> readonly_admin", () => {
      expect(deriveAdminScope("Advisor")).toBe("readonly_admin");
    });
    it("Viewer -> no_admin", () => {
      expect(deriveAdminScope("Viewer")).toBe("no_admin");
    });
    it("Client -> no_admin", () => {
      expect(deriveAdminScope("Client")).toBe("no_admin");
    });
  });

  describe("canEditSettings", () => {
    it("global_admin can edit any domain", () => {
      expect(canEditSettings("global_admin", "ai_behavior")).toBe(true);
      expect(canEditSettings("global_admin", "feature_flags")).toBe(true);
      expect(canEditSettings("global_admin", "branding")).toBe(true);
    });

    it("tenant_admin cannot edit feature_flags", () => {
      expect(canEditSettings("tenant_admin", "feature_flags")).toBe(false);
    });

    it("tenant_admin can edit ai_behavior", () => {
      expect(canEditSettings("tenant_admin", "ai_behavior")).toBe(true);
    });

    it("manager_admin can edit review_policies", () => {
      expect(canEditSettings("manager_admin", "review_policies")).toBe(true);
    });

    it("manager_admin cannot edit ai_behavior", () => {
      expect(canEditSettings("manager_admin", "ai_behavior")).toBe(false);
    });

    it("readonly_admin cannot edit anything", () => {
      expect(canEditSettings("readonly_admin", "review_policies")).toBe(false);
      expect(canEditSettings("readonly_admin", "communication_policies")).toBe(false);
    });

    it("no_admin cannot edit anything", () => {
      expect(canEditSettings("no_admin", "notification_policies")).toBe(false);
    });
  });

  describe("canViewSettings", () => {
    it("global_admin can view all domains", () => {
      expect(canViewSettings("global_admin", "feature_flags")).toBe(true);
      expect(canViewSettings("global_admin", "branding")).toBe(true);
    });

    it("readonly_admin can view tenant_profile", () => {
      expect(canViewSettings("readonly_admin", "tenant_profile")).toBe(true);
    });

    it("readonly_admin cannot view ai_behavior", () => {
      expect(canViewSettings("readonly_admin", "ai_behavior")).toBe(false);
    });

    it("no_admin cannot view anything", () => {
      expect(canViewSettings("no_admin", "tenant_profile")).toBe(false);
    });
  });

  describe("canAccessAdmin", () => {
    it("global_admin can access admin", () => {
      expect(canAccessAdmin("global_admin")).toBe(true);
    });
    it("readonly_admin can access admin", () => {
      expect(canAccessAdmin("readonly_admin")).toBe(true);
    });
    it("no_admin cannot access admin", () => {
      expect(canAccessAdmin("no_admin")).toBe(false);
    });
  });

  describe("canManagePolicies", () => {
    it("global_admin can manage policies", () => {
      expect(canManagePolicies("global_admin")).toBe(true);
    });
    it("tenant_admin can manage policies", () => {
      expect(canManagePolicies("tenant_admin")).toBe(true);
    });
    it("manager_admin can manage policies", () => {
      expect(canManagePolicies("manager_admin")).toBe(true);
    });
    it("readonly_admin cannot manage policies", () => {
      expect(canManagePolicies("readonly_admin")).toBe(false);
    });
  });

  describe("canManageFeatureFlags", () => {
    it("only global_admin can manage feature flags", () => {
      expect(canManageFeatureFlags("global_admin")).toBe(true);
      expect(canManageFeatureFlags("tenant_admin")).toBe(false);
      expect(canManageFeatureFlags("manager_admin")).toBe(false);
    });
  });

  describe("canManageInstitutions", () => {
    it("global_admin and tenant_admin can manage institutions", () => {
      expect(canManageInstitutions("global_admin")).toBe(true);
      expect(canManageInstitutions("tenant_admin")).toBe(true);
    });
    it("manager_admin cannot manage institutions", () => {
      expect(canManageInstitutions("manager_admin")).toBe(false);
    });
  });

  describe("canViewAudit", () => {
    it("all admin scopes except no_admin can view audit", () => {
      expect(canViewAudit("global_admin")).toBe(true);
      expect(canViewAudit("tenant_admin")).toBe(true);
      expect(canViewAudit("manager_admin")).toBe(true);
      expect(canViewAudit("ops_admin")).toBe(true);
      expect(canViewAudit("readonly_admin")).toBe(true);
    });
    it("no_admin cannot view audit", () => {
      expect(canViewAudit("no_admin")).toBe(false);
    });
  });

  describe("Plan 9 security / ops gates", () => {
    it("canAccessSecurityConsole for admin roles", () => {
      expect(canAccessSecurityConsole("global_admin")).toBe(true);
      expect(canAccessSecurityConsole("tenant_admin")).toBe(true);
      expect(canAccessSecurityConsole("manager_admin")).toBe(true);
      expect(canAccessSecurityConsole("readonly_admin")).toBe(false);
    });

    it("canManageIncidents for Director-level scopes", () => {
      expect(canManageIncidents("global_admin")).toBe(true);
      expect(canManageIncidents("tenant_admin")).toBe(true);
      expect(canManageIncidents("manager_admin")).toBe(false);
    });

    it("canManageOpsDeadLetter matches incidents", () => {
      expect(canManageOpsDeadLetter("tenant_admin")).toBe(true);
      expect(canManageOpsDeadLetter("manager_admin")).toBe(false);
    });

    it("canManageComplianceRequests for tenant admins", () => {
      expect(canManageComplianceRequests("tenant_admin")).toBe(true);
      expect(canManageComplianceRequests("manager_admin")).toBe(false);
    });
  });
});

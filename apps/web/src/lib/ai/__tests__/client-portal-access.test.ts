import { describe, it, expect } from "vitest";
import { buildPortalAccessSnapshotFromFlags, buildPortalAccessSnapshotFromVerdict } from "../client-portal-access";

describe("buildPortalAccessSnapshotFromFlags (legacy compat shim)", () => {
  it("treats client_contacts link as full portal access", () => {
    const s = buildPortalAccessSnapshotFromFlags({ hasClientContactRow: true, hasAcceptedInvitation: false });
    expect(s.hasActiveClientPortal).toBe(true);
    expect(s.hasLinkedUserAccount).toBe(true);
    expect(s.accessVerdict).toBe("ACTIVE");
  });

  it("accepted invite without client_contacts row maps to INCONSISTENT (not active)", () => {
    // Rule: acceptedAt set but client_contacts missing → broken state, not active
    const s = buildPortalAccessSnapshotFromFlags({ hasClientContactRow: false, hasAcceptedInvitation: true });
    expect(s.hasActiveClientPortal).toBe(false);
    expect(s.accessVerdict).toBe("INCONSISTENT");
  });

  it("no access when neither link nor accepted invite", () => {
    const s = buildPortalAccessSnapshotFromFlags({ hasClientContactRow: false, hasAcceptedInvitation: false });
    expect(s.hasActiveClientPortal).toBe(false);
    expect(s.accessVerdict).toBe("NEVER_INVITED");
  });
});

describe("buildPortalAccessSnapshotFromVerdict", () => {
  it("ACTIVE verdict → hasActiveClientPortal true", () => {
    const s = buildPortalAccessSnapshotFromVerdict("ACTIVE");
    expect(s.hasActiveClientPortal).toBe(true);
    expect(s.hasLinkedUserAccount).toBe(true);
    expect(s.accessVerdict).toBe("ACTIVE");
  });

  it("PASSWORD_PENDING verdict → hasActiveClientPortal true (has account, needs pw change)", () => {
    const s = buildPortalAccessSnapshotFromVerdict("PASSWORD_PENDING");
    expect(s.hasActiveClientPortal).toBe(true);
    expect(s.accessVerdict).toBe("PASSWORD_PENDING");
  });

  it("INCONSISTENT verdict → hasActiveClientPortal false", () => {
    const s = buildPortalAccessSnapshotFromVerdict("INCONSISTENT");
    expect(s.hasActiveClientPortal).toBe(false);
    expect(s.hasAcceptedInvitation).toBe(true);
    expect(s.accessVerdict).toBe("INCONSISTENT");
  });

  it("PENDING verdict → hasActiveClientPortal false", () => {
    const s = buildPortalAccessSnapshotFromVerdict("PENDING");
    expect(s.hasActiveClientPortal).toBe(false);
    expect(s.accessVerdict).toBe("PENDING");
  });

  it("NEVER_INVITED verdict → hasActiveClientPortal false", () => {
    const s = buildPortalAccessSnapshotFromVerdict("NEVER_INVITED");
    expect(s.hasActiveClientPortal).toBe(false);
    expect(s.accessVerdict).toBe("NEVER_INVITED");
  });
});

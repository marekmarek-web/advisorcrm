import { describe, it, expect } from "vitest";
import { buildPortalAccessSnapshotFromFlags } from "../client-portal-access";

describe("buildPortalAccessSnapshotFromFlags", () => {
  it("treats client_contacts link as full portal access", () => {
    const s = buildPortalAccessSnapshotFromFlags({ hasClientContactRow: true, hasAcceptedInvitation: false });
    expect(s.hasActiveClientPortal).toBe(true);
    expect(s.hasLinkedUserAccount).toBe(true);
  });

  it("uses accepted invitation when no client_contacts row", () => {
    const s = buildPortalAccessSnapshotFromFlags({ hasClientContactRow: false, hasAcceptedInvitation: true });
    expect(s.hasActiveClientPortal).toBe(true);
    expect(s.hasLinkedUserAccount).toBe(false);
  });

  it("no access when neither link nor accepted invite", () => {
    const s = buildPortalAccessSnapshotFromFlags({ hasClientContactRow: false, hasAcceptedInvitation: false });
    expect(s.hasActiveClientPortal).toBe(false);
  });
});

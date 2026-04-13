import { describe, it, expect } from "vitest";
import { computeAccessVerdictFromState } from "@/lib/auth/access-verdict";

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

function makeInvite(overrides: {
  acceptedAt?: Date | null;
  revokedAt?: Date | null;
  expiresAt?: Date;
  passwordChangedAt?: Date | null;
  token?: string;
  email?: string;
}) {
  return {
    acceptedAt: null,
    revokedAt: null,
    expiresAt: futureDate,
    passwordChangedAt: null,
    token: "tok-1",
    email: "client@test.cz",
    ...overrides,
  };
}

describe("computeAccessVerdictFromState", () => {
  it("ACTIVE when client_contacts row + Client membership both exist", () => {
    const result = computeAccessVerdictFromState({
      hasClientContactRow: true,
      hasClientMembership: true,
      invitations: [],
    });
    expect(result.verdict).toBe("ACTIVE");
  });

  it("ACTIVE when client_contacts row + membership even if invite was accepted", () => {
    const result = computeAccessVerdictFromState({
      hasClientContactRow: true,
      hasClientMembership: true,
      invitations: [makeInvite({ acceptedAt: new Date(), passwordChangedAt: new Date() })],
    });
    expect(result.verdict).toBe("ACTIVE");
  });

  it("INCONSISTENT when acceptedAt is set but client_contacts row is missing", () => {
    const result = computeAccessVerdictFromState({
      hasClientContactRow: false,
      hasClientMembership: false,
      invitations: [makeInvite({ acceptedAt: new Date() })],
    });
    expect(result.verdict).toBe("INCONSISTENT");
  });

  it("PASSWORD_PENDING when client_contacts row exists and invite acceptedAt set but passwordChangedAt is null", () => {
    const result = computeAccessVerdictFromState({
      hasClientContactRow: true,
      hasClientMembership: true,
      invitations: [makeInvite({ acceptedAt: new Date(), passwordChangedAt: null })],
    });
    expect(result.verdict).toBe("PASSWORD_PENDING");
    expect(result.inviteEmail).toBe("client@test.cz");
  });

  it("PENDING when invite exists, not expired, not revoked, acceptedAt null", () => {
    const result = computeAccessVerdictFromState({
      hasClientContactRow: false,
      hasClientMembership: false,
      invitations: [makeInvite({ acceptedAt: null, revokedAt: null, expiresAt: futureDate })],
    });
    expect(result.verdict).toBe("PENDING");
    expect(result.pendingInviteToken).toBe("tok-1");
    expect(result.inviteEmail).toBe("client@test.cz");
  });

  it("NEVER_INVITED when there are no invitations", () => {
    const result = computeAccessVerdictFromState({
      hasClientContactRow: false,
      hasClientMembership: false,
      invitations: [],
    });
    expect(result.verdict).toBe("NEVER_INVITED");
  });

  it("NEVER_INVITED when invite is expired and not accepted", () => {
    const result = computeAccessVerdictFromState({
      hasClientContactRow: false,
      hasClientMembership: false,
      invitations: [makeInvite({ expiresAt: pastDate, acceptedAt: null })],
    });
    expect(result.verdict).toBe("NEVER_INVITED");
  });

  it("NEVER_INVITED when invite is revoked and not accepted", () => {
    const result = computeAccessVerdictFromState({
      hasClientContactRow: false,
      hasClientMembership: false,
      invitations: [makeInvite({ revokedAt: new Date(), acceptedAt: null })],
    });
    expect(result.verdict).toBe("NEVER_INVITED");
  });

  it("PENDING wins over expired invite when a fresh pending invite also exists", () => {
    const result = computeAccessVerdictFromState({
      hasClientContactRow: false,
      hasClientMembership: false,
      invitations: [
        makeInvite({ expiresAt: pastDate, token: "expired", acceptedAt: null }),
        makeInvite({ expiresAt: futureDate, token: "fresh", acceptedAt: null }),
      ],
    });
    expect(result.verdict).toBe("PENDING");
    expect(result.pendingInviteToken).toBe("fresh");
  });

  it("does not redirect as pending when invite was already accepted (findPendingClientPasswordChangeRedirect fix)", () => {
    // Simulates: invite acceptedAt is set → should NOT be treated as PENDING
    const result = computeAccessVerdictFromState({
      hasClientContactRow: true,
      hasClientMembership: true,
      invitations: [makeInvite({ acceptedAt: new Date(), passwordChangedAt: new Date() })],
    });
    // ACTIVE, not PENDING — so redirect helper must not fire
    expect(result.verdict).toBe("ACTIVE");
    expect(result.verdict).not.toBe("PENDING");
  });
});

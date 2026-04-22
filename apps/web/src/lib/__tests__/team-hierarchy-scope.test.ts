import { describe, it, expect } from "vitest";
import {
  getVisibleUserIdsFromMembers,
  defaultLandingScopeForRole,
  resolveScopeForRole,
  type TeamHierarchyMember,
} from "@/lib/team-hierarchy-types";

function member(
  userId: string,
  parentId: string | null,
  roleName: string = "Advisor"
): TeamHierarchyMember {
  return {
    userId,
    parentId,
    roleName,
    joinedAt: new Date(),
    displayName: null,
    email: null,
    careerProgram: null,
    careerTrack: null,
    careerPositionCode: null,
    teamMemberId: null,
    authUserId: userId,
    memberKind: "internal_user",
    status: "active",
  };
}

describe("getVisibleUserIdsFromMembers — hierarchy edge cases", () => {
  it("my_team without any parent_id: Manager sees only self (no tenant-wide leak)", () => {
    const members = [member("mgr", null, "Manager"), member("a", null, "Advisor"), member("b", null, "Advisor")];
    expect(getVisibleUserIdsFromMembers(members, "mgr", "Manager", "my_team").sort()).toEqual(["mgr"]);
  });

  it("my_team with parent links: Manager sees self and descendants", () => {
    const members = [
      member("mgr", null, "Manager"),
      member("a", "mgr", "Advisor"),
      member("b", "a", "Advisor"),
    ];
    expect(new Set(getVisibleUserIdsFromMembers(members, "mgr", "Manager", "my_team"))).toEqual(
      new Set(["mgr", "a", "b"])
    );
  });

  it("full scope still returns all tenant team-role members for Director", () => {
    const members = [member("dir", null, "Director"), member("x", null, "Advisor")];
    expect(new Set(getVisibleUserIdsFromMembers(members, "dir", "Director", "full"))).toEqual(
      new Set(["dir", "x"])
    );
  });

  it("Advisor always scoped to me", () => {
    const members = [member("adv", null, "Advisor"), member("other", null, "Advisor")];
    expect(getVisibleUserIdsFromMembers(members, "adv", "Advisor", "full")).toEqual(["adv"]);
  });
});

describe("defaultLandingScopeForRole — Team Overview + detail URL parity", () => {
  it("Director/Admin land on full (same as team-overview/page initial)", () => {
    expect(defaultLandingScopeForRole("Director")).toBe("full");
    expect(defaultLandingScopeForRole("Admin")).toBe("full");
  });

  it("resolveScopeForRole(undefined) is more conservative than landing for Director — detail page must pass explicit landing/URL scope", () => {
    expect(resolveScopeForRole("Director", undefined)).toBe("my_team");
    expect(resolveScopeForRole("Director", "full")).toBe("full");
  });

  it("Advisor and Viewer land on me", () => {
    expect(defaultLandingScopeForRole("Advisor")).toBe("me");
    expect(defaultLandingScopeForRole("Viewer")).toBe("me");
  });

  it("Manager lands on my_team", () => {
    expect(defaultLandingScopeForRole("Manager")).toBe("my_team");
  });
});

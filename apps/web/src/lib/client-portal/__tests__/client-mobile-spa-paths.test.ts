import { describe, expect, it } from "vitest";
import { isClientMobileSpaPath, normalizeClientPathname } from "../client-mobile-spa-paths";

describe("normalizeClientPathname", () => {
  it("maps root and empty to /client", () => {
    expect(normalizeClientPathname("")).toBe("/client");
    expect(normalizeClientPathname("/")).toBe("/client");
  });

  it("strips query string", () => {
    expect(normalizeClientPathname("/client/payments?x=1")).toBe("/client/payments");
  });

  it("trims trailing slash except root", () => {
    expect(normalizeClientPathname("/client/messages/")).toBe("/client/messages");
  });

  it("adds leading slash", () => {
    expect(normalizeClientPathname("client/documents")).toBe("/client/documents");
  });
});

describe("isClientMobileSpaPath (regression: layout vs. client escape)", () => {
  it("treats main tabs and portfolio as SPA", () => {
    expect(isClientMobileSpaPath("/client")).toBe(true);
    expect(isClientMobileSpaPath("/client/messages")).toBe(true);
    expect(isClientMobileSpaPath("/client/documents")).toBe(true);
    expect(isClientMobileSpaPath("/client/profile")).toBe(true);
    expect(isClientMobileSpaPath("/client/notifications")).toBe(true);
    expect(isClientMobileSpaPath("/client/requests")).toBe(true);
    expect(isClientMobileSpaPath("/client/portfolio")).toBe(true);
    expect(isClientMobileSpaPath("/client/portfolio/foo")).toBe(true);
    expect(isClientMobileSpaPath("/client/payments")).toBe(true);
    expect(isClientMobileSpaPath("/client/contracts")).toBe(true);
    expect(isClientMobileSpaPath("/client/contracts/bar")).toBe(true);
  });

  it("excludes calculators, advisor material detail (full shell + children); payments stay in mobile SPA", () => {
    expect(isClientMobileSpaPath("/client/calculators")).toBe(false);
    expect(isClientMobileSpaPath("/client/calculators/mortgage")).toBe(false);
    expect(isClientMobileSpaPath("/client/payments")).toBe(true);
    expect(isClientMobileSpaPath("/client/pozadavky-poradce")).toBe(false);
    expect(isClientMobileSpaPath("/client/pozadavky-poradce/abc-123")).toBe(false);
    expect(isClientMobileSpaPath("/client/requests/new")).toBe(false);
    expect(isClientMobileSpaPath("/client/investments")).toBe(false);
    expect(isClientMobileSpaPath("/client/unsubscribe")).toBe(false);
  });
});

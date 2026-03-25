import { describe, expect, it } from "vitest";
import { getCzNameDaysForDate } from "../cz-name-days";

describe("getCzNameDaysForDate", () => {
  it("returns Marián on 25 March", () => {
    expect(getCzNameDaysForDate(2026, 3, 25)).toContain("Marián");
  });

  it("returns Mečislav on 1 January", () => {
    expect(getCzNameDaysForDate(2026, 1, 1)).toEqual(["Mečislav"]);
  });

  it("returns empty on 29 February in a non-leap year", () => {
    expect(getCzNameDaysForDate(2025, 2, 29)).toEqual([]);
  });

  it("returns Horymír on 29 February in a leap year", () => {
    expect(getCzNameDaysForDate(2024, 2, 29)).toContain("Horymír");
  });

  it("returns empty list for Christmas day personal names (table has none)", () => {
    expect(getCzNameDaysForDate(2026, 12, 25)).toEqual([]);
  });
});

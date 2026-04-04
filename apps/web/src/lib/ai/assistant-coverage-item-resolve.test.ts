import { describe, expect, it } from "vitest";
import {
  resolveCoverageItemKeyFromText,
  normalizeCoverageStatus,
} from "./assistant-coverage-item-resolve";

describe("assistant-coverage-item-resolve", () => {
  it("maps ODP slang to grid itemKey", () => {
    expect(resolveCoverageItemKeyFromText("odp", "")).toBe("Pojištění odpovědnosti");
    expect(resolveCoverageItemKeyFromText(null, "nastav ODP jako hotovo")).toBe(
      "Pojištění odpovědnosti",
    );
  });

  it("normalizes Czech status phrases", () => {
    expect(normalizeCoverageStatus("hotovo")).toBe("done");
    expect(normalizeCoverageStatus("neřeší")).toBe("not_relevant");
    expect(normalizeCoverageStatus("done")).toBe("done");
  });
});

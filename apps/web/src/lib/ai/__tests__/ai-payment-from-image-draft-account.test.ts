import { describe, it, expect } from "vitest";
import { formatDomesticAccountDisplayLine } from "../payment-field-contract";

/**
 * Regression: draft dříve skládal `accountNumber + '/' + bankCode` i když už byl kód v čísle.
 */
describe("payment draft — domácí účet z extrakce", () => {
  it("nesmí zdvojit kód banky (246000/5500 + 5500)", () => {
    expect(formatDomesticAccountDisplayLine("246000/5500", "5500")).toBe("246000/5500");
  });

  it("sloučí prefix a kód když model vrátí zvlášť", () => {
    expect(formatDomesticAccountDisplayLine("246000", "5500")).toBe("246000/5500");
  });

  it("odstraní zdvojený suffix /2700/2700", () => {
    expect(formatDomesticAccountDisplayLine("1234567890/2700/2700", "")).toBe("1234567890/2700");
  });
});

import { describe, it, expect } from "vitest";
import { dedupeCzechAccountTrailingBankCode } from "../payment-field-contract";

/**
 * Regression tests pro bug „opakující se kód banky za lomítkem" (AI Review).
 *
 * Viz plán: `/0600/0600` se objevilo v UI i v client_payment_setups při
 * nahrání smlouvy z AI Review. Deduplikace se provádí jak v coerce fázi
 * (combined-extraction → extractedFields), tak při persistenci
 * (apply-contract-review, manual-payment-setup) a pro zobrazení v UI.
 */
describe("dedupeCzechAccountTrailingBankCode", () => {
  it("odstraní duplikát 4místného bank kódu za lomítkem", () => {
    expect(dedupeCzechAccountTrailingBankCode("213038282/0600/0600")).toBe("213038282/0600");
  });

  it("odstraní více opakování ve smyčce (až zůstane jedno)", () => {
    expect(dedupeCzechAccountTrailingBankCode("229875956/0600/0600/0600")).toBe("229875956/0600");
  });

  it("ignoruje bílé znaky", () => {
    expect(dedupeCzechAccountTrailingBankCode("  213038282 / 0600 / 0600 ")).toBe("213038282/0600");
  });

  it("neovlivní korektní účet bez duplicity", () => {
    expect(dedupeCzechAccountTrailingBankCode("123456789/0100")).toBe("123456789/0100");
  });

  it("neovlivní účet s prefixem (předčíslím) a jediným bank kódem", () => {
    expect(dedupeCzechAccountTrailingBankCode("19-123456789/0800")).toBe("19-123456789/0800");
  });

  it("odstraní duplicitu i u účtu s předčíslím", () => {
    expect(dedupeCzechAccountTrailingBankCode("19-123456789/0800/0800")).toBe("19-123456789/0800");
  });

  it("neovlivní IBAN (bez trailing duplicity)", () => {
    expect(dedupeCzechAccountTrailingBankCode("CZ6508000000192000145399")).toBe(
      "CZ6508000000192000145399",
    );
  });

  it("neodstraní dvě různá čísla (žádný duplikát)", () => {
    expect(dedupeCzechAccountTrailingBankCode("123456789/0100/0800")).toBe("123456789/0100/0800");
  });

  it("zachová prázdné vstupy", () => {
    expect(dedupeCzechAccountTrailingBankCode("")).toBe("");
  });
});

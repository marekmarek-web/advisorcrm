import { describe, expect, it } from "vitest";
import type { PaymentInstruction } from "@/app/actions/payment-pdf";
import { dedupePortalPaymentInstructions } from "../portal-payment-instruction-dedup";

function instruction(overrides: Partial<PaymentInstruction>): PaymentInstruction {
  return {
    segment: "MAJ",
    partnerName: "ČSOB Pojišťovna",
    productName: "Pojištění odpovědnosti zaměstnance",
    contractNumber: "6200253364",
    accountNumber: "187078376/0300",
    bank: null,
    note: null,
    amount: "413",
    frequency: "monthly",
    variableSymbol: "6200253364",
    specificSymbol: null,
    constantSymbol: null,
    currency: null,
    paymentSetupId: "ps-1",
    contractId: "contract-1",
    linkedContractPortfolioStatus: "active",
    ...overrides,
  };
}

describe("dedupePortalPaymentInstructions", () => {
  it("keeps only one payment card for the same linked contract", () => {
    const rows = [
      instruction({ paymentSetupId: "ps-1", accountNumber: "187078376/0300" }),
      instruction({ paymentSetupId: null, accountNumber: "999999999/0300", contractId: "contract-1" }),
    ];

    expect(dedupePortalPaymentInstructions(rows)).toEqual([rows[0]]);
  });

  it("falls back to contract number when a row is not linked by id", () => {
    const rows = [
      instruction({ contractId: null, contractNumber: " 6200253364 " }),
      instruction({ contractId: null, contractNumber: "6200253364", accountNumber: "999999999/0300" }),
      instruction({ contractId: null, contractNumber: "7710252946", accountNumber: "CZ2703000000000287359968" }),
    ];

    expect(dedupePortalPaymentInstructions(rows)).toEqual([rows[0], rows[2]]);
  });

  it("uses contract number across linked and unlinked rows for the same contract", () => {
    const rows = [
      instruction({ contractId: null, contractNumber: "6200253364" }),
      instruction({ contractId: "contract-1", contractNumber: "6200253364", accountNumber: "999999999/0300" }),
    ];

    expect(dedupePortalPaymentInstructions(rows)).toEqual([rows[0]]);
  });
});

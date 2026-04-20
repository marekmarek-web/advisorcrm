import { describe, it, expect } from "vitest";
import {
  calculateBj,
  pickBestBjRule,
  type BjCoefficientRule,
} from "../calculate-bj";

/**
 * Reference fixture — řádky seedu z `add_bj_coefficients_2026-04-20.sql`
 * převedené do typu, který kalkulátor očekává. Pořadí nerozhoduje, protože
 * `pickBestBjRule()` si vybírá podle skóre (specificita pravidla).
 *
 * Číselné hodnoty se musí shodovat s hodnotami v SQL seedu. Když se sazebník
 * změní, test musí explodovat — to je záměr.
 */
const RULES: BjCoefficientRule[] = [
  // ── INVESTMENT_ENTRY_FEE ──────────────────────────────────────
  {
    productCategory: "INVESTMENT_ENTRY_FEE",
    partnerPattern: null,
    subtype: null,
    formula: "entry_fee",
    coefficient: null,
    divisor: 238.1,
    cap: null,
    floor: null,
    tenantScope: "global",
  },
  {
    productCategory: "INVESTMENT_ENTRY_FEE",
    partnerPattern: "^amundi",
    subtype: null,
    formula: "entry_fee",
    coefficient: null,
    divisor: 238.1,
    cap: null,
    floor: null,
    tenantScope: "global",
  },
  {
    productCategory: "INVESTMENT_ENTRY_FEE",
    partnerPattern: "^edward|investi[cč]ni u[cč]ty edward",
    subtype: null,
    formula: "entry_fee",
    coefficient: 0.0036,
    divisor: null,
    cap: null,
    floor: null,
    tenantScope: "global",
  },
  {
    productCategory: "INVESTMENT_ENTRY_FEE",
    partnerPattern: "^codya",
    subtype: null,
    formula: "entry_fee",
    coefficient: 0.004,
    divisor: null,
    cap: null,
    floor: null,
    tenantScope: "global",
  },
  {
    productCategory: "INVESTMENT_ENTRY_FEE",
    partnerPattern: "^investika",
    subtype: null,
    formula: "entry_fee",
    coefficient: 0.004,
    divisor: null,
    cap: null,
    floor: null,
    tenantScope: "global",
  },

  // ── INVESTMENT_SINGLE_WITH_ENTRY_FEE (realitní fondy) ─────────
  {
    productCategory: "INVESTMENT_SINGLE_WITH_ENTRY_FEE",
    partnerPattern: null,
    subtype: null,
    formula: "investment_amount",
    coefficient: 0.00016,
    divisor: null,
    cap: null,
    floor: null,
    tenantScope: "global",
  },
  {
    productCategory: "INVESTMENT_SINGLE_WITH_ENTRY_FEE",
    partnerPattern: "^atris",
    subtype: null,
    formula: "investment_amount",
    coefficient: 0.00016,
    divisor: null,
    cap: null,
    floor: null,
    tenantScope: "global",
  },
  {
    productCategory: "INVESTMENT_SINGLE_WITH_ENTRY_FEE",
    partnerPattern: "^efekta|czech real estate",
    subtype: null,
    formula: "investment_amount",
    coefficient: 0.00019605,
    divisor: null,
    cap: null,
    floor: null,
    tenantScope: "global",
  },

  // ── PENSION_PARTICIPANT_CONTRIBUTION ──────────────────────────
  {
    productCategory: "PENSION_PARTICIPANT_CONTRIBUTION",
    partnerPattern: null,
    subtype: null,
    formula: "client_contribution",
    coefficient: 0.011,
    divisor: null,
    cap: 1700,
    floor: null,
    tenantScope: "global",
  },
  {
    productCategory: "PENSION_PARTICIPANT_CONTRIBUTION",
    partnerPattern: "^conseq",
    subtype: null,
    formula: "client_contribution",
    coefficient: 0.011,
    divisor: null,
    cap: 1700,
    floor: null,
    tenantScope: "global",
  },

  // ── LIFE_INSURANCE_REGULAR ────────────────────────────────────
  {
    productCategory: "LIFE_INSURANCE_REGULAR",
    partnerPattern: null,
    subtype: "regular_payment",
    formula: "annual_premium",
    coefficient: 0.1,
    divisor: null,
    cap: null,
    floor: null,
    tenantScope: "global",
  },
  {
    productCategory: "LIFE_INSURANCE_REGULAR",
    partnerPattern: "^nn|nn [zž]ivot",
    subtype: null,
    formula: "annual_premium",
    coefficient: 0.0078,
    divisor: null,
    cap: null,
    floor: null,
    tenantScope: "global",
  },
  {
    productCategory: "LIFE_INSURANCE_REGULAR",
    partnerPattern: "^maxima|maxefekt",
    subtype: null,
    formula: "annual_premium",
    coefficient: 0.00783333,
    divisor: null,
    cap: null,
    floor: null,
    tenantScope: "global",
  },
  {
    productCategory: "LIFE_INSURANCE_REGULAR",
    partnerPattern: "^uniqa",
    subtype: null,
    formula: "annual_premium",
    coefficient: 0.00825,
    divisor: null,
    cap: null,
    floor: null,
    tenantScope: "global",
  },

  // ── MOTOR_INSURANCE ───────────────────────────────────────────
  {
    productCategory: "MOTOR_INSURANCE",
    partnerPattern: null,
    subtype: null,
    formula: "annual_premium",
    coefficient: 0.0006,
    divisor: null,
    cap: null,
    floor: null,
    tenantScope: "global",
  },
  {
    productCategory: "MOTOR_INSURANCE",
    partnerPattern: "^pillow",
    subtype: null,
    formula: "annual_premium",
    coefficient: 0.0006,
    divisor: null,
    cap: null,
    floor: null,
    tenantScope: "global",
  },

  // ── MORTGAGE ──────────────────────────────────────────────────
  {
    productCategory: "MORTGAGE",
    partnerPattern: null,
    subtype: null,
    formula: "loan_principal",
    coefficient: 0.00007,
    divisor: null,
    cap: null,
    floor: null,
    tenantScope: "global",
  },
  {
    productCategory: "MORTGAGE",
    partnerPattern: "^raiffeisen|^rb ",
    subtype: null,
    formula: "loan_principal",
    coefficient: 0.0000448,
    divisor: null,
    cap: null,
    floor: null,
    tenantScope: "global",
  },
  {
    productCategory: "MORTGAGE",
    partnerPattern: "^ucb|unicredit",
    subtype: null,
    formula: "loan_principal",
    coefficient: 0.00007,
    divisor: null,
    cap: null,
    floor: null,
    tenantScope: "global",
  },

  // ── CONSUMER_LOAN ─────────────────────────────────────────────
  {
    productCategory: "CONSUMER_LOAN",
    partnerPattern: null,
    subtype: "without_ppi",
    formula: "loan_principal",
    coefficient: 0.000112,
    divisor: null,
    cap: null,
    floor: null,
    tenantScope: "global",
  },
  {
    productCategory: "CONSUMER_LOAN",
    partnerPattern: null,
    subtype: "with_ppi",
    formula: "loan_principal",
    coefficient: 0.000132,
    divisor: null,
    cap: null,
    floor: null,
    tenantScope: "global",
  },
  {
    productCategory: "CONSUMER_LOAN",
    partnerPattern: "^rsts|rekop[uů]j[cč]ka",
    subtype: "without_ppi",
    formula: "loan_principal",
    coefficient: 0.000112,
    divisor: null,
    cap: null,
    floor: null,
    tenantScope: "global",
  },
  {
    productCategory: "CONSUMER_LOAN",
    partnerPattern: "^rsts|rekop[uů]j[cč]ka",
    subtype: "with_ppi",
    formula: "loan_principal",
    coefficient: 0.000132,
    divisor: null,
    cap: null,
    floor: null,
    tenantScope: "global",
  },
  {
    productCategory: "CONSUMER_LOAN",
    partnerPattern: "^(ucb|presto|unicredit)",
    subtype: null,
    formula: "loan_principal",
    coefficient: 0.00011,
    divisor: null,
    cap: null,
    floor: null,
    tenantScope: "global",
  },

  // ── LEASING ───────────────────────────────────────────────────
  {
    productCategory: "LEASING",
    partnerPattern: null,
    subtype: null,
    formula: "loan_principal",
    coefficient: 0.000072,
    divisor: null,
    cap: null,
    floor: null,
    tenantScope: "global",
  },
  {
    productCategory: "LEASING",
    partnerPattern: "^[cč]sob",
    subtype: null,
    formula: "loan_principal",
    coefficient: 0.000072,
    divisor: null,
    cap: null,
    floor: null,
    tenantScope: "global",
  },
];

/**
 * Reference hodnoty z obrázku "Body" v BP_kariera_01-2022. Všechny v 1 000 Kč
 * (VP / roční pojistné) nebo 1 000 000 Kč (jistina). `expected` je počet BJ.
 */
describe("calculateBj — reference hodnoty z kariérního plánu", () => {
  it("Amundi VP 1 000 Kč → 4,20 BJ (divisor 238,10)", () => {
    const res = calculateBj(
      {
        category: "INVESTMENT_ENTRY_FEE",
        subtypes: ["investment_fund"],
        haystack: "amundi amundi invest",
        amounts: { entryFee: 1000 },
      },
      RULES,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.bjUnits).toBeCloseTo(4.2, 2);
      expect(res.snapshot.matchedRule.partnerPattern).toBe("^amundi");
      expect(res.snapshot.divisor).toBe(238.1);
    }
  });

  it("Edward VP 1 000 Kč → 3,60 BJ", () => {
    const res = calculateBj(
      {
        category: "INVESTMENT_ENTRY_FEE",
        subtypes: [],
        haystack: "edward investiční účty edward",
        amounts: { entryFee: 1000 },
      },
      RULES,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.bjUnits).toBeCloseTo(3.6, 2);
  });

  it("Codya IS VP 1 000 Kč → 4,00 BJ", () => {
    const res = calculateBj(
      {
        category: "INVESTMENT_ENTRY_FEE",
        subtypes: [],
        haystack: "codya is fondy sicav",
        amounts: { entryFee: 1000 },
      },
      RULES,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.bjUnits).toBeCloseTo(4.0, 2);
  });

  it("Investika DIP VP 1 000 Kč → 4,00 BJ", () => {
    const res = calculateBj(
      {
        category: "INVESTMENT_ENTRY_FEE",
        subtypes: [],
        haystack: "investika dip investika realitní fond",
        amounts: { entryFee: 1000 },
      },
      RULES,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.bjUnits).toBeCloseTo(4.0, 2);
  });

  it("Conseq PS příspěvek 1 000 Kč/měs → 11,00 BJ", () => {
    const res = calculateBj(
      {
        category: "PENSION_PARTICIPANT_CONTRIBUTION",
        subtypes: ["pension"],
        haystack: "conseq ps zenit",
        amounts: { clientContributionMonthly: 1000 },
      },
      RULES,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.bjUnits).toBeCloseTo(11.0, 2);
      expect(res.snapshot.cap).toBe(1700);
    }
  });

  it("Conseq PS cap 1 700 — příspěvek 3 000 Kč/měs započte jen 1 700 = 18,70 BJ", () => {
    const res = calculateBj(
      {
        category: "PENSION_PARTICIPANT_CONTRIBUTION",
        subtypes: ["pension"],
        haystack: "conseq ps zenit",
        amounts: { clientContributionMonthly: 3000 },
      },
      RULES,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.bjUnits).toBeCloseTo(18.7, 2);
      expect(res.snapshot.appliedCap).toBe(true);
      expect(res.snapshot.amountCzk).toBe(1700);
      expect(res.snapshot.amountRawCzk).toBe(3000);
    }
  });

  it("Pillow roční 1 000 Kč → 0,60 BJ", () => {
    const res = calculateBj(
      {
        category: "MOTOR_INSURANCE",
        subtypes: ["auto"],
        haystack: "pillow autopojištění",
        amounts: { annualPremium: 1000 },
      },
      RULES,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.bjUnits).toBeCloseTo(0.6, 2);
  });

  it("NN Život roční 12 000 Kč → 93,60 BJ", () => {
    const res = calculateBj(
      {
        category: "LIFE_INSURANCE_REGULAR",
        subtypes: ["regular_payment"],
        haystack: "nn život 100 nn životní pojišťovna",
        amounts: { annualPremium: 12000 },
      },
      RULES,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.bjUnits).toBeCloseTo(93.6, 1);
  });

  it("Maxima MAXEFEKT roční 12 000 Kč → 94,00 BJ", () => {
    const res = calculateBj(
      {
        category: "LIFE_INSURANCE_REGULAR",
        subtypes: ["regular_payment"],
        haystack: "maxima maxefekt 100",
        amounts: { annualPremium: 12000 },
      },
      RULES,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.bjUnits).toBeCloseTo(94.0, 1);
  });

  it("Uniqa Život roční 12 000 Kč → ~99 BJ", () => {
    const res = calculateBj(
      {
        category: "LIFE_INSURANCE_REGULAR",
        subtypes: ["regular_payment"],
        haystack: "uniqa život a radost",
        amounts: { annualPremium: 12000 },
      },
      RULES,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.bjUnits).toBeCloseTo(99.0, 0);
  });

  it("RB hypotéka 1 mil Kč → 44,80 BJ (nižší než UCB default 70)", () => {
    const res = calculateBj(
      {
        category: "MORTGAGE",
        subtypes: ["mortgage"],
        haystack: "raiffeisenbank rb hypotéka fix 1-2 roky",
        amounts: { loanPrincipal: 1_000_000 },
      },
      RULES,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.bjUnits).toBeCloseTo(44.8, 2);
      expect(res.snapshot.matchedRule.partnerPattern).toBe("^raiffeisen|^rb ");
    }
  });

  it("UCB hypotéka 1 mil Kč → 70,00 BJ", () => {
    const res = calculateBj(
      {
        category: "MORTGAGE",
        subtypes: ["mortgage"],
        haystack: "unicredit bank ucb hypotéka",
        amounts: { loanPrincipal: 1_000_000 },
      },
      RULES,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.bjUnits).toBeCloseTo(70.0, 2);
  });

  it("RSTS bez PPI 1 mil Kč → 112,00 BJ", () => {
    const res = calculateBj(
      {
        category: "CONSUMER_LOAN",
        subtypes: ["unsecured_loan", "without_ppi"],
        haystack: "rsts rekopůjčka anuitní bez ppi",
        amounts: { loanPrincipal: 1_000_000 },
      },
      RULES,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.bjUnits).toBeCloseTo(112.0, 2);
      expect(res.snapshot.matchedRule.subtype).toBe("without_ppi");
    }
  });

  it("RSTS s PPI 1 mil Kč → 132,00 BJ", () => {
    const res = calculateBj(
      {
        category: "CONSUMER_LOAN",
        subtypes: ["unsecured_loan", "with_ppi"],
        haystack: "rsts rekopůjčka anuitní s ppi",
        amounts: { loanPrincipal: 1_000_000 },
      },
      RULES,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.bjUnits).toBeCloseTo(132.0, 2);
      expect(res.snapshot.matchedRule.subtype).toBe("with_ppi");
    }
  });

  it("UCB PRESTO úvěr 1 mil Kč → 110,00 BJ", () => {
    const res = calculateBj(
      {
        category: "CONSUMER_LOAN",
        subtypes: ["unsecured_loan"],
        haystack: "unicredit bank presto půjčka",
        amounts: { loanPrincipal: 1_000_000 },
      },
      RULES,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.bjUnits).toBeCloseTo(110.0, 2);
  });

  it("ČSOB Leasing 1 mil Kč → 72,00 BJ", () => {
    const res = calculateBj(
      {
        category: "LEASING",
        subtypes: [],
        haystack: "čsob leasing úvěrová smlouva",
        amounts: { loanPrincipal: 1_000_000 },
      },
      RULES,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.bjUnits).toBeCloseTo(72.0, 2);
  });

  it("ATRIS realitní fond 1 mil Kč → 160,00 BJ", () => {
    const res = calculateBj(
      {
        category: "INVESTMENT_SINGLE_WITH_ENTRY_FEE",
        subtypes: ["investment_fund", "single_payment"],
        haystack: "atris realita nemovitostní otevřený podílový fond",
        amounts: { investmentAmount: 1_000_000 },
      },
      RULES,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.bjUnits).toBeCloseTo(160.0, 2);
  });

  it("EFEKTA Czech Real Estate Fund 1 mil Kč → 196,05 BJ", () => {
    const res = calculateBj(
      {
        category: "INVESTMENT_SINGLE_WITH_ENTRY_FEE",
        subtypes: ["investment_fund", "single_payment"],
        haystack: "efekta czech real estate fund creif",
        amounts: { investmentAmount: 1_000_000 },
      },
      RULES,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.bjUnits).toBeCloseTo(196.05, 2);
  });
});

describe("calculateBj — fail cases", () => {
  it("chybějící částka → ok:false, reason=missing_amount", () => {
    const res = calculateBj(
      {
        category: "MORTGAGE",
        subtypes: ["mortgage"],
        haystack: "ucb hypotéka",
        amounts: {},
      },
      RULES,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("missing_amount");
      expect(res.partialSnapshot?.matchedRule?.productCategory).toBe("MORTGAGE");
    }
  });

  it("UNKNOWN_REVIEW bez pravidla → ok:false, reason=no_matching_rule", () => {
    const res = calculateBj(
      {
        category: "UNKNOWN_REVIEW",
        subtypes: [],
        haystack: "neznámý produkt",
        amounts: { annualPremium: 5000 },
      },
      RULES,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("no_matching_rule");
  });

  it("kategorie bez pravidla → ok:false", () => {
    const res = calculateBj(
      {
        category: "LIABILITY_INSURANCE",
        subtypes: [],
        haystack: "cokoliv",
        amounts: { annualPremium: 5000 },
      },
      RULES,
    );
    expect(res.ok).toBe(false);
  });
});

describe("pickBestBjRule — specificita", () => {
  it("partner match přebije category default", () => {
    const picked = pickBestBjRule(RULES, {
      category: "INVESTMENT_ENTRY_FEE",
      haystack: "edward investiční účty",
    });
    expect(picked).not.toBeNull();
    expect(picked?.partnerPattern).toBe("^edward|investi[cč]ni u[cč]ty edward");
    expect(picked?.coefficient).toBe(0.0036);
  });

  it("category default pokud partner match selže", () => {
    const picked = pickBestBjRule(RULES, {
      category: "INVESTMENT_ENTRY_FEE",
      haystack: "neznámý poskytovatel",
    });
    expect(picked).not.toBeNull();
    expect(picked?.partnerPattern).toBeNull();
    expect(picked?.divisor).toBe(238.1);
  });

  it("subtype rozhoduje u CONSUMER_LOAN (with_ppi vs without_ppi)", () => {
    const withPpi = pickBestBjRule(RULES, {
      category: "CONSUMER_LOAN",
      subtypes: ["with_ppi"],
      haystack: "rsts rekopůjčka",
    });
    const withoutPpi = pickBestBjRule(RULES, {
      category: "CONSUMER_LOAN",
      subtypes: ["without_ppi"],
      haystack: "rsts rekopůjčka",
    });
    expect(withPpi?.coefficient).toBe(0.000132);
    expect(withoutPpi?.coefficient).toBe(0.000112);
  });

  it("tenant scope má přednost před global (stejná specificita)", () => {
    const picked = pickBestBjRule(
      [
        ...RULES,
        {
          productCategory: "MORTGAGE",
          partnerPattern: "^ucb|unicredit",
          subtype: null,
          formula: "loan_principal",
          coefficient: 0.0001, // tenant vlastní sazba
          divisor: null,
          cap: null,
          floor: null,
          tenantScope: "tenant",
        },
      ],
      { category: "MORTGAGE", haystack: "ucb hypotéka" },
    );
    expect(picked?.tenantScope).toBe("tenant");
    expect(picked?.coefficient).toBe(0.0001);
  });
});
